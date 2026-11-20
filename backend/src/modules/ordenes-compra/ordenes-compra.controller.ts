import { Request, Response } from 'express';
import { Pool } from 'pg';
import { getDbPool } from '../../config/database';

const initializedSchemas = new Set<string>();

/**
 * Asegura que la tabla ordenes_compra y las columnas de dirección en proveedores
 * existan en la base de datos del tenant actual.
 */
const ensureOrdenesCompraSchema = async (pool: Pool, tenantKey: string) => {
  if (initializedSchemas.has(tenantKey)) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ordenes_compra (
      id uuid DEFAULT gen_random_uuid() NOT NULL,
      folio text NOT NULL,
      proveedor_id uuid NULL,
      proveedor_nombre text NOT NULL,
      proveedor_rfc text NULL,
      proveedor_correo text NULL,
      proveedor_calle_numero text NULL,
      proveedor_colonia text NULL,
      proveedor_ciudad text NULL,
      proveedor_estado text NULL,
      proveedor_cp text NULL,
      referencia text NULL,
      facturar boolean DEFAULT true NOT NULL,
      estatus_proceso text DEFAULT 'En Proceso'::text NOT NULL,
      moneda text DEFAULT 'MXN'::text NOT NULL,
      tipo_cambio numeric(12, 4) DEFAULT 1 NOT NULL,
      fecha_creacion text NULL,
      realizo_compra text NULL,
      recibido_por text NULL,
      subtotal numeric DEFAULT 0 NULL,
      iva numeric DEFAULT 0 NULL,
      total numeric DEFAULT 0 NULL,
      lineas jsonb DEFAULT '[]'::jsonb NULL,
      observaciones text NULL,
      condiciones_trabajo text NULL,
      creado_en timestamptz DEFAULT now() NULL,
      actualizado_en timestamptz DEFAULT now() NULL,
      CONSTRAINT ordenes_compra_folio_key UNIQUE (folio),
      CONSTRAINT ordenes_compra_pkey PRIMARY KEY (id)
    );
  `);

  // Agregar columnas opcionales de dirección/contacto a proveedores si no existen
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS correo_electronico text NULL;`);
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS calle_numero text NULL;`);
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS colonia text NULL;`);
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS ciudad text NULL;`);
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS estado text NULL;`);
  await pool.query(`ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS codigo_postal text NULL;`);
  await pool.query(`ALTER TABLE public.ordenes_compra ADD COLUMN IF NOT EXISTS cliente_final text NULL;`);

  initializedSchemas.add(tenantKey);
};

const getTenantPool = async (req: Request, res: Response): Promise<Pool | null> => {
  const tenant = (req as any).tenant;
  if (!tenant) {
    res.status(400).json({ error: 'Tenant no especificado' });
    return null;
  }
  const pool = getDbPool(tenant.company, tenant.env);
  await ensureOrdenesCompraSchema(pool, `${tenant.company}:${tenant.env}`);
  return pool;
};

/**
 * Calcula el siguiente folio consecutivo numérico (1, 2, 3...)
 */
const calculateNextNumericFolio = (existingFolios: string[]): { lastFolio: string | null; nextFolio: string } => {
  let maxNum = 0;
  const existingSet = new Set(existingFolios.map((f) => String(f || '').trim()));

  for (const folio of existingSet) {
    if (/^\d+$/.test(folio)) {
      const n = parseInt(folio, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }

  let candidate = maxNum + 1;
  while (existingSet.has(String(candidate))) {
    candidate++;
  }

  return {
    lastFolio: maxNum > 0 ? String(maxNum) : null,
    nextFolio: String(candidate),
  };
};

/**
 * Crea o actualiza el proveedor en el catálogo con sus datos fiscales y de dirección.
 */
const upsertProveedor = async (pool: Pool, proveedorData: any): Promise<string | null> => {
  if (!proveedorData || !proveedorData.nombre || !String(proveedorData.nombre).trim()) {
    return null;
  }

  const nombre = String(proveedorData.nombre).trim();
  const rfc = proveedorData.rfc && String(proveedorData.rfc).trim() ? String(proveedorData.rfc).trim().toUpperCase() : null;
  const correo = proveedorData.correo_electronico ? String(proveedorData.correo_electronico).trim() : null;
  const calleNumero = proveedorData.calle_numero ? String(proveedorData.calle_numero).trim() : null;
  const colonia = proveedorData.colonia ? String(proveedorData.colonia).trim() : null;
  const ciudad = proveedorData.ciudad ? String(proveedorData.ciudad).trim() : null;
  const estado = proveedorData.estado ? String(proveedorData.estado).trim() : null;
  const cp = proveedorData.codigo_postal ? String(proveedorData.codigo_postal).trim() : null;

  try {
    let targetId: string | null = proveedorData.id || null;

    if (!targetId && rfc) {
      const byRfc = await pool.query('SELECT id FROM proveedores WHERE UPPER(rfc) = $1 LIMIT 1', [rfc]);
      if (byRfc.rows.length > 0) targetId = byRfc.rows[0].id;
    }

    if (!targetId) {
      const byName = await pool.query('SELECT id FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER($1) LIMIT 1', [nombre]);
      if (byName.rows.length > 0) targetId = byName.rows[0].id;
    }

    if (targetId) {
      await pool.query(
        `UPDATE proveedores
         SET nombre = $1,
             rfc = COALESCE($2, rfc),
             correo_electronico = COALESCE($3, correo_electronico),
             calle_numero = COALESCE($4, calle_numero),
             colonia = COALESCE($5, colonia),
             ciudad = COALESCE($6, ciudad),
             estado = COALESCE($7, estado),
             codigo_postal = COALESCE($8, codigo_postal)
         WHERE id = $9`,
        [nombre, rfc, correo, calleNumero, colonia, ciudad, estado, cp, targetId]
      );
      return targetId;
    }

    const ins = await pool.query(
      `INSERT INTO proveedores (nombre, rfc, correo_electronico, calle_numero, colonia, ciudad, estado, codigo_postal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [nombre, rfc, correo, calleNumero, colonia, ciudad, estado, cp]
    );
    return ins.rows[0]?.id || null;
  } catch (err) {
    console.warn('[OrdenesCompra] No se pudo hacer upsert del proveedor:', err);
    return proveedorData.id || null;
  }
};

// === GET /api/ordenes-compra/search-proveedores ===
export const searchProveedores = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      const result = await pool.query('SELECT * FROM proveedores ORDER BY nombre ASC LIMIT 15');
      return res.json({ proveedores: result.rows });
    }

    const result = await pool.query(
      'SELECT * FROM proveedores WHERE nombre ILIKE $1 OR rfc ILIKE $1 ORDER BY nombre ASC LIMIT 15',
      [`%${q}%`]
    );
    return res.json({ proveedores: result.rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ordenes-compra/search-productos ===
export const searchProductos = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { q } = req.query;
    let queryText = 'SELECT * FROM productos ORDER BY nombre_oficial ASC LIMIT 15';
    let queryParams: any[] = [];

    if (q && typeof q === 'string' && q.trim().length > 0) {
      queryText = 'SELECT * FROM productos WHERE nombre_oficial ILIKE $1 OR sku_interno ILIKE $1 LIMIT 15';
      queryParams = [`%${q.trim()}%`];
    }

    try {
      const result = await pool.query(queryText, queryParams);
      return res.json({ productos: result.rows });
    } catch (error) {
      if (q && typeof q === 'string' && q.trim().length > 0) {
        const fbResult = await pool.query('SELECT * FROM productos WHERE nombre ILIKE $1 LIMIT 15', [`%${q.trim()}%`]);
        return res.json({ productos: fbResult.rows });
      }
      throw error;
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ordenes-compra/last-folio ===
export const getLastFolio = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const result = await pool.query('SELECT folio FROM ordenes_compra');
    const existingFolios = result.rows.map((row: any) => String(row.folio || '').trim());
    const { lastFolio, nextFolio } = calculateNextNumericFolio(existingFolios);

    return res.json({ lastFolio, nextFolio });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ordenes-compra ===
export const getOrdenesCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const result = await pool.query('SELECT * FROM ordenes_compra ORDER BY creado_en DESC');
    return res.json({ ordenesCompra: result.rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ordenes-compra/:id ===
export const getOrdenCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { id } = req.params;
    const ocRes = await pool.query('SELECT * FROM ordenes_compra WHERE id = $1', [id]);
    if (ocRes.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }
    const ordenCompra = ocRes.rows[0];

    let proveedorData = null;
    if (ordenCompra.proveedor_id) {
      const pRes = await pool.query('SELECT * FROM proveedores WHERE id = $1', [ordenCompra.proveedor_id]);
      if (pRes.rows.length > 0) proveedorData = pRes.rows[0];
    } else if (ordenCompra.proveedor_nombre) {
      const pRes = await pool.query('SELECT * FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER($1) LIMIT 1', [
        ordenCompra.proveedor_nombre,
      ]);
      if (pRes.rows.length > 0) proveedorData = pRes.rows[0];
    }

    return res.json({ ordenCompra, proveedorData });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/ordenes-compra/:id/pdf-data ===
export const getPdfData = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { id } = req.params;
    const ocRes = await pool.query('SELECT * FROM ordenes_compra WHERE id = $1', [id]);
    if (ocRes.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }
    const ordenCompra = ocRes.rows[0];

    let proveedorData = null;
    if (ordenCompra.proveedor_id) {
      const pRes = await pool.query('SELECT * FROM proveedores WHERE id = $1', [ordenCompra.proveedor_id]);
      if (pRes.rows.length > 0) proveedorData = pRes.rows[0];
    } else if (ordenCompra.proveedor_nombre) {
      const pRes = await pool.query('SELECT * FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER($1) LIMIT 1', [
        ordenCompra.proveedor_nombre,
      ]);
      if (pRes.rows.length > 0) proveedorData = pRes.rows[0];
    }

    return res.json({ ordenCompra, proveedorData });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/ordenes-compra ===
export const createOrdenCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { payload, proveedorData } = req.body;
    if (!payload || !payload.folio || !payload.proveedor_nombre) {
      return res.status(400).json({ error: 'Folio y nombre del proveedor son obligatorios.' });
    }

    const proveedorId = await upsertProveedor(pool, proveedorData);

    const record = {
      folio: String(payload.folio).trim(),
      proveedor_id: proveedorId || payload.proveedor_id || null,
      proveedor_nombre: String(payload.proveedor_nombre).trim(),
      proveedor_rfc: payload.proveedor_rfc || null,
      proveedor_correo: payload.proveedor_correo || null,
      proveedor_calle_numero: payload.proveedor_calle_numero || null,
      proveedor_colonia: payload.proveedor_colonia || null,
      proveedor_ciudad: payload.proveedor_ciudad || null,
      proveedor_estado: payload.proveedor_estado || null,
      proveedor_cp: payload.proveedor_cp || null,
      referencia: payload.referencia || null,
      facturar: payload.facturar !== undefined ? Boolean(payload.facturar) : true,
      estatus_proceso: payload.estatus_proceso || 'En Proceso',
      moneda: payload.moneda || 'MXN',
      tipo_cambio: Number(payload.tipo_cambio) > 0 ? Number(payload.tipo_cambio) : 1,
      fecha_creacion: payload.fecha_creacion || new Date().toLocaleDateString('es-MX'),
      realizo_compra: payload.realizo_compra || null,
      recibido_por: payload.recibido_por || null,
      subtotal: Number(payload.subtotal) || 0,
      iva: Number(payload.iva) || 0,
      total: Number(payload.total) || 0,
      lineas: JSON.stringify(payload.lineas || []),
      observaciones: payload.observaciones || null,
      condiciones_trabajo: payload.condiciones_trabajo || null,
      cliente_final: payload.cliente_final || null,
    };

    const cols = Object.keys(record);
    const vals = Object.values(record);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    const insertRes = await pool.query(
      `INSERT INTO ordenes_compra (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );

    return res.status(201).json({ success: true, ordenCompra: insertRes.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una orden de compra con ese folio.' });
    }
    return res.status(500).json({ error: error.message });
  }
};

// === PUT /api/ordenes-compra/:id ===
export const updateOrdenCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { id } = req.params;
    const { payload, proveedorData } = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Datos de orden de compra no proporcionados.' });
    }

    const proveedorId = await upsertProveedor(pool, proveedorData);

    const record: Record<string, any> = {
      folio: String(payload.folio).trim(),
      proveedor_id: proveedorId || payload.proveedor_id || null,
      proveedor_nombre: String(payload.proveedor_nombre || '').trim(),
      proveedor_rfc: payload.proveedor_rfc || null,
      proveedor_correo: payload.proveedor_correo || null,
      proveedor_calle_numero: payload.proveedor_calle_numero || null,
      proveedor_colonia: payload.proveedor_colonia || null,
      proveedor_ciudad: payload.proveedor_ciudad || null,
      proveedor_estado: payload.proveedor_estado || null,
      proveedor_cp: payload.proveedor_cp || null,
      referencia: payload.referencia || null,
      facturar: payload.facturar !== undefined ? Boolean(payload.facturar) : true,
      estatus_proceso: payload.estatus_proceso || 'En Proceso',
      moneda: payload.moneda || 'MXN',
      tipo_cambio: Number(payload.tipo_cambio) > 0 ? Number(payload.tipo_cambio) : 1,
      fecha_creacion: payload.fecha_creacion || new Date().toLocaleDateString('es-MX'),
      realizo_compra: payload.realizo_compra || null,
      recibido_por: payload.recibido_por || null,
      subtotal: Number(payload.subtotal) || 0,
      iva: Number(payload.iva) || 0,
      total: Number(payload.total) || 0,
      lineas: JSON.stringify(payload.lineas || []),
      observaciones: payload.observaciones || null,
      condiciones_trabajo: payload.condiciones_trabajo || null,
      cliente_final: payload.cliente_final || null,
      actualizado_en: new Date().toISOString(),
    };

    const keys = Object.keys(record);
    const vals = Object.values(record);
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    vals.push(id);

    const updateRes = await pool.query(
      `UPDATE ordenes_compra SET ${updates} WHERE id = $${vals.length} RETURNING *`,
      vals
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    return res.json({ success: true, ordenCompra: updateRes.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe otra orden de compra con ese folio.' });
    }
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/ordenes-compra/duplicate/:id ===
export const duplicateOrdenCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { id } = req.params;
    const origRes = await pool.query('SELECT * FROM ordenes_compra WHERE id = $1', [id]);
    if (origRes.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra original no encontrada' });
    }
    const orig = origRes.rows[0];

    const foliosRes = await pool.query('SELECT folio FROM ordenes_compra');
    const existingFolios = foliosRes.rows.map((r: any) => String(r.folio || '').trim());
    const { nextFolio } = calculateNextNumericFolio(existingFolios);

    const today = new Date();
    const record = {
      folio: nextFolio,
      proveedor_id: orig.proveedor_id || null,
      proveedor_nombre: orig.proveedor_nombre,
      proveedor_rfc: orig.proveedor_rfc || null,
      proveedor_correo: orig.proveedor_correo || null,
      proveedor_calle_numero: orig.proveedor_calle_numero || null,
      proveedor_colonia: orig.proveedor_colonia || null,
      proveedor_ciudad: orig.proveedor_ciudad || null,
      proveedor_estado: orig.proveedor_estado || null,
      proveedor_cp: orig.proveedor_cp || null,
      referencia: orig.referencia || null,
      facturar: orig.facturar !== undefined ? orig.facturar : true,
      estatus_proceso: 'En Proceso',
      moneda: orig.moneda || 'MXN',
      tipo_cambio: orig.tipo_cambio || 1,
      fecha_creacion: today.toLocaleDateString('es-MX'),
      realizo_compra: orig.realizo_compra || null,
      recibido_por: orig.recibido_por || null,
      subtotal: orig.subtotal || 0,
      iva: orig.iva || 0,
      total: orig.total || 0,
      lineas: orig.lineas ? JSON.stringify(orig.lineas) : '[]',
      observaciones: orig.observaciones || null,
      condiciones_trabajo: orig.condiciones_trabajo || null,
      cliente_final: orig.cliente_final || null,
    };

    const cols = Object.keys(record);
    const vals = Object.values(record);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    await pool.query(`INSERT INTO ordenes_compra (${cols.join(', ')}) VALUES (${placeholders})`, vals);

    return res.json({ success: true, newFolio: nextFolio });
  } catch (error: any) {
    console.error('Error in duplicateOrdenCompra:', error);
    return res.status(500).json({ error: error.message || 'Error al duplicar orden de compra' });
  }
};

// === DELETE /api/ordenes-compra/:id ===
export const deleteOrdenCompra = async (req: Request, res: Response) => {
  try {
    const pool = await getTenantPool(req, res);
    if (!pool) return;

    const { id } = req.params;
    await pool.query('DELETE FROM ordenes_compra WHERE id = $1', [id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
