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
    console.error('[AUTH ERROR] Faltan headers de autorización o no empieza con Bearer:', authHeader);
    res.status(401).json({ message: 'No se proporcionó un token de autenticación válido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded: any = jwt.decode(token);
    if (!decoded) {
      console.error('[AUTH ERROR] Token no decodificable:', token);
      throw new Error('Token no pudo ser decodificado');
    }
    
    if (typeof decoded === 'object') {
      if (decoded.sub && !decoded.id) decoded.id = decoded.sub;
      if (decoded.user_metadata?.nombre && !decoded.nombre) decoded.nombre = decoded.user_metadata.nombre;
    }
    
    req.user = decoded;
    next();
  } catch (error: any) {
    console.error('[AUTH ERROR] Excepción en middleware:', error.message);
    res.status(401).json({ message: 'Token expirado o inválido.' });
    return;
  }
};
