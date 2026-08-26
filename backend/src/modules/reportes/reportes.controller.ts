import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { PostgrestError } from '@supabase/supabase-js';

export const getAdminReportes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [gastosRes, usersRes, vehiculosRes, gasolinaRes, catRes, subRes, provRes, cliRes, sucRes] = await Promise.all([
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
      vehiculos: vehiculosRes.data || [],
      registrosGasolina: gasolinaRes.data || []
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

    const [gastosRes, catRes, subRes, provRes, cliRes, sucRes] = await Promise.all([
      client.from('gastos').select(`
        *,
        subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
        proveedor_rel:proveedores(id, nombre),
        cliente_rel:clientes(id, nombre),
        sucursal_rel:sucursales_cliente(id, nombre)
      `).eq('empleado_id', userId).order('created_at', { ascending: false }),
      client.from('categorias').select('*'),
      client.from('subcategorias').select('*'),
      client.from('proveedores').select('*'),
      client.from('clientes').select('*'),
      client.from('sucursales_cliente').select('*'),
    ]);

    const rawGastos = gastosRes.data || [];
    const categorias = catRes.data || [];
    const subcategorias = subRes.data || [];
    const proveedores = provRes.data || [];
    const clientes = cliRes.data || [];
    const sucursales = sucRes.data || [];

    const gastosEnriquecidos = rawGastos.map(g => {
      let cat = '';
      let subcat = '';
      let prov = '';
      let cli = '';
      let suc = '';
      
      let subRel = g.subcategoria_rel;
      let catRel = null;
      let provRel = g.proveedor_rel;
      let cliRel = g.cliente_rel;
      let sucRel = g.sucursal_rel;

      if (g.subcategoria_rel) {
        subcat = g.subcategoria_rel.nombre;
        if (g.subcategoria_rel.categorias) {
          cat = g.subcategoria_rel.categorias.nombre;
        }
      } else if (g.subcategoria_id) {
        const s = subcategorias.find((x: any) => x.id === g.subcategoria_id);
        if (s) {
          subcat = s.nombre;
          subRel = { id: s.id, nombre: s.nombre, categoria_id: s.categoria_id };
          const c = categorias.find((x: any) => x.id === s.categoria_id);
          if (c) {
            cat = c.nombre;
            subRel.categoria_rel = { id: c.id, nombre: c.nombre };
            catRel = subRel.categoria_rel;
          }
        }
      } else {
        cat = 'Sin clasificar';
        subcat = 'Sin clasificar';
      }

      if (g.proveedor_rel) prov = g.proveedor_rel.nombre;
      else if (g.proveedor_id) {
        const p = proveedores.find((x: any) => x.id === g.proveedor_id);
        if (p) {
          prov = p.nombre;
          provRel = { id: p.id, nombre: p.nombre };
        }
      }

      if (g.cliente_rel) cli = g.cliente_rel.nombre;
      else if (g.cliente_id) {
        const c = clientes.find((x: any) => x.id === g.cliente_id);
        if (c) {
          cli = c.nombre;
          cliRel = { id: c.id, nombre: c.nombre };
        }
      }

      if (g.sucursal_rel) suc = g.sucursal_rel.nombre;
      else if (g.sucursal_id) {
        const s = sucursales.find((x: any) => x.id === g.sucursal_id);
        if (s) {
          suc = s.nombre;
          sucRel = { id: s.id, nombre: s.nombre };
        }
      }

      return {
        ...g,
        categoria_nombre: cat,
        subcategoria_nombre: subcat,
        proveedor_nombre: prov,
        cliente_nombre: cli,
        sucursal_nombre: suc,
        subcategoria_rel: subRel,
        categoria_rel: catRel,
        proveedor_rel: provRel,
        cliente_rel: cliRel,
        sucursal_rel: sucRel
      };
    });

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
        sucursal_rel:sucursales_cliente(id, nombre)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return res.json({ gasto: data });
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
    const { updatePayload, gasolinaPayload, ...restPayload } = req.body;
    
    // Support both new {updatePayload} format and old direct payload format
    const payload = updatePayload || restPayload;

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

    if (oldGasto && oldGasto.venta_id) {
      await recalculateVentaTotalsInternal(client, oldGasto.venta_id);
    }

    return res.json({ success: true });
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
};

export const recalculateVentaTotals = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const { id } = req.params;
    await recalculateVentaTotalsInternal(client, id as string);
    
    return res.json({ success: true });
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


