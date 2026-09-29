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

    const obsText = (payload.observaciones || '').trim();
    const devolucionPayload = {
      ...payload,
      estado: 'PENDIENTE'
    };
    const { data: newDev, error: insertErr } = await client
      .from('devoluciones_empleado')
      .insert([devolucionPayload])
      .select()
      .single();
      
    if (insertErr) throw insertErr;

    const devShortId = newDev?.id ? newDev.id.substring(0, 8).toUpperCase() : '';
    const fullFolio = `DEVOLUCIÓN ${devShortId ? '#' + devShortId + ': ' : ''}${obsText || 'Devolución de material al almacén'}`;

    // 2. Procesar cada material: descontar del empleado, reintegrar a productos y registrar movimiento de ENTRADA
    for (const m of materiales) {
      const qtyDevolver = Number(m.devolver) || Number(m.cantidad) || 0;
      if (qtyDevolver <= 0) continue;

      const devNuevo = Number(m.devolver_nuevo) || (Number(m.devolver_usado) || Number(m.devolver_por_revisar) ? 0 : qtyDevolver);
      const devUsado = Number(m.devolver_usado) || 0;
      const devPorRev = Number(m.devolver_por_revisar) || 0;

      // 2.1 Descontar del inventario del empleado con desglose
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

          const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invData.cantidad_disponible) > 0)
            ? Number(invData.cantidad_disponible)
            : curNuevo;

          const nextNuevo = Math.max(0, baseNuevo - devNuevo);
          const nextUsado = Math.max(0, curUsado - devUsado);
          const nextPorRev = Math.max(0, curPorRev - devPorRev);
          const nextTotal = Math.max(0, Number(invData.cantidad_disponible) - qtyDevolver);

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
              cantidad_disponible: Math.max(0, fallbackInv.cantidad_disponible - qtyDevolver),
              updated_at: new Date().toISOString()
            })
            .eq('id', fallbackInv.id);
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/devoluciones/gasto-material ===
export const reportarGastoMaterial = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const {
      empleado_id,
      empleado_nombre,
      tipo_gasto,
      cliente_id,
      cliente_nombre,
      sucursal_id,
      sucursal_nombre,
      detalle_motivo,
      materiales
    } = req.body;

    if (!empleado_id || !Array.isArray(materiales) || materiales.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para reportar gasto de material' });
    }

    const clientLabel = cliente_nombre ? `${cliente_nombre}${sucursal_nombre ? ' - ' + sucursal_nombre : ''}` : '';
    const fullFolio = `GASTO MATERIAL: ${(detalle_motivo || '').trim()}${tipo_gasto ? ` [${tipo_gasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;

    const { devolver_restante, observaciones_devolucion } = req.body;
    const isCombinedRequest = Boolean(devolver_restante);

    // If it's a combined request, we will bundle the gastos and devoluciones together 
    // and NOT process them immediately.
    if (!isCombinedRequest) {
      for (const m of materiales) {
        const qtyUsed = Number(m.cantidad) || Number(m.devolver) || 0;
        if (qtyUsed <= 0) continue;

        // 1. Obtener y descontar inventario del empleado con desglose
        try {
          const { data: invData } = await client
            .from('inventario_empleados')
            .select('id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar')
            .eq('empleado_id', empleado_id)
            .eq('producto_id', m.productoId)
            .maybeSingle();

          if (invData) {
            const curNuevo = Number(invData.cantidad_nuevo) || 0;
            const curUsado = Number(invData.cantidad_usado) || 0;
            const curPorRev = Number(invData.cantidad_por_revisar) || 0;

            const reqNuevo = Number(m.cantidad_nuevo) || Number(m.devolver_nuevo) || 0;
            const reqUsado = Number(m.cantidad_usado) || Number(m.devolver_usado) || 0;
            const reqPorRev = Number(m.cantidad_por_revisar) || Number(m.devolver_por_revisar) || 0;

            let discountNuevo = 0;
            let discountUsado = 0;
            let discountPorRev = 0;

            if (reqNuevo > 0 || reqUsado > 0 || reqPorRev > 0) {
              discountNuevo = Math.min(curNuevo, reqNuevo);
              discountUsado = Math.min(curUsado, reqUsado);
              discountPorRev = Math.min(curPorRev, reqPorRev);
            } else {
              let remaining = qtyUsed;
              const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invData.cantidad_disponible) > 0)
                ? Number(invData.cantidad_disponible)
                : curNuevo;

              discountNuevo = Math.min(baseNuevo, remaining);
              remaining -= discountNuevo;
              discountUsado = Math.min(curUsado, remaining);
              remaining -= discountUsado;
              discountPorRev = Math.min(curPorRev, remaining);
            }

            const nextNuevo = Math.max(0, curNuevo - discountNuevo);
            const nextUsado = Math.max(0, curUsado - discountUsado);
            const nextPorRev = Math.max(0, curPorRev - discountPorRev);
            const nextTotal = Math.max(0, Number(invData.cantidad_disponible) - qtyUsed);

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
        } catch (invErr: any) {
          console.warn('Fallback al descontar inventario_empleados en gasto material:', invErr?.message);
          const { data: fallbackInv } = await client
            .from('inventario_empleados')
            .select('id, cantidad_disponible')
            .eq('empleado_id', empleado_id)
            .eq('producto_id', m.productoId)
            .maybeSingle();

          if (fallbackInv) {
            await client
              .from('inventario_empleados')
              .update({
                cantidad_disponible: Math.max(0, fallbackInv.cantidad_disponible - qtyUsed),
                updated_at: new Date().toISOString()
              })
              .eq('id', fallbackInv.id);
          }
        }

        // 2. Registrar salida en movimientos_inventario
        try {
          const prodIdToUse = m.productoId || m.producto_id;
          const { error: movErr } = await client
            .from('movimientos_inventario')
            .insert([{
              producto_id: prodIdToUse,
              tipo: 'SALIDA',
              cantidad: qtyUsed,
              folio_factura: fullFolio,
              creado_por: empleado_id,
              fecha: new Date().toISOString()
            }]);
          if (movErr) {
            console.error('Error insertando movimiento de gasto material:', movErr);
          }
        } catch (movErr: any) {
          console.warn('Aviso al insertar movimiento de gasto material:', movErr?.message);
        }
      }
    }

    // 3. Si se solicitó devolver el resto del inventario al almacén
    if (isCombinedRequest) {
      // Consultar el inventario del empleado
      const { data: remainingRows } = await client
        .from('inventario_empleados')
        .select('id, producto_id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar, producto:productos(id, nombre_oficial, sku_interno, unidad)')
        .eq('empleado_id', empleado_id)
        .gt('cantidad_disponible', 0);

      const itemsToDevolve: any[] = [];
      const devObs = observaciones_devolucion || `SOLICITUD COMBINADA: Gasto y devolución de sobrantes. Trabajo: ${(detalle_motivo || '').trim() || 'Servicio'}`;

      // Convert materiales array into a map for easy lookup of used amounts
      const usedMap = new Map();
      for (const m of materiales) {
        const pId = m.productoId || m.producto_id;
        const qtyUsed = Number(m.cantidad) || Number(m.devolver) || 0;
        if (pId && qtyUsed > 0) {
          usedMap.set(pId, qtyUsed);
        }
      }

      for (const row of (remainingRows || [])) {
        const prod = Array.isArray(row.producto) ? row.producto[0] : (row.producto || {});
        const qtyTotal = Number(row.cantidad_disponible) || 0;
        
        if (qtyTotal > 0) {
          const qtyUsed = usedMap.get(row.producto_id) || 0;
          const qtyToReturn = Math.max(0, qtyTotal - qtyUsed);

          const cNuevo = Number(row.cantidad_nuevo) || 0;
          const cUsado = Number(row.cantidad_usado) || 0;
          const cPorRev = Number(row.cantidad_por_revisar) || 0;

          const devNuevo = (cNuevo === 0 && cUsado === 0 && cPorRev === 0) ? qtyToReturn : Math.max(0, cNuevo - qtyUsed); // rough estimation if they have used some
          const devUsado = cUsado;
          const devPorRev = cPorRev;

          itemsToDevolve.push({
            productoId: row.producto_id,
            nombre: prod.nombre_oficial || 'Material',
            sku: prod.sku_interno || '',
            unidad: prod.unidad || 'pza',
            maximo: qtyTotal,
            gastar: qtyUsed, // We explicitly add gastar!
            devolver: qtyToReturn,
            devolver_nuevo: devNuevo,
            devolver_usado: devUsado,
            devolver_por_revisar: devPorRev,
            folio_gasto: fullFolio
          });

          // Poner en 0 el inventario del empleado
          await client
            .from('inventario_empleados')
            .update({
              cantidad_disponible: 0,
              cantidad_nuevo: 0,
              cantidad_usado: 0,
              cantidad_por_revisar: 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', row.id);
        }
      }

      if (itemsToDevolve.length > 0) {
        try {
          const { error: insertErr } = await client
            .from('devoluciones_empleado')
            .insert([{
              empleado_id,
              empleado_nombre: empleado_nombre || 'Empleado',
              materiales: JSON.stringify(itemsToDevolve),
              observaciones: devObs,
              estado: 'PENDIENTE',
              creado_en: new Date().toISOString()
            }]);
          
          if (insertErr) {
            console.warn('Error from Supabase inserting combined request:', insertErr);
          }
        } catch (devInsErr: any) {
          console.warn('Error al insertar devoluciones_empleado combinada:', devInsErr?.message);
        }
      }
    }

    return res.json({ success: true, devolver_restante: Boolean(devolver_restante) });
  } catch (error: any) {
    console.error('Error en reportarGastoMaterial:', error);
    return res.status(500).json({ error: error.message });
  }
};

