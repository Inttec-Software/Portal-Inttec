import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

// Helper: calcular estado de pago
function calcularEstadoPago(precioTotal: number, totalPagado: number): string {
  if (precioTotal <= 0) return 'SIN_PRECIO';
  if (totalPagado >= precioTotal) return 'PAGADA';
  if (totalPagado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

// Helper: sync payment status in DB
async function syncPaymentStatusInternal(pool: any, ventaId: string) {
  try {
    const ventaRes = await pool.query('SELECT precio_total_facturado FROM ventas WHERE id = $1', [ventaId]);
    const venta = ventaRes.rows[0];

    if (!venta) return;

    const pagosRes = await pool.query('SELECT monto FROM ventas_pagos WHERE venta_id = $1', [ventaId]);
    const pagos = pagosRes.rows;

    const precioTotal = Number(venta.precio_total_facturado) || 0;
    const totalPagado = (pagos || []).reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);
    const saldoPendiente = Math.max(0, precioTotal - totalPagado);
    const estadoPago = calcularEstadoPago(precioTotal, totalPagado);

    await pool.query(
      'UPDATE ventas SET total_pagado = $1, saldo_pendiente = $2, estado_pago = $3 WHERE id = $4',
      [totalPagado, saldoPendiente, estadoPago, ventaId]
    );
  } catch (err) {
    // Silently fail – non-critical
  }
}

// === GET /api/ventas/historial ===
export const getVentasHistorial = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const ventasRes = await pool.query(`
      SELECT v.*,
             (SELECT row_to_json(c_obj) FROM (SELECT folio FROM cotizaciones c WHERE c.id = v.cotizacion_id) c_obj) as cotizaciones,
             (SELECT row_to_json(u_obj) FROM (SELECT nombre FROM usuarios u WHERE u.id = v.registrado_por) u_obj) as usuarios,
             (SELECT json_agg(row_to_json(vp_obj)) FROM (SELECT descripcion, unidad FROM ventas_partidas vp WHERE vp.venta_id = v.id) vp_obj) as ventas_partidas
      FROM ventas v
      ORDER BY v.created_at DESC
      LIMIT 300
    `);

    const ventasData = ventasRes.rows;

    // Excluir registros generados como Factura Directa que no corresponden a ventas operativas
    const rawVentas = (ventasData || []).filter((v: any) => {
      if (v.tipo_proyecto === 'Factura Directa') {
        const ref = (v.factura_referencia || '').trim();
        const fol = (v.folio || '').trim();
        if (!ref || ref === fol) return false;
      }
      return true;
    });
    const ventaIds = rawVentas.map((v: any) => v.id);

    let pagosMap: Record<string, any[]> = {};
    if (ventaIds.length > 0) {
      try {
        const pagosRes = await pool.query(`
          SELECT * FROM ventas_pagos WHERE venta_id = ANY($1) ORDER BY fecha_pago DESC
        `, [ventaIds]);
        
        const pagosData = pagosRes.rows;
        pagosData.forEach((p: any) => {
          if (!pagosMap[p.venta_id]) pagosMap[p.venta_id] = [];
          pagosMap[p.venta_id].push(p);
        });
      } catch (_) {
        // Table may not exist yet
      }
    }

    const ventasConPagos = rawVentas.map((v: any) => {
      const pagos = pagosMap[v.id] || [];
      const totalPagado = pagos.length > 0
        ? pagos.reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0)
        : (Number(v.total_pagado) || 0);

      const precioFacturado = Number(v.precio_total_facturado) || 0;
      const saldoPendiente = v.saldo_pendiente !== undefined && v.saldo_pendiente !== null
        ? Number(v.saldo_pendiente)
        : Math.max(0, precioFacturado - totalPagado);

      const estadoPago = v.estado_pago || calcularEstadoPago(precioFacturado, totalPagado);
      const fechaUltimoPago = pagos.length > 0 ? pagos[0].fecha_pago : null;

      return {
        ...v,
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        estado_pago: estadoPago,
        fecha_ultimo_pago: fechaUltimoPago,
        pagos_count: pagos.length,
      };
    });

    return res.json({ ventas: ventasConPagos });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/:id/detalle ===
export const getVentaDetalle = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    const [partidasRes, gastosRes, pagosRes] = await Promise.all([
      pool.query('SELECT * FROM ventas_partidas WHERE venta_id = $1', [id]),
      pool.query(`
        SELECT g.*,
          (SELECT row_to_json(s_obj) FROM (
            SELECT s.id, s.nombre, s.categoria_id,
                   (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
            FROM subcategorias s WHERE s.id = g.subcategoria_id
          ) s_obj) as subcategoria_rel,
          (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
          (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
          (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel
        FROM gastos g
        WHERE g.venta_id = $1 AND g.status = 'APPROVED'
      `, [id]),
      pool.query('SELECT * FROM ventas_pagos WHERE venta_id = $1 ORDER BY fecha_pago DESC', [id]),
    ]);

    // Sync payment status in the background
    await syncPaymentStatusInternal(pool, id as string);

    const pagos = pagosRes.rows || [];
    const totalPagado = pagos.reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);

    return res.json({
      partidas: partidasRes.rows || [],
      gastos: gastosRes.rows || [],
      pagos: pagos,
      totalPagado,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/:id/pagos ===
export const getVentaPagos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    const pagosRes = await pool.query('SELECT * FROM ventas_pagos WHERE venta_id = $1 ORDER BY fecha_pago DESC', [id]);

    // Sync payment status
    await syncPaymentStatusInternal(pool, id as string);

    return res.json({ pagos: pagosRes.rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/ventas/:id/pagos ===
export const registrarPago = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { monto, fecha_pago, metodo_pago, referencia, registrado_por } = req.body;

    await pool.query(
      `INSERT INTO ventas_pagos (venta_id, monto, fecha_pago, metodo_pago, referencia, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, parseFloat(monto), fecha_pago, metodo_pago || 'Transferencia', referencia || null, registrado_por || null]
    );

    // Sync payment status after insert
    await syncPaymentStatusInternal(pool, id as string);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/ventas/:id/pagos/:pagoId ===
export const deletePago = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id, pagoId } = req.params;

    await pool.query('DELETE FROM ventas_pagos WHERE id = $1', [pagoId]);

    // Sync payment status after delete
    await syncPaymentStatusInternal(pool, id as string);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/ventas ===
export const createVenta = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { ventaPayload, partidasPayload } = req.body;

    // Generate sequential folio (escalable, ignorando A1 y buscando el máximo real)
    const allFoliosRes = await pool.query("SELECT folio FROM ventas WHERE folio IS NOT NULL AND folio ILIKE 'A%'");
    
    let maxNum = 3999; // Base para que empiece en A4000 si no hay mayores
    if (allFoliosRes.rows && allFoliosRes.rows.length > 0) {
      for (const item of allFoliosRes.rows) {
        if (item.folio) {
          const numStr = item.folio.substring(1);
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    const nextFolio = `A${maxNum + 1}`;
    const ventaPayloadWithFolio = { ...ventaPayload, folio: nextFolio };

    const keys = Object.keys(ventaPayloadWithFolio);
    const values = Object.values(ventaPayloadWithFolio);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const ventaDataRes = await pool.query(
      `INSERT INTO ventas (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const ventaData = ventaDataRes.rows[0];

    // Insert partidas
    if (partidasPayload && partidasPayload.length > 0) {
      for (const p of partidasPayload) {
        const pKeys = Object.keys(p);
        pKeys.push('venta_id');
        const pValues = Object.values(p);
        pValues.push(ventaData.id);
        const pPlaceholders = pKeys.map((_, i) => `$${i + 1}`).join(', ');
        
        await pool.query(
          `INSERT INTO ventas_partidas (${pKeys.join(', ')}) VALUES (${pPlaceholders})`,
          pValues
        );
      }
    }

    return res.json({ success: true, venta: ventaData });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === PUT /api/ventas/:id ===
export const updateVenta = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { ventaPayload, partidasPayload } = req.body;

    if (ventaPayload && Object.keys(ventaPayload).length > 0) {
      const keys = Object.keys(ventaPayload);
      const values = Object.values(ventaPayload);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      
      await pool.query(`UPDATE ventas SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);
    }

    // Delete old partidas
    await pool.query('DELETE FROM ventas_partidas WHERE venta_id = $1', [id]);

    // Insert new partidas
    if (partidasPayload && partidasPayload.length > 0) {
      for (const p of partidasPayload) {
        const pKeys = Object.keys(p);
        pKeys.push('venta_id');
        const pValues = Object.values(p);
        pValues.push(id);
        const pPlaceholders = pKeys.map((_, i) => `$${i + 1}`).join(', ');
        
        await pool.query(
          `INSERT INTO ventas_partidas (${pKeys.join(', ')}) VALUES (${pPlaceholders})`,
          pValues
        );
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/ventas/:id ===
export const deleteVenta = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    // Delete partidas first (foreign key)
    await pool.query('DELETE FROM ventas_partidas WHERE venta_id = $1', [id]);

    // Delete pagos
    try {
      await pool.query('DELETE FROM ventas_pagos WHERE venta_id = $1', [id]);
    } catch (_) {
      // Table may not exist, ignore
    }

    // Delete the venta
    await pool.query('DELETE FROM ventas WHERE id = $1', [id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/:id/partidas ===
export const getVentaPartidas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    const partidasRes = await pool.query('SELECT * FROM ventas_partidas WHERE venta_id = $1', [id]);

    return res.json({ partidas: partidasRes.rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/check-duplicate?ref=XXXX ===
export const checkDuplicateReference = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const ref = req.query.ref as string;
    if (!ref) return res.json({ exists: false });

    const existingRes = await pool.query('SELECT id FROM ventas WHERE factura_referencia ILIKE $1 LIMIT 1', [ref.trim()]);
    const existing = existingRes.rows[0];

    return res.json({ exists: !!existing, id: existing?.id || null });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/catalogs ===
export const getVentasCatalogs = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const [cliRes, sucRes] = await Promise.all([
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre'),
    ]);

    return res.json({
      clientes: cliRes.rows || [],
      sucursales: sucRes.rows || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ventas/:id/pdf-data ===
export const getVentaPdfData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    const ventaRes = await pool.query('SELECT cliente, cotizacion_id FROM ventas WHERE id = $1', [id]);
    const venta = ventaRes.rows[0];

    let clientData = null;
    if (venta?.cliente) {
      const clientRes = await pool.query('SELECT * FROM clientes WHERE nombre = $1 LIMIT 1', [venta.cliente]);
      clientData = clientRes.rows[0];
    }

    let cotizacionLineas: any[] = [];
    if (venta?.cotizacion_id) {
      const cotDataRes = await pool.query('SELECT lineas FROM cotizaciones WHERE id = $1', [venta.cotizacion_id]);
      const cotData = cotDataRes.rows[0];
      if (cotData?.lineas) cotizacionLineas = typeof cotData.lineas === 'string' ? JSON.parse(cotData.lineas) : cotData.lineas;
    }

    return res.json({
      clientData: clientData || null,
      cotizacionLineas,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/ventas/:id/sync-payment ===
export const syncPaymentStatus = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    await syncPaymentStatusInternal(pool, id as string);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
