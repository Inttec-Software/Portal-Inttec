import { Router } from 'express';
import { 
  getFacturasRecibidas, 
  getSatSolicitudes, 
  importFactura,
  getSatSyncStatus,
  triggerSatSync
} from './facturas-recibidas.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/sat-solicitudes', getSatSolicitudes);
router.get('/sync-status', getSatSyncStatus);
router.post('/sync-now', triggerSatSync);
router.post('/import', importFactura);
router.get('/', getFacturasRecibidas);

export default router;

