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

import { processSatSync } from './satSyncWorker';

router.post('/sync-facturas-recibidas', async (req, res) => {
  try {
    const company = (req.headers['x-company'] as string) || 'inttec';
    const env = (req.headers['x-env'] as string) || 'prod';
    const result = await processSatSync(company, env, req.body);
    if ((result as any)?.missingCredentials) {
      return res.status(400).json({ error: (result as any).message });
    }
    return res.json({ data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
