import { Router } from 'express';
import { 
  getProductosDisponibles, 
  confirmarRetiro 
} from './retiro-material.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/productos', getProductosDisponibles);
router.post('/confirmar', confirmarRetiro);

export default router;
