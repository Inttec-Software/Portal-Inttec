import { Router } from 'express';
import { getAsistenciaHoy, registrarEntrada, registrarSalida, getHistorial, handleHikvisionWebhook } from './asistencias.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = Router();

// Webhook para eventos de checada automática desde terminal física Hikvision MinMoe (Audición HTTP multipart/json)
router.post('/hikvision', upload.any(), handleHikvisionWebhook);

// Rutas protegidas por JWT para la app móvil / panel web
router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/hoy/:empleado_id', getAsistenciaHoy);
router.post('/entrada', registrarEntrada);
router.put('/salida', registrarSalida);
router.get('/historial/:empleado_id', getHistorial);

export default router;

