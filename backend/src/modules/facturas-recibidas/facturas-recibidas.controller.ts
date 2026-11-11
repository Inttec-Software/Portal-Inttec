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
        `SELECT id, uuid, rfc_emisor, nombre_emisor, rfc_receptor, rfc_pac, fecha_emision, subtotal, descuento, iva, retencion_isr, retencion_iva, total, moneda, tipo_comprobante, estado_sat, xml_url, pdf_url, created_at
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
                  'monto_consumido', (COALESCE(g.monto, 0) - COALESCE(g.monto_propina, 0)),
                  'es_factura_compartida', COALESCE(g.es_factura_compartida, false),
                  'status', g.status,
                  'justificacion', g.justificacion,
                  'fecha_comprobante', g.fecha_comprobante,
                  'created_at', g.created_at
                )), '[]'::json)
                FROM gastos g
                WHERE g.factura_recibida_id = f.id
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
