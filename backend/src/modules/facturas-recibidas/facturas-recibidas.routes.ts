import { Router } from 'express';
import { 
  getFacturasRecibidas, 
  getSatSolicitudes, 
  importFactura 
} from './facturas-recibidas.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/sat-solicitudes', getSatSolicitudes);
router.post('/import', importFactura);
router.get('/', getFacturasRecibidas);

export default router;
