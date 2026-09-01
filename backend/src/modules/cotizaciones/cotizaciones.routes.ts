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

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/search-clientes', searchClientes);
router.get('/search-productos', searchProductos);
router.get('/', getCotizaciones);
router.get('/last-folio', getLastFolio);
router.get('/:id', getCotizacion);
router.get('/:id/pdf-data', getPdfData);
router.post('/duplicate/:id', duplicateCotizacion);
router.post('/', createCotizacion);
router.put('/:id', updateCotizacion);
router.delete('/:id', deleteCotizacion);

export default router;
