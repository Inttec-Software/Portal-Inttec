import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

let hikvisionHeartbeatCounter = 0;

export const getAsistenciaHoy = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { empleado_id } = req.params;
    const { fecha } = req.query;

    if (!fecha) return res.status(400).json({ error: 'Fecha es requerida' });

    // 1. Primero buscar si hay algún turno ABIERTO hoy (tiene entrada pero no salida)
    const openShiftResult = await pool.query(
      `SELECT * FROM asistencias WHERE empleado_id = $1 AND fecha = $2 AND hora_salida IS NULL ORDER BY creado_en DESC LIMIT 1`,
      [empleado_id, fecha]
    );

    if (openShiftResult.rows.length > 0) {
      return res.json(openShiftResult.rows[0]);
    }

    // 2. Si no hay turno abierto, retornar el último turno cerrado de hoy
    const lastShiftResult = await pool.query(
      `SELECT * FROM asistencias WHERE empleado_id = $1 AND fecha = $2 ORDER BY creado_en DESC LIMIT 1`,
      [empleado_id, fecha]
    );

    return res.json(lastShiftResult.rows[0] || null);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarEntrada = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const payload = req.body;

    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    // Auto-cierre de turnos anteriores abiertos (olvidos de checada): fijar salida a las 18:00:00
    if (payload.empleado_id && payload.fecha) {
      try {
        const updateQuery = `UPDATE asistencias SET hora_salida = '18:00:00' WHERE empleado_id = $1 AND fecha < $2 AND hora_salida IS NULL`;
        await Promise.allSettled([
          poolInttec.query(updateQuery, [payload.empleado_id, payload.fecha]),
          poolDaravisa.query(updateQuery, [payload.empleado_id, payload.fecha]),
        ]);
      } catch (autoErr) {
        console.warn('Advertencia en auto-cierre de turnos anteriores:', autoErr);
      }
    }

    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `INSERT INTO asistencias (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;

    const [inttecRes, daravisaRes] = await Promise.allSettled([
      poolInttec.query(insertQuery, values),
      poolDaravisa.query(insertQuery, values),
    ]);

    const data =
      inttecRes.status === 'fulfilled' && (inttecRes.value as any)?.rows?.[0]
        ? (inttecRes.value as any).rows[0]
        : daravisaRes.status === 'fulfilled' && (daravisaRes.value as any)?.rows?.[0]
          ? (daravisaRes.value as any).rows[0]
          : null;

    if (!data) {
      const err =
        inttecRes.status === 'rejected'
          ? inttecRes.reason
          : daravisaRes.status === 'rejected'
            ? daravisaRes.reason
            : 'Error al registrar entrada';
      throw new Error(err.message || String(err));
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarSalida = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const { id, empleado_id, fecha, ...payload } = req.body;

    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    // Actualizar en Inttec
    let updateInttecPromise;
    if (id) {
      updateInttecPromise = poolInttec.query(
        `UPDATE asistencias SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id]
      );
    } else if (empleado_id && fecha) {
      updateInttecPromise = poolInttec.query(
        `UPDATE asistencias SET ${setClause} WHERE empleado_id = $${keys.length + 1} AND fecha = $${keys.length + 2} AND hora_salida IS NULL RETURNING *`,
        [...values, empleado_id, fecha]
      );
    }

    // Actualizar en Daravisa (por turno abierto del empleado y fecha)
    let updateDaravisaPromise;
    if (empleado_id && fecha) {
      updateDaravisaPromise = poolDaravisa.query(
        `UPDATE asistencias SET ${setClause} WHERE empleado_id = $${keys.length + 1} AND fecha = $${keys.length + 2} AND hora_salida IS NULL RETURNING *`,
        [...values, empleado_id, fecha]
      );
    } else if (id) {
      updateDaravisaPromise = poolDaravisa.query(
        `UPDATE asistencias SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id]
      );
    }

    const [resI, resD] = await Promise.allSettled([
      updateInttecPromise || Promise.resolve({ rows: [] }),
      updateDaravisaPromise || Promise.resolve({ rows: [] }),
    ]);

    const data =
      resI.status === 'fulfilled' && (resI.value as any)?.rows?.[0]
        ? (resI.value as any).rows[0]
        : resD.status === 'fulfilled' && (resD.value as any)?.rows?.[0]
          ? (resD.value as any).rows[0]
          : { success: true };

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getHistorial = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { empleado_id } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    let query = `SELECT * FROM asistencias WHERE empleado_id = $1`;
    const params: any[] = [empleado_id];

    if (startDate) {
      params.push(startDate);
      query += ` AND fecha >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND fecha <= $${params.length}`;
    }

    query += ` ORDER BY fecha DESC, hora_entrada ASC`;

    const result = await pool.query(query, params);

    return res.json(result.rows || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Endpoint Receptor Webhook para Terminal Hikvision MinMoe (Audición HTTP / Event Listening)
 */
export const handleHikvisionWebhook = async (req: Request, res: Response) => {
  try {
    let rawData = req.body;
    let event: any = null;

    // Si viene como AccessControllerEvent
    if (rawData?.AccessControllerEvent) {
      if (typeof rawData.AccessControllerEvent === 'string') {
        try {
          event = JSON.parse(rawData.AccessControllerEvent);
        } catch {
          const rawStr = rawData.AccessControllerEvent;
          const employeeNoMatch = rawStr.match(/<employeeNoString>(.*?)<\/employeeNoString>/) || rawStr.match(/"employeeNoString"\s*:\s*"([^"]+)"/);
          const nameMatch = rawStr.match(/<name>(.*?)<\/name>/) || rawStr.match(/"name"\s*:\s*"([^"]+)"/);
          event = {
            employeeNoString: employeeNoMatch ? employeeNoMatch[1] : undefined,
            name: nameMatch ? nameMatch[1] : undefined,
          };
        }
      } else if (typeof rawData.AccessControllerEvent === 'object') {
        event = rawData.AccessControllerEvent;
      }
    } else if (typeof rawData === 'string') {
      try {
        const parsed = JSON.parse(rawData);
        event = parsed.AccessControllerEvent || parsed;
      } catch {
        const employeeNoMatch = rawData.match(/<employeeNoString>(.*?)<\/employeeNoString>/) || rawData.match(/"employeeNoString"\s*:\s*"([^"]+)"/);
        const nameMatch = rawData.match(/<name>(.*?)<\/name>/) || rawData.match(/"name"\s*:\s*"([^"]+)"/);
        event = {
          employeeNoString: employeeNoMatch ? employeeNoMatch[1] : undefined,
          name: nameMatch ? nameMatch[1] : undefined,
        };
      }
    } else if (typeof rawData === 'object') {
      for (const k of Object.keys(rawData)) {
        if (typeof rawData[k] === 'string' && (rawData[k].startsWith('{') || rawData[k].startsWith('<'))) {
          try {
            const parsed = JSON.parse(rawData[k]);
            event = parsed.AccessControllerEvent || parsed;
            break;
          } catch {
            const employeeNoMatch = rawData[k].match(/<employeeNoString>(.*?)<\/employeeNoString>/) || rawData[k].match(/"employeeNoString"\s*:\s*"([^"]+)"/);
            const nameMatch = rawData[k].match(/<name>(.*?)<\/name>/) || rawData[k].match(/"name"\s*:\s*"([^"]+)"/);
            if (employeeNoMatch || nameMatch) {
              event = {
                employeeNoString: employeeNoMatch ? employeeNoMatch[1] : undefined,
                name: nameMatch ? nameMatch[1] : undefined,
              };
              break;
            }
          }
        }
      }
      if (!event) event = rawData;
    }

    const employeeNo = String(
      event?.employeeNoString ||
      event?.employeeNo ||
      event?.AccessControllerEvent?.employeeNoString ||
      ''
    ).trim();

    const employeeName = event?.name || event?.AccessControllerEvent?.name || '';
    const verifyMode = event?.currentVerifyMode || event?.AccessControllerEvent?.currentVerifyMode || (event?.subEventType === 75 ? 'Rostro' : 'Biométrico');

    let rawDateTime = event?.dateTime || event?.AccessControllerEvent?.dateTime || event?.time;

    // 1. Si es un latido de estado o evento sin usuario, responder ACK oficial al instante
    if (!employeeNo && !employeeName) {
      hikvisionHeartbeatCounter++;
      if (hikvisionHeartbeatCounter % 50 === 0) {
        console.log(`⏳ [HIKVISION DRAIN] Vaciando cola de memoria... (${hikvisionHeartbeatCounter} eventos procesados, fecha: ${rawDateTime || 'N/A'})`);
      }
      return res.status(200).json({ statusCode: 1, statusString: 'OK', subStatusCode: 'ok' });
    }

    console.log(`\n🟢 [HIKVISION] 👤 Checada recibida -> No: "${employeeNo}", Nombre: "${employeeName}", Modo: "${verifyMode}"`);

    // Buscar el usuario en Supabase (Inttec o Daravisa)
    const poolInttec = getDbPool('inttec', 'cloud');
    const poolDaravisa = getDbPool('daravisa', 'cloud');

    let usuario: any = null;

    // Helper para normalizar texto (quitar acentos, diacríticos y pasar a minúsculas)
    const normalize = (str: string) =>
      str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

    // 1. Buscar por UUID de usuario en Inttec
    if (employeeNo) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeNo);
      if (isUUID) {
        const uInttecRes = await poolInttec.query('SELECT id, nombre, email FROM usuarios WHERE id = $1 LIMIT 1', [employeeNo]);
        if (uInttecRes.rows.length > 0) usuario = uInttecRes.rows[0];
      }
    }

    // 2. Buscar por coincidencia de nombre flexible (ej: "Adriana Juarez" -> "Karla Adriana Juárez Reyes")
    if (!usuario && employeeName) {
      const allUsersInttecRes = await poolInttec.query('SELECT id, nombre, email FROM usuarios');
      if (allUsersInttecRes.rows.length > 0) {
        const allUsersInttec = allUsersInttecRes.rows;
        const targetTokens = normalize(employeeName).split(/\s+/).filter(Boolean);
        usuario = allUsersInttec.find((u: any) => {
          const uNorm = normalize(u.nombre);
          return targetTokens.every(tok => uNorm.includes(tok));
        });
      }
    }

    // 3. Probar en Daravisa si no se encontró en Inttec
    if (!usuario && employeeNo) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeNo);
      if (isUUID) {
        const uDaravisaRes = await poolDaravisa.query('SELECT id, nombre, email FROM usuarios WHERE id = $1 LIMIT 1', [employeeNo]);
        if (uDaravisaRes.rows.length > 0) usuario = uDaravisaRes.rows[0];
      }
    }

    if (!usuario && employeeName) {
      const allUsersDaravisaRes = await poolDaravisa.query('SELECT id, nombre, email FROM usuarios');
      if (allUsersDaravisaRes.rows.length > 0) {
        const allUsersDaravisa = allUsersDaravisaRes.rows;
        const targetTokens = normalize(employeeName).split(/\s+/).filter(Boolean);
        usuario = allUsersDaravisa.find((u: any) => {
          const uNorm = normalize(u.nombre);
          return targetTokens.every(tok => uNorm.includes(tok));
        });
      }
    }

    if (!usuario) {
      console.warn(`[HIKVISION] Usuario no encontrado en la base de datos para No: "${employeeNo}", Nombre: "${employeeName}"`);
      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        warning: 'Usuario no registrado en base de datos'
      });
    }

    const empleadoId = usuario.id;

    // Obtener la fecha y hora EXACTAS en que la persona checó en el dispositivo físico
    if (!rawDateTime) {
      rawDateTime = event?.dateTime || event?.AccessControllerEvent?.dateTime || event?.time;
    }
    if (!rawDateTime && typeof rawData === 'string') {
      const dtMatch = rawData.match(/<dateTime>(.*?)<\/dateTime>/) || rawData.match(/"dateTime"\s*:\s*"([^"]+)"/);
      if (dtMatch) rawDateTime = dtMatch[1];
    } else if (!rawDateTime && typeof rawData === 'object') {
      for (const k of Object.keys(rawData)) {
        if (typeof rawData[k] === 'string') {
          const dtMatch = rawData[k].match(/<dateTime>(.*?)<\/dateTime>/) || rawData[k].match(/"dateTime"\s*:\s*"([^"]+)"/);
          if (dtMatch) {
            rawDateTime = dtMatch[1];
            break;
          }
        }
      }
    }

    let fechaJornada: string;
    let horaLocal: string;

    if (rawDateTime) {
      let datePart = '';
      let timePart = '';
      if (rawDateTime.includes('T')) {
        const parts = rawDateTime.split('T');
        datePart = parts[0];
        timePart = parts[1].slice(0, 8);
      } else if (rawDateTime.includes(' ')) {
        const parts = rawDateTime.split(' ');
        datePart = parts[0];
        timePart = parts[1].slice(0, 8);
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && /^\d{2}:\d{2}:\d{2}$/.test(timePart)) {
        const hours = parseInt(timePart.slice(0, 2), 10);
        fechaJornada = datePart;
        if (hours < 6) {
          const [y, m, d] = datePart.split('-').map(Number);
          const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
          fechaJornada = `${prevDay.getUTCFullYear()}-${String(prevDay.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDay.getUTCDate()).padStart(2, '0')}`;
        }
        horaLocal = timePart;
      } else {
        const now = new Date();
        const localNowMs = now.getTime() + (now.getTimezoneOffset() * 60000) - (6 * 3600000);
        const localNow = new Date(localNowMs);
        fechaJornada = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
        horaLocal = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}:${String(localNow.getSeconds()).padStart(2, '0')}`;
      }
    } else {
      const now = new Date();
      const localNowMs = now.getTime() + (now.getTimezoneOffset() * 60000) - (6 * 3600000);
      const localNow = new Date(localNowMs);
      fechaJornada = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
      horaLocal = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}:${String(localNow.getSeconds()).padStart(2, '0')}`;
    }

    // Obtener la fecha de hoy en hora local de México
    const serverNow = new Date();
    const serverLocalNowMs = serverNow.getTime() + (serverNow.getTimezoneOffset() * 60000) - (6 * 3600000);
    const serverLocalNow = new Date(serverLocalNowMs);
    const serverToday = `${serverLocalNow.getFullYear()}-${String(serverLocalNow.getMonth() + 1).padStart(2, '0')}-${String(serverLocalNow.getDate()).padStart(2, '0')}`;

    console.log(`\n======================================================`);
    console.log(`📡 [HIKVISION CHECADOR] -> 👤 ${usuario.nombre} (${employeeNo || 'Sin No'})`);
    console.log(`📅 Fecha/Hora Dispositivo: ${fechaJornada} ${horaLocal} | Modo: ${verifyMode}`);
    console.log(`======================================================`);

    // FILTRO ESTRICTO: Descartar eventos anteriores a octubre 2026 (ej. septiembre o anteriores)
    if (fechaJornada < '2026-10-01') {
      console.warn(`[HIKVISION] Evento anterior a octubre descartado (${fechaJornada} ${horaLocal})`);
      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        message: 'Evento anterior a octubre descartado'
      });
    }

    // Validar antigüedad razonable: descartar si viene con más de 1 día en el futuro por desconfiguración del reloj
    const eventTime = new Date(`${fechaJornada}T${horaLocal}`).getTime();
    const serverTime = serverLocalNow.getTime();
    const diffHours = (serverTime - eventTime) / 3600000;

    if (diffHours < -24) {
      console.warn(`[HIKVISION] Evento en el futuro descartado (${fechaJornada} ${horaLocal})`);
      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        message: 'Evento descartado por fecha en el futuro'
      });
    }

    // 1. Buscar registros existentes del empleado en esta fecha para verificar idempotencia
    const recordsForDayRes = await poolInttec.query(
      'SELECT * FROM asistencias WHERE empleado_id = $1 AND fecha = $2 ORDER BY creado_en ASC',
      [empleadoId, fechaJornada]
    );

    const existingList = recordsForDayRes.rows || [];

    // Helper para convertir HH:MM:SS a segundos
    const toSeconds = (tStr: string | null) => {
      if (!tStr) return -1;
      const clean = tStr.split('+')[0];
      const [h, m, s] = clean.split(':').map(Number);
      return (h * 3600) + (m * 60) + (s || 0);
    };

    const currentSec = toSeconds(horaLocal);

    // Verificar si esta checada exacta ya fue registrada (duplicado idéntico por reenvío de cola)
    const isDuplicate = existingList.some((r: any) => {
      const inSec = toSeconds(r.hora_entrada);
      const outSec = toSeconds(r.hora_salida);
      return (inSec >= 0 && Math.abs(currentSec - inSec) < 60) || (outSec >= 0 && Math.abs(currentSec - outSec) < 60);
    });

    if (isDuplicate) {
      console.log(`[HIKVISION] Checada duplicada de ${usuario.nombre} a las ${horaLocal} ya procesada anteriormente. Confirmando ACK.`);
      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        message: 'Evento ya registrado previamente'
      });
    }

    // Buscar si hay turno abierto para esta fecha
    const openShift = existingList.find((r: any) => !r.hora_salida);

    if (!openShift) {
      // Registrar ENTRADA
      console.log(`[HIKVISION] Registrando ENTRADA para ${usuario.nombre} (${fechaJornada} ${horaLocal})`);

      // Auto-cierre de turnos anteriores abiertos de días pasados
      const autoClosePayload = {
        hora_salida: '18:00:00',
        descripcion: 'Cierre automático 6:00 PM (olvido de checada)'
      };
      await Promise.allSettled([
        poolInttec.query("UPDATE asistencias SET hora_salida = $1, descripcion = $2 WHERE empleado_id = $3 AND fecha < $4 AND hora_salida IS NULL", [autoClosePayload.hora_salida, autoClosePayload.descripcion, empleadoId, fechaJornada]),
        poolDaravisa.query("UPDATE asistencias SET hora_salida = $1, descripcion = $2 WHERE empleado_id = $3 AND fecha < $4 AND hora_salida IS NULL", [autoClosePayload.hora_salida, autoClosePayload.descripcion, empleadoId, fechaJornada]),
      ]);

      const entradaPayload = {
        empleado_id: empleadoId,
        fecha: fechaJornada,
        hora_entrada: horaLocal,
        direccion_entrada: `Checador Físico MinMoe (${verifyMode})`,
      };

      await Promise.allSettled([
        poolInttec.query("INSERT INTO asistencias (empleado_id, fecha, hora_entrada, direccion_entrada) VALUES ($1, $2, $3, $4)", [empleadoId, fechaJornada, horaLocal, entradaPayload.direccion_entrada]),
        poolDaravisa.query("INSERT INTO asistencias (empleado_id, fecha, hora_entrada, direccion_entrada) VALUES ($1, $2, $3, $4)", [empleadoId, fechaJornada, horaLocal, entradaPayload.direccion_entrada]),
      ]);

      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        tipo: 'ENTRADA',
        empleado: usuario.nombre,
        hora: horaLocal
      });
    } else {
      // Si checan antes de 10 minutos (600 segundos) de su entrada, ignorar salida accidental
      const inSec = toSeconds(openShift.hora_entrada);
      if (inSec >= 0) {
        const diffSec = currentSec - inSec;
        if (diffSec >= 0 && diffSec < 600) {
          console.log(`[HIKVISION] Checada ignorada para ${usuario.nombre} (menos de 10 min desde su entrada: ${diffSec}s)`);
          return res.status(200).json({
            statusCode: 1,
            statusString: 'OK',
            subStatusCode: 'ok',
            message: 'Checada ignorada (menos de 10 min de la entrada)'
          });
        }
      }

      // Registrar SALIDA
      console.log(`[HIKVISION] Registrando SALIDA para ${usuario.nombre} (${fechaJornada} ${horaLocal})`);
      const salidaPayload = {
        hora_salida: horaLocal,
        direccion_salida: `Checador Físico MinMoe (${verifyMode})`,
      };

      await Promise.allSettled([
        poolInttec.query("UPDATE asistencias SET hora_salida = $1, direccion_salida = $2 WHERE id = $3", [salidaPayload.hora_salida, salidaPayload.direccion_salida, openShift.id]),
        poolDaravisa.query("UPDATE asistencias SET hora_salida = $1, direccion_salida = $2 WHERE empleado_id = $3 AND fecha = $4 AND hora_salida IS NULL", [salidaPayload.hora_salida, salidaPayload.direccion_salida, empleadoId, fechaJornada]),
      ]);

      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        tipo: 'SALIDA',
        empleado: usuario.nombre,
        hora: horaLocal
      });
    }
  } catch (error: any) {
    console.error('[HIKVISION WEBHOOK ERROR]:', error);
    // Responder 200 con status de error para que el checador no se trabe en reintentos infinitos
    return res.status(200).json({ statusCode: 0, statusString: 'FAIL', subStatusCode: 'fail', error: error.message });
  }
};

/**
 * Edición manual de horas de asistencia (Exclusivo para usuarios con rol DEV)
 */
export const editarHorasAsistencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { id } = req.params;
    const { hora_entrada, hora_salida, fecha, observaciones } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID de registro de asistencia es requerido' });
    }

    // Doble verificación del rol DEV: en token y en la base de datos
    const poolInttec = getDbPool('inttec', tenant?.env || 'cloud');
    const poolDaravisa = getDbPool('daravisa', tenant?.env || 'cloud');

    let userRole = user.rol || user.role || user.user_metadata?.rol || user.app_metadata?.rol;

    if (userRole !== 'DEV') {
      const dbUserRes = await poolInttec.query('SELECT rol, nombre FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
      const dbUser = dbUserRes.rows[0];

      if (dbUser?.rol === 'DEV') {
        userRole = 'DEV';
      } else {
        const dbUserDaravisaRes = await poolDaravisa.query('SELECT rol, nombre FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
        const dbUserDaravisa = dbUserDaravisaRes.rows[0];
        if (dbUserDaravisa?.rol === 'DEV') {
          userRole = 'DEV';
        }
      }
    }

    if (userRole !== 'DEV') {
      return res.status(403).json({
        error: 'Acceso denegado. Únicamente los usuarios con rol DEV tienen permisos para modificar horas de asistencia.'
      });
    }

    // Validar y formatear horas (asegurar HH:MM:SS)
    const formatTime = (t: string | null | undefined) => {
      if (!t || t.trim() === '') return null;
      const clean = t.trim().split('+')[0];
      if (/^\d{1,2}:\d{2}$/.test(clean)) {
        const [h, m] = clean.split(':');
        return `${h.padStart(2, '0')}:${m}:00`;
      }
      if (/^\d{1,2}:\d{2}:\d{2}$/.test(clean)) {
        const [h, m, s] = clean.split(':');
        return `${h.padStart(2, '0')}:${m}:${s}`;
      }
      return clean;
    };

    const cleanHoraEntrada = formatTime(hora_entrada);
    const cleanHoraSalida = formatTime(hora_salida);

    if (!cleanHoraEntrada) {
      return res.status(400).json({ error: 'La hora de entrada es requerida y debe tener formato HH:MM o HH:MM:SS' });
    }

    // Buscar el registro actual en Inttec o Daravisa para obtener los datos de referencia
    let currentRecord: any = null;
    const recInttecRes = await poolInttec.query('SELECT * FROM asistencias WHERE id = $1 LIMIT 1', [id]);
    if (recInttecRes.rows.length > 0) currentRecord = recInttecRes.rows[0];
    if (!currentRecord) {
      const recDaravisaRes = await poolDaravisa.query('SELECT * FROM asistencias WHERE id = $1 LIMIT 1', [id]);
      if (recDaravisaRes.rows.length > 0) currentRecord = recDaravisaRes.rows[0];
    }

    let query = 'UPDATE asistencias SET hora_entrada = $1, hora_salida = $2';
    let params: any[] = [cleanHoraEntrada, cleanHoraSalida];
    if (fecha) {
      query += ', fecha = $3';
      params.push(fecha);
    }

    const editorNombre = user.nombre || user.email || 'DEV';

    // Actualizar simultáneamente en Inttec y Daravisa
    const updatePromises: any[] = [
      poolInttec.query(query + ` WHERE id = $${params.length + 1}`, [...params, id]),
      poolDaravisa.query(query + ` WHERE id = $${params.length + 1}`, [...params, id]),
    ];

    if (currentRecord?.empleado_id && currentRecord?.fecha) {
      updatePromises.push(
        poolInttec.query(
          query + ` WHERE empleado_id = $${params.length + 1} AND fecha = $${params.length + 2} AND hora_entrada = $${params.length + 3}`,
          [...params, currentRecord.empleado_id, currentRecord.fecha, currentRecord.hora_entrada]
        ),
        poolDaravisa.query(
          query + ` WHERE empleado_id = $${params.length + 1} AND fecha = $${params.length + 2} AND hora_entrada = $${params.length + 3}`,
          [...params, currentRecord.empleado_id, currentRecord.fecha, currentRecord.hora_entrada]
        )
      );
    }

    const results = await Promise.allSettled(updatePromises);
    const errors: any[] = [];
    let updatedCount = 0;
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(r.reason);
      } else if (r.status === 'fulfilled') {
        updatedCount += (r.value as any).rowCount || 0;
      }
    }

    if (updatedCount === 0 && errors.length > 0) {
      console.error('[DEV EDIT] Error al actualizar en BD:', errors[0]);
      throw new Error(errors[0]?.message || 'Error al actualizar asistencia en la base de datos');
    }

    console.log(`🛠️ [DEV EDIT] Horas de asistencia actualizadas para registro ${id} por ${editorNombre}: Entrada=${cleanHoraEntrada}, Salida=${cleanHoraSalida}`);

    return res.json({
      success: true,
      message: 'Horas de asistencia actualizadas correctamente',
      data: {
        id,
        hora_entrada: cleanHoraEntrada,
        hora_salida: cleanHoraSalida
      }
    });
  } catch (error: any) {
    console.error('[EDITAR HORAS ASISTENCIA ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Eliminación de registro de asistencia (Exclusivo para usuarios con rol DEV)
 */
export const eliminarAsistencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'ID de registro de asistencia es requerido' });
    }

    // Doble verificación del rol DEV
    const poolInttec = getDbPool('inttec', tenant?.env || 'cloud');
    const poolDaravisa = getDbPool('daravisa', tenant?.env || 'cloud');

    let userRole = user.rol || user.role || user.user_metadata?.rol || user.app_metadata?.rol;

    if (userRole !== 'DEV') {
      const dbUserRes = await poolInttec.query('SELECT rol, nombre FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
      const dbUser = dbUserRes.rows[0];

      if (dbUser?.rol === 'DEV') {
        userRole = 'DEV';
      } else {
        const dbUserDaravisaRes = await poolDaravisa.query('SELECT rol, nombre FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
        const dbUserDaravisa = dbUserDaravisaRes.rows[0];
        if (dbUserDaravisa?.rol === 'DEV') {
          userRole = 'DEV';
        }
      }
    }

    if (userRole !== 'DEV') {
      return res.status(403).json({
        error: 'Acceso denegado. Únicamente los usuarios con rol DEV tienen permisos para eliminar registros de asistencia.'
      });
    }

    // Buscar el registro para conocer fecha y empleado
    let currentRecord: any = null;
    const recInttecRes = await poolInttec.query('SELECT * FROM asistencias WHERE id = $1 LIMIT 1', [id]);
    if (recInttecRes.rows.length > 0) currentRecord = recInttecRes.rows[0];
    if (!currentRecord) {
      const recDaravisaRes = await poolDaravisa.query('SELECT * FROM asistencias WHERE id = $1 LIMIT 1', [id]);
      if (recDaravisaRes.rows.length > 0) currentRecord = recDaravisaRes.rows[0];
    }

    const deletePromises: any[] = [
      poolInttec.query('DELETE FROM asistencias WHERE id = $1', [id]),
      poolDaravisa.query('DELETE FROM asistencias WHERE id = $1', [id]),
    ];

    if (currentRecord?.empleado_id && currentRecord?.fecha && currentRecord?.hora_entrada) {
      deletePromises.push(
        poolInttec.query(
          'DELETE FROM asistencias WHERE empleado_id = $1 AND fecha = $2 AND hora_entrada = $3',
          [currentRecord.empleado_id, currentRecord.fecha, currentRecord.hora_entrada]
        ),
        poolDaravisa.query(
          'DELETE FROM asistencias WHERE empleado_id = $1 AND fecha = $2 AND hora_entrada = $3',
          [currentRecord.empleado_id, currentRecord.fecha, currentRecord.hora_entrada]
        )
      );
    }

    const results = await Promise.allSettled(deletePromises);
    const errors: any[] = [];
    let deletedCount = 0;
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(r.reason);
      } else if (r.status === 'fulfilled') {
        deletedCount += (r.value as any).rowCount || 0;
      }
    }

    if (deletedCount === 0 && errors.length > 0) {
      console.error('[DEV DELETE] Error al eliminar en BD:', errors[0]);
      throw new Error(errors[0]?.message || 'Error al eliminar asistencia de la base de datos');
    }

    const editorNombre = user.nombre || user.email || 'DEV';
    console.log(`🗑️ [DEV DELETE] Registro de asistencia ${id} eliminado por ${editorNombre}`);

    return res.json({
      success: true,
      message: 'Registro de asistencia eliminado correctamente'
    });
  } catch (error: any) {
    console.error('[ELIMINAR ASISTENCIA ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
};


