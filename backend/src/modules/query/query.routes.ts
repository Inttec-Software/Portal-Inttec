import { Router } from 'express';
import { getSupabaseClient } from '../../config/supabase';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const company = (req.headers['x-query-client'] || req.headers['x-company'] || 'inttec') as 'inttec' | 'daravisa';
    const env = (req.headers['x-env'] || 'cloud') as 'cloud' | 'test';
    
    const client = getSupabaseClient(company, env);
    const { table, action, cols, conditions, payload, limitCount, isSingle, orderCol, orderAsc } = req.body;
    
    let qb = client.from(table);
    qb.action = action || 'select';
    qb.cols = cols || '*';
    qb.conditions = conditions || [];
    qb.payload = payload;
    qb.limitCount = limitCount;
    qb.isSingle = isSingle || false;
    qb.orderCol = orderCol;
    qb.orderAsc = orderAsc;
    
    const { data, error } = await qb;
    if (error) {
      return res.status(400).json({ data: null, error });
    }
    return res.json({ data, error: null });
  } catch (err: any) {
    console.error('Query endpoint error:', err);
    res.status(500).json({ data: null, error: { message: err.message || 'Internal server error' } });
  }
});

export default router;
