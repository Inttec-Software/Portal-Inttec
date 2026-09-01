import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// 1. GET /api/vehiculos
export const getVehiculos = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    
    // Default to soloActivos=true if not passed, to match frontend behavior
    const { soloActivos } = req.query;
    let query = supabase.from('vehiculos').select('*');
    
    if (soloActivos === 'true' || soloActivos === undefined) {
      query = query.eq('activo', true);
    }
    
    const { data, error } = await query.order('marca', { ascending: true });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/vehiculos
export const createVehiculo = async (req: Request, res: Response) => {
  try {
    const { env } = req.tenant!;
    const { company: activeCompany } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';
    
    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

    const { data, error } = await primaryClient
      .from('vehiculos')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('vehiculos').upsert([data]);
    } catch (syncErr: any) {
      console.warn('Error syncing vehiculo to secondary db:', syncErr);
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 3. PUT /api/vehiculos/:id
export const updateVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = req.tenant!;
    const { company: activeCompany } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

    const { data, error } = await primaryClient
      .from('vehiculos')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('vehiculos').update(req.body).eq('id', id);
    } catch (syncErr: any) {
      console.warn('Error updating vehiculo in secondary db:', syncErr);
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 4. DELETE /api/vehiculos/:id
export const deleteVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = req.tenant!;
    
    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    const deleteInttec = async () => clientInttec.from('vehiculos').delete().eq('id', id);
    const deleteDaravisa = async () => clientDaravisa.from('vehiculos').delete().eq('id', id);

    await Promise.allSettled([deleteInttec(), deleteDaravisa()]);

    res.json({ success: true, message: 'Vehiculo eliminado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 5. GET /api/vehiculos/gasolina
export const getRegistrosGasolina = async (req: Request, res: Response) => {
  try {
    const { env } = req.tenant!;
    const { vehiculoId, empleadoId, placas } = req.query;

    const inttecClient = getSupabaseClient('inttec', env);
    const daravisaClient = getSupabaseClient('daravisa', env);

    let targetPlacas = placas as string | undefined;

    // We query activeCompany client first if we need to find plates by vehiculoId
    if (vehiculoId && !targetPlacas) {
      try {
        const primaryClient = getSupabaseClient(req.tenant!.company, env);
        const { data: v } = await primaryClient.from('vehiculos').select('placas').eq('id', vehiculoId).single();
        if (v?.placas) targetPlacas = v.placas;
      } catch (e) {}
    }

    const fetchFromClient = async (client: any, empresaNombre: string) => {
      try {
        let query = client
          .from('registro_gasolina')
          .select('*, vehiculo:vehiculo_id (marca, modelo, placas), empleado:empleado_id (nombre)');

        if (empleadoId) {
          query = query.eq('empleado_id', empleadoId);
        }

        const { data, error } = await query;
        if (error || !data) return [];
        
        return data.map((row: any) => ({
          ...row,
          vehiculo_marca: row.vehiculo?.marca,
          vehiculo_modelo: row.vehiculo?.modelo,
          vehiculo_placas: row.vehiculo?.placas,
          empleado_nombre: row.empleado?.nombre,
          empresa_origen: empresaNombre,
        }));
      } catch (err) {
        return [];
      }
    };

    const [inttecLogs, daravisaLogs] = await Promise.all([
      fetchFromClient(inttecClient, 'INTTEC'),
      fetchFromClient(daravisaClient, 'DARAVISA'),
    ]);

    const logMap = new Map<string, any>();
    [...inttecLogs, ...daravisaLogs].forEach(item => {
      if (item && item.id) {
        logMap.set(item.id, item);
      }
    });

    let allLogs = Array.from(logMap.values());

    if (targetPlacas) {
      const cleanTarget = targetPlacas.toLowerCase().trim();
      allLogs = allLogs.filter(item => (item.vehiculo_placas || '').toLowerCase().trim() === cleanTarget);
    }

    allLogs.sort((a, b) => {
      const timeA = new Date(a.fecha || a.created_at).getTime();
      const timeB = new Date(b.fecha || b.created_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.kilometraje_actual || 0) - Number(b.kilometraje_actual || 0);
    });

    for (let i = 0; i < allLogs.length; i++) {
      if (i > 0) {
        const prev = allLogs[i - 1];
        const kmAnterior = Number(prev.kilometraje_actual || 0);
        const kmActual = Number(allLogs[i].kilometraje_actual || 0);
        const litros = Number(allLogs[i].litros || 0);
        const kmRecorridos = Math.max(0, kmActual - kmAnterior);

        allLogs[i].kilometraje_anterior = kmAnterior;
        allLogs[i].distancia_recorrida = kmRecorridos;
        allLogs[i].rendimiento_km_l = litros > 0 && kmRecorridos > 0 ? Number((kmRecorridos / litros).toFixed(2)) : 0;
      } else {
        allLogs[i].kilometraje_anterior = null;
        allLogs[i].distancia_recorrida = 0;
        allLogs[i].rendimiento_km_l = 0;
      }
    }

    res.json(allLogs.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 6. POST /api/vehiculos/gasolina
export const createRegistroGasolina = async (req: Request, res: Response) => {
  try {
    const { env, company } = req.tenant!;
    const primaryClient = getSupabaseClient(company, env);
    
    // We insert into active company database
    const { data, error } = await primaryClient
      .from('registro_gasolina')
      .insert([req.body])
      .select()
      .single();
      
    if (error) throw error;

    // Synchronize current mileage in BOTH companies
    if (req.body.vehiculo_id && req.body.kilometraje_actual) {
      try {
        const { data: v } = await primaryClient.from('vehiculos').select('placas').eq('id', req.body.vehiculo_id).single();
        if (v?.placas) {
          const clientInttec = getSupabaseClient('inttec', env);
          const clientDaravisa = getSupabaseClient('daravisa', env);
          await Promise.allSettled([
            clientInttec.from('vehiculos').update({ kilometraje_actual: req.body.kilometraje_actual }).eq('placas', v.placas),
            clientDaravisa.from('vehiculos').update({ kilometraje_actual: req.body.kilometraje_actual }).eq('placas', v.placas),
          ]);
        }
      } catch (err) {
        console.warn('Error syncing km', err);
      }
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
