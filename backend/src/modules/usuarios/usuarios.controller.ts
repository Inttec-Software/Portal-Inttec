import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDbPool } from '../../config/database';

export const getUsuarios = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { rows } = await pool.query(`SELECT * FROM usuarios ORDER BY nombre`);
    
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createUsuario = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password, rol, telefono } = req.body;
    
    // We need both pools for the active environment to sync the user across companies
    const { company: activeCompany, env } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';
    
    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    let hashedPassword = password;
    if (password && !password.startsWith('$2a$') && !password.startsWith('$2b$')) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const usuarioData = { nombre, email, password: hashedPassword, rol, telefono };
    const keys = Object.keys(usuarioData);
    const values = Object.values(usuarioData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await primaryPool.query(
      `INSERT INTO usuarios (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const data = rows[0];

    try {
      const allKeys = Object.keys(data);
      const allVals = Object.values(data);
      const allPl = allKeys.map((_, i) => `$${i + 1}`).join(', ');
      const updateEx = allKeys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
      await secondaryPool.query(
        `INSERT INTO usuarios (${allKeys.join(', ')}) VALUES (${allPl}) ON CONFLICT (id) DO UPDATE SET ${updateEx}`,
        allVals
      );
    } catch (syncErr: any) {
      console.error('[UsuariosController] Error syncing user to secondary db:', syncErr);
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    
    if (updates.password && !updates.password.startsWith('$2a$') && !updates.password.startsWith('$2b$')) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    
    const { env } = req.tenant!;
    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    let userEmail = updates.email?.trim().toLowerCase();
    if (!userEmail) {
      const uInttec = await poolInttec.query(`SELECT email FROM usuarios WHERE id = $1`, [id]);
      const uDaravisa = await poolDaravisa.query(`SELECT email FROM usuarios WHERE id = $1`, [id]);
      userEmail = (uInttec.rows[0]?.email || uDaravisa.rows[0]?.email)?.trim().toLowerCase();
    }

    const updateDb = async (pool: any) => {
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      if (keys.length === 0) return;
      
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await pool.query(`UPDATE usuarios SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);

      if (userEmail) {
        await pool.query(`UPDATE usuarios SET ${setClause} WHERE email = $${keys.length + 1}`, [...values, userEmail]);
      }
    };

    await Promise.allSettled([updateDb(poolInttec), updateDb(poolDaravisa)]);

    res.json({ success: true, message: 'Usuario actualizado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { env } = req.tenant!;
    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    const uInttec = await poolInttec.query(`SELECT email FROM usuarios WHERE id = $1`, [id]);
    const uDaravisa = await poolDaravisa.query(`SELECT email FROM usuarios WHERE id = $1`, [id]);
    const userEmail = (uInttec.rows[0]?.email || uDaravisa.rows[0]?.email)?.trim().toLowerCase();

    const deleteDb = async (pool: any) => {
      await pool.query(`DELETE FROM usuarios WHERE id = $1`, [id]);
      if (userEmail) {
        await pool.query(`DELETE FROM usuarios WHERE email = $1`, [userEmail]);
      }
    };

    await Promise.all([deleteDb(poolInttec), deleteDb(poolDaravisa)]);

    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message, code: error.code });
  }
};
