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
