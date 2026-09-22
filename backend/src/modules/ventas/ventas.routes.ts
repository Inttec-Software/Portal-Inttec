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

import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

const ventasMutate = (req: any, res: any, next: any) => {
  invalidateCache('ventas');
  invalidateCache('sat');
  next();
};

router.get('/historial', cacheMiddleware(30), getVentasHistorial);
router.get('/catalogs', cacheMiddleware(60), getVentasCatalogs);
router.get('/check-duplicate', checkDuplicateReference);
router.get('/:id/detalle', getVentaDetalle);
router.get('/:id/pagos', getVentaPagos);
router.post('/:id/pagos', ventasMutate, registrarPago);
router.delete('/:id/pagos/:pagoId', ventasMutate, deletePago);
router.get('/:id/partidas', getVentaPartidas);
router.get('/:id/pdf-data', getVentaPdfData);
router.post('/:id/sync-payment', ventasMutate, syncPaymentStatus);

router.post('/', ventasMutate, createVenta);
router.put('/:id', ventasMutate, updateVenta);
router.delete('/:id', ventasMutate, deleteVenta);

export default router;
