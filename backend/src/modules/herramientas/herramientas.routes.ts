import { Router } from 'express';
import {
  getHerramientas,
  getSiguienteCodigo,
  createHerramienta,
  updateHerramienta,
  deleteHerramienta,
  getKitsEmpleados,
  asignarHerramientaEmpleado,
  desasignarHerramientaEmpleado,
  getKitsVehiculos,
  asignarHerramientaVehiculo,
  desasignarHerramientaVehiculo,
  getChecklists,
  createChecklist,
  getUltimoChecklistVehiculo,
  getTrazabilidadHerramienta,
} from './herramientas.controller';

const router = Router();

// Catálogo Maestro y Trazabilidad
router.get('/', getHerramientas);
router.get('/siguiente-codigo', getSiguienteCodigo);
router.get('/:id/trazabilidad', getTrazabilidadHerramienta);
router.post('/', createHerramienta);
router.put('/:id', updateHerramienta);
router.delete('/:id', deleteHerramienta);

// Kits de Empleados
router.get('/empleados', getKitsEmpleados);
router.post('/empleados/asignar', asignarHerramientaEmpleado);
router.delete('/empleados/:id', desasignarHerramientaEmpleado);

// Kits de Vehículos
router.get('/vehiculos', getKitsVehiculos);
router.post('/vehiculos/asignar', asignarHerramientaVehiculo);
router.delete('/vehiculos/:id', desasignarHerramientaVehiculo);

// Checklists
router.get('/checklists', getChecklists);
router.post('/checklists', createChecklist);
router.get('/checklists/ultimo/:vehiculoId', getUltimoChecklistVehiculo);

export default router;
