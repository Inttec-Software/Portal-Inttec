import { Router } from 'express';
import { getChatContext, getEmployeeChatContext, mejorarRedaccion } from './chat.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/context', getChatContext);
router.get('/employee-context', getEmployeeChatContext);
router.post('/mejorar-redaccion', mejorarRedaccion);

export default router;
