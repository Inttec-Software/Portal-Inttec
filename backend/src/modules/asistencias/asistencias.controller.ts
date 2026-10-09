import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

let hikvisionHeartbeatCounter = 0;

export const getAsistenciaHoy = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { empleado_id } = req.params;
    const { fecha } = req.query;

    if (!fecha) return res.status(400).json({ error: 'Fecha es requerida' });

    // 1. Primero buscar si hay algún turno ABIERTO hoy (tiene entrada pero no salida)
    const { data: openShift } = await client
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleado_id)
      .eq('fecha', fecha as string)
      .is('hora_salida', null)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openShift) {
      return res.json(openShift);
    }

    // 2. Si no hay turno abierto, retornar el último turno cerrado de hoy
    const { data: lastShift, error } = await client
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleado_id)
      .eq('fecha', fecha as string)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return res.json(lastShift || null);
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

    // Sincronización dual garantizada con service_role en el backend
    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    // Auto-cierre de turnos anteriores abiertos (olvidos de checada): fijar salida a las 18:00:00
    if (payload.empleado_id && payload.fecha) {
      try {
        const autoClosePayload = {
          hora_salida: '18:00:00'
        };
        await Promise.allSettled([
          clientInttec
            .from('asistencias')
            .update(autoClosePayload)
            .eq('empleado_id', payload.empleado_id)
            .lt('fecha', payload.fecha)
            .is('hora_salida', null),
          clientDaravisa
            .from('asistencias')
            .update(autoClosePayload)
            .eq('empleado_id', payload.empleado_id)
            .lt('fecha', payload.fecha)
            .is('hora_salida', null),
        ]);
      } catch (autoErr) {
        console.warn('Advertencia en auto-cierre de turnos anteriores:', autoErr);
      }
    }

    const [inttecRes, daravisaRes] = await Promise.allSettled([
      clientInttec.from('asistencias').insert([payload]).select().single(),
      clientDaravisa.from('asistencias').insert([payload]).select().single(),
    ]);

    const data =
      inttecRes.status === 'fulfilled' && inttecRes.value.data
        ? inttecRes.value.data
        : daravisaRes.status === 'fulfilled' && daravisaRes.value.data
          ? daravisaRes.value.data
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

    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    // Actualizar en Inttec
    let updateInttecPromise;
    if (id) {
      updateInttecPromise = clientInttec.from('asistencias').update(payload).eq('id', id).select().maybeSingle();
    } else if (empleado_id && fecha) {
      updateInttecPromise = clientInttec
        .from('asistencias')
        .update(payload)
        .eq('empleado_id', empleado_id)
        .eq('fecha', fecha)
        .is('hora_salida', null)
        .select()
        .maybeSingle();
    }

    // Actualizar en Daravisa (por turno abierto del empleado y fecha)
    let updateDaravisaPromise;
    if (empleado_id && fecha) {
      updateDaravisaPromise = clientDaravisa
        .from('asistencias')
        .update(payload)
        .eq('empleado_id', empleado_id)
        .eq('fecha', fecha)
        .is('hora_salida', null)
        .select()
        .maybeSingle();
    } else if (id) {
      updateDaravisaPromise = clientDaravisa.from('asistencias').update(payload).eq('id', id).select().maybeSingle();
    }

    const [resI, resD] = await Promise.allSettled([
      updateInttecPromise || Promise.resolve({ data: null }),
      updateDaravisaPromise || Promise.resolve({ data: null }),
    ]);

    const data =
      resI.status === 'fulfilled' && (resI.value as any)?.data
        ? (resI.value as any).data
        : resD.status === 'fulfilled' && (resD.value as any)?.data
          ? (resD.value as any).data
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
    const client = getSupabaseClient(company, env);
    const { empleado_id } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    let query = client
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleado_id);

    if (startDate) query = query.gte('fecha', startDate);
    if (endDate) query = query.lte('fecha', endDate);

    // Ordenar cronológicamente por fecha descendente, y los turnos del mismo día de más temprano a más tarde
    const { data, error } = await query
      .order('fecha', { ascending: false })
      .order('hora_entrada', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
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
    const clientInttec = getSupabaseClient('inttec', 'cloud');
    const clientDaravisa = getSupabaseClient('daravisa', 'cloud');

    let usuario: any = null;

    // Helper para normalizar texto (quitar acentos, diacríticos y pasar a minúsculas)
    const normalize = (str: string) =>
      str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

    // 1. Buscar por UUID de usuario en Inttec
    if (employeeNo) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeNo);
      if (isUUID) {
        const { data: uInttec } = await clientInttec.from('usuarios').select('id, nombre, email').eq('id', employeeNo).maybeSingle();
        if (uInttec) usuario = uInttec;
      }
    }

    // 2. Buscar por coincidencia de nombre flexible (ej: "Adriana Juarez" -> "Karla Adriana Juárez Reyes")
    if (!usuario && employeeName) {
      const { data: allUsersInttec } = await clientInttec.from('usuarios').select('id, nombre, email');
      if (allUsersInttec && allUsersInttec.length > 0) {
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
        const { data: uDaravisa } = await clientDaravisa.from('usuarios').select('id, nombre, email').eq('id', employeeNo).maybeSingle();
        if (uDaravisa) usuario = uDaravisa;
      }
    }

    if (!usuario && employeeName) {
      const { data: allUsersDaravisa } = await clientDaravisa.from('usuarios').select('id, nombre, email');
      if (allUsersDaravisa && allUsersDaravisa.length > 0) {
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
    const { data: recordsForDay } = await clientInttec
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fechaJornada)
      .order('creado_en', { ascending: true });

    const existingList = recordsForDay || [];

    // Helper para convertir HH:MM:SS a segundos
    const toSeconds = (tStr: string | null) => {
      if (!tStr) return -1;
      const clean = tStr.split('+')[0];
      const [h, m, s] = clean.split(':').map(Number);
      return (h * 3600) + (m * 60) + (s || 0);
    };

    const currentSec = toSeconds(horaLocal);

    // Verificar si esta checada exacta ya fue registrada (duplicado idéntico por reenvío de cola)
    const isDuplicate = existingList.some(r => {
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
    const openShift = existingList.find(r => !r.hora_salida);

    if (!openShift) {
      // Registrar ENTRADA
      console.log(`[HIKVISION] Registrando ENTRADA para ${usuario.nombre} (${fechaJornada} ${horaLocal})`);

      // Auto-cierre de turnos anteriores abiertos de días pasados
      const autoClosePayload = {
        hora_salida: '18:00:00',
        descripcion: 'Cierre automático 6:00 PM (olvido de checada)'
      };
      await Promise.allSettled([
        clientInttec.from('asistencias').update(autoClosePayload).eq('empleado_id', empleadoId).lt('fecha', fechaJornada).is('hora_salida', null),
        clientDaravisa.from('asistencias').update(autoClosePayload).eq('empleado_id', empleadoId).lt('fecha', fechaJornada).is('hora_salida', null),
      ]);

      const entradaPayload = {
        empleado_id: empleadoId,
        fecha: fechaJornada,
        hora_entrada: horaLocal,
        direccion_entrada: `Checador Físico MinMoe (${verifyMode})`,
      };

      await Promise.allSettled([
        clientInttec.from('asistencias').insert([entradaPayload]),
        clientDaravisa.from('asistencias').insert([entradaPayload]),
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
        clientInttec.from('asistencias').update(salidaPayload).eq('id', openShift.id),
        clientDaravisa.from('asistencias').update(salidaPayload).eq('empleado_id', empleadoId).eq('fecha', fechaJornada).is('hora_salida', null),
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
    const clientInttec = getSupabaseClient('inttec', tenant?.env || 'cloud');
    const clientDaravisa = getSupabaseClient('daravisa', tenant?.env || 'cloud');

    let userRole = user.rol || user.role || user.user_metadata?.rol || user.app_metadata?.rol;

    if (userRole !== 'DEV') {
      const { data: dbUser } = await clientInttec
        .from('usuarios')
        .select('rol, nombre')
        .eq('id', user.id)
        .maybeSingle();

      if (dbUser?.rol === 'DEV') {
        userRole = 'DEV';
      } else {
        const { data: dbUserDaravisa } = await clientDaravisa
          .from('usuarios')
          .select('rol, nombre')
          .eq('id', user.id)
          .maybeSingle();
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
    const { data: recInttec } = await clientInttec.from('asistencias').select('*').eq('id', id).maybeSingle();
    if (recInttec) currentRecord = recInttec;
    if (!currentRecord) {
      const { data: recDaravisa } = await clientDaravisa.from('asistencias').select('*').eq('id', id).maybeSingle();
      if (recDaravisa) currentRecord = recDaravisa;
    }

    const updatePayload: any = {
      hora_entrada: cleanHoraEntrada,
      hora_salida: cleanHoraSalida,
    };

    if (fecha) {
      updatePayload.fecha = fecha;
    }

    const editorNombre = user.nombre || user.email || 'DEV';

    // Actualizar simultáneamente en Inttec y Daravisa
    const updatePromises: any[] = [
      clientInttec.from('asistencias').update(updatePayload).eq('id', id),
      clientDaravisa.from('asistencias').update(updatePayload).eq('id', id),
    ];

    if (currentRecord?.empleado_id && currentRecord?.fecha) {
      updatePromises.push(
        clientInttec
          .from('asistencias')
          .update(updatePayload)
          .eq('empleado_id', currentRecord.empleado_id)
          .eq('fecha', currentRecord.fecha)
          .eq('hora_entrada', currentRecord.hora_entrada),
        clientDaravisa
          .from('asistencias')
          .update(updatePayload)
          .eq('empleado_id', currentRecord.empleado_id)
          .eq('fecha', currentRecord.fecha)
          .eq('hora_entrada', currentRecord.hora_entrada)
      );
    }

    const results = await Promise.allSettled(updatePromises);
    const errors: any[] = [];
    let updatedCount = 0;
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(r.reason);
      } else if (r.status === 'fulfilled') {
        if (r.value?.error) {
          errors.push(r.value.error);
        } else {
          updatedCount++;
        }
      }
    }

    if (updatedCount === 0 && errors.length > 0) {
      console.error('[DEV EDIT] Error al actualizar en Supabase:', errors[0]);
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
    const clientInttec = getSupabaseClient('inttec', tenant?.env || 'cloud');
    const clientDaravisa = getSupabaseClient('daravisa', tenant?.env || 'cloud');

    let userRole = user.rol || user.role || user.user_metadata?.rol || user.app_metadata?.rol;

    if (userRole !== 'DEV') {
      const { data: dbUser } = await clientInttec
        .from('usuarios')
        .select('rol, nombre')
        .eq('id', user.id)
        .maybeSingle();

      if (dbUser?.rol === 'DEV') {
        userRole = 'DEV';
      } else {
        const { data: dbUserDaravisa } = await clientDaravisa
          .from('usuarios')
          .select('rol, nombre')
          .eq('id', user.id)
          .maybeSingle();
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
    const { data: recInttec } = await clientInttec.from('asistencias').select('*').eq('id', id).maybeSingle();
    if (recInttec) currentRecord = recInttec;
    if (!currentRecord) {
      const { data: recDaravisa } = await clientDaravisa.from('asistencias').select('*').eq('id', id).maybeSingle();
      if (recDaravisa) currentRecord = recDaravisa;
    }

    const deletePromises: any[] = [
      clientInttec.from('asistencias').delete().eq('id', id),
      clientDaravisa.from('asistencias').delete().eq('id', id),
    ];

    if (currentRecord?.empleado_id && currentRecord?.fecha && currentRecord?.hora_entrada) {
      deletePromises.push(
        clientInttec
          .from('asistencias')
          .delete()
          .eq('empleado_id', currentRecord.empleado_id)
          .eq('fecha', currentRecord.fecha)
          .eq('hora_entrada', currentRecord.hora_entrada),
        clientDaravisa
          .from('asistencias')
          .delete()
          .eq('empleado_id', currentRecord.empleado_id)
          .eq('fecha', currentRecord.fecha)
          .eq('hora_entrada', currentRecord.hora_entrada)
      );
    }

    const results = await Promise.allSettled(deletePromises);
    const errors: any[] = [];
    let deletedCount = 0;
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(r.reason);
      } else if (r.status === 'fulfilled') {
        if (r.value?.error) {
          errors.push(r.value.error);
        } else {
          deletedCount++;
        }
      }
    }

    if (deletedCount === 0 && errors.length > 0) {
      console.error('[DEV DELETE] Error al eliminar en Supabase:', errors[0]);
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


