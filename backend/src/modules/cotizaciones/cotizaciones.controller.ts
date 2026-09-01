import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// === GET /api/cotizaciones/search-clientes ===
export const searchClientes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);
    
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) return res.json({ clientes: [] });

    const { data, error } = await client
      .from('clientes')
      .select('*')
      .ilike('nombre', `%${q}%`)
      .limit(5);

    if (error) throw error;
    return res.json({ clientes: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones/search-productos ===
export const searchProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);
    
    const { q } = req.query;
    let query = client.from('productos').select('*').limit(15);
    
    if (q && typeof q === 'string' && q.trim().length > 0) {
      // Intentamos con nombre (algunas bdd usan nombre_oficial, otras nombre, asumiendo lo que estaba en frontend)
      query = query.ilike('nombre_oficial', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      // Fallback a "nombre" si "nombre_oficial" falla (por si acaso la BDD es diferente)
      let fbQuery = client.from('productos').select('*').limit(15);
      if (q && typeof q === 'string' && q.trim().length > 0) {
        fbQuery = fbQuery.ilike('nombre', `%${q}%`);
      }
      const fbData = await fbQuery;
      if (fbData.error) throw fbData.error;
      return res.json({ productos: fbData.data || [] });
    }
    
    return res.json({ productos: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones ===
export const getCotizaciones = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { data, error } = await client
      .from('cotizaciones')
      .select('*')
      .order('creado_en', { ascending: false });

    if (error) throw error;
    return res.json({ cotizaciones: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones/:id ===
export const getCotizacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;

    const { data: cotizacion, error } = await client
      .from('cotizaciones')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    let clientData = null;
    let sucursales = [];
    if (cotizacion.cliente_nombre) {
      const { data: cData } = await client
        .from('clientes')
        .select('*')
        .eq('nombre', cotizacion.cliente_nombre)
        .single();
      
      clientData = cData || null;

      if (clientData) {
        const { data: sData } = await client
          .from('sucursales_cliente')
          .select('*')
          .eq('cliente_id', clientData.id);
        sucursales = sData || [];
      }
    }

    return res.json({ cotizacion, clientData, sucursales });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones/:id/pdf-data ===
export const getPdfData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;

    const { data: cotizacion, error } = await client
      .from('cotizaciones')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    let clientData = null;
    if (cotizacion.cliente_nombre) {
      const { data: cData } = await client
        .from('clientes')
        .select('*')
        .eq('nombre', cotizacion.cliente_nombre)
        .single();
      clientData = cData || null;
    }

    return res.json({ cotizacion, clientData });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones/last-folio ===
export const getLastFolio = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { prefix } = req.query;

    let query = client
      .from('cotizaciones')
      .select('folio');

    if (prefix && typeof prefix === 'string') {
      query = query.ilike('folio', `${prefix}%`);
    }

    const { data, error } = await query
      .order('folio', { ascending: false })
      .limit(1);

    if (error) throw error;
    return res.json({ lastFolio: data && data.length > 0 ? data[0].folio : null });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/cotizaciones/:id ===
export const deleteCotizacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;

    const { error } = await client
      .from('cotizaciones')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/cotizaciones/duplicate/:id ===
export const duplicateCotizacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;

    const { data: original, error: origError } = await client
      .from('cotizaciones')
      .select('*')
      .eq('id', id)
      .single();

    if (origError) throw origError;

    // Generate new folio
    const { data: lastData } = await client
      .from('cotizaciones')
      .select('folio')
      .order('folio', { ascending: false })
      .limit(1);

    let newFolio = (new Date().getFullYear() % 100).toString() + "0001";
    if (lastData && lastData.length > 0) {
      const lastFolio = parseInt(lastData[0].folio, 10);
      if (!isNaN(lastFolio)) {
        newFolio = (lastFolio + 1).toString();
      }
    }

    const payload = {
      folio: newFolio,
      cliente_nombre: original.cliente_nombre,
      vendedor: original.vendedor,
      moneda: original.moneda,
      fecha_creacion: new Date().toLocaleDateString('es-MX'),
      subtotal: original.subtotal,
      iva: original.iva,
      total: original.total,
      lineas: original.lineas,
      terminos_condiciones: original.terminos_condiciones,
      estado: 'Borrador'
    };

    const { error: insError } = await client
      .from('cotizaciones')
      .insert([payload]);

    if (insError) throw insError;
    return res.json({ success: true, newFolio });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/cotizaciones ===
export const createCotizacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { payload, clientData, updateProducts } = req.body;

    if (clientData) {
      await client.from('clientes').upsert(clientData, { onConflict: 'nombre' });
    }

    if (updateProducts && updateProducts.length > 0) {
      for (const linea of updateProducts) {
        if (!linea.productoNombre) continue;

        if (linea.productoId) {
          await client.from('productos').update({ 
            precio_unitario: linea.precioUnitario,
            impuesto_porcentaje: linea.impuestoPorcentaje,
            clave_facturacion: linea.claveFacturacion || null
          }).eq('id', linea.productoId);
        } else {
          let catId = null;
          const { data: catData } = await client.from('categorias_productos').select('id').limit(1);
          if (catData && catData.length > 0) {
            catId = catData[0].id;
          } else {
            const { data: newCat } = await client.from('categorias_productos').insert({ nombre: 'General' }).select('id').single();
            if (newCat) catId = newCat.id;
          }

          if (catId) {
            const tempSku = `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const { data: newProd, error: prodErr } = await client.from('productos').insert({
              nombre_oficial: linea.productoNombre.trim(),
              sku_interno: tempSku,
              categoria_id: catId,
              precio_unitario: linea.precioUnitario,
              impuesto_porcentaje: linea.impuestoPorcentaje,
              clave_facturacion: linea.claveFacturacion || null,
              activo: true,
              stock_actual: 0
            }).select('id').single();
            
            if (newProd && !prodErr) {
              const matchedLinea = payload.lineas.find((l: any) => l.id === linea.id);
              if (matchedLinea) {
                matchedLinea.productoId = newProd.id;
              }
            }
          }
        }
      }
    }

    const { data: result, error } = await client
      .from('cotizaciones')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, cotizacion: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === PUT /api/cotizaciones/:id ===
export const updateCotizacion = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const { id } = req.params;
    const { payload, clientData, updateProducts } = req.body;

    if (clientData) {
      await client.from('clientes').upsert(clientData, { onConflict: 'nombre' });
    }

    if (updateProducts && updateProducts.length > 0) {
      for (const linea of updateProducts) {
        if (!linea.productoNombre) continue;

        if (linea.productoId) {
          await client.from('productos').update({ 
            precio_unitario: linea.precioUnitario,
            impuesto_porcentaje: linea.impuestoPorcentaje,
            clave_facturacion: linea.claveFacturacion || null
          }).eq('id', linea.productoId);
        } else {
          let catId = null;
          const { data: catData } = await client.from('categorias_productos').select('id').limit(1);
          if (catData && catData.length > 0) {
            catId = catData[0].id;
          } else {
            const { data: newCat } = await client.from('categorias_productos').insert({ nombre: 'General' }).select('id').single();
            if (newCat) catId = newCat.id;
          }

          if (catId) {
            const tempSku = `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const { data: newProd, error: prodErr } = await client.from('productos').insert({
              nombre_oficial: linea.productoNombre.trim(),
              sku_interno: tempSku,
              categoria_id: catId,
              precio_unitario: linea.precioUnitario,
              impuesto_porcentaje: linea.impuestoPorcentaje,
              clave_facturacion: linea.claveFacturacion || null,
              activo: true,
              stock_actual: 0
            }).select('id').single();
            
            if (newProd && !prodErr) {
              const matchedLinea = payload.lineas.find((l: any) => l.id === linea.id);
              if (matchedLinea) {
                matchedLinea.productoId = newProd.id;
              }
            }
          }
        }
      }
    }

    const { error } = await client
      .from('cotizaciones')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
