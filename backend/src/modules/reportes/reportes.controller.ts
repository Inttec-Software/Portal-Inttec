import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { PostgrestError } from '@supabase/supabase-js';

export const getAdminReportes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [gastosRes, usersRes, vehListRes, gasLogsRes, catRes, subRes, provRes, cliRes, sucRes] = await Promise.all([
      client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).order('created_at', { ascending: false }),
      client.from('usuarios').select('*').order('nombre'),
      client.from('vehiculos').select('*').eq('archivado', false).order('marca'),
      client.from('registro_gasolina').select('*, vehiculos(marca, modelo)').order('created_at', { ascending: false }),
      client.from('categorias').select('*'),
      client.from('subcategorias').select('*'),
      client.from('proveedores').select('*'),
      client.from('clientes').select('*'),
      client.from('sucursales_cliente').select('*'),
    ]);

    if (usersRes.error) throw usersRes.error;

    // Enriquecer gastos como se hacía en el frontend
    const enriquecerGastos = (rawGastos: any[]) => {
      const categorias = catRes.data || [];
      const subcategorias = subRes.data || [];
      const proveedores = provRes.data || [];
      const clientes = cliRes.data || [];
      const sucursales = sucRes.data || [];

      return rawGastos.map(g => {
        let cat = '';
        let subcat = '';
        let prov = '';
        let cli = '';
        let suc = '';

        if (g.subcategoria_rel) {
          subcat = g.subcategoria_rel.nombre;
          if (g.subcategoria_rel.categorias) {
            cat = g.subcategoria_rel.categorias.nombre;
          }
        } else if (g.subcategoria_id) {
          const s = subcategorias.find((x: any) => x.id === g.subcategoria_id);
          if (s) {
            subcat = s.nombre;
            const c = categorias.find((x: any) => x.id === s.categoria_id);
            if (c) cat = c.nombre;
          }
        } else {
          cat = 'Sin clasificar';
        }

        if (g.proveedor_rel) {
          prov = g.proveedor_rel.nombre;
        } else if (g.proveedor_id) {
          const p = proveedores.find((x: any) => x.id === g.proveedor_id);
          if (p) prov = p.nombre;
        }

        if (g.cliente_rel) {
          cli = g.cliente_rel.nombre;
        } else if (g.cliente_id) {
          const c = clientes.find((x: any) => x.id === g.cliente_id);
          if (c) cli = c.nombre;
        }

        if (g.sucursal_rel) {
          suc = g.sucursal_rel.nombre;
        } else if (g.sucursal_id) {
          const sc = sucursales.find((x: any) => x.id === g.sucursal_id);
          if (sc) suc = sc.nombre;
        }

        return { ...g, cat, subcat, prov, cli, suc };
      });
    };

    let rawGastos = gastosRes.data || [];
    if (gastosRes.error) {
      console.warn('Relational gastos query failed, attempting basic select:', gastosRes.error.message);
      const fallbackRes = await client.from('gastos').select('*').order('created_at', { ascending: false });
      rawGastos = fallbackRes.data || [];
    }

    const enrichedGastos = enriquecerGastos(rawGastos);

    return res.json({
      gastos: enrichedGastos,
      usuarios: usersRes.data || [],
      vehiculos: vehListRes.data || [],
      registrosGasolina: gasLogsRes.data || []
    });
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

    const [ventasRes, cliRes, sucRes] = await Promise.all([
      client.from('ventas').select('*').order('fecha', { ascending: false }).limit(50),
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

    if (type === 'asistencias') {
      const { data, error } = await client.from('asistencias').select('*').order('fecha', { ascending: false });
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
      const { data, error } = await client.from('movimientos_inventario').select('*, producto:productos(nombre_oficial)').eq('tipo', 'SALIDA').order('fecha', { ascending: false });
      if (error) throw error;
      return res.json(data || []);
    } else if (type === 'ventas') {
      const { data, error } = await client.from('ventas').select('*').order('fecha', { ascending: false });
      if (error) throw error;
      return res.json(data || []);
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
    const payload = req.body;

    const { error: updateError } = await client
      .from('gastos')
      .update(payload)
      .eq('id', id);

    if (updateError) throw updateError;

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const recalculateVentaTotals = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;

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
    return res.json({ success: true, costoTotal, utilidadBruta, margenPorcentual });
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
