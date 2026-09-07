import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { SatSyncService } from '../../services/satSyncService';

// === GET /api/facturas-recibidas ===
export const getFacturasRecibidas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { data, error } = await client
      .from('facturas_recibidas')
      .select('*')
      .order('fecha_emision', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
        return res.json({ facturas: [], tableMissing: true });
      }
      throw error;
    }

    return res.json({ facturas: data || [], tableMissing: false });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/facturas-recibidas/sat-solicitudes ===
export const getSatSolicitudes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const isPendingOnly = req.query.pending === 'true';
    let query = client
      .from('sat_descarga_solicitudes')
      .select('*')
      .order('created_at', { ascending: false });

    if (isPendingOnly) {
      query = query.in('estado_sat', ['PENDIENTE', 'EN_PROCESO']).limit(5);
    } else {
      query = query.limit(50);
    }

    const { data, error } = await query;

    if (error) throw error;
    return res.json({ solicitudes: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/facturas-recibidas/import ===
export const importFactura = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { parsed } = req.body;
    if (!parsed || !parsed.uuid) return res.status(400).json({ error: 'Invalid payload' });

    const { data, error } = await client
      .from('facturas_recibidas')
      .upsert(
        {
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
          conceptos_json: parsed.conceptos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'uuid' }
      )
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, factura: data });
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


