import { Request, Response, Router } from 'express';
import { getDbPool } from '../../config/database';

const router = Router();

router.get('/version', async (req: Request, res: Response) => {
  try {
    const pool = getDbPool((req as any).tenant?.company || 'inttec', (req as any).tenant?.env || 'cloud');
    const { rows } = await pool.query('SELECT min_version_code FROM app_settings LIMIT 1');
    res.json(rows.length > 0 ? rows[0] : { min_version_code: 1 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
