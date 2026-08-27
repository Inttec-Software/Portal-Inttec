import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// Helper: calcular estado de pago
function calcularEstadoPago(precioTotal: number, totalPagado: number): string {
  if (precioTotal <= 0) return 'SIN_PRECIO';
  if (totalPagado >= precioTotal) return 'PAGADA';
  if (totalPagado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

// Helper: sync payment status in DB
async function syncPaymentStatusInternal(client: any, ventaId: string) {
  try {
    const { data: venta, error: vErr } = await client
      .from('ventas')
      .select('precio_total_facturado')
      .eq('id', ventaId)
      .single();

    if (vErr || !venta) return;

    const { data: pagos, error: pErr } = await client
      .from('ventas_pagos')
      .select('monto')
      .eq('venta_id', ventaId);

    if (pErr) return;

    const precioTotal = Number(venta.precio_total_facturado) || 0;
    const totalPagado = (pagos || []).reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);
    const saldoPendiente = Math.max(0, precioTotal - totalPagado);
    const estadoPago = calcularEstadoPago(precioTotal, totalPagado);

    await client
      .from('ventas')
      .update({
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        estado_pago: estadoPago
      })
      .eq('id', ventaId);
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
    const client = getSupabaseClient(company, env);

    const { data: ventasData, error } = await client
      .from('ventas')
      .select('*, cotizaciones(folio), usuarios!ventas_registrado_por_fkey(nombre), ventas_partidas(descripcion, unidad)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    const rawVentas = ventasData || [];
    const ventaIds = rawVentas.map((v: any) => v.id);

    let pagosMap: Record<string, any[]> = {};
    if (ventaIds.length > 0) {
      try {
        const { data: pagosData, error: pagosErr } = await client
          .from('ventas_pagos')
          .select('*')
          .in('venta_id', ventaIds)
          .order('fecha_pago', { ascending: false });

        if (!pagosErr && pagosData) {
          pagosData.forEach((p: any) => {
            if (!pagosMap[p.venta_id]) pagosMap[p.venta_id] = [];
            pagosMap[p.venta_id].push(p);
          });
        }
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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    // Fetch partidas, gastos vinculados, and pagos in parallel
    const [partidasRes, gastosRes, pagosRes] = await Promise.all([
      client.from('ventas_partidas').select('*').eq('venta_id', id),
      client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).eq('venta_id', id).eq('status', 'APPROVED'),
      client.from('ventas_pagos').select('*').eq('venta_id', id).order('fecha_pago', { ascending: false }),
    ]);

    if (partidasRes.error) throw partidasRes.error;

    // Sync payment status in the background
    await syncPaymentStatusInternal(client, id as string);

    const pagos = pagosRes.data || [];
    const totalPagado = pagos.reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);

    return res.json({
      partidas: partidasRes.data || [],
      gastos: gastosRes.data || [],
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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    const { data: pagosData, error } = await client
      .from('ventas_pagos')
      .select('*')
      .eq('venta_id', id)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;

    // Sync payment status
    await syncPaymentStatusInternal(client, id as string);

    return res.json({ pagos: pagosData || [] });
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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const { monto, fecha_pago, metodo_pago, referencia, registrado_por } = req.body;

    const payload = {
      venta_id: id,
      monto: parseFloat(monto),
      fecha_pago,
      metodo_pago: metodo_pago || 'Transferencia',
      referencia: referencia || null,
      registrado_por: registrado_por || null,
    };

    const { error } = await client
      .from('ventas_pagos')
      .insert([payload]);

    if (error) throw error;

    // Sync payment status after insert
    await syncPaymentStatusInternal(client, id as string);

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
    const client = getSupabaseClient(company, env);

    const { id, pagoId } = req.params;

    const { error } = await client
      .from('ventas_pagos')
      .delete()
      .eq('id', pagoId);

    if (error) throw error;

    // Sync payment status after delete
    await syncPaymentStatusInternal(client, id as string);

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
    const client = getSupabaseClient(company, env);

    const { ventaPayload, partidasPayload } = req.body;

    // Generate sequential folio (escalable, ignorando A1 y buscando el máximo real)
    const { data: allFolios } = await client
      .from('ventas')
      .select('folio')
      .not('folio', 'is', null)
      .ilike('folio', 'A%');

    let maxNum = 3999; // Base para que empiece en A4000 si no hay mayores
    if (allFolios && allFolios.length > 0) {
      for (const item of allFolios) {
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

    const { data: ventaData, error: ventaError } = await client
      .from('ventas')
      .insert([ventaPayloadWithFolio])
      .select()
      .single();

    if (ventaError) throw ventaError;

    // Insert partidas
    const partidasWithVentaId = partidasPayload.map((p: any) => ({
      ...p,
      venta_id: ventaData.id,
    }));

    const { error: partidasError } = await client
      .from('ventas_partidas')
      .insert(partidasWithVentaId);

    if (partidasError) throw partidasError;

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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const { ventaPayload, partidasPayload } = req.body;

    // Update the venta
    const { error: updateError } = await client
      .from('ventas')
      .update(ventaPayload)
      .eq('id', id);

    if (updateError) throw updateError;

    // Delete old partidas
    const { error: deletePartidasError } = await client
      .from('ventas_partidas')
      .delete()
      .eq('venta_id', id);

    if (deletePartidasError) throw deletePartidasError;

    // Insert new partidas
    const partidasWithVentaId = partidasPayload.map((p: any) => ({
      ...p,
      venta_id: id,
    }));

    const { error: partidasError } = await client
      .from('ventas_partidas')
      .insert(partidasWithVentaId);

    if (partidasError) throw partidasError;

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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    // Delete partidas first (foreign key)
    const { error: partError } = await client
      .from('ventas_partidas')
      .delete()
      .eq('venta_id', id);

    if (partError) throw partError;

    // Delete pagos
    try {
      await client
        .from('ventas_pagos')
        .delete()
        .eq('venta_id', id);
    } catch (_) {
      // Table may not exist, ignore
    }

    // Delete the venta
    const { error: ventError } = await client
      .from('ventas')
      .delete()
      .eq('id', id);

    if (ventError) throw ventError;

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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    const { data, error } = await client
      .from('ventas_partidas')
      .select('*')
      .eq('venta_id', id);

    if (error) throw error;

    return res.json({ partidas: data || [] });
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
    const client = getSupabaseClient(company, env);

    const ref = req.query.ref as string;
    if (!ref) return res.json({ exists: false });

    const { data: existing } = await client
      .from('ventas')
      .select('id')
      .ilike('factura_referencia', ref.trim())
      .maybeSingle();

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
    const client = getSupabaseClient(company, env);

    const [cliRes, sucRes] = await Promise.all([
      client.from('clientes').select('*').order('nombre'),
      client.from('sucursales_cliente').select('*').order('nombre'),
    ]);

    return res.json({
      clientes: cliRes.data || [],
      sucursales: sucRes.data || [],
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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    // Get the venta to find client name and cotizacion_id
    const { data: venta, error: ventaErr } = await client
      .from('ventas')
      .select('cliente, cotizacion_id')
      .eq('id', id)
      .single();

    if (ventaErr) throw ventaErr;

    let clientData = null;
    if (venta?.cliente) {
      const { data } = await client
        .from('clientes')
        .select('*')
        .eq('nombre', venta.cliente)
        .single();
      clientData = data;
    }

    let cotizacionLineas: any[] = [];
    if (venta?.cotizacion_id) {
      const { data: cotData } = await client
        .from('cotizaciones')
        .select('lineas')
        .eq('id', venta.cotizacion_id)
        .single();
      if (cotData?.lineas) cotizacionLineas = cotData.lineas;
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
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    await syncPaymentStatusInternal(client, id as string);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
