import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const [
      categoriasRes,
      proveedoresRes,
      productosRes,
      historialRes,
      clientesRes,
      usuariosRes
    ] = await Promise.all([
      pool.query('SELECT * FROM categorias_productos ORDER BY nombre'),
      pool.query('SELECT * FROM proveedores ORDER BY nombre'),
      pool.query('SELECT * FROM productos ORDER BY nombre_oficial'),
      pool.query(`
        SELECT m.*, 
               p.nombre_oficial as "producto_nombre_oficial",
               p.sku_interno as "producto_sku_interno",
               p.precio_unitario as "producto_precio_unitario",
               p.unidad as "producto_unidad"
        FROM movimientos_inventario m
        LEFT JOIN productos p ON m.producto_id = p.id
        WHERE m.tipo = 'SALIDA'
        ORDER BY m.fecha DESC
        LIMIT 50
      `),
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT id, nombre, rol, email FROM usuarios ORDER BY nombre')
    ]);

    const userMap = new Map((usuariosRes.rows || []).map((u: any) => [u.id, u]));
    const historialWithUser = (historialRes.rows || []).map((m: any) => ({
      ...m,
      producto: m.producto_nombre_oficial ? {
        nombre_oficial: m.producto_nombre_oficial,
        sku_interno: m.producto_sku_interno,
        precio_unitario: m.producto_precio_unitario,
        unidad: m.producto_unidad
      } : null,
      usuario: userMap.get(m.creado_por || m.empleado_id) || null
    }));

    const normalizedProductos = (productosRes.rows || []).map((p: any) => {
      const sNuevo = Number(p.stock_nuevo) || 0;
      const sUsado = Number(p.stock_usado) || 0;
      const sPorRev = Number(p.stock_por_revisar) || 0;
      const sumConditions = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
      const totalStock = sumConditions > 0 ? sumConditions : (Number(p.stock_actual) || 0);

      return {
        ...p,
        stock_actual: totalStock,
        stock_nuevo: sNuevo > 0 ? sNuevo : (sUsado === 0 && sPorRev === 0 ? totalStock : 0),
        stock_usado: sUsado,
        stock_por_revisar: sPorRev
      };
    });

    return res.json({
      categorias: categoriasRes.rows || [],
      proveedores: proveedoresRes.rows || [],
      productos: normalizedProductos,
      historial_consumo: historialWithUser,
      clientes: clientesRes.rows || [],
      usuarios: (usuariosRes.rows || []).filter((u: any) => ['EMPLEADO', 'DEV'].includes(u.rol))
    });
  } catch (error: any) {
    console.error('Error in getDashboardData:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const aprobarDevolucion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const pool = getDbPool(company, env);
    const { dev } = req.body; 

    const materiales = typeof dev.materiales === 'string' ? JSON.parse(dev.materiales || '[]') : dev.materiales;
    for (const m of materiales) {
      const totalDevolver = Number(m.devolver) || 0;
      const totalGastar = Number(m.gastar) || 0;

      if (totalGastar > 0) {
        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por) 
           VALUES ($1, $2, $3, $4, $5)`,
          [m.productoId, 'SALIDA', totalGastar, m.folio_gasto || `GASTO MATERIAL (Devolución ${dev.id.substring(0,8)})`, user?.id || dev.empleado_id]
        );
      }

      if (totalDevolver > 0) {
        const { rows: pRows } = await pool.query(
          `SELECT id, stock_actual, stock_nuevo, stock_usado, stock_por_revisar 
           FROM productos WHERE id = $1`,
          [m.productoId]
        );
        const pData = pRows[0];

        if (pData) {
          let currNuevo = Number(pData.stock_nuevo) || 0;
          let currUsado = Number(pData.stock_usado) || 0;
          let currPorRevisar = Number(pData.stock_por_revisar) || 0;

          let addNuevo = Number(m.devolver_nuevo) || 0;
          let addUsado = Number(m.devolver_usado) || 0;
          let addPorRevisar = Number(m.devolver_por_revisar) || 0;

          if (addNuevo === 0 && addUsado === 0 && addPorRevisar === 0) {
            if (m.estado === 'usado') addUsado = totalDevolver;
            else if (m.estado === 'por_revisar') addPorRevisar = totalDevolver;
            else addNuevo = totalDevolver;
          }

          const nuevoTotalNuevo = currNuevo + addNuevo;
          const nuevoTotalUsado = currUsado + addUsado;
          const nuevoTotalPorRevisar = currPorRevisar + addPorRevisar;
          const nuevoStockActual = Math.round((nuevoTotalNuevo + nuevoTotalUsado + nuevoTotalPorRevisar) * 100) / 100;

          await pool.query(
            `UPDATE productos 
             SET stock_actual = $1, stock_nuevo = $2, stock_usado = $3, stock_por_revisar = $4 
             WHERE id = $5`,
            [nuevoStockActual, nuevoTotalNuevo, nuevoTotalUsado, nuevoTotalPorRevisar, m.productoId]
          );

          const estadosDesglose = [];
          if (addNuevo > 0) estadosDesglose.push(`Nuevas: ${addNuevo}`);
          if (addUsado > 0) estadosDesglose.push(`Usadas: ${addUsado}`);
          if (addPorRevisar > 0) estadosDesglose.push(`Dañadas/Incompletas: ${addPorRevisar}`);
          const labelEstados = estadosDesglose.length > 0 ? ` (${estadosDesglose.join(', ')})` : '';

          await pool.query(
            `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por) 
             VALUES ($1, $2, $3, $4, $5)`,
            [m.productoId, 'ENTRADA', totalDevolver, `DEVOLUCIÓN ${dev.id.substring(0,8)}${labelEstados}`, user?.id || dev.empleado_id]
          );
        }
      }
    }

    await pool.query(
      `UPDATE devoluciones_empleado SET estado = 'APROBADO', revisado_por = $1 WHERE id = $2`,
      [user?.id, dev.id]
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEmpleadoRetribuciones = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;
    
    const [evidenciasRes, devolucionesRes, invRes] = await Promise.all([
      pool.query(`SELECT id, cliente, created_at, descripcion_trabajo, empleado_nombre, sobrantes_verificados 
                  FROM evidencias WHERE empleado_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT * FROM devoluciones_empleado 
                  WHERE empleado_id = $1 AND estado = 'PENDIENTE' ORDER BY creado_en DESC`, [id]),
      pool.query(`
        SELECT ie.id, ie.cantidad_disponible, 
               p.id as "producto_id", p.nombre_oficial as "producto_nombre_oficial", 
               p.sku_interno as "producto_sku_interno", p.unidad as "producto_unidad"
        FROM inventario_empleados ie
        LEFT JOIN productos p ON ie.producto_id = p.id
        WHERE ie.empleado_id = $1 AND ie.cantidad_disponible > 0
      `, [id])
    ]);

    const inventario = invRes.rows.map((r: any) => ({
      id: r.id,
      cantidad_disponible: r.cantidad_disponible,
      productos: {
        id: r.producto_id,
        nombre_oficial: r.producto_nombre_oficial,
        sku_interno: r.producto_sku_interno,
        unidad: r.producto_unidad
      }
    }));

    return res.json({ 
      evidencias: evidenciasRes.rows || [], 
      devoluciones: devolucionesRes.rows || [], 
      inventario: inventario || [] 
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const verificarEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { evidenciaId, action, reason, userActionName } = req.body;

    const notas = `[${action} por ${userActionName}] ${reason || ''}`.trim();
    await pool.query(
      `UPDATE evidencias SET sobrantes_verificados = true, notas_verificacion = $1 WHERE id = $2`,
      [notas, evidenciaId]
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const upsertProducto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    
    const id = req.params.id;
    const isUpdate = !!id;
    const body = { ...req.body };

    if (body.stock_nuevo !== undefined || body.stock_usado !== undefined || body.stock_por_revisar !== undefined) {
      const nuevo = Math.max(0, Number(body.stock_nuevo) || 0);
      const usado = Math.max(0, Number(body.stock_usado) || 0);
      const porRevisar = Math.max(0, Number(body.stock_por_revisar) || 0);
      
      if (usado === 0 && porRevisar === 0 && body.stock_actual !== undefined) {
        const total = Math.max(0, Number(body.stock_actual) || 0);
        body.stock_actual = total;
        body.stock_nuevo = total;
        body.stock_usado = 0;
        body.stock_por_revisar = 0;
      } else {
        body.stock_nuevo = nuevo;
        body.stock_usado = usado;
        body.stock_por_revisar = porRevisar;
        body.stock_actual = Math.round((nuevo + usado + porRevisar) * 100) / 100;
      }
    } else if (body.stock_actual !== undefined) {
      const total = Math.max(0, Number(body.stock_actual) || 0);
      body.stock_actual = total;
      body.stock_nuevo = total;
      body.stock_usado = 0;
      body.stock_por_revisar = 0;
    }
    
    if (isUpdate) {
      const { rows } = await pool.query(`SELECT * FROM productos WHERE id = $1`, [id]);
      const oldProd = rows[0];

      const setClauses = [];
      const values = [];
      let i = 1;
      for (const key of Object.keys(body)) {
        setClauses.push(`${key} = $${i}`);
        values.push(body[key]);
        i++;
      }
      values.push(id);
      
      await pool.query(
        `UPDATE productos SET ${setClauses.join(', ')} WHERE id = $${i}`,
        values
      );

      if (oldProd && body.stock_actual !== undefined) {
        const oldStock = Number(oldProd.stock_actual) || 0;
        const newStock = Number(body.stock_actual) || 0;
        const diff = Math.round((newStock - oldStock) * 100) / 100;

        if (diff > 0) {
          await pool.query(
            `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, proveedor_id, creado_por) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, 'ENTRADA', diff, 'AJUSTE MANUAL / INCREMENTO DE STOCK', body.proveedor_id || oldProd.proveedor_id || null, (req as any).user?.id || tenant.user?.id || null]
          );
        } else if (diff < 0) {
          await pool.query(
            `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, proveedor_id, creado_por) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, 'SALIDA', Math.abs(diff), 'AJUSTE MANUAL / DISMINUCIÓN DE STOCK', body.proveedor_id || oldProd.proveedor_id || null, (req as any).user?.id || tenant.user?.id || null]
          );
        }
      }
      return res.json({ success: true });
    } else {
      const columns = Object.keys(body);
      const values = Object.values(body);
      const placeholders = values.map((_, idx) => `$${idx + 1}`);

      const { rows: inserted } = await pool.query(
        `INSERT INTO productos (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );
      const data = inserted[0];

      const initialStock = Number(data.stock_actual) || 0;
      if (initialStock > 0) {
        const estadosDesglose: string[] = [];
        if (data.stock_nuevo > 0) estadosDesglose.push(`Nuevas: ${data.stock_nuevo}`);
        if (data.stock_usado > 0) estadosDesglose.push(`Usadas: ${data.stock_usado}`);
        if (data.stock_por_revisar > 0) estadosDesglose.push(`Dañadas/Incompletas: ${data.stock_por_revisar}`);
        const desgloseStr = estadosDesglose.length > 0 ? ` (${estadosDesglose.join(', ')})` : '';

        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, proveedor_id, creado_por) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [data.id, 'ENTRADA', initialStock, `ALTA DE PRODUCTO / INVENTARIO INICIAL${desgloseStr}`, data.proveedor_id || null, (req as any).user?.id || tenant.user?.id || null]
        );
      }
      return res.json({ success: true, data });
    }
  } catch (error: any) {
    console.error('Error in upsertProducto:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const addStock = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;
    const { cantidad, motivo, currentStock, estado } = req.body;

    const { rows } = await pool.query(`SELECT * FROM productos WHERE id = $1`, [id]);
    const prodData = rows[0];

    let updates: any = {};
    if (prodData) {
      const curStock = Number(prodData.stock_actual) || 0;
      const curNuevo = Number(prodData.stock_nuevo) || 0;
      const curUsado = Number(prodData.stock_usado) || 0;
      const curPorRevisar = Number(prodData.stock_por_revisar) || 0;

      if (estado === 'USADO') {
        updates = { stock_usado: curUsado + cantidad, stock_actual: curStock + cantidad };
      } else if (estado === 'POR_REVISAR') {
        updates = { stock_por_revisar: curPorRevisar + cantidad, stock_actual: curStock + cantidad };
      } else {
        updates = { stock_nuevo: curNuevo + cantidad, stock_actual: curStock + cantidad };
      }
    } else {
      updates = { stock_actual: (currentStock || 0) + cantidad };
    }

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key of Object.keys(updates)) {
      setClauses.push(`${key} = $${i}`);
      values.push(updates[key]);
      i++;
    }
    values.push(id);
    await pool.query(`UPDATE productos SET ${setClauses.join(', ')} WHERE id = $${i}`, values);

    await pool.query(
      `INSERT INTO movimientos_inventario (producto_id, cantidad, tipo, motivo) VALUES ($1, $2, $3, $4)`,
      [id, cantidad, 'ENTRADA', motivo]
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const guardarConsumo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const pool = getDbPool(company, env);
    const { items, esAsignacionEmpleado, destinoId, motivoGeneral } = req.body; 

    for (const item of items) {
      const { rows } = await pool.query(`SELECT * FROM productos WHERE id = $1`, [item.productoId]);
      const prodData = rows[0];

      if (prodData) {
        let toDiscount = item.qty;
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
        const total = Math.round((nuevo + usado + porRevisar) * 100) / 100;
        await pool.query(
          `UPDATE productos SET stock_actual = $1, stock_nuevo = $2, stock_usado = $3, stock_por_revisar = $4 WHERE id = $5`,
          [total, nuevo, usado, porRevisar, item.productoId]
        );
      } else {
        await pool.query(
          `UPDATE productos SET stock_actual = $1 WHERE id = $2`,
          [Math.max(0, item.currentStock - item.qty), item.productoId]
        );
      }

      if (esAsignacionEmpleado && destinoId) {
        const { rows: invRows } = await pool.query(
          `SELECT * FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
          [destinoId, item.productoId]
        );
        const invEmp = invRows[0];
        
        if (invEmp) {
          await pool.query(
            `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
            [invEmp.cantidad_disponible + item.qty, new Date().toISOString(), invEmp.id]
          );
        } else {
          await pool.query(
            `INSERT INTO inventario_empleados (empleado_id, producto_id, cantidad_disponible) VALUES ($1, $2, $3)`,
            [destinoId, item.productoId, item.qty]
          );
        }
      }

      await pool.query(
        `INSERT INTO movimientos_inventario (producto_id, empleado_id, cantidad, tipo, motivo) VALUES ($1, $2, $3, $4, $5)`,
        [item.productoId, esAsignacionEmpleado ? destinoId : (user ? user.id : null), item.qty, 'SALIDA', motivoGeneral]
      );
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const asignarMaterialEmpleado = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const pool = getDbPool(company, env);

    const { empleadoId, motivo, items } = req.body;

    if (!empleadoId) {
      return res.status(400).json({ error: 'Debes seleccionar un empleado destinatario' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debes agregar al menos un material a asignar' });
    }

    const { rows: empRows } = await pool.query(`SELECT id, nombre, email FROM usuarios WHERE id = $1`, [empleadoId]);
    const empleadoData = empRows[0];

    if (!empleadoData) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const empleadoNombre = empleadoData.nombre || empleadoData.email || 'Empleado';
    const motivoTexto = (motivo || '').trim() || 'Asignación de material por Administrador';

    const productosValidados: any[] = [];
    for (const item of items) {
      const qty = Number(item.cantidad);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `La cantidad para cada producto debe ser mayor a 0` });
      }

      const { rows: pRows } = await pool.query(`SELECT * FROM productos WHERE id = $1`, [item.productoId]);
      const prodData = pRows[0];

      if (!prodData) {
        return res.status(404).json({ error: `Producto no encontrado en inventario` });
      }

      const stockActual = Number(prodData.stock_actual) || 0;
      if (qty > stockActual) {
        return res.status(400).json({
          error: `Stock insuficiente para "${prodData.nombre_oficial}". Solicitado: ${qty}, Disponible: ${stockActual}`
        });
      }

      productosValidados.push({ producto: prodData, cantidad: qty });
    }

    const materialesSnapshot = productosValidados.map(({ producto, cantidad }) => ({
      producto_id: producto.id,
      sku: producto.sku_interno || '',
      nombre: producto.nombre_oficial || 'Producto',
      cantidad,
      cantidad_nuevo: cantidad,
      cantidad_usado: 0,
      cantidad_por_revisar: 0,
      unidad: producto.unidad || 'pza'
    }));

    try {
      await pool.query(
        `INSERT INTO retiros_material (empleado_id, empleado_nombre, tipo_gasto, detalle_servicio_proyecto, materiales, motivo, responsiva_aceptada, firmado_en, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [empleadoId, empleadoNombre, 'Asignación de Material', motivoTexto, JSON.stringify(materialesSnapshot), motivoTexto, true, new Date().toISOString(), new Date().toISOString()]
      );
    } catch (rErr: any) {
      console.warn('Aviso insertando en retiros_material desde asignación admin:', rErr.message);
    }

    for (const { producto, cantidad } of productosValidados) {
      let nuevo = Number(producto.stock_nuevo) || 0;
      let usado = Number(producto.stock_usado) || 0;
      let porRevisar = Number(producto.stock_por_revisar) || 0;

      let withdrawNuevo = 0;
      let withdrawUsado = 0;
      let withdrawPorRevisar = 0;

      let toDiscount = cantidad;
      if (nuevo >= toDiscount) {
        withdrawNuevo = toDiscount;
        nuevo -= toDiscount;
        toDiscount = 0;
      } else {
        withdrawNuevo = nuevo;
        toDiscount -= nuevo;
        nuevo = 0;
        if (usado >= toDiscount) {
          withdrawUsado = toDiscount;
          usado -= toDiscount;
          toDiscount = 0;
        } else {
          withdrawUsado = usado;
          toDiscount -= usado;
          usado = 0;
          withdrawPorRevisar = Math.min(porRevisar, toDiscount);
          porRevisar = Math.max(0, porRevisar - toDiscount);
        }
      }

      const newStock = Math.round((nuevo + usado + porRevisar) * 100) / 100;

      await pool.query(
        `UPDATE productos SET stock_actual = $1, stock_nuevo = $2, stock_usado = $3, stock_por_revisar = $4 WHERE id = $5`,
        [newStock, nuevo, usado, porRevisar, producto.id]
      );

      const fullFolio = `ASIGNACIÓN: ${motivoTexto} [${empleadoNombre}]`;
      try {
        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por) VALUES ($1, $2, $3, $4, $5)`,
          [producto.id, 'SALIDA', cantidad, fullFolio, user ? user.id : null]
        );
      } catch (moveErr: any) {
        console.warn('Aviso insertando movimiento de inventario:', moveErr.message);
      }

      const { rows: invRows } = await pool.query(
        `SELECT * FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
        [empleadoId, producto.id]
      );
      const invEmp = invRows[0];

      if (invEmp) {
        const curDisp = Number(invEmp.cantidad_disponible) || 0;
        const curNuevo = Number(invEmp.cantidad_nuevo) || 0;
        const curUsado = Number(invEmp.cantidad_usado) || 0;
        const curPorRev = Number(invEmp.cantidad_por_revisar) || 0;

        const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && curDisp > 0) ? curDisp : curNuevo;

        const nextNuevo = baseNuevo + withdrawNuevo;
        const nextUsado = curUsado + withdrawUsado;
        const nextPorRev = curPorRev + withdrawPorRevisar;
        const nextTotal = Math.round((nextNuevo + nextUsado + nextPorRev) * 100) / 100;

        await pool.query(
          `UPDATE inventario_empleados SET cantidad_disponible = $1, cantidad_nuevo = $2, cantidad_usado = $3, cantidad_por_revisar = $4, updated_at = $5 WHERE id = $6`,
          [nextTotal, nextNuevo, nextUsado, nextPorRev, new Date().toISOString(), invEmp.id]
        );
      } else {
        await pool.query(
          `INSERT INTO inventario_empleados (empleado_id, producto_id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [empleadoId, producto.id, cantidad, withdrawNuevo, withdrawUsado, withdrawPorRevisar, new Date().toISOString(), new Date().toISOString()]
        );
      }
    }

    return res.json({ success: true, mensaje: `Se asignaron ${productosValidados.length} material(es) al empleado ${empleadoNombre} exitosamente.` });
  } catch (error: any) {
    console.error('Error en asignarMaterialEmpleado:', error);
    return res.status(500).json({ error: error.message || 'Error al asignar material al empleado' });
  }
};

export const guardarImportacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env, user } = tenant;
    const pool = getDbPool(company, env);
    const { mappedItems, proveedorId, folioFactura } = req.body;

    if (folioFactura && folioFactura.trim() !== '') {
      const { rows } = await pool.query(`SELECT id FROM movimientos_inventario WHERE folio_factura = $1 LIMIT 1`, [folioFactura.trim()]);
      if (rows.length > 0) {
        return res.status(400).json({ error: 'El folio de factura ingresado ya ha sido registrado previamente en el sistema.' });
      }
    }

    for (const item of mappedItems) {
      let finalProductId = item.matchedProductId;

      if (item.esNuevoProducto) {
        const finalSku = item.skuSugerido && item.skuSugerido.trim() !== '' ? item.skuSugerido.trim() : 'SKU-AI-' + Math.random().toString(36).substring(3, 8).toUpperCase();
        
        const { rows: insRows } = await pool.query(
          `INSERT INTO productos (sku_interno, nombre_oficial, categoria_id, stock_actual, stock_nuevo, stock_usado, stock_por_revisar, precio_unitario, activo, proveedor_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [finalSku, item.descripcionFactura, item.categoriaSeleccionadaId, item.cantidad, item.cantidad, 0, 0, item.precioUnitario || 0, true, proveedorId]
        );
        finalProductId = insRows[0].id;

        await pool.query(
          `INSERT INTO alias_proveedor_producto (proveedor_id, producto_id, nombre_segun_proveedor) VALUES ($1, $2, $3)`,
          [proveedorId, finalProductId, item.descripcionFactura]
        );
      } else if (finalProductId) {
        const { rows: pRows } = await pool.query(`SELECT stock_actual, stock_nuevo, precio_unitario FROM productos WHERE id = $1`, [finalProductId]);
        const pData = pRows[0];
        
        if (pData) {
          const newActual = (Number(pData.stock_actual) || 0) + item.cantidad;
          const newNuevo = (Number(pData.stock_nuevo) || 0) + item.cantidad;
          
          if (item.precioUnitario > 0) {
            await pool.query(`UPDATE productos SET stock_actual = $1, stock_nuevo = $2, precio_unitario = $3 WHERE id = $4`, [newActual, newNuevo, item.precioUnitario, finalProductId]);
          } else {
            await pool.query(`UPDATE productos SET stock_actual = $1, stock_nuevo = $2 WHERE id = $3`, [newActual, newNuevo, finalProductId]);
          }

          if (proveedorId) {
            const { rows: aRows } = await pool.query(`SELECT id FROM alias_proveedor_producto WHERE proveedor_id = $1 AND nombre_segun_proveedor = $2 LIMIT 1`, [proveedorId, item.descripcionFactura]);
            if (aRows.length === 0) {
              await pool.query(
                `INSERT INTO alias_proveedor_producto (proveedor_id, producto_id, nombre_segun_proveedor) VALUES ($1, $2, $3)`,
                [proveedorId, finalProductId, item.descripcionFactura]
              );
            }
          }
        }
      }

      if (finalProductId) {
        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, cantidad, tipo, folio_factura, creado_por) VALUES ($1, $2, $3, $4, $5)`,
          [finalProductId, item.cantidad, 'ENTRADA', folioFactura, user?.id]
        );
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const crearCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { tipo } = req.params; 

    let table = '';
    if (tipo === 'categoria') table = 'categorias_productos';
    else if (tipo === 'proveedor') table = 'proveedores';
    else if (tipo === 'cliente') table = 'clientes';
    else return res.status(400).json({ error: 'Tipo inválido' });

    const body = req.body;
    const keys = Object.keys(body);
    const values = Object.values(body);
    const placeholders = values.map((_, idx) => `$${idx + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const verificarFolioFactura = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const folio = req.query.folio as string;

    if (!folio || folio.trim() === '') {
      return res.json({ existe: false });
    }

    const { rows } = await pool.query(`SELECT id FROM movimientos_inventario WHERE folio_factura = $1 LIMIT 1`, [folio.trim()]);
    
    return res.json({ existe: rows.length > 0 });
  } catch (error: any) {
    console.error('Error verificando folio:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const bulkDeleteProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo de IDs de productos.' });
    }

    await pool.query(`UPDATE productos SET activo = false WHERE id = ANY($1::int[])`, [ids]);
    return res.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('Error in bulkDeleteProductos:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const bulkUpdateProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { ids, updates } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo de IDs de productos.' });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar.' });
    }

    const allowedFields = ['categoria_id', 'proveedor_id', 'stock_actual', 'precio_unitario', 'activo'];
    const cleanUpdates: any = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key];
      }
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar en lote.' });
    }

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key of Object.keys(cleanUpdates)) {
      setClauses.push(`${key} = $${i}`);
      values.push(cleanUpdates[key]);
      i++;
    }
    values.push(ids);

    await pool.query(`UPDATE productos SET ${setClauses.join(', ')} WHERE id = ANY($${i}::int[])`, values);
    
    return res.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('Error in bulkUpdateProductos:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const hardDeleteProducto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;

    await pool.query(`DELETE FROM productos WHERE id = $1`, [id]);
    
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error in hardDeleteProducto:', error);
    if (error.code === '23503' || error.message?.includes('foreign key constraint') || error.message?.includes('violates foreign key')) {
      return res.status(409).json({ 
        error: 'No se puede eliminar este producto definitivamente porque tiene ventas, cotizaciones o movimientos históricos asociados. Puedes marcarlo como inactivo.',
        isForeignKeyConstraint: true
      });
    }
    return res.status(500).json({ error: error.message || 'Error al eliminar el producto de la base de datos' });
  }
};

export const eliminarMovimiento = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;
    const { source_table, folio_factura } = req.query;

    if (!source_table) {
      await pool.query(`DELETE FROM movimientos_inventario WHERE id = $1`, [id]);
      return res.json({ success: true });
    }

    if (source_table === 'retiros_material') {
      await pool.query(`DELETE FROM retiros_material WHERE id = $1`, [id]);
      if (folio_factura) {
        await pool.query(`DELETE FROM movimientos_inventario WHERE folio_factura = $1`, [folio_factura]);
      }
    } else if (source_table === 'devoluciones_empleado') {
      await pool.query(`DELETE FROM devoluciones_empleado WHERE id = $1`, [id]);
      const shortId = String(id).substring(0, 8).toUpperCase();
      await pool.query(`DELETE FROM movimientos_inventario WHERE folio_factura ILIKE $1`, [`%${shortId}%`]);
    } else if (source_table === 'movimientos_inventario') {
      if (folio_factura) {
        await pool.query(`DELETE FROM movimientos_inventario WHERE folio_factura = $1`, [folio_factura]);
      } else {
        await pool.query(`DELETE FROM movimientos_inventario WHERE id = $1`, [id]);
      }
    } else {
      return res.status(400).json({ error: 'Tabla de origen desconocida' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[eliminarMovimiento] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getMovimientosInventario = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const [movsRes, retirosRes, devsRes, usersRes, provsRes] = await Promise.all([
      pool.query(`
        SELECT m.id, m.producto_id, m.tipo, m.cantidad, m.fecha, m.folio_factura, m.proveedor_id, m.creado_por, m.firma_base64,
               p.id as p_id, p.nombre_oficial as p_nombre, p.sku_interno as p_sku, p.unidad as p_unidad, p.precio_unitario as p_precio
        FROM movimientos_inventario m
        LEFT JOIN productos p ON m.producto_id = p.id
        ORDER BY m.fecha DESC
        LIMIT 1000
      `),
      pool.query(`
        SELECT id, empleado_id, empleado_nombre, motivo, tipo_gasto, cliente_nombre, sucursal_nombre, is_split, proveedor_id, proveedor, materiales, created_at, responsiva_aceptada, firmado_en, dispositivo_info, firma_base64
        FROM retiros_material
        ORDER BY created_at DESC
        LIMIT 200
      `),
      pool.query(`
        SELECT *
        FROM devoluciones_empleado
          ORDER BY creado_en DESC
        LIMIT 200
      `),
      pool.query(`SELECT id, nombre, email, rol FROM usuarios`),
      pool.query(`SELECT id, nombre FROM proveedores`)
    ]);

    const userMap = new Map((usersRes.rows || []).map((u: any) => [u.id, u.nombre || u.email || 'Usuario']));
    const provMap = new Map((provsRes.rows || []).map((p: any) => [p.id, p.nombre]));

    const structuredRetiros = (retirosRes.rows || []).map((r: any) => {
      let mats = [];
      try {
        mats = typeof r.materiales === 'string' ? JSON.parse(r.materiales) : (r.materiales || []);
      } catch (e) {
        mats = [];
      }
      if (!Array.isArray(mats)) mats = [];
      const totalQty = mats.reduce((s: number, m: any) => s + (Number(m.cantidad) || 0), 0);
      const clientLabel = r.is_split ? 'Varios clientes' : (r.cliente_nombre ? (r.cliente_nombre + (r.sucursal_nombre ? ' - ' + r.sucursal_nombre : '')) : '');
      const fullFolio = `SALIDA: ${(r.motivo || '').trim()}${r.tipo_gasto ? ` [${r.tipo_gasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;
      
      return {
        id: r.id,
        source_table: 'retiros_material',
        tipo: 'SALIDA',
        subtipo: 'SALIDA',
        cantidad: totalQty,
        fecha: r.created_at,
        folio_factura: fullFolio,
        detalle_motivo: r.detalle_servicio_proyecto || r.motivo || fullFolio,
        motivo: r.motivo || '',
        cliente_nombre: r.cliente_nombre || '',
        sucursal_nombre: r.sucursal_nombre || '',
        is_split: Boolean(r.is_split),
        tipo_gasto: r.tipo_gasto || 'Operativo',
        proveedor_id: r.proveedor_id || null,
        proveedor_nombre: r.proveedor || provMap.get(r.proveedor_id) || '',
        usuario_id: r.empleado_id,
        usuario_nombre: r.empleado_nombre || userMap.get(r.empleado_id) || 'Empleado',
        producto_id: mats[0]?.producto_id || '',
        producto_nombre: mats.length === 1 ? (mats[0].nombre || 'Material') : `${mats.length} materiales: ${mats.map((m: any) => m.nombre).join(', ')}`,
        producto_sku: mats.length === 1 ? (mats[0].sku || '-') : `${mats.length} partidas`,
        producto_unidad: mats.length === 1 ? (mats[0].unidad || 'pza') : 'pzas',
        precio_unitario: 0,
        materiales: mats,
        tiene_firma: Boolean(r.firma_base64),
        firma_base64: null,
        responsiva_aceptada: r.responsiva_aceptada !== false,
        firmado_en: r.firmado_en || r.created_at,
        dispositivo_info: r.dispositivo_info || null
      };
    });

    const structuredDevs: any[] = [];
    (devsRes.rows || []).forEach((d: any) => {
      let rawMats: any[] = [];
      try {
        rawMats = typeof d.materiales === 'string' ? JSON.parse(d.materiales) : (d.materiales || []);
      } catch (_) {
        rawMats = [];
      }
      if (!Array.isArray(rawMats)) rawMats = [];
      const mats = rawMats.filter((m: any) => (Number(m.devolver) || Number(m.cantidad) || 0) > 0);
      const totalQty = mats.reduce((s: number, m: any) => s + (Number(m.devolver) || Number(m.cantidad) || 0), 0);
      if (totalQty <= 0) return;

      const shortId = d.id ? d.id.substring(0, 8).toUpperCase() : 'DEV';
      const cleanObs = (d.observaciones || '').replace(/^DEVOLUCI[OÓ]N:\s*/i, '').trim();
      const fullFolio = `DEVOLUCIÓN #${shortId}${cleanObs ? ': ' + cleanObs : ''}`;

      structuredDevs.push({
        id: d.id,
        source_table: 'devoluciones_empleado',
        tipo: 'ENTRADA',
        subtipo: 'DEVOLUCIÓN',
        cantidad: totalQty,
        fecha: d.updated_at || d.created_at,
        folio_factura: fullFolio,
        detalle_motivo: d.observaciones || fullFolio,
        motivo: cleanObs || 'Devolución de material',
        cliente_nombre: '',
        sucursal_nombre: '',
        tipo_gasto: '',
        proveedor_id: null,
        proveedor_nombre: '',
        usuario_id: d.empleado_id,
        usuario_nombre: d.empleado_nombre || userMap.get(d.empleado_id) || 'Empleado',
        producto_id: mats[0]?.productoId || mats[0]?.producto_id || '',
        producto_nombre: mats.length === 1 ? (mats[0].nombre || 'Material') : `${mats.length} materiales: ${mats.map((m: any) => m.nombre).join(', ')}`,
        producto_sku: mats.length === 1 ? (mats[0].sku || '-') : `${mats.length} partidas`,
        producto_unidad: mats.length === 1 ? (mats[0].unidad || 'pza') : 'pzas',
        precio_unitario: 0,
        materiales: mats.map((m: any) => ({
          producto_id: m.productoId || m.producto_id,
          sku: m.sku || '-',
          nombre: m.nombre || 'Material',
          cantidad: Number(m.devolver) || Number(m.cantidad) || 0,
          unidad: m.unidad || 'pza',
          devolver_nuevo: Number(m.devolver_nuevo) || 0,
          devolver_usado: Number(m.devolver_usado) || 0,
          devolver_por_revisar: Number(m.devolver_por_revisar) || 0
        }))
      });
    });

    const otherMovs: any[] = [];
    const legacyRetirosMap = new Map<string, any>();
    const legacyDevsMap = new Map<string, any>();
    const legacyConsumosMap = new Map<string, any>();

    (movsRes.rows || []).forEach((m: any) => {
      const prod = {
        nombre_oficial: m.p_nombre,
        sku_interno: m.p_sku,
        unidad: m.p_unidad,
        precio_unitario: m.p_precio
      };
      const folio = (m.folio_factura || '').trim();
      const mTime = new Date(m.fecha).getTime();

      const isRetiro = /^RETIRO:/i.test(folio);
      const isDevolucion = /devoluci[oó]n/i.test(folio);
      const isGasto = /^(GASTO MATERIAL:|CONSUMO:|GASTO:)/i.test(folio);

      if (isRetiro) {
        const alreadyInStructured = structuredRetiros.some((st: any) => {
          const stTime = new Date(st.fecha).getTime();
          return (st.usuario_id === m.creado_por || st.usuario_nombre === userMap.get(m.creado_por)) && Math.abs(stTime - mTime) < 180000;
        });

        if (!alreadyInStructured) {
          const cleanKey = folio.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
          const groupKey = `${m.creado_por}_${cleanKey}_${Math.floor(mTime / 180000)}`;
          if (!legacyRetirosMap.has(groupKey)) {
            let tipoGasto = '';
            const tipoMatch = folio.match(/\[(Servicio|Proyecto|Venta|Operativo)\]/i);
            if (tipoMatch) tipoGasto = tipoMatch[1];
            let clienteNombre = '';
            const clientMatch = folio.match(/\((.*?)\)/);
            if (clientMatch) clienteNombre = clientMatch[1];
            const detalle = folio.replace(/^RETIRO:\s*/i, '').replace(/\[(Servicio|Proyecto|Venta|Operativo)\]/gi, '').replace(/\(.*?\)/g, '').trim();

            legacyRetirosMap.set(groupKey, {
              id: m.id,
              source_table: 'movimientos_inventario',
              tipo: 'SALIDA',
              subtipo: 'SALIDA',
              cantidad: 0,
              fecha: m.fecha,
              folio_factura: folio,
              detalle_motivo: detalle || folio,
              motivo: detalle,
              cliente_nombre: clienteNombre,
              sucursal_nombre: '',
              tipo_gasto: tipoGasto || 'Operativo',
              proveedor_id: m.proveedor_id,
              proveedor_nombre: provMap.get(m.proveedor_id) || '',
              usuario_id: m.creado_por,
              usuario_nombre: userMap.get(m.creado_por) || 'Empleado',
              producto_id: m.producto_id,
              producto_nombre: prod.nombre_oficial || 'Producto',
              producto_sku: prod.sku_interno || '-',
              producto_unidad: prod.unidad || 'pza',
              precio_unitario: prod.precio_unitario || 0,
              materiales: []
            });
          }

          const leg = legacyRetirosMap.get(groupKey);
          leg.cantidad = Math.round((leg.cantidad + (Number(m.cantidad) || 0)) * 100) / 100;
          leg.materiales.push({
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          });
          if (leg.materiales.length > 1) {
            leg.producto_nombre = `${leg.materiales.length} materiales: ${leg.materiales.map((x: any) => x.nombre).join(', ')}`;
            leg.producto_sku = `${leg.materiales.length} partidas`;
          }
        }
      } else if (isDevolucion) {
        const alreadyInStructuredDev = structuredDevs.some((sd: any) => {
          const sdIdShort = sd.id ? sd.id.substring(0, 8).toLowerCase() : '';
          const matchFolioId = Boolean(sdIdShort && folio.toLowerCase().includes(sdIdShort));
          const sdTime = new Date(sd.fecha).getTime();
          const matchTimeAndUser = (sd.usuario_id === m.creado_por || sd.usuario_nombre === userMap.get(m.creado_por)) && Math.abs(sdTime - mTime) < 300000;
          return matchFolioId || matchTimeAndUser;
        });

        if (!alreadyInStructuredDev) {
          const baseFolio = folio.split('(')[0].trim();
          const cleanKey = baseFolio.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
          const groupKey = `${m.creado_por}_${cleanKey}_${Math.floor(mTime / 300000)}`;
          if (!legacyDevsMap.has(groupKey)) {
            const cleanObs = folio.replace(/^DEVOLUCI[OÓ]N:\s*/i, '').trim();
            legacyDevsMap.set(groupKey, {
              id: m.id,
              source_table: 'movimientos_inventario',
              tipo: 'ENTRADA',
              subtipo: 'DEVOLUCIÓN',
              cantidad: 0,
              fecha: m.fecha,
              folio_factura: folio,
              detalle_motivo: folio,
              motivo: cleanObs || 'Devolución de material',
              cliente_nombre: '',
              sucursal_nombre: '',
              tipo_gasto: '',
              proveedor_id: null,
              proveedor_nombre: '',
              usuario_id: m.creado_por,
              usuario_nombre: userMap.get(m.creado_por) || 'Empleado',
              producto_id: m.producto_id,
              producto_nombre: prod.nombre_oficial || 'Producto',
              producto_sku: prod.sku_interno || '-',
              producto_unidad: prod.unidad || 'pza',
              precio_unitario: prod.precio_unitario || 0,
              materiales: []
            });
          }

          const legDev = legacyDevsMap.get(groupKey);
          legDev.cantidad = Math.round((legDev.cantidad + (Number(m.cantidad) || 0)) * 100) / 100;
          legDev.materiales.push({
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          });
          if (legDev.materiales.length > 1) {
            legDev.producto_nombre = `${legDev.materiales.length} materiales: ${legDev.materiales.map((x: any) => x.nombre).join(', ')}`;
            legDev.producto_sku = `${legDev.materiales.length} partidas`;
          }
        }
      } else if (isGasto) {
        const cleanKey = folio.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
        const groupKey = `${m.creado_por}_${cleanKey}_${Math.floor(mTime / 180000)}`;
        if (!legacyConsumosMap.has(groupKey)) {
          let tipoGasto = '';
          const tipoMatch = folio.match(/\[(Servicio|Proyecto|Venta|Operativo)\]/i);
          if (tipoMatch) tipoGasto = tipoMatch[1];
          let clienteNombre = '';
          const clientMatch = folio.match(/\((.*?)\)/);
          if (clientMatch) clienteNombre = clientMatch[1];
          const detalle = folio.replace(/^(GASTO MATERIAL:|CONSUMO:|GASTO:)\s*/i, '').replace(/\[(Servicio|Proyecto|Venta|Operativo)\]/gi, '').replace(/\(.*?\)/g, '').trim();

          legacyConsumosMap.set(groupKey, {
            id: m.id,
            source_table: 'movimientos_inventario',
            tipo: 'GASTO',
            subtipo: 'GASTO',
            cantidad: 0,
            fecha: m.fecha,
            folio_factura: folio,
            detalle_motivo: detalle || folio,
            motivo: detalle,
            cliente_nombre: clienteNombre,
            sucursal_nombre: '',
            tipo_gasto: tipoGasto || 'Servicio',
            proveedor_id: m.proveedor_id,
            proveedor_nombre: '',
            usuario_id: m.creado_por,
            usuario_nombre: userMap.get(m.creado_por) || 'Empleado',
            producto_id: m.producto_id,
            producto_nombre: prod.nombre_oficial || 'Producto',
            producto_sku: prod.sku_interno || '-',
            producto_unidad: prod.unidad || 'pza',
            precio_unitario: prod.precio_unitario || 0,
            materiales: []
          });
        }

        const legCon = legacyConsumosMap.get(groupKey);
        legCon.cantidad = Math.round((legCon.cantidad + (Number(m.cantidad) || 0)) * 100) / 100;
        legCon.materiales.push({
          producto_id: m.producto_id,
          sku: prod.sku_interno || '-',
          nombre: prod.nombre_oficial || 'Producto',
          cantidad: Number(m.cantidad) || 0,
          unidad: prod.unidad || 'pza'
        });
        if (legCon.materiales.length > 1) {
          legCon.producto_nombre = `${legCon.materiales.length} materiales: ${legCon.materiales.map((x: any) => x.nombre).join(', ')}`;
          legCon.producto_sku = `${legCon.materiales.length} partidas`;
        }
      } else {
        let subtipo = m.tipo;
        let tipoDisplay = m.tipo;
        if (folio.startsWith('IMPORTACIÓN') || folio.startsWith('FACTURA') || m.proveedor_id) {
          subtipo = 'COMPRA/FACTURA';
        } else if (folio.startsWith('CONSUMO') || folio.startsWith('GASTO') || /gasto/i.test(folio)) {
          subtipo = 'GASTO';
          tipoDisplay = 'GASTO';
        } else if (folio.startsWith('ALTA DE PRODUCTO')) {
          subtipo = 'ENTRADA';
        }

        otherMovs.push({
          id: m.id,
          source_table: 'movimientos_inventario',
          tipo: tipoDisplay,
          subtipo,
          cantidad: Number(m.cantidad) || 0,
          fecha: m.fecha,
          folio_factura: folio,
          detalle_motivo: folio,
          cliente_nombre: '',
          tipo_gasto: '',
          proveedor_id: m.proveedor_id,
          proveedor_nombre: provMap.get(m.proveedor_id) || '',
          usuario_id: m.creado_por,
          usuario_nombre: userMap.get(m.creado_por) || 'Sistema / Almacén',
          producto_id: m.producto_id,
          producto_nombre: prod.nombre_oficial || 'Producto',
          producto_sku: prod.sku_interno || '-',
          producto_unidad: prod.unidad || 'pza',
          precio_unitario: prod.precio_unitario || 0,
          tiene_firma: Boolean(m.firma_base64),
          firma_base64: null,
          materiales: [{
            producto_id: m.producto_id,
            sku: prod.sku_interno || '-',
            nombre: prod.nombre_oficial || 'Producto',
            cantidad: Number(m.cantidad) || 0,
            unidad: prod.unidad || 'pza'
          }]
        });
      }
    });

    const allMovs = [
      ...structuredRetiros, 
      ...Array.from(legacyRetirosMap.values()), 
      ...structuredDevs, 
      ...Array.from(legacyDevsMap.values()), 
      ...Array.from(legacyConsumosMap.values()),
      ...otherMovs
    ];

    allMovs.sort((a, b) => {
      const timeA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const timeB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return timeB - timeA;
    });

    return res.json({ movimientos: allMovs, retiros: allMovs });
  } catch (error: any) {
    console.error('Error en getMovimientosInventario:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getFirmaMovimiento = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;

    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const { rows: rRows } = await pool.query(`SELECT firma_base64 FROM retiros_material WHERE id = $1`, [id]);
    if (rRows.length > 0 && rRows[0].firma_base64) {
      return res.json({ firma_base64: rRows[0].firma_base64 });
    }

    const { rows: mRows } = await pool.query(`SELECT firma_base64 FROM movimientos_inventario WHERE id = $1`, [id]);
    if (mRows.length > 0 && mRows[0].firma_base64) {
      return res.json({ firma_base64: mRows[0].firma_base64 });
    }

    return res.json({ firma_base64: null });
  } catch (error: any) {
    console.error('Error en getFirmaMovimiento:', error);
    return res.status(500).json({ error: error.message });
  }
};
