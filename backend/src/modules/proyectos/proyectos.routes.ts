import { Router } from 'express';
import {
  getProyectos,
  getProyectoById,
  createProyecto,
  updateProyecto,
  getVentasDisponibles,
} from './proyectos.controller';
import { verifyToken } from '../../middlewares/auth.middleware';
import { tenantMiddleware } from '../../middlewares/tenant.middleware';
import { cacheMiddleware, invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

router.use(verifyToken);
router.use(tenantMiddleware);

const proyectosMutate = (_req: any, _res: any, next: any) => {
  invalidateCache('proyectos');
  invalidateCache('reportes');
  next();
};

router.get('/', cacheMiddleware(15), getProyectos);
router.get('/ventas-disponibles', cacheMiddleware(10), getVentasDisponibles);
router.get('/:id', cacheMiddleware(15), getProyectoById);
router.post('/', proyectosMutate, createProyecto);
router.put('/:id', proyectosMutate, updateProyecto);

export default router;
