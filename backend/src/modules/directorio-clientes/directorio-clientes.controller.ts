import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

const isAdminRole = (user: any): boolean => {
  const rol = String(user?.rol || user?.role || '').trim().toUpperCase();
  return rol === 'ADMIN' || rol === 'DEV';
};

export const getDirectorioClientes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const q = String(req.query.q || '').trim();
    if (q) {
      const search = `%${q}%`;
      const { rows } = await pool.query(
        `SELECT id, nombre, direccion, telefono, correo, created_at, updated_at
         FROM directorio_clientes
         WHERE nombre ILIKE $1
            OR COALESCE(direccion, '') ILIKE $1
            OR COALESCE(telefono, '') ILIKE $1
            OR COALESCE(correo, '') ILIKE $1
         ORDER BY nombre ASC`,
        [search]
      );
      return res.json({ clientes: rows });
    }

    const { rows } = await pool.query(
      `SELECT id, nombre, direccion, telefono, correo, created_at, updated_at
       FROM directorio_clientes
       ORDER BY nombre ASC`
    );
    return res.json({ clientes: rows });
  } catch (error: any) {
    console.error('[getDirectorioClientes] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const createDirectorioCliente = async (req: Request, res: Response) => {
  try {
    if (!isAdminRole(req.user)) {
      return res.status(403).json({ error: 'Solo los administradores pueden agregar clientes al directorio.' });
    }

    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const nombre = String(req.body?.nombre || '').trim();
    const direccion = req.body?.direccion ? String(req.body.direccion).trim() : null;
    const telefono = req.body?.telefono ? String(req.body.telefono).trim() : null;
    const correo = req.body?.correo ? String(req.body.correo).trim() : null;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    }

    const actorId = req.user?.id || null;
    const { rows } = await pool.query(
      `INSERT INTO directorio_clientes (nombre, direccion, telefono, correo, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, direccion, telefono, correo, created_at, updated_at`,
      [nombre, direccion, telefono, correo, actorId]
    );

    return res.status(201).json({ cliente: rows[0] });
  } catch (error: any) {
    console.error('[createDirectorioCliente] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const updateDirectorioCliente = async (req: Request, res: Response) => {
  try {
    if (!isAdminRole(req.user)) {
      return res.status(403).json({ error: 'Solo los administradores pueden editar clientes del directorio.' });
    }

    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;
    const nombre = String(req.body?.nombre || '').trim();
    const direccion = req.body?.direccion ? String(req.body.direccion).trim() : null;
    const telefono = req.body?.telefono ? String(req.body.telefono).trim() : null;
    const correo = req.body?.correo ? String(req.body.correo).trim() : null;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    }

    const { rows } = await pool.query(
      `UPDATE directorio_clientes
       SET nombre = $1,
           direccion = $2,
           telefono = $3,
           correo = $4,
           updated_at = now()
       WHERE id = $5
       RETURNING id, nombre, direccion, telefono, correo, created_at, updated_at`,
      [nombre, direccion, telefono, correo, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado en el directorio.' });
    }

    return res.json({ cliente: rows[0] });
  } catch (error: any) {
    console.error('[updateDirectorioCliente] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const deleteDirectorioCliente = async (req: Request, res: Response) => {
  try {
    if (!isAdminRole(req.user)) {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar clientes del directorio.' });
    }

    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM directorio_clientes WHERE id = $1', [id]);

    if (!rowCount || rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado en el directorio.' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[deleteDirectorioCliente] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
