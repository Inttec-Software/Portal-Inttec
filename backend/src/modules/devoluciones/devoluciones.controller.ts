import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getInventarioEmpleado = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);
    
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    let rows: any[] = [];
    try {
      const { rows: data } = await pool.query(
        `SELECT ie.id, ie.producto_id, ie.cantidad_disponible, ie.cantidad_nuevo, ie.cantidad_usado, ie.cantidad_por_revisar,
         row_to_json(p.*) as producto
         FROM inventario_empleados ie
         LEFT JOIN productos p ON ie.producto_id = p.id
         WHERE ie.empleado_id = $1 AND ie.cantidad_disponible > 0
         ORDER BY ie.updated_at DESC`,
        [userId]
      );
      rows = (data || []).map((item: any) => {
        const cTotal = Number(item.cantidad_disponible) || 0;
        const cNuevo = Number(item.cantidad_nuevo) || 0;
        const cUsado = Number(item.cantidad_usado) || 0;
        const cPorRev = Number(item.cantidad_por_revisar) || 0;
        if (cNuevo === 0 && cUsado === 0 && cPorRev === 0 && cTotal > 0) {
          return { ...item, cantidad_nuevo: cTotal, cantidad_usado: 0, cantidad_por_revisar: 0 };
        }
        return item;
      });
    } catch (error: any) {
      console.warn('[getInventarioEmpleado] Retrying with basic columns:', error.message);
      const { rows: fallbackData } = await pool.query(
        `SELECT id, producto_id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND cantidad_disponible > 0`,
        [userId]
      );
      const prodIds = fallbackData.map((item: any) => item.producto_id);
      let prodMap: Record<string, any> = {};
      if (prodIds.length > 0) {
        const placeholders = prodIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const { rows: prods } = await pool.query(
          `SELECT id, nombre_oficial, sku_interno, unidad, stock_actual, stock_nuevo, stock_usado, stock_por_revisar FROM productos WHERE id IN (${placeholders})`,
          prodIds
        );
        prods.forEach((p: any) => { prodMap[p.id] = p; });
      }
      rows = fallbackData.map((item: any) => ({
        ...item,
        cantidad_nuevo: item.cantidad_disponible,
        cantidad_usado: 0,
        cantidad_por_revisar: 0,
        producto: prodMap[item.producto_id] || { nombre_oficial: 'Desconocido', sku_interno: '' }
      }));
    }

    return res.json({ inventario: rows });
  } catch (error: any) {
    console.error('[getInventarioEmpleado] Unexpected error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const solicitarDevolucion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { payload, materiales } = req.body;
    if (!payload || !materiales) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const devolucionPayload = { ...payload, estado: 'PENDIENTE' };
    const keys = Object.keys(devolucionPayload);
    const values = Object.values(devolucionPayload);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: newDevRows } = await pool.query(
      `INSERT INTO devoluciones_empleado (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const newDev = newDevRows[0];

    for (const m of materiales) {
      const qtyDevolver = Number(m.devolver) || Number(m.cantidad) || 0;
      if (qtyDevolver <= 0) continue;

      const devNuevo = Number(m.devolver_nuevo) || (Number(m.devolver_usado) || Number(m.devolver_por_revisar) ? 0 : qtyDevolver);
      const devUsado = Number(m.devolver_usado) || 0;
      const devPorRev = Number(m.devolver_por_revisar) || 0;

      try {
        const { rows: invDataRows } = await pool.query(
          `SELECT id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
          [payload.empleado_id, m.productoId]
        );
        const invData = invDataRows[0];
          
        if (invData) {
          const curNuevo = Number(invData.cantidad_nuevo) || 0;
          const curUsado = Number(invData.cantidad_usado) || 0;
          const curPorRev = Number(invData.cantidad_por_revisar) || 0;
          const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invData.cantidad_disponible) > 0) ? Number(invData.cantidad_disponible) : curNuevo;
          const nextNuevo = Math.max(0, baseNuevo - devNuevo);
          const nextUsado = Math.max(0, curUsado - devUsado);
          const nextPorRev = Math.max(0, curPorRev - devPorRev);
          const nextTotal = Math.max(0, Number(invData.cantidad_disponible) - qtyDevolver);

          await pool.query(
            `UPDATE inventario_empleados SET cantidad_disponible = $1, cantidad_nuevo = $2, cantidad_usado = $3, cantidad_por_revisar = $4, updated_at = $5 WHERE id = $6`,
            [nextTotal, nextNuevo, nextUsado, nextPorRev, new Date().toISOString(), invData.id]
          );
        }
      } catch (invDiscErr: any) {
        console.warn('Fallback al descontar inventario_empleados:', invDiscErr?.message);
        const { rows: fallbackInvRows } = await pool.query(
          `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
          [payload.empleado_id, m.productoId]
        );
        const fallbackInv = fallbackInvRows[0];
        if (fallbackInv) {
          await pool.query(
            `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
            [Math.max(0, fallbackInv.cantidad_disponible - qtyDevolver), new Date().toISOString(), fallbackInv.id]
          );
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const reportarGastoMaterial = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const {
      empleado_id, empleado_nombre, tipo_gasto, cliente_id, cliente_nombre, sucursal_id, sucursal_nombre, detalle_motivo, materiales
    } = req.body;

    if (!empleado_id || !Array.isArray(materiales) || materiales.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para reportar gasto de material' });
    }

    const clientLabel = cliente_nombre ? `${cliente_nombre}${sucursal_nombre ? ' - ' + sucursal_nombre : ''}` : '';
    const fullFolio = `GASTO MATERIAL: ${(detalle_motivo || '').trim()}${tipo_gasto ? ` [${tipo_gasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;

    const { devolver_restante, observaciones_devolucion } = req.body;
    const isCombinedRequest = Boolean(devolver_restante);

    if (!isCombinedRequest) {
      for (const m of materiales) {
        const qtyUsed = Number(m.cantidad) || Number(m.devolver) || 0;
        if (qtyUsed <= 0) continue;

        try {
          const { rows: invDataRows } = await pool.query(
            `SELECT id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
            [empleado_id, m.productoId]
          );
          const invData = invDataRows[0];

          if (invData) {
            const curNuevo = Number(invData.cantidad_nuevo) || 0;
            const curUsado = Number(invData.cantidad_usado) || 0;
            const curPorRev = Number(invData.cantidad_por_revisar) || 0;
            const reqNuevo = Number(m.cantidad_nuevo) || Number(m.devolver_nuevo) || 0;
            const reqUsado = Number(m.cantidad_usado) || Number(m.devolver_usado) || 0;
            const reqPorRev = Number(m.cantidad_por_revisar) || Number(m.devolver_por_revisar) || 0;

            let discountNuevo = 0; let discountUsado = 0; let discountPorRev = 0;
            if (reqNuevo > 0 || reqUsado > 0 || reqPorRev > 0) {
              discountNuevo = Math.min(curNuevo, reqNuevo); discountUsado = Math.min(curUsado, reqUsado); discountPorRev = Math.min(curPorRev, reqPorRev);
            } else {
              let remaining = qtyUsed;
              const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invData.cantidad_disponible) > 0) ? Number(invData.cantidad_disponible) : curNuevo;
              discountNuevo = Math.min(baseNuevo, remaining); remaining -= discountNuevo;
              discountUsado = Math.min(curUsado, remaining); remaining -= discountUsado;
              discountPorRev = Math.min(curPorRev, remaining);
            }

            const nextNuevo = Math.max(0, curNuevo - discountNuevo);
            const nextUsado = Math.max(0, curUsado - discountUsado);
            const nextPorRev = Math.max(0, curPorRev - discountPorRev);
            const nextTotal = Math.max(0, Number(invData.cantidad_disponible) - qtyUsed);

            await pool.query(
              `UPDATE inventario_empleados SET cantidad_disponible = $1, cantidad_nuevo = $2, cantidad_usado = $3, cantidad_por_revisar = $4, updated_at = $5 WHERE id = $6`,
              [nextTotal, nextNuevo, nextUsado, nextPorRev, new Date().toISOString(), invData.id]
            );
          }
        } catch (invErr: any) {
          console.warn('Fallback al descontar inventario_empleados en gasto material:', invErr?.message);
          const { rows: fallbackInvRows } = await pool.query(
            `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
            [empleado_id, m.productoId]
          );
          const fallbackInv = fallbackInvRows[0];
          if (fallbackInv) {
            await pool.query(
              `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
              [Math.max(0, fallbackInv.cantidad_disponible - qtyUsed), new Date().toISOString(), fallbackInv.id]
            );
          }
        }

        try {
          const prodIdToUse = m.productoId || m.producto_id;
          await pool.query(
            `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por, fecha) VALUES ($1, $2, $3, $4, $5, $6)`,
            [prodIdToUse, 'SALIDA', qtyUsed, fullFolio, empleado_id, new Date().toISOString()]
          );
        } catch (movErr: any) {
          console.warn('Aviso al insertar movimiento de gasto material:', movErr?.message);
        }
      }
    }

    if (isCombinedRequest) {
      const { rows: remainingRows } = await pool.query(
        `SELECT ie.id, ie.producto_id, ie.cantidad_disponible, ie.cantidad_nuevo, ie.cantidad_usado, ie.cantidad_por_revisar, row_to_json(p.*) as producto 
         FROM inventario_empleados ie LEFT JOIN productos p ON ie.producto_id = p.id 
         WHERE ie.empleado_id = $1 AND ie.cantidad_disponible > 0`,
        [empleado_id]
      );

      const itemsToDevolve: any[] = [];
      const devObs = observaciones_devolucion || `SOLICITUD COMBINADA: Gasto y devolución de sobrantes. Trabajo: ${(detalle_motivo || '').trim() || 'Servicio'}`;
      const usedMap = new Map();
      for (const m of materiales) {
        const pId = m.productoId || m.producto_id;
        const qtyUsed = Number(m.cantidad) || Number(m.devolver) || 0;
        if (pId && qtyUsed > 0) usedMap.set(pId, qtyUsed);
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
          const devNuevo = (cNuevo === 0 && cUsado === 0 && cPorRev === 0) ? qtyToReturn : Math.max(0, cNuevo - qtyUsed);
          
          itemsToDevolve.push({
            productoId: row.producto_id, nombre: prod.nombre_oficial || 'Material', sku: prod.sku_interno || '', unidad: prod.unidad || 'pza',
            maximo: qtyTotal, gastar: qtyUsed, devolver: qtyToReturn, devolver_nuevo: devNuevo, devolver_usado: cUsado, devolver_por_revisar: cPorRev, folio_gasto: fullFolio
          });

          await pool.query(
            `UPDATE inventario_empleados SET cantidad_disponible = 0, cantidad_nuevo = 0, cantidad_usado = 0, cantidad_por_revisar = 0, updated_at = $1 WHERE id = $2`,
            [new Date().toISOString(), row.id]
          );
        }
      }

      if (itemsToDevolve.length > 0) {
        try {
          await pool.query(
            `INSERT INTO devoluciones_empleado (empleado_id, empleado_nombre, materiales, observaciones, estado, creado_en) VALUES ($1, $2, $3, $4, $5, $6)`,
            [empleado_id, empleado_nombre || 'Empleado', JSON.stringify(itemsToDevolve), devObs, 'PENDIENTE', new Date().toISOString()]
          );
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
