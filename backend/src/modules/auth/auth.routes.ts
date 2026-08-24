import { Router } from 'express';
import { login, getProfile } from './auth.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Endpoint público para iniciar sesión
router.post('/login', login);

// Endpoint privado de prueba (requiere Bearer token)
router.get('/profile', verifyToken, getProfile);

export default router;
