import { Router } from 'express';
import { SatController } from './satController';

const router = Router();

// Rutas de consulta rápida del catálogo SAT completo (52,000+ claves y 2,400+ unidades)
router.get('/productos-servicios', SatController.searchProductosServicios);
router.get('/unidades', SatController.searchUnidades);
router.get('/clave/:clave', SatController.getClaveInfo);

export default router;
