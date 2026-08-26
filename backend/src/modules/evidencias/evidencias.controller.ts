import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// 1. GET /api/evidencias/catalogos
export const getCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
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
    const { company, env, user } = tenant;
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

    // Insert Evidencia
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

    // Process inventory
    for (const t of trabajosPayload) {
      for (const m of (t.materiales_usados || [])) {
        if (m.usado > 0) {
          const { data: invEmp } = await client
            .from('inventario_empleados')
            .select('id, cantidad_disponible')
            .eq('empleado_id', user.id)
            .eq('producto_id', m.productoId)
            .maybeSingle();
            
          if (invEmp) {
            await client
              .from('inventario_empleados')
              .update({ 
                cantidad_disponible: Math.max(0, invEmp.cantidad_disponible - m.usado),
                updated_at: new Date().toISOString()
              })
              .eq('id', invEmp.id);
              
            // Create movement log
            await client.from('movimientos_inventario').insert({
              producto_id: m.productoId,
              empleado_id: user.id,
              cantidad: m.usado,
              tipo: 'USO_EVIDENCIA',
              motivo: `Utilizado en evidencia. Trabajo: ${t.descripcion?.substring(0, 50) || ''}`,
              empresa: company
            });
          }
        }
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
    return res.status(500).json({ error: error.message });
  }
};
