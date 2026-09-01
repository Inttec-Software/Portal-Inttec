import { Router } from 'express';
import { createCatalogo, updateCatalogo, deleteCatalogo, getAllCatalogos, getSucursales, getClienteSummary } from './catalogos.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/all', getAllCatalogos);
router.get('/sucursales/:clienteId', getSucursales);
router.get('/summary/:clienteId', getClienteSummary);

router.post('/', createCatalogo);
router.put('/', updateCatalogo);
router.delete('/:table/:id', deleteCatalogo);

export default router;
