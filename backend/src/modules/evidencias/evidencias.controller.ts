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

    const [cliRes, sucRes, prodRes] = await Promise.all([
      client.from('clientes').select('*').order('nombre'),
      client.from('sucursales_cliente').select('*').order('nombre'),
      user?.id ? client.from('inventario_empleados').select('cantidad_disponible, producto_id, productos(sku_interno, nombre_oficial)').eq('empleado_id', user.id).gt('cantidad_disponible', 0) : Promise.resolve({ data: [], error: null }),
    ]);

    if (cliRes.error) throw cliRes.error;
    if (sucRes.error) throw sucRes.error;
    if (prodRes.error) throw prodRes.error;

    return res.json({
      clientes: cliRes.data || [],
      sucursales: sucRes.data || [],
      inventario: prodRes.data || []
    });

  } catch (error: any) {
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

    // 1. Agrupar y calcular uso total por material para evitar inconsistencias y validar antes
    const materialUsage: Record<string, { usado: number; nombre: string; dbId?: string; currentStock?: number; motivos: string[] }> = {};
    for (const t of trabajosPayload) {
      for (const m of (t.materiales_usados || [])) {
        if (m.usado > 0) {
          if (!materialUsage[m.productoId]) {
            materialUsage[m.productoId] = { usado: 0, nombre: m.nombre, motivos: [] };
          }
          materialUsage[m.productoId].usado += m.usado;
          if (t.descripcion) {
            materialUsage[m.productoId].motivos.push(`Trabajo: ${t.descripcion.substring(0, 50)}`);
          }
        }
      }
    }

    // 2. Validar que exista suficiente stock en el inventario del empleado para todos los materiales
    for (const prodId of Object.keys(materialUsage)) {
      const item = materialUsage[prodId];
      const { data: invEmp, error: invError } = await client
        .from('inventario_empleados')
        .select('id, cantidad_disponible')
        .eq('empleado_id', user.id)
        .eq('producto_id', prodId)
        .maybeSingle();

      if (invError || !invEmp) {
        return res.status(400).json({ error: `No se encontró inventario para el material: ${item.nombre}` });
      }

      if (invEmp.cantidad_disponible < item.usado) {
        return res.status(400).json({ error: `Stock insuficiente para: ${item.nombre}. Disponible: ${invEmp.cantidad_disponible}, Requerido: ${item.usado}` });
      }
      
      item.dbId = invEmp.id;
      item.currentStock = invEmp.cantidad_disponible;
    }

    // 3. Insertar Evidencia
    const { data: evidenciaData, error: evidenciaError } = await client.from('evidencias').insert([
      {
        empleado_id: user.id,
        empleado_nombre: user.nombre,
        cliente,
        descripcion_trabajo,
        materiales_usados,
        observaciones,
        foto_antes_url,
        foto_despues_url,
        fotos_adicionales_urls,
      }
    ]).select().single();

    if (evidenciaError) throw evidenciaError;

    // 4. Descontar del inventario y registrar movimientos de forma consistente
    for (const prodId of Object.keys(materialUsage)) {
      const item = materialUsage[prodId];
      if (item.dbId && item.currentStock !== undefined) {
        // Actualizar inventario
        await client
          .from('inventario_empleados')
          .update({ 
            cantidad_disponible: item.currentStock - item.usado,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.dbId);
          
        // Crear log de movimiento
        await client.from('movimientos_inventario').insert({
          producto_id: prodId,
          empleado_id: user.id,
          cantidad: item.usado,
          tipo: 'USO_EVIDENCIA',
          motivo: `Utilizado en evidencia. ${item.motivos.join(' | ')}`,
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
    } = req.body;

    const { data, error } = await client
      .from('evidencias')
      .update({
        cliente,
        descripcion_trabajo,
        materiales_usados,
        observaciones,
        foto_antes_url,
        foto_despues_url,
        fotos_adicionales_urls,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

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
