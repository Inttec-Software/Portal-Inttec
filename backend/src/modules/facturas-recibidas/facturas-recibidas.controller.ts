import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import { SatSyncService } from '../../services/satSyncService';
import { reconcilePendingInvoicesForPool } from '../reportes/reportes.controller';
import { invalidateCache } from '../../middlewares/cache.middleware';

// === GET /api/facturas-recibidas ===
export const getFacturasRecibidas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    try {
      const { rows } = await pool.query(
        `SELECT *
         FROM facturas_recibidas
         ORDER BY fecha_emision DESC
         LIMIT 1000`
      );
      return res.json({ facturas: rows || [], tableMissing: false });
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return res.json({ facturas: [], tableMissing: true });
      }
      throw dbError;
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/facturas-recibidas/:id ===
export const getFacturaById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM facturas_recibidas WHERE id = $1`, [id]);

    return res.json({ factura: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/facturas-recibidas/sat-solicitudes ===
export const getSatSolicitudes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const isPendingOnly = req.query.pending === 'true';
    let sql = `SELECT * FROM sat_descarga_solicitudes`;
    if (isPendingOnly) {
      sql += ` WHERE estado_sat IN ('PENDIENTE', 'EN_PROCESO') ORDER BY created_at DESC LIMIT 5`;
    } else {
      sql += ` ORDER BY created_at DESC LIMIT 50`;
    }

    const { rows } = await pool.query(sql);

    return res.json({ solicitudes: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/facturas-recibidas/import ===
export const importFactura = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { parsed } = req.body;
    if (!parsed || !parsed.uuid) return res.status(400).json({ error: 'Invalid payload' });

    const payload = {
      uuid: parsed.uuid,
      rfc_emisor: parsed.rfcEmisor || parsed.issuer?.tax_id || '',
      nombre_emisor: parsed.nombreEmisor || parsed.issuer?.legal_name || 'Proveedor SAT',
      rfc_receptor: parsed.rfcReceptor || parsed.customer?.tax_id || '',
      rfc_pac: parsed.rfcPac || parsed.stamp?.pac_rfc || null,
      fecha_emision: parsed.fechaEmision || parsed.created_at || new Date().toISOString(),
      subtotal: Number(parsed.subtotal) || 0,
      descuento: Number(parsed.descuento) || 0,
      iva: Number(parsed.iva) || Number(parsed.total_impuestos_trasladados) || 0,
      retencion_isr: Number(parsed.retencionIsr) || 0,
      retencion_iva: Number(parsed.retencionIva) || 0,
      total: Number(parsed.total) || 0,
      moneda: parsed.moneda || parsed.currency || 'MXN',
      tipo_comprobante: parsed.tipoComprobante || 'I',
      estado_sat: parsed.estadoSat || 'VIGENTE',
      conceptos_json: JSON.stringify(parsed.conceptos || parsed.items || []),
      updated_at: new Date().toISOString(),
    };

    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updateEx = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');

    const { rows } = await pool.query(
      `INSERT INTO facturas_recibidas (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (uuid) DO UPDATE SET ${updateEx} RETURNING *`,
      values
    );

    try {
      await reconcilePendingInvoicesForPool(pool);
      invalidateCache('reportes');
    } catch (recErr) {
      console.warn('[importFactura] Error ejecutando conciliación de gastos:', recErr);
    }

    return res.json({ success: true, factura: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/facturas-recibidas/lookup ===
export const lookupFacturasRecibidas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const q = String(req.query.q || '').trim();
    const currentGastoId = req.query.gasto_id ? String(req.query.gasto_id).trim() : null;

    if (!q) {
      return res.json({ facturas: [] });
    }

    const searchTerm = `%${q}%`;
    const { rows } = await pool.query(
      `SELECT f.id, f.uuid, f.rfc_emisor, f.nombre_emisor, f.rfc_receptor, f.fecha_emision,
              f.subtotal, f.descuento, f.iva, f.retencion_isr, f.retencion_iva, f.total,
              f.moneda, f.tipo_comprobante, f.estado_sat, f.xml_url, f.pdf_url,
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'id', g.id,
                  'empleado_nombre', g.empleado_nombre,
                  'monto', g.monto,
                  'monto_propina', COALESCE(g.monto_propina, 0),
                  'monto_consumido', gf.monto_aplicado,
                  'es_factura_compartida', COALESCE(g.es_factura_compartida, false),
                  'status', g.status,
                  'justificacion', g.justificacion,
                  'fecha_comprobante', g.fecha_comprobante,
                  'created_at', g.created_at
                )), '[]'::json)
                FROM gasto_facturas gf
                JOIN gastos g ON g.id = gf.gasto_id
                WHERE gf.factura_recibida_id = f.id
              ) as gastos_vinculados
       FROM facturas_recibidas f
       WHERE (
         f.uuid ILIKE $1 
         OR f.rfc_emisor ILIKE $1 
         OR f.nombre_emisor ILIKE $1
       )
       ORDER BY f.fecha_emision DESC
       LIMIT 25`,
      [searchTerm]
    );

    const results = rows.map((fac: any) => {
      const vinculados: any[] = Array.isArray(fac.gastos_vinculados) ? fac.gastos_vinculados : [];
      const otrosGastos = currentGastoId 
        ? vinculados.filter(g => g.id !== currentGastoId)
        : vinculados;

      const totalFactura = Number(fac.total || 0);
      const montoConsumidoTotal = vinculados.reduce((sum, g) => sum + Number(g.monto_consumido || 0), 0);
      const montoConsumidoOtros = otrosGastos.reduce((sum, g) => sum + Number(g.monto_consumido || 0), 0);
      const saldoDisponible = Math.max(0, totalFactura - montoConsumidoOtros);
      const esCompartida = otrosGastos.some(g => g.es_factura_compartida === true);

      return {
        ...fac,
        gastos_vinculados: vinculados,
        total_consumido: Number(montoConsumidoTotal.toFixed(2)),
        total_consumido_otros: Number(montoConsumidoOtros.toFixed(2)),
        saldo_disponible: Number(saldoDisponible.toFixed(2)),
        es_ya_vinculada: otrosGastos.length > 0,
        es_factura_compartida: esCompartida,
        otros_gastos: otrosGastos,
      };
    });

    return res.json({ facturas: results });
  } catch (error: any) {
    console.error('[lookupFacturasRecibidas] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/facturas-recibidas/sync-status ===
export const getSatSyncStatus = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const company = tenant?.company || 'inttec';
    const status = SatSyncService.getStatus(company);
    return res.json({ success: true, status });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/facturas-recibidas/sync-now ===
export const triggerSatSync = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const result = await SatSyncService.syncCompany(tenant.company, tenant.env);
    return res.json({ success: true, result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/facturas-recibidas/conciliacion-sat ===
export const conciliarSatFacturas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { facturasSat, periodo } = req.body;
    if (!Array.isArray(facturasSat) || facturasSat.length === 0) {
      return res.status(400).json({ error: 'No se enviaron facturas para conciliar.' });
    }

    // 1. Mapeo de UUIDs del archivo SAT en mayúsculas
    const uuidMap = new Map<string, any>();
    facturasSat.forEach((f: any) => {
      const cleanUuid = String(f.uuid || '').trim().toUpperCase();
      if (cleanUuid) {
        uuidMap.set(cleanUuid, {
          uuid: cleanUuid,
          fechaEmision: f.fechaEmision || f['Fecha emision'] || '',
          rfcEmisor: f.rfcEmisor || f['RFC emisor'] || '',
          nombreEmisor: f.nombreEmisor || f['Razon emisor'] || f.proveedor || '',
          rfcReceptor: f.rfcReceptor || f['RFC receptor'] || '',
          total: Number(f.total !== undefined ? f.total : f.Total) || 0,
          estadoSat: (f.estadoSat || f.Estado || 'VIGENTE').toUpperCase(),
          conceptos: f.conceptos || f.Conceptos || '',
          moneda: f.moneda || f.Moneda || 'MXN',
        });
      }
    });

    const uuidsArray = Array.from(uuidMap.keys());

    // 2. Consultar qué facturas del archivo existen en la tabla facturas_recibidas del portal
    const facturasPortalRes = await pool.query(`
      SELECT id, UPPER(uuid) AS uuid, rfc_emisor, nombre_emisor, total
      FROM facturas_recibidas
      WHERE UPPER(uuid) = ANY($1)
    `, [uuidsArray]);

    const portalFacturasMap = new Map<string, any>();
    facturasPortalRes.rows.forEach((row: any) => {
      portalFacturasMap.set(row.uuid, row);
    });

    // 3. Consultar gastos vinculados que coincidan con estos UUIDs en la BDD (soporte N:M via gasto_facturas)
    const vinculadosRes = await pool.query(`
      SELECT 
        f.id AS factura_id,
        UPPER(f.uuid) AS uuid,
        f.rfc_emisor,
        f.nombre_emisor,
        f.total AS total_sat,
        f.fecha_emision,
        f.estado_sat,
        g.id AS gasto_id,
        g.empleado_nombre,
        g.fecha_comprobante,
        g.created_at AS gasto_created_at,
        g.monto AS gasto_monto,
        gf.monto_aplicado,
        COALESCE(g.monto_propina, 0) AS monto_propina,
        g.motivo_sin_factura,
        g.status AS gasto_status,
        g.justificacion,
        g.detalle_servicio_proyecto,
        (SELECT c.nombre FROM categorias c JOIN subcategorias s ON s.categoria_id = c.id WHERE s.id = g.subcategoria_id) AS categoria_nombre,
        (SELECT s.nombre FROM subcategorias s WHERE s.id = g.subcategoria_id) AS subcategoria_nombre,
        (SELECT cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) AS cliente_nombre,
        (SELECT v.cliente FROM ventas v WHERE v.id = g.venta_id) AS venta_cliente
      FROM facturas_recibidas f
      JOIN gasto_facturas gf ON gf.factura_recibida_id = f.id
      JOIN gastos g ON g.id = gf.gasto_id
      WHERE UPPER(f.uuid) = ANY($1)
    `, [uuidsArray]);

    const vinculadosMap = new Map<string, any[]>();
    vinculadosRes.rows.forEach((row: any) => {
      const u = row.uuid;
      if (!vinculadosMap.has(u)) vinculadosMap.set(u, []);
      vinculadosMap.get(u)!.push(row);
    });

    // 4. Separar en Conciliadas vs Huérfanas SAT
    const conciliadas: any[] = [];
    const huerfanasSat: any[] = [];

    uuidMap.forEach((satItem, uuid) => {
      const gastosVinculados = vinculadosMap.get(uuid);
      if (gastosVinculados && gastosVinculados.length > 0) {
        gastosVinculados.forEach((g) => {
          conciliadas.push({
            sat: satItem,
            gasto: g,
          });
        });
      } else {
        const existeEnPortal = portalFacturasMap.has(uuid);
        huerfanasSat.push({
          ...satItem,
          en_portal: existeEnPortal,
          portal_factura_id: existeEnPortal ? portalFacturasMap.get(uuid).id : null,
        });
      }
    });

    // 5. Rango de fechas del periodo para gastos huérfanos
    const fechaInicio = (periodo?.inicio || '1970-01-01').substring(0, 10);
    const fechaFin = (periodo?.fin || '2099-12-31').substring(0, 10);

    // 6. Consultar Gastos del portal de ese periodo sin factura vinculada
    const huerfanosGastosRes = await pool.query(`
      SELECT 
        g.id,
        g.empleado_nombre,
        g.fecha_comprobante,
        g.created_at,
        g.monto,
        g.status,
        g.facturado,
        g.motivo_sin_factura,
        g.justificacion,
        g.detalle_servicio_proyecto,
        (SELECT c.nombre FROM categorias c JOIN subcategorias s ON s.categoria_id = c.id WHERE s.id = g.subcategoria_id) AS categoria_nombre,
        (SELECT s.nombre FROM subcategorias s WHERE s.id = g.subcategoria_id) AS subcategoria_nombre,
        (SELECT p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) AS proveedor_nombre,
        (SELECT cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) AS cliente_nombre
      FROM gastos g
      WHERE COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) >= $1
        AND COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) <= $2
        AND g.factura_recibida_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM gasto_facturas gf WHERE gf.gasto_id = g.id)
        AND g.status != 'REJECTED'
      ORDER BY g.fecha_comprobante DESC, g.created_at DESC
    `, [fechaInicio, fechaFin]);

    const huerfanosGastos = huerfanosGastosRes.rows.map((g: any) => {
      const motivo = String(g.motivo_sin_factura || '').toUpperCase();
      let clasificacionFiscal: 'FACTURADO_SIN_VINCULAR' | 'PENDIENTE_FACTURA' | 'NO_FACTURADO' = 'NO_FACTURADO';

      if (g.facturado) {
        clasificacionFiscal = 'FACTURADO_SIN_VINCULAR';
      } else if (motivo.includes('PENDIENTE')) {
        clasificacionFiscal = 'PENDIENTE_FACTURA';
      } else {
        clasificacionFiscal = 'NO_FACTURADO';
      }

      return {
        ...g,
        clasificacion_fiscal: clasificacionFiscal,
      };
    });

    // 7. Consolidar KPIs
    const totalSatCount = facturasSat.length;
    const totalSatMonto = facturasSat.reduce((sum: number, f: any) => sum + (Number(f.total !== undefined ? f.total : f.Total) || 0), 0);
    const conciliadasCount = conciliadas.length;
    const conciliadasMontoSat = conciliadas.reduce((sum: number, c: any) => sum + (Number(c.sat.total) || 0), 0);
    const conciliadasMontoGasto = conciliadas.reduce((sum: number, c: any) => sum + (Number(c.gasto.gasto_monto) || 0), 0);
    const huerfanasSatCount = huerfanasSat.length;
    const huerfanasSatMonto = huerfanasSat.reduce((sum: number, f: any) => sum + (Number(f.total) || 0), 0);
    const huerfanasEnPortalCount = huerfanasSat.filter(h => h.en_portal).length;
    const huerfanasNoEnPortalCount = huerfanasSat.filter(h => !h.en_portal).length;

    const huerfanosGastosCount = huerfanosGastos.length;
    const huerfanosGastosMonto = huerfanosGastos.reduce((sum: number, g: any) => sum + (Number(g.monto) || 0), 0);
    const huerfanosFacturadoSinVincularCount = huerfanosGastos.filter(g => g.clasificacion_fiscal === 'FACTURADO_SIN_VINCULAR').length;
    const huerfanosPendienteCount = huerfanosGastos.filter(g => g.clasificacion_fiscal === 'PENDIENTE_FACTURA').length;
    const huerfanosNoFacturadoCount = huerfanosGastos.filter(g => g.clasificacion_fiscal === 'NO_FACTURADO').length;

    return res.json({
      kpis: {
        totalSatCount,
        totalSatMonto: Number(totalSatMonto.toFixed(2)),
        conciliadasCount,
        conciliadasMontoSat: Number(conciliadasMontoSat.toFixed(2)),
        conciliadasMontoGasto: Number(conciliadasMontoGasto.toFixed(2)),
        huerfanasSatCount,
        huerfanasSatMonto: Number(huerfanasSatMonto.toFixed(2)),
        huerfanasEnPortalCount,
        huerfanasNoEnPortalCount,
        huerfanosGastosCount,
        huerfanosGastosMonto: Number(huerfanosGastosMonto.toFixed(2)),
        huerfanosFacturadoSinVincularCount,
        huerfanosPendienteCount,
        huerfanosNoFacturadoCount,
        periodo: {
          inicio: fechaInicio,
          fin: fechaFin,
        },
      },
      conciliadas,
      huerfanasSat,
      huerfanosGastos,
    });
  } catch (error: any) {
    console.error('[conciliarSatFacturas] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
