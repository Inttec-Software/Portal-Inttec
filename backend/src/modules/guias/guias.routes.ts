import { Router } from 'express';
import { verifyToken } from '../../middlewares/auth.middleware';
import {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  listarGuias,
  obtenerGuiaPorId,
  crearGuia,
  actualizarGuia,
  eliminarGuia,
} from './guias.controller';

const router = Router();

router.use(verifyToken);

router.get('/categorias', listarCategorias);
router.post('/categorias', crearCategoria);
router.put('/categorias/:id', actualizarCategoria);
router.delete('/categorias/:id', eliminarCategoria);

router.get('/', listarGuias);
router.get('/:id', obtenerGuiaPorId);
router.post('/', crearGuia);
router.put('/:id', actualizarGuia);
router.delete('/:id', eliminarGuia);

export default router;
