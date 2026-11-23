import { Router } from 'express';
import {
  searchProveedores,
  searchProductos,
  getLastFolio,
  getOrdenesCompra,
  getOrdenCompra,
  getPdfData,
  createOrdenCompra,
  updateOrdenCompra,
  duplicateOrdenCompra,
  deleteOrdenCompra,
} from './ordenes-compra.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';
import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

const ocMutate = (req: any, res: any, next: any) => {
  invalidateCache('ordenes-compra');
  next();
};

router.get('/search-proveedores', searchProveedores);
router.get('/search-productos', searchProductos);
router.get('/last-folio', getLastFolio);
router.get('/', cacheMiddleware(30), getOrdenesCompra);
router.get('/:id', getOrdenCompra);
router.get('/:id/pdf-data', getPdfData);
router.post('/duplicate/:id', ocMutate, duplicateOrdenCompra);
router.post('/', ocMutate, createOrdenCompra);
router.put('/:id', ocMutate, updateOrdenCompra);
router.delete('/:id', ocMutate, deleteOrdenCompra);

export default router;
