import { Router } from 'express';
import { 
  getCotizaciones, 
  getCotizacion, 
  getPdfData, 
  getLastFolio, 
  deleteCotizacion, 
  duplicateCotizacion, 
  createCotizacion, 
  updateCotizacion,
  searchClientes,
  searchProductos
} from './cotizaciones.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

const cotizMutate = (req: any, res: any, next: any) => {
  invalidateCache('cotizaciones');
  next();
};

router.get('/search-clientes', searchClientes);
router.get('/search-productos', searchProductos);
router.get('/', cacheMiddleware(30), getCotizaciones);
router.get('/last-folio', getLastFolio);
router.get('/:id', getCotizacion);
router.get('/:id/pdf-data', getPdfData);
router.post('/duplicate/:id', cotizMutate, duplicateCotizacion);
router.post('/', cotizMutate, createCotizacion);
router.put('/:id', cotizMutate, updateCotizacion);
router.delete('/:id', cotizMutate, deleteCotizacion);

export default router;
