import { Router } from 'express';
import { getCatalogos, crearEvidencia } from './evidencias.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/catalogos', getCatalogos);
router.post('/', crearEvidencia);

export default router;
