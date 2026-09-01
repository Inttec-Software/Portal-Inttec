import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// === GET /api/auditoria/gastos ===
// Endpoint para obtener los gastos de una tarjeta en un rango de fechas para la conciliación
export const getGastosParaAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { tarjeta, metodoPago, minDate, maxDate } = req.query;

    let query = client
      .from('gastos')
      .select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `)
      .eq('status', 'APPROVED')
      .eq('tipo_tarjeta', tarjeta)
      .gte('fecha_comprobante', minDate)
      .lte('fecha_comprobante', maxDate);

    if (metodoPago !== 'tarjeta') {
      // Specific method: credit or debit
      query = query.eq('metodo_pago', metodoPago);
    } else {
      // "Any" card method
      query = query.in('metodo_pago', ['tarjeta', 'tarjeta_credito', 'tarjeta_debito']);
    }

    const { data, error } = await query;

    if (error) throw error;
    return res.json({ gastos: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/auditoria ===
export const guardarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const auditoria = req.body;

    const { data, error } = await client
      .from('auditorias_tarjeta')
      .insert([auditoria])
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/auditoria ===
export const obtenerAuditorias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { tarjeta } = req.query;

    let query = client
      .from('auditorias_tarjeta')
      .select('*')
      .order('creado_en', { ascending: false });

    if (tarjeta && tarjeta !== 'TODAS') {
      query = query.eq('tarjeta', tarjeta);
    }

    const { data, error } = await query;

    if (error) throw error;
    return res.json({ auditorias: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/auditoria/:id ===
export const eliminarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;

    const { error } = await client
      .from('auditorias_tarjeta')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
