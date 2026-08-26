import { Router } from 'express';
import { getAdminReportes, updateGastoStatus, getSalesForLinking, getExportData, updateGasto, recalculateVentaTotals, deleteGasto, saveQuickSale, getFormCatalogs, createGastos } from './reportes.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/admin/all', getAdminReportes);
router.get('/admin/ventas', getSalesForLinking);
router.get('/admin/export/:type', getExportData);
router.post('/ventas/quick', saveQuickSale);
router.put('/gastos/:id/status', updateGastoStatus);
router.put('/gastos/:id', updateGasto);
router.post('/gastos', createGastos);
router.delete('/gastos/:id', deleteGasto);
router.post('/ventas/:id/recalculate', recalculateVentaTotals);
router.get('/form-catalogs', getFormCatalogs);

export default router;
