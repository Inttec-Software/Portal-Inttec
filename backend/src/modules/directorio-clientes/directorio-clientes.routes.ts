import { Router } from 'express';
import { verifyToken } from '../../middlewares/auth.middleware';
import {
  getDirectorioClientes,
  createDirectorioCliente,
  updateDirectorioCliente,
  deleteDirectorioCliente,
} from './directorio-clientes.controller';

const router = Router();

router.use(verifyToken);

router.get('/', getDirectorioClientes);
router.post('/', createDirectorioCliente);
router.put('/:id', updateDirectorioCliente);
router.delete('/:id', deleteDirectorioCliente);

export default router;
