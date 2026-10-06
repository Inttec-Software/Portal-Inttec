import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import { SatSyncService } from '../../services/satSyncService';

// === GET /api/facturas-recibidas ===
export const getFacturasRecibidas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    try {
      const { rows } = await pool.query(
        `SELECT id, uuid, rfc_emisor, nombre_emisor, rfc_receptor, fecha_emision, subtotal, descuento, iva, retencion_isr, retencion_iva, total, moneda, tipo_comprobante, estado_sat, xml_url, pdf_url, created_at
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
      rfc_emisor: parsed.rfcEmisor,
      nombre_emisor: parsed.nombreEmisor,
      rfc_receptor: parsed.rfcReceptor,
      fecha_emision: parsed.fechaEmision,
      subtotal: parsed.subtotal,
      descuento: parsed.descuento,
      iva: parsed.iva,
      retencion_isr: parsed.retencionIsr,
      retencion_iva: parsed.retencionIva,
      total: parsed.total,
      moneda: parsed.moneda,
      tipo_comprobante: parsed.tipoComprobante,
      estado_sat: parsed.estadoSat,
      conceptos_json: JSON.stringify(parsed.conceptos || []),
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

    return res.json({ success: true, factura: rows[0] });
  } catch (error: any) {
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
