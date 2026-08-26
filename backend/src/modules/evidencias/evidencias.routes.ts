import { Router } from 'express';
import { getCatalogos, crearEvidencia, getAdminEvidencias } from './evidencias.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/catalogos', getCatalogos);
router.post('/', crearEvidencia);
router.get('/admin/all', getAdminEvidencias);

export default router;
