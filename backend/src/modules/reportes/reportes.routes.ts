import { Router } from 'express';
import { getAdminReportes, updateGastoStatus, getSalesForLinking, getExportData, updateGasto, recalculateVentaTotals, deleteGasto, saveQuickSale, getFormCatalogs, createGastos, getEmpleadoGastos, getGastoById } from './reportes.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

const reportesMutate = (req: any, res: any, next: any) => {
  invalidateCache('reportes');
  next();
};

router.get('/admin/all', cacheMiddleware(30), getAdminReportes);
router.get('/admin/ventas', getSalesForLinking);
router.get('/admin/export/:type', getExportData);
router.get('/empleado', cacheMiddleware(20), getEmpleadoGastos);
router.get('/gastos/:id', getGastoById);
router.post('/ventas/quick', reportesMutate, saveQuickSale);
router.put('/gastos/:id/status', reportesMutate, updateGastoStatus);
router.put('/gastos/:id', reportesMutate, updateGasto);
router.post('/gastos', reportesMutate, createGastos);
router.delete('/gastos/:id', reportesMutate, deleteGasto);
router.post('/ventas/:id/recalculate', reportesMutate, recalculateVentaTotals);
router.get('/form-catalogs', cacheMiddleware(60), getFormCatalogs);

export default router;
