import { Router } from 'express';
import { 
  getCatalogos, 
  getInventarioColaboradores,
  crearEvidencia, 
  getAdminEvidencias, 
  getMisEvidencias, 
  actualizarEvidencia, 
  getAdminEvidenciaById 
} from './evidencias.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/catalogos', getCatalogos);
router.get('/inventario-colaboradores', getInventarioColaboradores);
router.get('/mis-evidencias', getMisEvidencias);
router.post('/', crearEvidencia);
router.get('/admin/all', getAdminEvidencias);
router.get('/admin/:id', getAdminEvidenciaById);
router.put('/admin/:id', actualizarEvidencia);

export default router;
