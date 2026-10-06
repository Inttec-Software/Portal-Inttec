import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

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
    const pool = getDbPool(tenant.company, tenant.env);
    
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.length < 2) return res.json({ clientes: [] });

    const query = 'SELECT * FROM clientes WHERE nombre ILIKE $1 LIMIT 5';
    const result = await pool.query(query, [`%${q}%`]);
    return res.json({ clientes: result.rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones/search-productos ===
export const searchProductos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);
    
    const { q } = req.query;
    let queryText = 'SELECT * FROM productos LIMIT 15';
    let queryParams: any[] = [];
    
    if (q && typeof q === 'string' && q.trim().length > 0) {
      queryText = 'SELECT * FROM productos WHERE nombre_oficial ILIKE $1 LIMIT 15';
      queryParams = [`%${q}%`];
    }

    try {
      const result = await pool.query(queryText, queryParams);
      return res.json({ productos: result.rows });
    } catch (error) {
      if (q && typeof q === 'string' && q.trim().length > 0) {
        const fbResult = await pool.query('SELECT * FROM productos WHERE nombre ILIKE $1 LIMIT 15', [`%${q}%`]);
        return res.json({ productos: fbResult.rows });
      }
      throw error;
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/cotizaciones ===
export const getCotizaciones = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const result = await pool.query('SELECT * FROM cotizaciones ORDER BY creado_en DESC');
    const formatted = result.rows.map(formatCotizacionResponse);
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
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    const cotizacionRes = await pool.query('SELECT * FROM cotizaciones WHERE id = $1', [id]);
    if (cotizacionRes.rows.length === 0) throw new Error('Cotización no encontrada');
    const cotizacion = cotizacionRes.rows[0];

    let clientData = null;
    let sucursales: any[] = [];
    if (cotizacion.cliente_nombre) {
      const cDataRes = await pool.query('SELECT * FROM clientes WHERE nombre = $1', [cotizacion.cliente_nombre]);
      if (cDataRes.rows.length > 0) {
        clientData = cDataRes.rows[0];
        const sDataRes = await pool.query('SELECT * FROM sucursales_cliente WHERE cliente_id = $1', [clientData.id]);
        sucursales = sDataRes.rows;
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
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    const cotizacionRes = await pool.query('SELECT * FROM cotizaciones WHERE id = $1', [id]);
    if (cotizacionRes.rows.length === 0) throw new Error('Cotización no encontrada');
    const cotizacion = cotizacionRes.rows[0];

    let clientData = null;
    if (cotizacion.cliente_nombre) {
      const cDataRes = await pool.query('SELECT * FROM clientes WHERE nombre = $1', [cotizacion.cliente_nombre]);
      if (cDataRes.rows.length > 0) {
        clientData = cDataRes.rows[0];
      }
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
    const pool = getDbPool(tenant.company, tenant.env);

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const defaultPrefix = `${yy}${mm}${dd}`;

    const prefix = typeof req.query.prefix === 'string' && req.query.prefix.trim() !== ''
      ? req.query.prefix.trim()
      : defaultPrefix;

    const result = await pool.query('SELECT folio FROM cotizaciones WHERE folio ILIKE $1', [`${prefix}%`]);
    const existingFolios = result.rows.map((row: any) => String(row.folio || '').trim());
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
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    await pool.query('DELETE FROM cotizaciones WHERE id = $1', [id]);

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
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    const origRes = await pool.query('SELECT * FROM cotizaciones WHERE id = $1', [id]);
    if (origRes.rows.length === 0) throw new Error('Cotización original no encontrada');
    const original = origRes.rows[0];

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const foliosRes = await pool.query('SELECT folio FROM cotizaciones WHERE folio ILIKE $1', [`${datePrefix}%`]);
    const existingFolios = foliosRes.rows.map((r: any) => String(r.folio || '').trim());
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
      lineas: original.lineas ? JSON.stringify(original.lineas) : '[]',
      terminos_condiciones: original.terminos_condiciones,
      notas_observaciones: original.notas_observaciones || null,
      estado: 'Borrador'
    };

    const cols = Object.keys(payload);
    const vals = Object.values(payload);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    let qry = `INSERT INTO cotizaciones (${cols.join(', ')}) VALUES (${placeholders})`;
    
    try {
      await pool.query(qry, vals);
    } catch (insError: any) {
      if (insError.message?.includes('notas_observaciones')) {
        const fbPayload = prepareFallbackPayload(payload);
        const fbCols = Object.keys(fbPayload);
        const fbVals = Object.values(fbPayload);
        const fbPlaceholders = fbVals.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`INSERT INTO cotizaciones (${fbCols.join(', ')}) VALUES (${fbPlaceholders})`, fbVals);
      } else {
        throw insError;
      }
    }

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
    const pool = getDbPool(tenant.company, tenant.env);

    const { payload, clientData, updateProducts } = req.body;

    if (clientData) {
      const keys = Object.keys(clientData).filter(k => k !== 'id');
      const vals = keys.map(k => clientData[k]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const updates = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
      await pool.query(
        `INSERT INTO clientes (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (nombre) DO UPDATE SET ${updates}`,
        vals
      );
    }

    if (updateProducts && updateProducts.length > 0) {
      for (const linea of updateProducts) {
        if (!linea.productoNombre) continue;

        if (linea.productoId) {
          await pool.query(
            'UPDATE productos SET precio_unitario = $1, impuesto_porcentaje = $2, clave_facturacion = $3 WHERE id = $4',
            [linea.precioUnitario, linea.impuestoPorcentaje, linea.claveFacturacion || null, linea.productoId]
          );
        } else {
          let catId = null;
          const catRes = await pool.query('SELECT id FROM categorias_productos LIMIT 1');
          if (catRes.rows.length > 0) {
            catId = catRes.rows[0].id;
          } else {
            const newCatRes = await pool.query("INSERT INTO categorias_productos (nombre) VALUES ('General') RETURNING id");
            if (newCatRes.rows.length > 0) catId = newCatRes.rows[0].id;
          }

          if (catId) {
            const tempSku = `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            let newProd = null;
            let prodErr = null;
            try {
              const pRes = await pool.query(
                'INSERT INTO productos (nombre_oficial, sku_interno, categoria_id, precio_unitario, impuesto_porcentaje, clave_facturacion, activo, stock_actual) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [linea.productoNombre.trim(), tempSku, catId, linea.precioUnitario, linea.impuestoPorcentaje, linea.claveFacturacion || null, true, 0]
              );
              newProd = pRes.rows[0];
            } catch (err: any) {
              prodErr = err;
            }
            
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

    if (payload.lineas) payload.lineas = JSON.stringify(payload.lineas);

    const cols = Object.keys(payload);
    const vals = Object.values(payload);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    let qry = `INSERT INTO cotizaciones (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    let result: any;
    try {
      const resInsert = await pool.query(qry, vals);
      result = resInsert.rows[0];
    } catch (err: any) {
      if (err.message?.includes('notas_observaciones')) {
        const fbPayload = prepareFallbackPayload(payload);
        const fbCols = Object.keys(fbPayload);
        const fbVals = Object.values(fbPayload);
        const fbPlaceholders = fbVals.map((_, i) => `$${i + 1}`).join(', ');
        const resInsert = await pool.query(`INSERT INTO cotizaciones (${fbCols.join(', ')}) VALUES (${fbPlaceholders}) RETURNING *`, fbVals);
        result = resInsert.rows[0];
      } else {
        throw err;
      }
    }

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
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;
    const { payload, clientData, updateProducts } = req.body;

    if (clientData) {
      const keys = Object.keys(clientData).filter(k => k !== 'id');
      const vals = keys.map(k => clientData[k]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const updates = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
      await pool.query(
        `INSERT INTO clientes (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (nombre) DO UPDATE SET ${updates}`,
        vals
      );
    }

    if (updateProducts && updateProducts.length > 0) {
      for (const linea of updateProducts) {
        if (!linea.productoNombre) continue;

        if (linea.productoId) {
          await pool.query(
            'UPDATE productos SET precio_unitario = $1, impuesto_porcentaje = $2, clave_facturacion = $3 WHERE id = $4',
            [linea.precioUnitario, linea.impuestoPorcentaje, linea.claveFacturacion || null, linea.productoId]
          );
        } else {
          let catId = null;
          const catRes = await pool.query('SELECT id FROM categorias_productos LIMIT 1');
          if (catRes.rows.length > 0) {
            catId = catRes.rows[0].id;
          } else {
            const newCatRes = await pool.query("INSERT INTO categorias_productos (nombre) VALUES ('General') RETURNING id");
            if (newCatRes.rows.length > 0) catId = newCatRes.rows[0].id;
          }

          if (catId) {
            const tempSku = `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            let newProd = null;
            let prodErr = null;
            try {
              const pRes = await pool.query(
                'INSERT INTO productos (nombre_oficial, sku_interno, categoria_id, precio_unitario, impuesto_porcentaje, clave_facturacion, activo, stock_actual) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [linea.productoNombre.trim(), tempSku, catId, linea.precioUnitario, linea.impuestoPorcentaje, linea.claveFacturacion || null, true, 0]
              );
              newProd = pRes.rows[0];
            } catch (err: any) {
              prodErr = err;
            }
            
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

    if (payload.lineas) payload.lineas = JSON.stringify(payload.lineas);

    const keys = Object.keys(payload);
    const vals = Object.values(payload);
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    vals.push(id);
    let qry = `UPDATE cotizaciones SET ${updates} WHERE id = $${vals.length}`;

    try {
      await pool.query(qry, vals);
    } catch (err: any) {
      if (err.message?.includes('notas_observaciones')) {
        const fbPayload = prepareFallbackPayload(payload);
        const fbKeys = Object.keys(fbPayload);
        const fbVals = Object.values(fbPayload);
        const fbUpdates = fbKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        fbVals.push(id);
        await pool.query(`UPDATE cotizaciones SET ${fbUpdates} WHERE id = $${fbVals.length}`, fbVals);
      } else {
        throw err;
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
