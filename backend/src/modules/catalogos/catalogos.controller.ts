import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

const getOtherCompany = (company: 'inttec' | 'daravisa'): 'inttec' | 'daravisa' => {
  return company === 'inttec' ? 'daravisa' : 'inttec';
};

const syncToOtherCompany = async (table: string, data: any, company: 'inttec' | 'daravisa', env: 'cloud' | 'test') => {
  try {
    const otherCompany = getOtherCompany(company);
    const pool = getDbPool(otherCompany, env);
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updateEx = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
    
    await pool.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateEx}`,
      values
    );
  } catch (error) {
    console.error(`Error syncing ${table} to ${getOtherCompany(company)}:`, error);
  }
};

const executeSyncUpdate = async (table: string, id: string, updates: any, env: 'cloud' | 'test') => {
  try {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1}`;
    const params = [...values, id];

    await Promise.allSettled([
      getDbPool('inttec', env).query(sql, params),
      getDbPool('daravisa', env).query(sql, params)
    ]);
  } catch (error) {
    console.error(`Error updating ${table}:`, error);
  }
};

const executeSyncDelete = async (table: string, id: string, env: 'cloud' | 'test') => {
  try {
    const sql = `DELETE FROM ${table} WHERE id = $1`;
    await Promise.allSettled([
      getDbPool('inttec', env).query(sql, [id]),
      getDbPool('daravisa', env).query(sql, [id])
    ]);
  } catch (error) {
    console.error(`Error deleting ${table}:`, error);
  }
};

export const getAllCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const [catRes, subRes, cliRes, provRes] = await Promise.all([
      pool.query(`SELECT * FROM categorias ORDER BY nombre`),
      pool.query(`SELECT * FROM subcategorias ORDER BY nombre`),
      pool.query(`SELECT * FROM clientes ORDER BY nombre`),
      pool.query(`SELECT * FROM proveedores ORDER BY nombre`),
    ]);

    return res.json({
      categorias: catRes.rows || [],
      subcategorias: subRes.rows || [],
      clientes: cliRes.rows || [],
      proveedores: provRes.rows || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getClientes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const q = String(req.query.q || '').trim();
    let sql = '';
    let values: any[] = [];

    if (q) {
      sql = `SELECT id, nombre, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi FROM clientes WHERE razon_social ILIKE $1 OR nombre ILIKE $1 OR rfc ILIKE $1 ORDER BY nombre LIMIT 20`;
      values.push(`%${q}%`);
    } else {
      sql = `SELECT id, nombre, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi FROM clientes ORDER BY nombre`;
    }

    const { rows } = await pool.query(sql, values);
    return res.json(rows || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSucursales = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { clienteId } = req.params;
    const pool = getDbPool(company, env);

    const { rows } = await pool.query(
      `SELECT * FROM sucursales_cliente WHERE cliente_id = $1 ORDER BY nombre`,
      [clienteId]
    );
      
    return res.json(rows || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getClienteSummary = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { clienteId } = req.params;
    const clienteNombre = req.query.clienteNombre as string;
    const pool = getDbPool(company, env);

    const [gastosRes, ventasRes] = await Promise.all([
      pool.query(`SELECT monto FROM gastos WHERE cliente_id = $1 AND status != 'REJECTED'`, [clienteId]),
      pool.query(`SELECT precio_total_facturado, costo_total FROM ventas WHERE cliente = $1`, [clienteNombre])
    ]);

    return res.json({
      gastos: gastosRes.rows || [],
      ventas: ventasRes.rows || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { table, data } = req.body;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    const pool = getDbPool(company, env);
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const inserted = rows[0];

    await syncToOtherCompany(table, inserted, company, env);

    return res.status(201).json(inserted);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const { table, id, updates } = req.body;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    await executeSyncUpdate(table, id, updates, env);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const table = req.params.table as string;
    const id = req.params.id as string;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    await executeSyncDelete(table, id, env);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
