import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// 1. GET /api/evidencias/catalogos
export const getCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const client = getSupabaseClient(company, env);

    const [cliRes, sucRes, prodRes, usersRes] = await Promise.all([
      client.from('clientes').select('*').order('nombre'),
      client.from('sucursales_cliente').select('*').order('nombre'),
      user?.id ? client.from('inventario_empleados')
        .select('id, cantidad_disponible, producto_id, empleado_id, productos(id, sku_interno, nombre_oficial, unidad)')
        .eq('empleado_id', user.id)
        .gt('cantidad_disponible', 0) : Promise.resolve({ data: [], error: null }),
      client.from('usuarios').select('id, nombre, email, rol').order('nombre'),
    ]);

    if (cliRes.error) throw cliRes.error;
    if (sucRes.error) throw sucRes.error;
    if (prodRes.error) throw prodRes.error;
    if (usersRes.error) throw usersRes.error;

    const allUsers = usersRes.data || [];
    const colaboradoresDisponibles = allUsers.filter((u: any) => u.id !== user?.id);

    return res.json({
      clientes: cliRes.data || [],
      sucursales: sucRes.data || [],
      inventario: prodRes.data || [],
      empleados: colaboradoresDisponibles,
      todosLosEmpleados: allUsers,
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 1.1 GET /api/evidencias/inventario-colaboradores?ids=id1,id2
export const getInventarioColaboradores = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { ids } = req.query;
    if (!ids) {
      return res.json({ inventario: [] });
    }

    const idList = (typeof ids === 'string' ? ids.split(',') : (ids as string[])).map((s: string) => s.trim()).filter(Boolean);
    if (idList.length === 0) {
      return res.json({ inventario: [] });
    }

    const { data, error } = await client
      .from('inventario_empleados')
      .select('id, cantidad_disponible, producto_id, empleado_id, productos(id, sku_interno, nombre_oficial, unidad)')
      .in('empleado_id', idList)
      .gt('cantidad_disponible', 0);

    if (error) throw error;

    return res.json({ inventario: data || [] });
  } catch (error: any) {
    console.error('Error en getInventarioColaboradores:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/evidencias
export const crearEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const client = getSupabaseClient(company, env);

    const {
      cliente,
      descripcion_trabajo, // This is a JSON string of trabajosPayload
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
      colaboradores,
    } = req.body;

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Parse the trabajosPayload to process inventory deducts
    let trabajosPayload: any[] = [];
    try {
      if (descripcion_trabajo) {
        trabajosPayload = JSON.parse(descripcion_trabajo);
      }
    } catch (e) {}

    // 1. Agrupar y calcular uso total por (empleado_id + material) para soportar múltiples colaboradores
    const materialUsage: Record<string, { 
      empleadoId: string;
      empleadoNombre: string;
      productoId: string;
      usado: number;
      nombre: string;
      dbId?: string;
      currentStock?: number;
      motivos: string[];
    }> = {};

    for (const t of trabajosPayload) {
      for (const m of (t.materiales_usados || [])) {
        if (m.usado > 0) {
          const targetEmpleadoId = m.empleadoId || user.id;
          const targetEmpleadoNombre = m.empleadoNombre || (targetEmpleadoId === user.id ? user.nombre : 'Colaborador');
          const compositeKey = `${targetEmpleadoId}___${m.productoId}`;

          if (!materialUsage[compositeKey]) {
            materialUsage[compositeKey] = {
              empleadoId: targetEmpleadoId,
              empleadoNombre: targetEmpleadoNombre,
              productoId: m.productoId,
              usado: 0,
              nombre: m.nombre,
              motivos: []
            };
          }
          materialUsage[compositeKey].usado += m.usado;
          if (t.descripcion) {
            materialUsage[compositeKey].motivos.push(`Trabajo: ${t.descripcion.substring(0, 50)}`);
          }
        }
      }
    }

    // 2. Validar que exista suficiente stock en el inventario del empleado correspondiente para cada material
    for (const key of Object.keys(materialUsage)) {
      const item = materialUsage[key];
      const { data: invEmp, error: invError } = await client
        .from('inventario_empleados')
        .select('id, cantidad_disponible')
        .eq('empleado_id', item.empleadoId)
        .eq('producto_id', item.productoId)
        .maybeSingle();

      if (invError || !invEmp) {
        return res.status(400).json({ 
          error: `No se encontró inventario para el material: ${item.nombre} en el stock de ${item.empleadoNombre}` 
        });
      }

      if (invEmp.cantidad_disponible < item.usado) {
        return res.status(400).json({ 
          error: `Stock insuficiente para: ${item.nombre} (${item.empleadoNombre}). Disponible: ${invEmp.cantidad_disponible}, Requerido: ${item.usado}` 
        });
      }
      
      item.dbId = invEmp.id;
      item.currentStock = invEmp.cantidad_disponible;
    }

    // 3. Insertar Evidencia con colaboradores
    let insertPayload: any = {
      empleado_id: user.id,
      empleado_nombre: user.nombre,
      cliente,
      descripcion_trabajo,
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
    };

    if (colaboradores !== undefined && colaboradores !== null) {
      insertPayload.colaboradores = typeof colaboradores === 'object' ? colaboradores : JSON.parse(colaboradores);
    }

    let { data: evidenciaData, error: evidenciaError } = await client
      .from('evidencias')
      .insert([insertPayload])
      .select()
      .single();

    if (evidenciaError) {
      // Si la columna colaboradores no existe en la base de datos, reintentar sin ella
      if (evidenciaError.message?.includes('colaboradores') || (evidenciaError as any).code === 'PGRST204') {
        console.warn('Columna colaboradores no detectada en tabla evidencias, guardando sin columna dedicada.');
        delete insertPayload.colaboradores;
        const fallbackRes = await client.from('evidencias').insert([insertPayload]).select().single();
        if (fallbackRes.error) throw fallbackRes.error;
        evidenciaData = fallbackRes.data;
      } else {
        throw evidenciaError;
      }
    }

    // 4. Descontar del inventario y registrar movimientos de forma individual para cada empleado
    for (const key of Object.keys(materialUsage)) {
      const item = materialUsage[key];
      if (item.dbId && item.currentStock !== undefined) {
        // Actualizar inventario de quien aportó el material
        await client
          .from('inventario_empleados')
          .update({ 
            cantidad_disponible: item.currentStock - item.usado,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.dbId);
          
        // Crear log de movimiento detallado
        const esPropio = item.empleadoId === user.id;
        const motivoDetalle = esPropio
          ? `Utilizado en evidencia (${cliente || 'Sin cliente'}). ${item.motivos.join(' | ')}`
          : `Utilizado como colaborador en reporte de ${user.nombre} (${cliente || 'Sin cliente'}). ${item.motivos.join(' | ')}`;

        await client.from('movimientos_inventario').insert({
          producto_id: item.productoId,
          empleado_id: item.empleadoId,
          cantidad: item.usado,
          tipo: 'USO_EVIDENCIA',
          motivo: motivoDetalle,
          empresa: company
        });
      }
    }

    return res.status(201).json(evidenciaData);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 3. GET /api/evidencias/admin/all
export const getAdminEvidencias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [evidencesRes, employeesRes] = await Promise.all([
      client.from('evidencias').select('*').order('created_at', { ascending: false }),
      client.from('usuarios').select('*').eq('rol', 'EMPLEADO').order('nombre'),
    ]);

    if (evidencesRes.error) throw evidencesRes.error;
    if (employeesRes.error) throw employeesRes.error;

    return res.json({
      evidencias: evidencesRes.data || [],
      employees: employeesRes.data || []
    });

  } catch (error: any) {
    console.error('[GET MIS EVIDENCIAS ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 4. GET /api/evidencias/mis-evidencias
export const getMisEvidencias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const client = getSupabaseClient(company, env);

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { data, error } = await client
      .from('evidencias')
      .select('*')
      .eq('empleado_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ evidencias: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 5. PUT /api/evidencias/admin/:id
export const actualizarEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const client = getSupabaseClient(company, env);
    const { id } = req.params;

    if (!user || (user.rol !== 'ADMIN' && user.rol !== 'DEV')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const {
      cliente,
      descripcion_trabajo,
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
      colaboradores,
    } = req.body;

    const updatePayload: any = {
      cliente,
      descripcion_trabajo,
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
    };

    if (colaboradores !== undefined) {
      updatePayload.colaboradores = typeof colaboradores === 'object' ? colaboradores : JSON.parse(colaboradores);
    }

    let { data, error } = await client
      .from('evidencias')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.message?.includes('colaboradores') || (error as any).code === 'PGRST204') {
        delete updatePayload.colaboradores;
        const retry = await client.from('evidencias').update(updatePayload).eq('id', id).select().single();
        if (retry.error) throw retry.error;
        data = retry.data;
      } else {
        throw error;
      }
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 6. GET /api/evidencias/admin/:id
export const getAdminEvidenciaById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    const { id } = req.params;

    const { data, error } = await client
      .from('evidencias')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return res.json({ evidencia: data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
