import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getAsistenciaHoy = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { empleado_id } = req.params;
    const { fecha } = req.query;

    if (!fecha) return res.status(400).json({ error: 'Fecha es requerida' });

    const result = await pool.query(
      `SELECT * FROM asistencias WHERE empleado_id = $1 AND fecha = $2 ORDER BY creado_en DESC LIMIT 1`,
      [empleado_id, fecha]
    );

    return res.json(result.rows[0] || null);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarEntrada = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const payload = req.body;

    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `INSERT INTO asistencias (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarSalida = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id, ...payload } = req.body;

    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE asistencias SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );

    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getHistorial = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { empleado_id } = req.params;

    const result = await pool.query(
      `SELECT * FROM asistencias WHERE empleado_id = $1 ORDER BY fecha DESC`,
      [empleado_id]
    );

    return res.json(result.rows || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
