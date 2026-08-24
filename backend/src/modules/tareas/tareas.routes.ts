import { Router } from 'express';
import { 
  getTareas, 
  getTareaById, 
  getFormLookups, 
  createTarea, 
  updateTarea, 
  addNota 
} from './tareas.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Todas las rutas de tareas requieren autenticación JWT
router.use(verifyToken);

router.get('/form/lookups', getFormLookups);
router.get('/', getTareas);
router.get('/:id', getTareaById);
router.post('/', createTarea);
router.put('/:id', updateTarea);
router.post('/:id/notas', addNota);

export default router;
