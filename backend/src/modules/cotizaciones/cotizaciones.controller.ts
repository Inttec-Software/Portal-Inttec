import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// Helper para adaptar el payload si la columna 'notas_observaciones' no existe en la BDD
const prepareFallbackPayload = (payload: any) => {
  const fbPayload = { ...payload };
  if (fbPayload.notas_observaciones && String(fbPayload.notas_observaciones).trim() !== '') {
    const notesStr = String(fbPayload.notas_observaciones).trim();
    const existingTerms = fbPayload.terminos_condiciones ? String(fbPayload.terminos_condiciones).trim() : '';
    fbPayload.terminos_condiciones = existingTerms 
      ? `${existingTerms}\n\n[Notas u Observaciones]:\n${notesStr}`
      : `[Notas u Observaciones]:\n${notesStr}`;
  }
  delete fbPayload.notas_observaciones;
  return fbPayload;
};

// Helper para extraer 'notas_observaciones' si fue concatenado en 'terminos_condiciones'
const formatCotizacionResponse = (cot: any) => {
  if (!cot) return cot;
  const formatted = { ...cot };
  if ((!formatted.notas_observaciones || String(formatted.notas_observaciones).trim() === '') && formatted.terminos_condiciones) {
    const marker = '[Notas u Observaciones]:';
    const index = formatted.terminos_condiciones.indexOf(marker);
    if (index !== -1) {
      formatted.notas_observaciones = formatted.terminos_condiciones.substring(index + marker.length).trim();
      formatted.terminos_condiciones = formatted.terminos_condiciones.substring(0, index).trim();
    }
  }
  return formatted;
};

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
      query = query.ilike('nombre_oficial', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
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
    const formatted = (data || []).map(formatCotizacionResponse);
    return res.json({ cotizaciones: formatted });
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

    return res.json({ cotizacion: formatCotizacionResponse(cotizacion), clientData, sucursales });
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

    return res.json({ cotizacion: formatCotizacionResponse(cotizacion), clientData });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Helper para calcular el siguiente folio en formato YYMMDDNN (ciclo 01 a 06 y vuelve a 01)
const calculateNextFolio = (prefix: string, existingFolios: string[]): string => {
  const daySeqs: number[] = [];

  existingFolios.forEach(folio => {
    const clean = String(folio || '').trim();
    if (clean.startsWith(prefix)) {
      const suffix = clean.substring(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > 0) {
        daySeqs.push(num);
      }
    }
  });

  const maxNum = daySeqs.length > 0 ? Math.max(...daySeqs) : 0;
  // Consecutivo: 01, 02... al llegar a 06 vuelve a 01
  let nextSeq = 1;
  if (maxNum > 0) {
    if (maxNum < 6) {
      nextSeq = maxNum + 1;
    } else {
      nextSeq = 1; // Al llegar al 06 vuelve al 01
    }
  }

  let candidateFolio = `${prefix}${String(nextSeq).padStart(2, '0')}`;
  const existingSet = new Set(existingFolios.map(f => String(f || '').trim()));

  // Evitar colisión de llave única en BD si el candidato ya está ocupado
  if (existingSet.has(candidateFolio)) {
    let found = false;
    for (let s = 1; s <= 6; s++) {
      const test = `${prefix}${String(s).padStart(2, '0')}`;
      if (!existingSet.has(test)) {
        candidateFolio = test;
        found = true;
        break;
      }
    }
    if (!found) {
      let s = maxNum + 1;
      while (existingSet.has(`${prefix}${String(s).padStart(2, '0')}`)) {
        s++;
      }
      candidateFolio = `${prefix}${String(s).padStart(2, '0')}`;
    }
  }

  return candidateFolio;
};

// === GET /api/cotizaciones/last-folio ===
export const getLastFolio = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const client = getSupabaseClient(tenant.company, tenant.env);

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const defaultPrefix = `${yy}${mm}${dd}`;

    const prefix = typeof req.query.prefix === 'string' && req.query.prefix.trim() !== ''
      ? req.query.prefix.trim()
      : defaultPrefix;

    let query = client
      .from('cotizaciones')
      .select('folio')
      .ilike('folio', `${prefix}%`);

    const { data, error } = await query;

    if (error) throw error;

    const existingFolios = (data || []).map((row: any) => String(row.folio || '').trim());
    const nextFolio = calculateNextFolio(prefix, existingFolios);

    let highestFolio = null;
    const daySeqs: number[] = [];
    existingFolios.forEach(folio => {
      if (folio.startsWith(prefix)) {
        const num = parseInt(folio.substring(prefix.length), 10);
        if (!isNaN(num) && num > 0) daySeqs.push(num);
      }
    });
    if (daySeqs.length > 0) {
      const maxNum = Math.max(...daySeqs);
      highestFolio = `${prefix}${String(maxNum).padStart(2, '0')}`;
    }

    return res.json({ lastFolio: highestFolio, nextFolio });
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

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const { data: allFolios, error: foliosErr } = await client
      .from('cotizaciones')
      .select('folio')
      .ilike('folio', `${datePrefix}%`);

    if (foliosErr) throw foliosErr;

    const existingFolios = (allFolios || []).map((r: any) => String(r.folio || '').trim());
    const newFolio = calculateNextFolio(datePrefix, existingFolios);

    const payload = {
      folio: newFolio,
      cliente_nombre: original.cliente_nombre,
      vendedor: original.vendedor,
      moneda: original.moneda || 'MXN',
      fecha_creacion: today.toLocaleDateString('es-MX'),
      subtotal: original.subtotal || 0,
      iva: original.iva || 0,
      total: original.total || 0,
      lineas: original.lineas || [],
      terminos_condiciones: original.terminos_condiciones,
      notas_observaciones: original.notas_observaciones || null,
      estado: 'Borrador'
    };

    let { error: insError } = await client
      .from('cotizaciones')
      .insert([payload]);

    if (insError && (insError.message?.includes('notas_observaciones') || insError.message?.includes('schema cache'))) {
      const fbPayload = prepareFallbackPayload(payload);
      const fbRes = await client.from('cotizaciones').insert([fbPayload]);
      insError = fbRes.error;
    }

    if (insError) throw insError;
    return res.json({ success: true, newFolio });
  } catch (error: any) {
    console.error('Error in duplicateCotizacion:', error);
    return res.status(500).json({ error: error.message || 'Error al duplicar cotización' });
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

    let { data: result, error } = await client
      .from('cotizaciones')
      .insert([payload])
      .select()
      .single();

    if (error && (error.message?.includes('notas_observaciones') || error.message?.includes('schema cache'))) {
      const fbPayload = prepareFallbackPayload(payload);
      const fbRes = await client
        .from('cotizaciones')
        .insert([fbPayload])
        .select()
        .single();
      result = fbRes.data;
      error = fbRes.error;
    }

    if (error) throw error;
    return res.json({ success: true, cotizacion: formatCotizacionResponse(result) });
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

    let { error } = await client
      .from('cotizaciones')
      .update(payload)
      .eq('id', id);

    if (error && (error.message?.includes('notas_observaciones') || error.message?.includes('schema cache'))) {
      const fbPayload = prepareFallbackPayload(payload);
      const fbRes = await client
        .from('cotizaciones')
        .update(fbPayload)
        .eq('id', id);
      error = fbRes.error;
    }

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

