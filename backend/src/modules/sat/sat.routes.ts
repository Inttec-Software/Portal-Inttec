import { Router } from 'express';
import { SatController } from './satController';

import facturacionRoutes from './facturacion.routes';

const router = Router();

// Rutas de facturación y timbrado CFDI 4.0 con Finkok
router.use('/', facturacionRoutes);

// Rutas de consulta rápida del catálogo SAT completo (52,000+ claves y 2,400+ unidades)
router.get('/productos-servicios', SatController.searchProductosServicios);
router.get('/unidades', SatController.searchUnidades);
router.get('/clave/:clave', SatController.getClaveInfo);

export default router;
