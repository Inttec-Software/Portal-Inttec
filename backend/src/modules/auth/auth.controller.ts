import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getSupabaseClient } from '../../config/supabase';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ message: 'Email y contraseña son requeridos.' });
      return;
    }

    // Obtenemos el tenant del request (inyectado por tenantMiddleware)
    const { company, env } = req.tenant!;
    
    // Obtenemos el cliente de Supabase adecuado
    const supabase = getSupabaseClient(company, env);

    // Llamamos al RPC custom que ya existía en la BD para validar credenciales
    const { data: usuario, error } = await supabase
      .rpc('login_usuario', {
        email_param: email.trim().toLowerCase(),
        password_param: password,
      })
      .maybeSingle();

    if (error) {
      console.error('[Auth Controller] Error de Supabase:', error.message);
      res.status(500).json({ message: 'Error de conexión con la base de datos.' });
      return;
    }

    if (!usuario) {
      res.status(401).json({ message: 'Credenciales incorrectas.' });
      return;
    }

    // Generar el Token JWT
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_cambiar_en_produccion';
    
    // Firmamos el token con los datos básicos del usuario
    // Recomendable que el token expire, por ejemplo, en 7 días
    const token = jwt.sign(
      { 
        id: (usuario as any).id, 
        email: (usuario as any).email, 
        rol: (usuario as any).rol, 
        nombre: (usuario as any).nombre 
      },
      secret,
      { expiresIn: '7d' }
    );

    // Retornamos el usuario (para mantener compatibilidad con el front temporalmente) y el token
    res.json({
      usuario,
      token
    });

  } catch (error: any) {
    console.error('[Auth Controller] Excepción:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

// Ruta de prueba para verificar que el JWT funciona
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  // Si llegamos aquí, el middleware verifyToken ya extrajo el req.user
  res.json({
    message: 'Ruta protegida accedida con éxito.',
    user: req.user
  });
};
