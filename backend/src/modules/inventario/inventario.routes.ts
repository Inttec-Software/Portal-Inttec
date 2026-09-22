import { Router } from 'express';
import { 
  getDashboardData, 
  aprobarDevolucion, 
  verificarEvidencia, 
  upsertProducto, 
  bulkDeleteProductos,
  bulkUpdateProductos,
  addStock, 
  guardarConsumo, 
  guardarImportacion, 
  crearCatalogo,
  getEmpleadoRetribuciones,
  verificarFolioFactura,
  hardDeleteProducto,
  getMovimientosInventario
} from './inventario.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

// router.use(verifyToken);
router.use(tenantMiddleware);

const invMutate = (req: any, res: any, next: any) => {
  invalidateCache('inventario');
  next();
};

router.get('/dashboard', cacheMiddleware(30), getDashboardData);
router.get('/movimientos', getMovimientosInventario);
router.get('/retiros', getMovimientosInventario);
router.post('/devoluciones/aprobar', invMutate, aprobarDevolucion);
router.post('/evidencias/verificar', invMutate, verificarEvidencia);
router.post('/productos/bulk-delete', invMutate, bulkDeleteProductos);
router.post('/productos/bulk-update', invMutate, bulkUpdateProductos);
router.post('/productos', invMutate, upsertProducto);
router.put('/productos/:id', invMutate, upsertProducto);
router.delete('/productos/:id', invMutate, hardDeleteProducto);
router.post('/productos/:id/stock', invMutate, addStock);
router.post('/consumos', invMutate, guardarConsumo);
router.post('/importar', invMutate, guardarImportacion);
router.get('/verificar-folio', verificarFolioFactura);
router.post('/catalogos/:tipo', invMutate, crearCatalogo);
router.get('/empleado/:id/retribuciones', cacheMiddleware(15), getEmpleadoRetribuciones);

export default router;

