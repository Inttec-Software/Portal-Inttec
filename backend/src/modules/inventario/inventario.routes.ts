import { Router } from 'express';
import { 
  getDashboardData, 
  aprobarDevolucion, 
  verificarEvidencia, 
  upsertProducto, 
  addStock, 
  guardarConsumo, 
  guardarImportacion, 
  crearCatalogo,
  getEmpleadoRetribuciones
} from './inventario.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

// router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/dashboard', getDashboardData);
router.post('/devoluciones/aprobar', aprobarDevolucion);
router.post('/evidencias/verificar', verificarEvidencia);
router.post('/productos', upsertProducto);
router.put('/productos/:id', upsertProducto);
router.post('/productos/:id/stock', addStock);
router.post('/consumos', guardarConsumo);
router.post('/importar', guardarImportacion);
router.post('/catalogos/:tipo', crearCatalogo);
router.get('/empleado/:id/retribuciones', getEmpleadoRetribuciones);

export default router;
