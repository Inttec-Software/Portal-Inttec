import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

// === GET /api/retiro-material/productos ===
export const getProductosDisponibles = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { rows: data } = await pool.query(
      `SELECT id, sku_interno, nombre_oficial, stock_actual, stock_nuevo, stock_usado, stock_por_revisar, unidad
       FROM productos
       WHERE activo = $1
       ORDER BY nombre_oficial`,
      [true]
    );
    
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
        stock_por_revisar: sPorRev,
        unidad
      };
    }).filter((p: any) => p.stock_actual > 0);

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
    const pool = getDbPool(tenant.company, tenant.env);
    
    const {
      cart,
      motivoRetiro,
      currentUser,
      tipoGasto,
      detalleServicioProyecto,
      proveedor,
      proveedorId,
      clienteId,
      clienteNombre,
      sucursalId,
      sucursalNombre,
      isSplit,
      splits,
      firmaBase64,
      dispositivoInfo,
      responsivaAceptada
    } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0 || !currentUser || !currentUser.id) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const materialesSnapshot = cart.map(item => ({
      producto_id: item.producto.id,
      sku: item.producto.sku_interno || '',
      nombre: item.producto.nombre_oficial || 'Producto',
      cantidad: item.cantidad,
      cantidad_nuevo: Number(item.cantidad_nuevo) || 0,
      cantidad_usado: Number(item.cantidad_usado) || 0,
      cantidad_por_revisar: Number(item.cantidad_por_revisar) || 0,
      unidad: item.producto.unidad || 'pza'
    }));

    const sanitizeUuid = (val: any): string | null => {
      if (!val || typeof val !== 'string') return null;
      const trimmed = val.trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(trimmed) ? trimmed : null;
    };

    // 1. Guardar registro estructurado en retiros_material
    try {
      await pool.query(
        `INSERT INTO retiros_material (
          empleado_id, empleado_nombre, tipo_gasto, detalle_servicio_proyecto, proveedor, proveedor_id, cliente_id, cliente_nombre, sucursal_id, sucursal_nombre, is_split, splits_json, materiales, motivo, firma_base64, responsiva_aceptada, firmado_en, dispositivo_info, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )`,
        [
          sanitizeUuid(currentUser.id) || currentUser.id,
          currentUser.nombre || currentUser.email || 'Empleado',
          tipoGasto || 'Operativo',
          detalleServicioProyecto || '',
          proveedor || '',
          sanitizeUuid(proveedorId),
          sanitizeUuid(clienteId),
          clienteNombre || '',
          sanitizeUuid(sucursalId),
          sucursalNombre || '',
          Boolean(isSplit),
          JSON.stringify(splits || []),
          JSON.stringify(materialesSnapshot),
          (motivoRetiro || '').trim(),
          firmaBase64 || null,
          responsivaAceptada !== false,
          new Date().toISOString(),
          dispositivoInfo ? JSON.stringify(dispositivoInfo) : null,
          new Date().toISOString()
        ]
      );
    } catch (saveRetiroErr: any) {
      console.warn('Error capturado en retiros_material insert:', saveRetiroErr.message);
    }

    // 2. Procesar cada material: descontar stock por estado específico, movimiento salida, inventario empleado
    for (const item of cart) {
      const { rows: prodRows } = await pool.query(
        `SELECT * FROM productos WHERE id = $1`,
        [item.producto.id]
      );
      const prodData = prodRows[0];
        
      if (!prodData) continue;
      
      let nuevo = Number(prodData.stock_nuevo) || 0;
      let usado = Number(prodData.stock_usado) || 0;
      let porRevisar = Number(prodData.stock_por_revisar) || 0;

      const reqNuevo = Number(item.cantidad_nuevo) || 0;
      const reqUsado = Number(item.cantidad_usado) || 0;
      const reqPorRevisar = Number(item.cantidad_por_revisar) || 0;

      let withdrawNuevo = 0;
      let withdrawUsado = 0;
      let withdrawPorRevisar = 0;

      if (reqNuevo > 0 || reqUsado > 0 || reqPorRevisar > 0) {
        // Descuento exacto por estado solicitado
        withdrawNuevo = Math.min(nuevo, reqNuevo);
        withdrawUsado = Math.min(usado, reqUsado);
        withdrawPorRevisar = Math.min(porRevisar, reqPorRevisar);

        nuevo = Math.max(0, nuevo - withdrawNuevo);
        usado = Math.max(0, usado - withdrawUsado);
        porRevisar = Math.max(0, porRevisar - withdrawPorRevisar);
      } else {
        // Descuento por orden de prioridad (FIFO) si no se especificó desglose
        let toDiscount = item.cantidad;
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
      }

      const newStock = Math.round((nuevo + usado + porRevisar) * 100) / 100;

      // Descontar del inventario general
      await pool.query(
        `UPDATE productos SET stock_actual = $1, stock_nuevo = $2, stock_usado = $3, stock_por_revisar = $4 WHERE id = $5`,
        [newStock, nuevo, usado, porRevisar, item.producto.id]
      );

      // Registrar movimiento de salida
      const clientLabel = isSplit ? 'Varios clientes' : (clienteNombre ? `${clienteNombre}${sucursalNombre ? ` - ${sucursalNombre}` : ''}` : '');
      const fullFolio = `RETIRO: ${(motivoRetiro || '').trim()}${tipoGasto ? ` [${tipoGasto}]` : ''}${clientLabel ? ` (${clientLabel})` : ''}`;

      try {
        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por, firma_base64)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            item.producto.id,
            'SALIDA',
            item.cantidad,
            fullFolio,
            currentUser.id,
            firmaBase64 || null
          ]
        );
      } catch (moveErr: any) {
        console.warn('No se pudo registrar histórico:', moveErr.message);
      }

      // Agregar al inventario del empleado con desglose de estados
      try {
        const { rows: invEmpRows } = await pool.query(
          `SELECT id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar 
           FROM inventario_empleados 
           WHERE empleado_id = $1 AND producto_id = $2`,
          [currentUser.id, item.producto.id]
        );
        const invEmp = invEmpRows[0];

        if (invEmp) {
          const curNuevo = Number(invEmp.cantidad_nuevo) || 0;
          const curUsado = Number(invEmp.cantidad_usado) || 0;
          const curPorRev = Number(invEmp.cantidad_por_revisar) || 0;

          // Si el empleado ya tenía stock pero no desglosado
          const baseNuevo = (curNuevo === 0 && curUsado === 0 && curPorRev === 0 && Number(invEmp.cantidad_disponible) > 0)
            ? Number(invEmp.cantidad_disponible)
            : curNuevo;

          const nextNuevo = baseNuevo + withdrawNuevo;
          const nextUsado = curUsado + withdrawUsado;
          const nextPorRev = curPorRev + withdrawPorRevisar;
          const nextTotal = Math.round((nextNuevo + nextUsado + nextPorRev) * 100) / 100;

          await pool.query(
            `UPDATE inventario_empleados 
             SET cantidad_disponible = $1, cantidad_nuevo = $2, cantidad_usado = $3, cantidad_por_revisar = $4, updated_at = $5 
             WHERE id = $6`,
            [nextTotal, nextNuevo, nextUsado, nextPorRev, new Date().toISOString(), invEmp.id]
          );
        } else {
          await pool.query(
            `INSERT INTO inventario_empleados (empleado_id, producto_id, cantidad_disponible, cantidad_nuevo, cantidad_usado, cantidad_por_revisar)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [currentUser.id, item.producto.id, item.cantidad, withdrawNuevo, withdrawUsado, withdrawPorRevisar]
          );
        }
      } catch (invSaveErr: any) {
        console.warn('Fallback al actualizar inventario_empleados:', invSaveErr?.message);
        // Fallback simple si la tabla no tuviera las columnas todavía
        const { rows: fallbackInvRows } = await pool.query(
          `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
          [currentUser.id, item.producto.id]
        );
        const fallbackInv = fallbackInvRows[0];

        if (fallbackInv) {
          await pool.query(
            `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
            [fallbackInv.cantidad_disponible + item.cantidad, new Date().toISOString(), fallbackInv.id]
          );
        } else {
          await pool.query(
            `INSERT INTO inventario_empleados (empleado_id, producto_id, cantidad_disponible)
             VALUES ($1, $2, $3)`,
            [currentUser.id, item.producto.id, item.cantidad]
          );
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/retiro-material/historial ===
export const getHistorialRetiros = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    // 1. Intentar consultar de la tabla dedicada retiros_material
    let structuredRetiros: any[] = [];
    try {
      const { rows: retirosData } = await pool.query(
        `SELECT * FROM retiros_material ORDER BY created_at DESC`
      );
      if (Array.isArray(retirosData)) {
        structuredRetiros = retirosData;
      }
    } catch (dbErr: any) {
      console.warn('Excepción al consultar retiros_material:', dbErr?.message);
    }

    // 2. Consultar movimientos_inventario para incluir retiros históricos / legados
    const [movsRes, usersRes] = await Promise.all([
      pool.query(
        `SELECT m.*, 
          p.id as p_id, 
          p.sku_interno as p_sku_interno, 
          p.nombre_oficial as p_nombre_oficial, 
          p.unidad as p_unidad
         FROM movimientos_inventario m
         LEFT JOIN productos p ON m.producto_id = p.id
         WHERE m.tipo = $1 AND m.folio_factura ILIKE $2
         ORDER BY m.fecha DESC
         LIMIT 200`,
        ['SALIDA', 'RETIRO:%']
      ),
      pool.query(`SELECT id, nombre, email FROM usuarios`)
    ]);

    const usersMap = new Map<string, string>();
    if (usersRes.rows) {
      usersRes.rows.forEach((u: any) => {
        usersMap.set(u.id, u.nombre || u.email || 'Empleado');
      });
    }

    // Agrupar movimientos_inventario en transacciones de retiro
    const rawMovs = movsRes.rows.map(row => ({
      ...row,
      producto: row.p_id ? {
        id: row.p_id,
        sku_interno: row.p_sku_interno,
        nombre_oficial: row.p_nombre_oficial,
        unidad: row.p_unidad
      } : null
    }));
    const legacyGroups: any[] = [];

    for (const m of rawMovs) {
      const mTime = new Date(m.fecha).getTime();
      const folio = m.folio_factura || '';

      const prod = m.producto || {};
      const mat = {
        producto_id: m.producto_id || prod.id,
        sku: prod.sku_interno || '-',
        nombre: prod.nombre_oficial || 'Producto',
        cantidad: m.cantidad || 0,
        unidad: prod.unidad || 'pza'
      };

      // Buscar si pertenece a un grupo legado existente (mismo creador, mismo folio, fecha dentro de 60 segundos)
      const existingGroup = legacyGroups.find(g =>
        g.empleado_id === m.creado_por &&
        g.raw_folio === folio &&
        Math.abs(new Date(g.created_at).getTime() - mTime) < 60000
      );

      if (existingGroup) {
        existingGroup.materiales.push(mat);
      } else {
        let tipo = 'Operativo';
        const tipoMatch = folio.match(/\[(Servicio|Proyecto|Venta|Operativo)\]/i);
        if (tipoMatch) tipo = tipoMatch[1];

        let clienteNombre = '';
        const clientMatch = folio.match(/\((.*?)\)/);
        if (clientMatch) clienteNombre = clientMatch[1];

        const cleanMotivo = folio
          .replace(/^RETIRO:\s*/i, '')
          .replace(/\[(Servicio|Proyecto|Venta|Operativo)\]/gi, '')
          .replace(/\(.*?\)/g, '')
          .trim();

        legacyGroups.push({
          id: m.id,
          raw_folio: folio,
          empleado_id: m.creado_por,
          empleado_nombre: usersMap.get(m.creado_por) || 'Empleado',
          tipo_gasto: tipo,
          detalle_servicio_proyecto: '',
          proveedor: '',
          cliente_nombre: clienteNombre,
          sucursal_nombre: '',
          is_split: clienteNombre.toLowerCase().includes('varios'),
          splits_json: [],
          materiales: [mat],
          motivo: cleanMotivo,
          created_at: m.fecha
        });
      }
    }

    // 3. Fusionar: Conservar retiros_material estructurados y agregar legados que no estén duplicados
    const combinedRetiros = [...structuredRetiros];

    for (const leg of legacyGroups) {
      const legTime = new Date(leg.created_at).getTime();
      // Verificar si ya existe en structuredRetiros con mismo empleado y fecha similar (+/- 60s)
      const alreadyInStructured = structuredRetiros.some(st =>
        st.empleado_id === leg.empleado_id &&
        Math.abs(new Date(st.created_at).getTime() - legTime) < 60000
      );

      if (!alreadyInStructured) {
        combinedRetiros.push(leg);
      }
    }

    // Ordenar descendente por fecha
    combinedRetiros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({ retiros: combinedRetiros });
  } catch (error: any) {
    console.error('Error en getHistorialRetiros:', error);
    return res.json({ retiros: [] });
  }
};
