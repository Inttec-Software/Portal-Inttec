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
    // 1. Insertar registro en devoluciones_empleado
    const devolucionPayload = {
      ...payload,
      estado: 'APROBADO'
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

      // 2.2 Reintegrar unidades al almacén general (tabla productos)
      try {
        const { data: prodData } = await client
          .from('productos')
          .select('id, stock_actual, stock_nuevo, stock_usado, stock_por_revisar')
          .eq('id', m.productoId)
          .single();

        if (prodData) {
          const curStock = Number(prodData.stock_actual) || 0;
          const curNuevo = Number(prodData.stock_nuevo) || 0;
          const curUsado = Number(prodData.stock_usado) || 0;
          const curPorRev = Number(prodData.stock_por_revisar) || 0;

          const updatedNuevo = curNuevo + devNuevo;
          const updatedUsado = curUsado + devUsado;
          const updatedPorRev = curPorRev + devPorRev;
          const updatedStock = Math.round((updatedNuevo + updatedUsado + updatedPorRev) * 100) / 100;

          await client
            .from('productos')
            .update({
              stock_actual: updatedStock > 0 ? updatedStock : (curStock + qtyDevolver),
              stock_nuevo: updatedNuevo,
              stock_usado: updatedUsado,
              stock_por_revisar: updatedPorRev
            })
            .eq('id', m.productoId);
        }
      } catch (prodUpdErr: any) {
        console.warn('Error reintegrando stock en productos:', prodUpdErr?.message);
      }

      // 2.3 Registrar movimiento de ENTRADA en movimientos_inventario
      try {
        await client
          .from('movimientos_inventario')
          .insert([{
            producto_id: m.productoId,
            tipo: 'ENTRADA',
            cantidad: qtyDevolver,
            folio_factura: fullFolio,
            creado_por: payload.empleado_id,
            fecha: new Date().toISOString()
          }]);
      } catch (movErr: any) {
        console.warn('Error registrando movimiento de ENTRADA por devolución:', movErr?.message);
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

    // 3. Si se solicitó devolver el resto del inventario al almacén
    const { devolver_restante, observaciones_devolucion } = req.body;
    if (devolver_restante) {
      // Consultar el inventario actualizado del empleado
      const { data: remainingRows } = await client
        .from('inventario_empleados')
        .select('id, producto_id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar, producto:productos(id, nombre_oficial, sku_interno, unidad)')
        .eq('empleado_id', empleado_id)
        .gt('cantidad_disponible', 0);

      const itemsToDevolve: any[] = [];
      const devObs = observaciones_devolucion || `DEVOLUCIÓN: Devolución de sobrantes tras gasto de material en: ${(detalle_motivo || '').trim() || 'Servicio'}`;

      for (const row of (remainingRows || [])) {
        const prod = Array.isArray(row.producto) ? row.producto[0] : (row.producto || {});
        const qtyAvailable = Number(row.cantidad_disponible) || 0;
        if (qtyAvailable > 0) {
          const cNuevo = Number(row.cantidad_nuevo) || 0;
          const cUsado = Number(row.cantidad_usado) || 0;
          const cPorRev = Number(row.cantidad_por_revisar) || 0;

          const devNuevo = (cNuevo === 0 && cUsado === 0 && cPorRev === 0) ? qtyAvailable : cNuevo;
          const devUsado = cUsado;
          const devPorRev = cPorRev;

          itemsToDevolve.push({
            productoId: row.producto_id,
            nombre: prod.nombre_oficial || 'Material',
            sku: prod.sku_interno || '',
            unidad: prod.unidad || 'pza',
            maximo: qtyAvailable,
            devolver: qtyAvailable,
            devolver_nuevo: devNuevo,
            devolver_usado: devUsado,
            devolver_por_revisar: devPorRev
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

          // Reintegrar al stock general en productos
          try {
            const { data: prodData } = await client
              .from('productos')
              .select('id, stock_actual, stock_nuevo, stock_usado, stock_por_revisar')
              .eq('id', row.producto_id)
              .single();

            if (prodData) {
              const curStock = Number(prodData.stock_actual) || 0;
              const curNuevo = Number(prodData.stock_nuevo) || 0;
              const curUsado = Number(prodData.stock_usado) || 0;
              const curPorRev = Number(prodData.stock_por_revisar) || 0;

              const updatedNuevo = curNuevo + devNuevo;
              const updatedUsado = curUsado + devUsado;
              const updatedPorRev = curPorRev + devPorRev;
              const updatedStock = Math.round((updatedNuevo + updatedUsado + updatedPorRev) * 100) / 100;

              await client
                .from('productos')
                .update({
                  stock_actual: updatedStock > 0 ? updatedStock : (curStock + qtyAvailable),
                  stock_nuevo: updatedNuevo,
                  stock_usado: updatedUsado,
                  stock_por_revisar: updatedPorRev
                })
                .eq('id', row.producto_id);
            }
          } catch (prodUpdErr: any) {
            console.warn('Error reintegrando stock en productos:', prodUpdErr?.message);
          }
        }
      }

      if (itemsToDevolve.length > 0) {
        let devShortId = '';
        try {
          const { data: newDevRec } = await client
            .from('devoluciones_empleado')
            .insert([{
              empleado_id,
              empleado_nombre: empleado_nombre || 'Empleado',
              materiales: JSON.stringify(itemsToDevolve),
              observaciones: devObs,
              estado: 'APROBADO',
              created_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (newDevRec?.id) {
            devShortId = newDevRec.id.substring(0, 8).toUpperCase();
          }
        } catch (devInsErr: any) {
          console.warn('Error al insertar devoluciones_empleado:', devInsErr?.message);
        }

        const devMovementFolio = `DEVOLUCIÓN ${devShortId ? '#' + devShortId + ': ' : ''}${devObs}`;

        for (const itm of itemsToDevolve) {
          try {
            await client
              .from('movimientos_inventario')
              .insert([{
                producto_id: itm.productoId,
                tipo: 'ENTRADA',
                cantidad: itm.devolver,
                folio_factura: devMovementFolio,
                creado_por: empleado_id,
                fecha: new Date().toISOString()
              }]);
          } catch (movErr: any) {
            console.warn('Error registrando movimiento de ENTRADA por devolución:', movErr?.message);
          }
        }
      }
    }

    return res.json({ success: true, devolver_restante: Boolean(devolver_restante) });
  } catch (error: any) {
    console.error('Error en reportarGastoMaterial:', error);
    return res.status(500).json({ error: error.message });
  }
};

