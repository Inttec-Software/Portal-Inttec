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

    let rows: any[] = [];
    const { data, error } = await client
      .from('inventario_empleados')
      .select('id, producto_id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar, producto:productos(id, nombre_oficial, sku_interno, unidad, stock_actual, stock_nuevo, stock_usado, stock_por_revisar)')
      .eq('empleado_id', userId)
      .gt('cantidad_disponible', 0)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[getInventarioEmpleado] Retrying with basic columns:', error.message);
      // Fallback query if condition columns or relation syntax fails
      const { data: fallbackData, error: fallbackError } = await client
        .from('inventario_empleados')
        .select('id, producto_id, cantidad_disponible')
        .eq('empleado_id', userId)
        .gt('cantidad_disponible', 0);

      if (fallbackError) {
        console.error('[getInventarioEmpleado] Fallback Error:', fallbackError);
        return res.status(500).json({ error: error.message || fallbackError.message });
      }

      // Fetch products manually if relation syntax fails
      const prodIds = (fallbackData || []).map((item: any) => item.producto_id);
      let prodMap: Record<string, any> = {};
      if (prodIds.length > 0) {
        const { data: prods } = await client
          .from('productos')
          .select('id, nombre_oficial, sku_interno, unidad, stock_actual, stock_nuevo, stock_usado, stock_por_revisar')
          .in('id', prodIds);
        (prods || []).forEach((p: any) => { prodMap[p.id] = p; });
      }

      rows = (fallbackData || []).map((item: any) => ({
        ...item,
        cantidad_nuevo: item.cantidad_disponible,
        cantidad_usado: 0,
        cantidad_por_revisar: 0,
        producto: prodMap[item.producto_id] || { nombre_oficial: 'Desconocido', sku_interno: '' }
      }));
    } else {
      rows = (data || []).map((item: any) => {
        const cTotal = Number(item.cantidad_disponible) || 0;
        const cNuevo = Number(item.cantidad_nuevo) || 0;
        const cUsado = Number(item.cantidad_usado) || 0;
        const cPorRev = Number(item.cantidad_por_revisar) || 0;

        // Si no tiene desglose previo en la BD del empleado, se asume nuevo
        if (cNuevo === 0 && cUsado === 0 && cPorRev === 0 && cTotal > 0) {
          return { ...item, cantidad_nuevo: cTotal, cantidad_usado: 0, cantidad_por_revisar: 0 };
        }
        return item;
      });
    }

    return res.json({ inventario: rows });
  } catch (error: any) {
    console.error('[getInventarioEmpleado] Unexpected error:', error);
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

    // 2. Descontar del inventario del empleado con desglose
    for (const m of materiales) {
      if (m.devolver > 0) {
        try {
          const { data: invData } = await client
            .from('inventario_empleados')
            .select('id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar')
            .eq('empleado_id', payload.empleado_id)
            .eq('producto_id', m.productoId)
            .maybeSingle();
            
          if (invData) {
            const curNuevo = Number(invData.cantidad_nuevo) || 0;
            const curUsado = Number(invData.cantidad_usado) || 0;
            const curPorRev = Number(invData.cantidad_por_revisar) || 0;

            const devNuevo = Number(m.devolver_nuevo) || 0;
            const devUsado = Number(m.devolver_usado) || 0;
            const devPorRev = Number(m.devolver_por_revisar) || 0;

            // Si el registro original no tenía estados desglosados
            const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invData.cantidad_disponible) > 0)
              ? Number(invData.cantidad_disponible)
              : curNuevo;

            const nextNuevo = Math.max(0, baseNuevo - devNuevo);
            const nextUsado = Math.max(0, curUsado - devUsado);
            const nextPorRev = Math.max(0, curPorRev - devPorRev);
            const nextTotal = Math.max(0, Number(invData.cantidad_disponible) - Number(m.devolver));

            await client
              .from('inventario_empleados')
              .update({
                cantidad_disponible: nextTotal,
                cantidad_nuevo: nextNuevo,
                cantidad_usado: nextUsado,
                cantidad_por_revisar: nextPorRev,
                updated_at: new Date().toISOString()
              })
              .eq('id', invData.id);
          }
        } catch (invDiscErr: any) {
          console.warn('Fallback al descontar inventario_empleados:', invDiscErr?.message);
          const { data: fallbackInv } = await client
            .from('inventario_empleados')
            .select('id, cantidad_disponible')
            .eq('empleado_id', payload.empleado_id)
            .eq('producto_id', m.productoId)
            .maybeSingle();

          if (fallbackInv) {
            await client
              .from('inventario_empleados')
              .update({
                cantidad_disponible: Math.max(0, fallbackInv.cantidad_disponible - m.devolver),
                updated_at: new Date().toISOString()
              })
              .eq('id', fallbackInv.id);
          }
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
