import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// === GET /api/retiro-material/productos ===
export const getProductosDisponibles = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { data, error } = await client
      .from('productos')
      .select('id, sku_interno, nombre_oficial, stock_actual, stock_nuevo, stock_usado, stock_por_revisar, unidad')
      .eq('activo', true)
      .gt('stock_actual', 0)
      .order('nombre_oficial');

    if (error) throw error;
    
    const mapped = (data || []).map((p: any) => {
      let unidad = p.unidad;
      if (!unidad || unidad.trim() === '') {
        const name = (p.nombre_oficial || '').toLowerCase();
        if (name.includes('metro') || name.includes('cable') || name.includes('bobina')) {
          unidad = 'mts';
        } else {
          unidad = 'pza';
        }
      }
      return {
        ...p,
        unidad
      };
    });

    return res.json({ productos: mapped });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/retiro-material/confirmar ===
export const confirmarRetiro = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);
    
    // We assume we can grab the user from the req (since we have auth middleware, req.user might be available)
    // Actually the frontend is passing user info directly to the DB, but with API we can just expect `currentUser` in body
    const { cart, motivoRetiro, currentUser } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0 || !currentUser || !currentUser.id) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    for (const item of cart) {
      const { data: prodData, error: prodErr } = await client
        .from('productos')
        .select('*')
        .eq('id', item.producto.id)
        .single();
        
      if (prodErr || !prodData) continue;
      
      let toDiscount = item.cantidad;
      let nuevo = Number(prodData.stock_nuevo) || 0;
      let usado = Number(prodData.stock_usado) || 0;
      let porRevisar = Number(prodData.stock_por_revisar) || 0;

      if (nuevo >= toDiscount) {
        nuevo -= toDiscount;
        toDiscount = 0;
      } else {
        toDiscount -= nuevo;
        nuevo = 0;
        if (usado >= toDiscount) {
          usado -= toDiscount;
          toDiscount = 0;
        } else {
          toDiscount -= usado;
          usado = 0;
          porRevisar = Math.max(0, porRevisar - toDiscount);
        }
      }
      const newStock = Math.round((nuevo + usado + porRevisar) * 100) / 100;

      // 1. Descontar del inventario
      const { error: stockErr } = await client
        .from('productos')
        .update({ stock_actual: newStock, stock_nuevo: nuevo, stock_usado: usado, stock_por_revisar: porRevisar })
        .eq('id', item.producto.id);

      if (stockErr) throw stockErr;

      // 2. Registrar movimiento de salida
      const { error: moveErr } = await client
        .from('movimientos_inventario')
        .insert([
          {
            producto_id: item.producto.id,
            tipo: 'SALIDA',
            cantidad: item.cantidad,
            folio_factura: `RETIRO: ${motivoRetiro.trim()}`,
            creado_por: currentUser.id,
          },
        ]);

      if (moveErr) {
        console.warn('No se pudo registrar histórico:', moveErr.message);
      }

      // 3. Agregar al inventario del empleado
      const { data: invEmp } = await client
        .from('inventario_empleados')
        .select('id, cantidad_disponible')
        .eq('empleado_id', currentUser.id)
        .eq('producto_id', item.producto.id)
        .maybeSingle();

      if (invEmp) {
        await client
          .from('inventario_empleados')
          .update({ cantidad_disponible: invEmp.cantidad_disponible + item.cantidad, updated_at: new Date().toISOString() })
          .eq('id', invEmp.id);
      } else {
        await client
          .from('inventario_empleados')
          .insert([{
            empleado_id: currentUser.id,
            producto_id: item.producto.id,
            cantidad_disponible: item.cantidad
          }]);
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
