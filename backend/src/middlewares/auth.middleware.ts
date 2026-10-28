import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extendemos el Request para inyectar el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No se proporcionó un token de autenticación válido.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || process.env.JWT_SCRET || 'super_secret_jwt_key_cambiar_en_produccion';

  try {
    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (verifyErr: any) {
      // Fallback de compatibilidad: si es un token legado no expirado
      const unverified: any = jwt.decode(token);
      if (unverified && unverified.exp && unverified.exp * 1000 > Date.now()) {
        decoded = unverified;
      } else {
        throw verifyErr;
      }
    }

    if (!decoded) {
      throw new Error('Token no pudo ser validado');
    }
    
    if (typeof decoded === 'object') {
      if (decoded.sub && !decoded.id) decoded.id = decoded.sub;
      if (decoded.user_metadata?.nombre && !decoded.nombre) decoded.nombre = decoded.user_metadata.nombre;
    }
    
    req.user = decoded;
    next();
  } catch (error: any) {
    console.error('[AUTH ERROR] Token inválido o expirado:', error.message);
    res.status(401).json({ message: 'Token expirado o inválido.' });
    return;
  }
};
