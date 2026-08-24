import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from './usuarios.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Todas las rutas de usuarios requieren autenticación JWT
router.use(verifyToken);

// These routes are mounted at /api/usuarios
router.get('/', getUsuarios);
router.post('/', createUsuario);
router.put('/:id', updateUsuario);
router.delete('/:id', deleteUsuario);

export default router;
