import { Router } from 'express';
import { 
  getInventarioEmpleado, 
  solicitarDevolucion,
  reportarGastoMaterial
} from './devoluciones.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/inventario', getInventarioEmpleado);
router.post('/solicitar', solicitarDevolucion);
router.post('/gasto-material', reportarGastoMaterial);

export default router;

