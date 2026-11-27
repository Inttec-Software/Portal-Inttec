import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import {
  GASTO_RELATIONS_SELECT_SQL,
  buildProyectoResumenFromGastos,
  formatGasto,
} from '../reportes/gastoHelpers';
import { recalculateVentaTotalsInternal } from '../reportes/reportes.controller';

const PROYECTO_SELECT_SQL = `
  SELECT pr.*,
    (SELECT cl.nombre FROM clientes cl WHERE cl.id = pr.cliente_id) AS cliente_nombre,
    (SELECT sc.nombre FROM sucursales_cliente sc WHERE sc.id = pr.sucursal_id) AS sucursal_nombre,
    (SELECT row_to_json(v_obj) FROM (
      SELECT v.id, v.folio, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto,
             v.factura_referencia, v.precio_total_facturado
      FROM ventas v WHERE v.id = pr.venta_id
    ) v_obj) AS venta_rel
  FROM proyectos pr
`;

export const getVentasDisponibles = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { rows } = await pool.query(`
      SELECT v.id, v.folio, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto,
             v.factura_referencia, v.precio_total_facturado,
             pr.id AS proyecto_vinculado_id,
             pr.nombre AS proyecto_vinculado_nombre
      FROM ventas v
      LEFT JOIN proyectos pr ON pr.venta_id = v.id
      ORDER BY v.fecha DESC NULLS LAST, v.created_at DESC NULLS LAST
      LIMIT 1500
    `);

    return res.json({ ventas: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getProyectos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const statusFilter = String(req.query.status || 'ALL').trim().toUpperCase();
    const params: any[] = [];
    let whereSql = '';

    if (statusFilter === 'ACTIVO' || statusFilter === 'CERRADO') {
      params.push(statusFilter);
      whereSql = 'WHERE pr.status = $1';
    }

    const proyectosRes = await pool.query(
      `${PROYECTO_SELECT_SQL}
       ${whereSql}
       ORDER BY (pr.status = 'ACTIVO') DESC, pr.created_at DESC, pr.nombre ASC`,
      params
    );

    const proyectos = proyectosRes.rows || [];
    if (proyectos.length === 0) {
      return res.json({ proyectos: [] });
    }

    const proyectoIds = proyectos.map((p: any) => p.id);
    const gastosRes = await pool.query(
      `SELECT g.id, g.proyecto_id, g.monto, g.status, g.subcategoria_id, g.subtipo_traslado,
              g.fecha_hospedaje_inicio, g.fecha_hospedaje_fin,
              (SELECT row_to_json(s_obj) FROM (
                SELECT s.id, s.nombre, s.categoria_id,
                       (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
                FROM subcategorias s WHERE s.id = g.subcategoria_id
              ) s_obj) as subcategoria_rel
       FROM gastos g
       WHERE g.proyecto_id = ANY($1::uuid[])`,
      [proyectoIds]
    );

    const gastosPorProyecto = new Map<string, any[]>();
    for (const g of gastosRes.rows || []) {
      const arr = gastosPorProyecto.get(g.proyecto_id) || [];
      arr.push(g);
      gastosPorProyecto.set(g.proyecto_id, arr);
    }

    const proyectosConResumen = proyectos.map((p: any) => {
      const gastosDelProyecto = gastosPorProyecto.get(p.id) || [];
      const resumen = buildProyectoResumenFromGastos(gastosDelProyecto);
      return {
        ...p,
        ...resumen,
      };
    });

    return res.json({ proyectos: proyectosConResumen });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getProyectoById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    const [proyectoRes, gastosRes] = await Promise.all([
      pool.query(`${PROYECTO_SELECT_SQL} WHERE pr.id = $1`, [id]),
      pool.query(
        `SELECT g.*,
                ${GASTO_RELATIONS_SELECT_SQL}
         FROM gastos g
         WHERE g.proyecto_id = $1
         ORDER BY g.created_at DESC`,
        [id]
      ),
    ]);

    const proyecto = proyectoRes.rows[0];
    if (!proyecto) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const gastos = (gastosRes.rows || []).map(formatGasto);
    const resumen = buildProyectoResumenFromGastos(gastos);

    return res.json({
      proyecto: {
        ...proyecto,
        ...resumen,
      },
      resumen,
      gastos,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createProyecto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { nombre, cliente_id, sucursal_id, venta_id, notas, status } = req.body;
    const cleanNombre = typeof nombre === 'string' ? nombre.trim() : '';

    if (!cleanNombre) {
      return res.status(400).json({ error: 'El nombre del proyecto es obligatorio' });
    }

    const cleanStatus = status ? String(status).trim().toUpperCase() : 'ACTIVO';
    if (cleanStatus !== 'ACTIVO' && cleanStatus !== 'CERRADO') {
      return res.status(400).json({ error: 'Estatus inválido. Use ACTIVO o CERRADO' });
    }

    const cleanClienteId = cliente_id && String(cliente_id).trim() ? String(cliente_id).trim() : null;
    const cleanSucursalId = sucursal_id && String(sucursal_id).trim() ? String(sucursal_id).trim() : null;
    const cleanVentaId = venta_id && String(venta_id).trim() ? String(venta_id).trim() : null;
    const cleanNotas = typeof notas === 'string' && notas.trim() ? notas.trim() : null;
    const createdBy = req.user?.id || req.body?.created_by || null;

    if (cleanVentaId) {
      const dupVentaRes = await pool.query(
        'SELECT id, nombre FROM proyectos WHERE venta_id = $1 LIMIT 1',
        [cleanVentaId]
      );
      if (dupVentaRes.rows.length > 0) {
        return res.status(409).json({
          error: `Esta venta ya está vinculada al proyecto "${dupVentaRes.rows[0].nombre}" (relación 1 a 1).`,
        });
      }
    }

    const insertRes = await pool.query(
      `INSERT INTO proyectos (nombre, cliente_id, sucursal_id, venta_id, status, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [cleanNombre, cleanClienteId, cleanSucursalId, cleanVentaId, cleanStatus, cleanNotas, createdBy]
    );

    if (cleanVentaId) {
      try { await recalculateVentaTotalsInternal(pool, cleanVentaId); } catch (_) {}
    }

    const newId = insertRes.rows[0].id;
    const fullRes = await pool.query(`${PROYECTO_SELECT_SQL} WHERE pr.id = $1`, [newId]);
    const proyecto = {
      ...fullRes.rows[0],
      ...buildProyectoResumenFromGastos([]),
    };

    return res.json({ success: true, proyecto });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateProyecto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const existingRes = await pool.query('SELECT id, venta_id FROM proyectos WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    const oldVentaId: string | null = existingRes.rows[0].venta_id || null;

    const updates: string[] = [];
    const values: any[] = [];

    const pushField = (col: string, val: any) => {
      values.push(val);
      updates.push(`${col} = $${values.length}`);
    };

    if (req.body.nombre !== undefined) {
      const cleanNombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
      if (!cleanNombre) {
        return res.status(400).json({ error: 'El nombre del proyecto no puede estar vacío' });
      }
      pushField('nombre', cleanNombre);
    }

    if (req.body.status !== undefined) {
      const cleanStatus = String(req.body.status).trim().toUpperCase();
      if (cleanStatus !== 'ACTIVO' && cleanStatus !== 'CERRADO') {
        return res.status(400).json({ error: 'Estatus inválido. Use ACTIVO o CERRADO' });
      }
      pushField('status', cleanStatus);
    }

    if (req.body.cliente_id !== undefined) {
      pushField('cliente_id', req.body.cliente_id && String(req.body.cliente_id).trim() ? String(req.body.cliente_id).trim() : null);
    }
    if (req.body.sucursal_id !== undefined) {
      pushField('sucursal_id', req.body.sucursal_id && String(req.body.sucursal_id).trim() ? String(req.body.sucursal_id).trim() : null);
    }
    let nextVentaId: string | null = oldVentaId;
    if (req.body.venta_id !== undefined) {
      const cleanVentaId = req.body.venta_id && String(req.body.venta_id).trim() ? String(req.body.venta_id).trim() : null;
      if (cleanVentaId) {
        const dupVentaRes = await pool.query(
          'SELECT id, nombre FROM proyectos WHERE venta_id = $1 AND id != $2 LIMIT 1',
          [cleanVentaId, id]
        );
        if (dupVentaRes.rows.length > 0) {
          return res.status(409).json({
            error: `Esta venta ya está vinculada al proyecto "${dupVentaRes.rows[0].nombre}" (relación 1 a 1).`,
          });
        }
      }
      nextVentaId = cleanVentaId;
      pushField('venta_id', cleanVentaId);
    }
    if (req.body.notas !== undefined) {
      pushField('notas', typeof req.body.notas === 'string' && req.body.notas.trim() ? req.body.notas.trim() : null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = now()');
      values.push(id);
      await pool.query(
        `UPDATE proyectos SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
      );
    }

    if (oldVentaId !== nextVentaId) {
      if (oldVentaId) {
        try { await recalculateVentaTotalsInternal(pool, oldVentaId); } catch (_) {}
      }
      if (nextVentaId) {
        try { await recalculateVentaTotalsInternal(pool, nextVentaId); } catch (_) {}
      }
    }

    const fullRes = await pool.query(`${PROYECTO_SELECT_SQL} WHERE pr.id = $1`, [id]);
    const gastosRes = await pool.query(
      `SELECT g.id, g.proyecto_id, g.monto, g.status, g.subcategoria_id, g.subtipo_traslado,
              g.fecha_hospedaje_inicio, g.fecha_hospedaje_fin,
              (SELECT row_to_json(s_obj) FROM (
                SELECT s.id, s.nombre, s.categoria_id,
                       (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
                FROM subcategorias s WHERE s.id = g.subcategoria_id
              ) s_obj) as subcategoria_rel
       FROM gastos g
       WHERE g.proyecto_id = $1`,
      [id]
    );

    const proyecto = {
      ...fullRes.rows[0],
      ...buildProyectoResumenFromGastos(gastosRes.rows || []),
    };

    return res.json({ success: true, proyecto });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
