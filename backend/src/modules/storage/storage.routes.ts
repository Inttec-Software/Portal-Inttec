import { Request, Response, Router } from 'express';
import { uploadMiddleware, uploadFileToStorage } from '../../config/storage';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.post('/', uploadMiddleware.single('file'), async (req: Request, res: Response) => {
  try {
    let buffer, originalname, mimetype;
    const { folder = 'general' } = req.body;

    if (req.file) {
      buffer = req.file.buffer;
      originalname = req.file.originalname;
      mimetype = req.file.mimetype;
    } else if (req.body.fileBase64) {
      let b64 = req.body.fileBase64;
      if (b64.includes(';base64,')) {
        b64 = b64.split(';base64,')[1];
      }
      buffer = Buffer.from(b64, 'base64');
      originalname = req.body.fileName || `upload_${Date.now()}`;
      mimetype = req.body.contentType || 'application/octet-stream';
    } else {
      return res.status(400).json({ error: 'No se envió ningún archivo' });
    }

    const company = (req as any).tenant?.company || 'inttec';
    const targetFolder = `${company}/${folder}`;

    const publicUrl = await uploadFileToStorage(
      buffer,
      originalname,
      targetFolder,
      mimetype,
      req.body.filePath
    );

    res.json({
      success: true,
      url: publicUrl,
      fileName: req.body.filePath || originalname
    });
  } catch (error: any) {
    console.error('[Storage Error]:', error);
    res.status(500).json({ error: 'Error al subir el archivo', details: error.message });
  }
});

export default router;
