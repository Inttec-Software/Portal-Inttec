import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDbPool } from '../../config/database';

const getJwtSecret = (): string =>
  process.env.JWT_SECRET || process.env.JWT_SCRET || 'super_secret_jwt_key_cambiar_en_produccion';

const signUserToken = (usuario: { id: string; email: string; rol: string; nombre: string }): string =>
  jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ message: 'Email y contraseña son requeridos.' });
      return;
    }

    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);

    const emailParam = email.trim().toLowerCase();

    // 1. Buscamos el usuario por correo electrónico
    const { rows } = await pool.query(
      'SELECT id, nombre, email, password, rol, telefono, created_at FROM usuarios WHERE email = $1',
      [emailParam]
    );

    let usuario = null;

    if (rows.length > 0) {
      const dbUser = rows[0];
      
      // 2. Comparamos la contraseña en Node.js, usando bcryptjs (compatible con pgcrypto de Supabase)
      const isMatch = await bcrypt.compare(password, dbUser.password);
      
      if (isMatch) {
        // Quitamos la contraseña del objeto usuario por seguridad
        const { password: _, ...userWithoutPassword } = dbUser;
        usuario = userWithoutPassword;
      } else {
        // Fallback por si en algún ambiente local se usó texto plano temporalmente
        if (password === dbUser.password) {
          const { password: _, ...userWithoutPassword } = dbUser;
          usuario = userWithoutPassword;
        }
      }
    }

    if (!usuario) {
      res.status(401).json({ message: 'Credenciales incorrectas.' });
      return;
    }

    const token = signUserToken(usuario);

    res.json({
      usuario,
      token
    });

  } catch (error: any) {
    console.error('[Auth Controller] Excepción:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenUser = req.user;
    const userId = tokenUser?.id ? String(tokenUser.id) : null;
    const userEmail = typeof tokenUser?.email === 'string' ? tokenUser.email.trim().toLowerCase() : null;

    if (!userId && !userEmail) {
      res.status(401).json({ message: 'Token inválido para renovación.' });
      return;
    }

    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);

    const { rows } = await pool.query(
      `SELECT id, nombre, email, rol, telefono, created_at
       FROM usuarios
       WHERE ($1::text IS NOT NULL AND id::text = $1)
          OR ($2::text IS NOT NULL AND LOWER(email) = $2)
       ORDER BY CASE WHEN ($1::text IS NOT NULL AND id::text = $1) THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId, userEmail]
    );

    if (rows.length === 0) {
      res.status(401).json({ message: 'Usuario no encontrado o sesión inválida.' });
      return;
    }

    const usuario = rows[0];
    const token = signUserToken(usuario);

    res.json({ usuario, token });
  } catch (error: any) {
    console.error('[Auth Controller] Error al renovar token:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  res.json({
    message: 'Ruta protegida accedida con éxito.',
    user: (req as any).user
  });
};
