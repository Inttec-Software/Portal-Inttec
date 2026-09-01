import { Router } from 'express';
import { 
  getVentasHistorial, 
  getVentaDetalle, 
  getVentaPagos, 
  registrarPago, 
  deletePago, 
  createVenta, 
  updateVenta, 
  deleteVenta, 
  getVentaPartidas, 
  checkDuplicateReference, 
  getVentasCatalogs, 
  getVentaPdfData, 
  syncPaymentStatus 
} from './ventas.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/historial', getVentasHistorial);
router.get('/catalogs', getVentasCatalogs);
router.get('/check-duplicate', checkDuplicateReference);
router.get('/:id/detalle', getVentaDetalle);
router.get('/:id/pagos', getVentaPagos);
router.post('/:id/pagos', registrarPago);
router.delete('/:id/pagos/:pagoId', deletePago);
router.get('/:id/partidas', getVentaPartidas);
router.get('/:id/pdf-data', getVentaPdfData);
router.post('/:id/sync-payment', syncPaymentStatus);

router.post('/', createVenta);
router.put('/:id', updateVenta);
router.delete('/:id', deleteVenta);

export default router;
