import { Router } from 'express';
import { 
  getGastosParaAuditoria, 
  guardarAuditoria, 
  obtenerAuditorias, 
  eliminarAuditoria 
} from './auditoria.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/gastos', getGastosParaAuditoria);
router.get('/', obtenerAuditorias);
router.post('/', guardarAuditoria);
router.delete('/:id', eliminarAuditoria);

export default router;
