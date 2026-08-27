import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// === GET /api/devoluciones/inventario ===
export const getInventarioEmpleado = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);
    
    // Auth user info passed from frontend via query params or from a verified auth token
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    const { data, error } = await client
      .from('inventario_empleados')
      .select('id, producto_id, cantidad_disponible, producto:productos(nombre_oficial, sku_interno)')
      .eq('empleado_id', userId)
      .gt('cantidad_disponible', 0)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return res.json({ inventario: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/devoluciones/solicitar ===
export const solicitarDevolucion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { payload, materiales } = req.body;
    
    if (!payload || !materiales) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // 1. Insertar devolución
    const { error: insertErr } = await client
      .from('devoluciones_empleado')
      .insert([payload]);
      
    if (insertErr) throw insertErr;

    // 2. Descontar del inventario del empleado
    for (const m of materiales) {
      if (m.devolver > 0) {
        const { data: invData } = await client
          .from('inventario_empleados')
          .select('id, cantidad_disponible')
          .eq('empleado_id', payload.empleado_id)
          .eq('producto_id', m.productoId)
          .maybeSingle();
          
        if (invData) {
          await client
            .from('inventario_empleados')
            .update({
              cantidad_disponible: Math.max(0, invData.cantidad_disponible - m.devolver)
            })
            .eq('id', invData.id);
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
