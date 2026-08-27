import { Router } from 'express';
import { getChatContext } from './chat.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/context', getChatContext);

export default router;
