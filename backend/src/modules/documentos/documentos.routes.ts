import { Router } from 'express';
import { obtenerDocumentosAdmin, crearDocumento, obtenerMisDocumentos, obtenerFirmas, registrarFirma, eliminarDocumento, proxyPdf } from './documentos.controller';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/admin', obtenerDocumentosAdmin);
router.post('/', crearDocumento);
router.get('/proxy-pdf', proxyPdf);
router.get('/empleado/:empleadoId', obtenerMisDocumentos);
router.get('/:documentoId/firmas', obtenerFirmas);
router.patch('/firmas/:idAsignacion', registrarFirma);
router.delete('/:id', eliminarDocumento);

export default router;

