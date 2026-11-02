import { Router } from 'express';
import { 
  getGastosParaAuditoria, 
  guardarAuditoria, 
  obtenerAuditorias, 
  eliminarAuditoria,
  procesarImagenMovimientos
} from './auditoria.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/gastos', getGastosParaAuditoria);
router.post('/ocr-imagen', procesarImagenMovimientos);
router.get('/', obtenerAuditorias);
router.post('/', guardarAuditoria);
router.delete('/:id', eliminarAuditoria);

export default router;
