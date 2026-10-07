import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

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
          hora_salida: '18:00:00',
          descripcion: 'Cierre automático 6:00 PM (olvido de checada)'
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

    // 1. Si es un latido de estado o evento sin usuario, responder ACK oficial al instante
    if (!employeeNo && !employeeName) {
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
    let rawDateTime = event?.dateTime || event?.AccessControllerEvent?.dateTime || event?.time;
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

    const isToday = fechaJornada === serverToday;

    console.log(`\n======================================================`);
    console.log(`📡 [HIKVISION CHECADOR] -> 👤 ${usuario.nombre} (${employeeNo || 'Sin No'})`);
    console.log(`📅 Fecha/Hora Dispositivo: ${fechaJornada} ${horaLocal} | Modo: ${verifyMode}`);
    console.log(`🎯 Estado: ${isToday ? '🟢 EVENTO DE HOY EN VIVO (GUARDANDO)' : `⏩ HISTÓRICO PENDIENTE DE COLA (DESCARTANDO)`}`);
    console.log(`======================================================`);

    // FILTRO DE REGISTROS PASADOS: Si el evento es de días anteriores (ej. septiembre o días pasados),
    // responder 200 OK inmediatamente al checador para vaciar su cola, pero SIN guardar en la BD.
    if (fechaJornada < serverToday) {
      return res.status(200).json({
        statusCode: 1,
        statusString: 'OK',
        subStatusCode: 'ok',
        message: 'Evento histórico descartado'
      });
    }

    // Buscar si hay turno abierto (con entrada y sin salida)
    const { data: openShift } = await clientInttec
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fechaJornada)
      .is('hora_salida', null)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openShift) {
      // Registrar ENTRADA
      console.log(`[HIKVISION] Registrando ENTRADA para ${usuario.nombre}`);

      // Auto-cierre de turnos anteriores abiertos (olvidos de checada): fijar salida a las 18:00:00
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
        tipo: 'ENTRADA',
        empleado: usuario.nombre,
        hora: horaLocal
      });
    } else {
      // Evitar registrar salida accidental si checan antes de 10 minutos (600 segundos) de su entrada
      if (openShift.hora_entrada) {
        const [eH, eM, eS] = openShift.hora_entrada.split(':').map(Number);
        const [cH, cM, cS] = horaLocal.split(':').map(Number);
        const entradaSegundos = (eH * 3600) + (eM * 60) + (eS || 0);
        const actualSegundos = (cH * 3600) + (cM * 60) + (cS || 0);
        const diffSegundos = actualSegundos - entradaSegundos;
        if (diffSegundos >= 0 && diffSegundos < 600) {
          console.log(`[HIKVISION] Checada ignorada para ${usuario.nombre} (menos de 10 min desde su entrada: ${diffSegundos}s)`);
          return res.status(200).json({
            statusCode: 1,
            statusString: 'OK',
            message: 'Checada ignorada (menos de 10 min de la entrada)'
          });
        }
      }

      // Registrar SALIDA
      console.log(`[HIKVISION] Registrando SALIDA para ${usuario.nombre}`);
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
        tipo: 'SALIDA',
        empleado: usuario.nombre,
        hora: horaLocal
      });
    }
  } catch (error: any) {
    console.error('[HIKVISION WEBHOOK ERROR]:', error);
    // Responder 200 con status de error para que el checador no se trabe en reintentos infinitos
    return res.status(200).json({ statusCode: 0, statusString: 'FAIL', error: error.message });
  }
};

