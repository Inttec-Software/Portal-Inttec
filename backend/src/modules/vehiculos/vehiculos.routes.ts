import { Router } from 'express';
import { 
  getVehiculos, 
  createVehiculo, 
  updateVehiculo, 
  deleteVehiculo, 
  getRegistrosGasolina, 
  createRegistroGasolina 
} from './vehiculos.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// Gasolina logs
router.get('/gasolina', getRegistrosGasolina);
router.post('/gasolina', createRegistroGasolina);

// Vehiculos CRUD
router.get('/', getVehiculos);
router.post('/', createVehiculo);
router.put('/:id', updateVehiculo);
router.delete('/:id', deleteVehiculo);

export default router;
