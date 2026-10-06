import { Request, Response, Router } from 'express';
import { getDbPool } from '../../config/database';
import { verifyToken } from '../../middlewares/auth.middleware';

const router = Router();

// Endpoint para enviar notificaciones push a través de Expo
router.post('/send-push', verifyToken, async (req: Request, res: Response) => {
  try {
    const { targetUserId, title, body, data } = req.body;

    if (!targetUserId || !title || !body) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (targetUserId, title, body)' });
    }

    const pool = getDbPool((req as any).tenant?.company, (req as any).tenant?.env);

    // Obtener el push token del usuario destino desde la base de datos
    const { rows } = await pool.query(
      'SELECT expo_push_token FROM usuarios WHERE id = $1',
      [targetUserId]
    );

    if (rows.length === 0 || !rows[0].expo_push_token) {
      return res.status(404).json({ error: 'Usuario no encontrado o no tiene push token registrado' });
    }

    const pushToken = rows[0].expo_push_token;

    // Enviar a la API de Expo
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: data || {},
      }),
    });

    const expoResult = await expoResponse.json();

    return res.status(200).json({ success: true, result: expoResult });
  } catch (error: any) {
    console.error('[Push Notification Error]:', error);
    return res.status(500).json({ error: error.message || 'Error al enviar la notificación' });
  }
});

// Obtener notificaciones
router.get('/:usuario_id', verifyToken, async (req: Request, res: Response) => {
  try {
    const pool = getDbPool((req as any).tenant?.company, (req as any).tenant?.env);
    const { rows } = await pool.query(
      'SELECT * FROM notificaciones WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.params.usuario_id]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar como leída
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const pool = getDbPool((req as any).tenant?.company, (req as any).tenant?.env);
    await pool.query(
      'UPDATE notificaciones SET leido = true WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
