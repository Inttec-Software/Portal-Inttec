import { Router } from 'express';
import { getAsistenciaHoy, registrarEntrada, registrarSalida, getHistorial } from './asistencias.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

router.get('/hoy/:empleado_id', getAsistenciaHoy);
router.post('/entrada', registrarEntrada);
router.put('/salida', registrarSalida);
router.get('/historial/:empleado_id', getHistorial);

export default router;
