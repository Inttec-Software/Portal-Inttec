import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { PostgrestError } from '@supabase/supabase-js';

const formatGasto = (g: any) => {
  let cat = 'Sin clasificar';
  let subcat = 'Sin clasificar';
  let prov = '';
  let cli = '';
  let suc = '';
  
  let catRel = null;

  if (g.subcategoria_rel) {
    subcat = g.subcategoria_rel.nombre;
    if (g.subcategoria_rel.categorias) {
      cat = g.subcategoria_rel.categorias.nombre;
      catRel = g.subcategoria_rel.categorias;
    }
  }
  if (g.proveedor_rel) prov = g.proveedor_rel.nombre;
  if (g.cliente_rel) cli = g.cliente_rel.nombre;
  if (g.sucursal_rel) suc = g.sucursal_rel.nombre;

  return {
    ...g,
    cat, subcat, prov, cli, suc, // Props legadas
    categoria_nombre: cat,
    subcategoria_nombre: subcat,
    proveedor_nombre: prov,
    cliente_nombre: cli,
    sucursal_nombre: suc,
    categoria_rel: catRel,
    venta_rel: g.venta_rel || null,
  };
};

export const getAdminReportes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    let gastosQuery = client.from('gastos').select(`
      *,
      subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
      proveedor_rel:proveedores(id, nombre),
      cliente_rel:clientes(id, nombre),
      sucursal_rel:sucursales_cliente(id, nombre),
      venta_rel:ventas(id, cliente, fecha, sucursal, tipo_proyecto, factura_referencia, precio_total_facturado)
    `).order('created_at', { ascending: false });

    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      gastosQuery = gastosQuery.limit(limitQuery);
    }

    const [gastosRes, usersRes, vehiculosRes, gasolinaRes, provRes] = await Promise.all([
      gastosQuery,
      client.from('usuarios').select('*').order('nombre'),
      client.from('vehiculos').select('*').eq('archivado', false).order('marca'),
      client.from('registro_gasolina').select('*, vehiculos(marca, modelo)').order('created_at', { ascending: false }).limit(250),
      client.from('proveedores').select('id, nombre, rfc').order('nombre')
    ]);

    if (usersRes.error) throw usersRes.error;


    let rawGastos = gastosRes.data || [];
    if (gastosRes.error) {
      console.warn('Relational gastos query failed, attempting basic select:', gastosRes.error.message);
      const fallbackRes = await client.from('gastos').select('*').order('created_at', { ascending: false });
      rawGastos = fallbackRes.data || [];
    }

    const enrichedGastos = rawGastos.map(formatGasto);

    return res.json({
      gastos: enrichedGastos,
      usuarios: usersRes.data || [],
      vehiculos: vehiculosRes.data || [],
      registrosGasolina: gasolinaRes.data || [],
      proveedores: provRes.data || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEmpleadoGastos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);
    
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    let query = client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).eq('empleado_id', userId).order('created_at', { ascending: false });

    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      query = query.limit(limitQuery);
    }

    const gastosRes = await query;

    const rawGastos = gastosRes.data || [];


    const gastosEnriquecidos = rawGastos.map(formatGasto);

    return res.json({ gastos: gastosEnriquecidos });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getGastoById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    const { data, error } = await client
      .from('gastos')
      .select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre),
        venta_rel:ventas(id, cliente, fecha, sucursal, tipo_proyecto, factura_referencia, precio_total_facturado)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    const formatted = data ? formatGasto(data) : null;
    return res.json({ gasto: formatted });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGastoStatus = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const { status, payload, actor_id, monto } = req.body;

    const { error: updateError } = await client
      .from('gastos')
      .update(payload)
      .eq('id', id);

    if (updateError) throw updateError;

    let actionName = 'UPDATE';
    if (status === 'APPROVED') actionName = 'APPROVE';
    else if (status === 'REJECTED') actionName = 'REJECT';
    else if (status === 'PENDING') actionName = 'REVERT';

    await client.from('audit_logs').insert([{
      action: actionName,
      actor_id,
      target_id: id,
      details: req.body.audit_details || (status === 'PENDING'
        ? `Gasto por ${monto} devuelto a revisión por Admin.`
        : `Gasto por ${monto} revisado por Admin. Estado final: ${status}`),
    }]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSalesForLinking = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const limitQuery = req.query.limit !== undefined
      ? parseInt(req.query.limit as string, 10)
      : 1000;

    let query = client.from('ventas').select('*').order('fecha', { ascending: false });
    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      query = query.limit(limitQuery);
    }

    const [ventasRes, cliRes, sucRes] = await Promise.all([
      query,
      client.from('clientes').select('*').order('nombre'),
      client.from('sucursales_cliente').select('*').order('nombre'),
    ]);

    return res.json({
      ventas: ventasRes.data || [],
      clientes: cliRes.data || [],
      sucursales: sucRes.data || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getExportData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { type } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    if (type === 'asistencias') {
      let query = client.from('asistencias').select('*');
      if (req.query.empleado_id) query = query.eq('empleado_id', req.query.empleado_id as string);
      if (startDate) query = query.gte('fecha', startDate);
      if (endDate) query = query.lte('fecha', endDate);
      const { data, error } = await query
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return res.json(data || []);
    } else if (type === 'inventario') {
      const [prodRes, catRes] = await Promise.all([
        client.from('productos').select('*').order('nombre_oficial'),
        client.from('categorias_productos').select('*').order('nombre'),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (catRes.error) throw catRes.error;
      return res.json({ productos: prodRes.data || [], categorias: catRes.data || [] });
    } else if (type === 'consumos') {
      let query = client.from('movimientos_inventario')
        .select('*, producto:productos(nombre_oficial, sku_interno, precio_unitario)')
        .eq('tipo', 'SALIDA')
        .order('fecha', { ascending: false });
      if (startDate) query = query.gte('fecha', `${startDate}T00:00:00`);
      if (endDate) query = query.lte('fecha', `${endDate}T23:59:59.999Z`);
      const [movRes, userRes] = await Promise.all([
        query,
        client.from('usuarios').select('id, nombre, email')
      ]);
      if (movRes.error) throw movRes.error;
      const userMap = new Map((userRes.data || []).map((u: any) => [u.id, u]));
      const dataWithUsers = (movRes.data || []).map((m: any) => {
        const u = userMap.get(m.creado_por || m.empleado_id);
        const uName = u?.nombre || m.empleado_nombre || m.usuario_nombre || 'No especificado / Almacén';
        return {
          ...m,
          usuario: u || null,
          usuario_nombre: uName,
          empleado_nombre: uName,
          producto_sku: m.producto?.sku_interno || m.producto_sku || '-',
          producto_nombre: m.producto?.nombre_oficial || m.producto_nombre || 'Producto',
          costo_total: m.costo_total !== undefined ? m.costo_total : ((Number(m.cantidad || 0) * Number(m.producto?.precio_unitario || 0)) || 0)
        };
      });
      return res.json(dataWithUsers);
    } else if (type === 'ventas') {
      let query = client.from('ventas').select('*').order('fecha', { ascending: false });
      if (startDate) query = query.gte('fecha', startDate);
      if (endDate) query = query.lte('fecha', endDate);
      
      const [ventasRes, usersRes, gastosRes] = await Promise.all([
        query,
        client.from('usuarios').select('id, nombre, email'),
        client.from('gastos').select('id, venta_id, monto, status')
      ]);
      
      if (ventasRes.error) throw ventasRes.error;
      
      const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

      // Mapear sumatoria de gastos vinculados por cada venta
      const gastosMap = new Map<string, { total: number; count: number }>();
      (gastosRes.data || []).forEach((g: any) => {
        const st = String(g.status || '').toUpperCase();
        if (!g.venta_id || st === 'RECHAZADO' || st === 'REJECTED') return;
        const current = gastosMap.get(g.venta_id) || { total: 0, count: 0 };
        current.total += Number(g.monto) || 0;
        current.count += 1;
        gastosMap.set(g.venta_id, current);
      });
      
      const mappedData = (ventasRes.data || []).map((v: any) => {
        const usuario = userMap.get(v.registrado_por);
        const gastoInfo = gastosMap.get(v.id) || { total: 0, count: 0 };
        const precioFacturado = Number(v.precio_total_facturado) || Number(v.total) || 0;
        const costoPartidas = Number(v.costo_total) || 0;
        const gastosVinculados = gastoInfo.total;
        const costoTotalReal = costoPartidas + gastosVinculados;
        const utilidadReal = precioFacturado - costoTotalReal;
        const margenRealPorcentual = precioFacturado > 0 ? (utilidadReal / precioFacturado) : 0;

        return {
          ...v,
          cliente_nombre: v.cliente,
          vendedor_nombre: usuario?.nombre || usuario?.email || 'Desconocido',
          estatus: v.estado_pago || v.cfdi_estado || 'PENDIENTE',
          total: precioFacturado,
          gastos_vinculados_total: gastosVinculados,
          gastos_vinculados_count: gastoInfo.count,
          costo_total_real: costoTotalReal,
          utilidad_real: utilidadReal,
          margen_real_porcentual: margenRealPorcentual,
        };
      });
      
      return res.json(mappedData);
    } else if (type === 'gastos') {
      let query = client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).order('created_at', { ascending: false });
      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.json((data || []).map(formatGasto));
    }

    return res.status(400).json({ error: 'Tipo de exportación inválido' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const { updatePayload, gasolinaPayload, ...restPayload } = req.body;
    
    // Support both new {updatePayload} format and old direct payload format
    const payload = updatePayload || restPayload;

    if (payload.estado_reembolso !== undefined) {
      const userRole = req.user?.rol || req.user?.role;
      if (userRole && userRole !== 'ADMIN' && userRole !== 'DEV') {
        return res.status(403).json({ error: 'Solo administradores pueden modificar el estado de reembolso' });
      }
    }

    // Get old gasto to see if it's linked to a sale
    const { data: oldGasto } = await client
      .from('gastos')
      .select('venta_id')
      .eq('id', id)
      .single();

    const { error: updateError } = await client
      .from('gastos')
      .update(payload)
      .eq('id', id);

    if (updateError) throw updateError;

    if (gasolinaPayload) {
      if (gasolinaPayload.action === 'upsert') {
        const { error: gasError } = await client
          .from('registro_gasolina')
          .upsert([{ ...gasolinaPayload.data, gasto_id: id }], { onConflict: 'gasto_id' });
        if (gasError) throw gasError;
      } else if (gasolinaPayload.action === 'delete') {
        const { error: gasError } = await client
          .from('registro_gasolina')
          .delete()
          .eq('gasto_id', id);
        if (gasError) throw gasError;
      }
    }

    if (payload.venta_id !== undefined && payload.venta_id !== oldGasto?.venta_id) {
      if (oldGasto && oldGasto.venta_id) {
        await recalculateVentaTotalsInternal(client, oldGasto.venta_id);
      }
      if (payload.venta_id) {
        await recalculateVentaTotalsInternal(client, payload.venta_id);
      }
    } else if (oldGasto && oldGasto.venta_id) {
      await recalculateVentaTotalsInternal(client, oldGasto.venta_id);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const relinkGastoVenta = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const { venta_id, actor_id } = req.body;
    const newVentaId = (venta_id && typeof venta_id === 'string' && venta_id.trim()) ? venta_id.trim() : null;

    // Obtener el gasto actual
    const { data: gasto, error: gastoErr } = await client
      .from('gastos')
      .select('id, venta_id, monto, status')
      .eq('id', id)
      .single();

    if (gastoErr || !gasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const oldVentaId = gasto.venta_id;

    if (oldVentaId === newVentaId) {
      return res.json({ 
        success: true, 
        message: newVentaId ? 'El gasto ya está vinculado a esa venta' : 'El gasto ya se encuentra desvinculado',
        old_venta_id: oldVentaId,
        new_venta_id: newVentaId,
      });
    }

    let targetVenta: any = null;
    if (newVentaId) {
      const { data: vData, error: vErr } = await client
        .from('ventas')
        .select('id, cliente, fecha, sucursal, tipo_proyecto, factura_referencia, precio_total_facturado')
        .eq('id', newVentaId)
        .single();
      if (vErr || !vData) {
        return res.status(404).json({ error: 'La venta seleccionada no existe' });
      }
      targetVenta = vData;
    }

    // Actualizar el venta_id del gasto
    const { error: updateErr } = await client
      .from('gastos')
      .update({ venta_id: newVentaId })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Recalcular venta anterior si existía
    if (oldVentaId) {
      try {
        await recalculateVentaTotalsInternal(client, oldVentaId);
      } catch (e: any) {
        console.warn(`[relinkGastoVenta] Error recalculando venta previa ${oldVentaId}:`, e.message);
      }
    }

    // Recalcular nueva venta asignada
    if (newVentaId) {
      try {
        await recalculateVentaTotalsInternal(client, newVentaId);
      } catch (e: any) {
        console.warn(`[relinkGastoVenta] Error recalculando nueva venta ${newVentaId}:`, e.message);
      }
    }

    // Auditoría
    const actor = req.user?.id || actor_id;
    const details = newVentaId
      ? (oldVentaId 
          ? `Gasto reasignado de la venta ${oldVentaId} a la venta ${newVentaId} (${targetVenta?.cliente || ''}).` 
          : `Gasto vinculado a la venta ${newVentaId} (${targetVenta?.cliente || ''}).`)
      : `Gasto desvinculado de la venta ${oldVentaId}.`;

    try {
      await client.from('audit_logs').insert([{
        action: 'UPDATE',
        actor_id: actor,
        target_id: id,
        details,
      }]);
    } catch (auditErr: any) {
      console.warn('[relinkGastoVenta] Error en audit log:', auditErr.message);
    }

    return res.json({
      success: true,
      old_venta_id: oldVentaId,
      new_venta_id: newVentaId,
      venta_rel: targetVenta,
      message: newVentaId ? 'Gasto vinculado correctamente' : 'Gasto desvinculado correctamente',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const recalculateVentaTotalsInternal = async (client: any, id: string) => {
  const { data: venta, error: ventaErr } = await client
    .from('ventas')
    .select('precio_total_facturado')
    .eq('id', id)
    .single();
  if (ventaErr || !venta) throw ventaErr || new Error('Sale not found');

  const { data: partidas, error: partidasErr } = await client
    .from('ventas_partidas')
    .select('costo_total_proveedor')
    .eq('venta_id', id);
  if (partidasErr) throw partidasErr;

  const costoPartidas = (partidas || []).reduce((sum: number, p: any) => sum + (Number(p.costo_total_proveedor) || 0), 0);

  const { data: gastos, error: gastosErr } = await client
    .from('gastos')
    .select('monto')
    .eq('venta_id', id)
    .eq('status', 'APPROVED');
  if (gastosErr) throw gastosErr;

  const costoGastos = (gastos || []).reduce((sum: number, g: any) => sum + (Number(g.monto) || 0), 0);

  const costoTotal = Math.round((costoPartidas + costoGastos) * 100) / 100;
  const precioTotal = Number(venta.precio_total_facturado) || 0;
  const utilidadBruta = Math.round((precioTotal - costoTotal) * 100) / 100;
  const margenPorcentual = precioTotal > 0 ? Math.round((utilidadBruta / precioTotal) * 10000) / 10000 : 0;

  const { error: updateErr } = await client
    .from('ventas')
    .update({
      costo_total: costoTotal,
      utilidad_bruta: utilidadBruta,
      margen_porcentual: margenPorcentual
    })
    .eq('id', id);
  
  if (updateErr) throw updateErr;

  return { costoTotal, utilidadBruta, margenPorcentual };
};

export const recalculateVentaTotals = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    const result = await recalculateVentaTotalsInternal(client, id as string);
    
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

    const { error } = await client.from('gastos').delete().eq('id', id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const saveQuickSale = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { ventaPayload, partidasPayload } = req.body;

    const { data: ventaData, error: ventaError } = await client
      .from('ventas')
      .insert([ventaPayload])
      .select()
      .single();

    if (ventaError) throw ventaError;

    if (partidasPayload && partidasPayload.length > 0) {
      const pPayload = partidasPayload.map((p: any) => ({ ...p, venta_id: ventaData.id }));
      const { error: partidasError } = await client
        .from('ventas_partidas')
        .insert(pPayload);

      if (partidasError) throw partidasError;
    }

    return res.json({ success: true, ventaId: ventaData.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getFormCatalogs = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [catRes, subRes, cliRes, usersRes, sucRes, provRes] = await Promise.all([
      client.from('categorias').select('*').order('nombre'),
      client.from('subcategorias').select('*').order('nombre'),
      client.from('clientes').select('*').order('nombre'),
      client.from('usuarios').select('*').order('nombre'),
      client.from('sucursales_cliente').select('*').order('nombre'),
      client.from('proveedores').select('*').order('nombre'),
    ]);

    if (catRes.error) throw catRes.error;

    return res.json({
      categorias: catRes.data || [],
      subcategorias: subRes.data || [],
      clientes: cliRes.data || [],
      usuarios: usersRes.data || [],
      sucursales: sucRes.data || [],
      proveedores: provRes.data || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createGastos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { payloadsToInsert, gasolinaPayload } = req.body;

    const { data: insertedGastos, error: dbError } = await client
      .from('gastos')
      .insert(payloadsToInsert)
      .select();

    if (dbError) throw dbError;

    if (gasolinaPayload && insertedGastos && insertedGastos.length > 0) {
      gasolinaPayload.gasto_id = insertedGastos[0].id;
      const { error: gasError } = await client
        .from('registro_gasolina')
        .insert([gasolinaPayload]);

      if (gasError) throw gasError;
    }

    const { createNotifications, employeeName, totalGasto, categoriaNombre } = req.body;
    if (createNotifications && insertedGastos && insertedGastos.length > 0) {
      try {
        const { data: admins } = await client.from('usuarios').select('id').eq('rol', 'ADMIN');
        if (admins && admins.length > 0) {
          const notifications = admins.map((admin: any) => ({
            usuario_id: admin.id,
            titulo: 'Nuevo Gasto Registrado',
            mensaje: `${employeeName || 'Un empleado'} ha registrado un gasto de $${Number(totalGasto || 0).toFixed(2)} (${categoriaNombre || 'Sin categoría'})`,
            tipo: 'GASTO_NUEVO',
            referencia_id: insertedGastos[0].id,
          }));
          await client.from('notificaciones').insert(notifications);
        }
      } catch (notifErr) {
        console.warn('Error inserting notifications:', notifErr);
      }
    }

    return res.json({ success: true, insertedGastos });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};


