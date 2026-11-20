import { Router } from 'express';
import {
  getVehiculos,
  createVehiculo,
  updateVehiculo,
  deleteVehiculo,
  getRegistrosGasolina,
  createRegistroGasolina,
  getFlotaGpsLive,
  asignarConductoresDia,
  getGpsConfigController,
  saveGpsConfigController,
  handleGpsWebhook,
  getHistorialRutaVehiculo,
} from './vehiculos.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Webhook público para recibir eventos push de EPCOM GPS / Flespi / Traccar
router.post('/gps/webhook', handleGpsWebhook);

router.use(verifyToken);

// Telemetría GPS en vivo y configuración EPCOM GPS
router.get('/gps/live', getFlotaGpsLive);
router.get('/gps/config', getGpsConfigController);
router.post('/gps/config', saveGpsConfigController);
router.get('/:id/gps/historial', getHistorialRutaVehiculo);
router.put('/:id/asignar-dia', asignarConductoresDia);

// Gasolina logs
router.get('/gasolina', getRegistrosGasolina);
router.post('/gasolina', createRegistroGasolina);

// Vehiculos CRUD
router.get('/', getVehiculos);
router.post('/', createVehiculo);
router.put('/:id', updateVehiculo);
router.delete('/:id', deleteVehiculo);

export default router;
