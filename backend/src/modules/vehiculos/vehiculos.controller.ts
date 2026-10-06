import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

// Helper for insert queries
const insertInto = async (pool: any, table: string, data: any) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

// Helper for update queries
const updateTable = async (pool: any, table: string, data: any, id: any) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  values.push(id);
  const query = `UPDATE ${table} SET ${setString} WHERE id = $${values.length} RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

// 1. GET /api/vehiculos
export const getVehiculos = async (req: Request, res: Response) => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    const soloActivos = req.query.soloActivos;
    
    let query = 'SELECT * FROM vehiculos';
    if (soloActivos === 'true' || soloActivos === undefined) {
      query += ' WHERE activo = true';
    }
    query += ' ORDER BY marca ASC';
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/vehiculos
export const createVehiculo = async (req: Request, res: Response) => {
  try {
    const { env, company: activeCompany } = (req as any).tenant;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';
    
    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const inserted = await insertInto(primaryPool, 'vehiculos', req.body);

    try {
      // Intentar sincronizar en la secundaria
      const check = await secondaryPool.query('SELECT id FROM vehiculos WHERE id = $1', [inserted.id]);
      if (check.rows.length > 0) {
        await updateTable(secondaryPool, 'vehiculos', req.body, inserted.id);
      } else {
        await insertInto(secondaryPool, 'vehiculos', { ...req.body, id: inserted.id });
      }
    } catch (syncErr: any) {
      console.warn('Error syncing vehiculo to secondary db:', syncErr.message);
    }

    res.status(201).json(inserted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 3. PUT /api/vehiculos/:id
export const updateVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env, company: activeCompany } = (req as any).tenant;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const updated = await updateTable(primaryPool, 'vehiculos', req.body, id);

    try {
      await updateTable(secondaryPool, 'vehiculos', req.body, id);
    } catch (syncErr: any) {
      console.warn('Error updating vehiculo in secondary db:', syncErr.message);
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 4. DELETE /api/vehiculos/:id
export const deleteVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = (req as any).tenant;
    
    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    await Promise.allSettled([
      poolInttec.query('DELETE FROM vehiculos WHERE id = $1', [id]),
      poolDaravisa.query('DELETE FROM vehiculos WHERE id = $1', [id])
    ]);

    res.json({ success: true, message: 'Vehiculo eliminado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 5. GET /api/vehiculos/gasolina
export const getRegistrosGasolina = async (req: Request, res: Response) => {
  try {
    const { env, company } = (req as any).tenant;
    const { vehiculoId, empleadoId, placas } = req.query;

    const inttecPool = getDbPool('inttec', env);
    const daravisaPool = getDbPool('daravisa', env);

    let targetPlacas = placas as string | undefined;

    if (vehiculoId && !targetPlacas) {
      try {
        const primaryPool = getDbPool(company, env);
        const { rows } = await primaryPool.query('SELECT placas FROM vehiculos WHERE id = $1', [vehiculoId]);
        if (rows.length > 0) targetPlacas = rows[0].placas;
      } catch (e) {}
    }

    const fetchFromPool = async (pool: any, empresaNombre: string) => {
      try {
        let query = `
          SELECT rg.*, 
                 v.marca as vehiculo_marca, v.modelo as vehiculo_modelo, v.placas as vehiculo_placas,
                 u.nombre as empleado_nombre
          FROM registro_gasolina rg
          LEFT JOIN vehiculos v ON rg.vehiculo_id = v.id
          LEFT JOIN usuarios u ON rg.empleado_id = u.id
          WHERE 1=1
        `;
        const values: any[] = [];
        if (empleadoId) {
          values.push(empleadoId);
          query += ` AND rg.empleado_id = $${values.length}`;
        }

        const { rows } = await pool.query(query, values);
        return rows.map((row: any) => ({
          ...row,
          empresa_origen: empresaNombre,
        }));
      } catch (err) {
        return [];
      }
    };

    const [inttecLogs, daravisaLogs] = await Promise.all([
      fetchFromPool(inttecPool, 'INTTEC'),
      fetchFromPool(daravisaPool, 'DARAVISA'),
    ]);

    const logMap = new Map<string, any>();
    [...inttecLogs, ...daravisaLogs].forEach(item => {
      if (item && item.id) {
        logMap.set(item.id, item);
      }
    });

    let allLogs = Array.from(logMap.values());

    if (targetPlacas) {
      const cleanTarget = targetPlacas.toLowerCase().trim();
      allLogs = allLogs.filter(item => (item.vehiculo_placas || '').toLowerCase().trim() === cleanTarget);
    }

    allLogs.sort((a, b) => {
      const timeA = new Date(a.fecha || a.created_at).getTime();
      const timeB = new Date(b.fecha || b.created_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.kilometraje_actual || 0) - Number(b.kilometraje_actual || 0);
    });

    for (let i = 0; i < allLogs.length; i++) {
      if (i > 0) {
        const prev = allLogs[i - 1];
        const kmAnterior = Number(prev.kilometraje_actual || 0);
        const kmActual = Number(allLogs[i].kilometraje_actual || 0);
        const litros = Number(allLogs[i].litros || 0);
        const kmRecorridos = Math.max(0, kmActual - kmAnterior);

        allLogs[i].kilometraje_anterior = kmAnterior;
        allLogs[i].distancia_recorrida = kmRecorridos;
        allLogs[i].rendimiento_km_l = litros > 0 && kmRecorridos > 0 ? Number((kmRecorridos / litros).toFixed(2)) : 0;
      } else {
        allLogs[i].kilometraje_anterior = null;
        allLogs[i].distancia_recorrida = 0;
        allLogs[i].rendimiento_km_l = 0;
      }
    }

    res.json(allLogs.reverse());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// 6. POST /api/vehiculos/gasolina
export const createRegistroGasolina = async (req: Request, res: Response) => {
  try {
    const { env, company } = (req as any).tenant;
    const primaryPool = getDbPool(company, env);
    
    const inserted = await insertInto(primaryPool, 'registro_gasolina', req.body);

    if (req.body.vehiculo_id && req.body.kilometraje_actual) {
      try {
        const { rows } = await primaryPool.query('SELECT placas FROM vehiculos WHERE id = $1', [req.body.vehiculo_id]);
        if (rows.length > 0) {
          const placas = rows[0].placas;
          const poolInttec = getDbPool('inttec', env);
          const poolDaravisa = getDbPool('daravisa', env);
          
          await Promise.allSettled([
            poolInttec.query('UPDATE vehiculos SET kilometraje_actual = $1 WHERE placas = $2', [req.body.kilometraje_actual, placas]),
            poolDaravisa.query('UPDATE vehiculos SET kilometraje_actual = $1 WHERE placas = $2', [req.body.kilometraje_actual, placas]),
          ]);
        }
      } catch (err) {
        console.warn('Error syncing km', err);
      }
    }

    res.status(201).json(inserted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
