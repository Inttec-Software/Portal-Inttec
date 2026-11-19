import { Router } from 'express';
import { login, getProfile, refresh } from './auth.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Endpoint público para iniciar sesión
router.post('/login', login);

// Endpoint protegido para renovar silenciosamente el JWT mientras siga vigente
router.post('/refresh', verifyToken, refresh);

// Endpoint privado de prueba (requiere Bearer token)
router.get('/profile', verifyToken, getProfile);

export default router;
