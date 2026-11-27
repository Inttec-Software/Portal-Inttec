import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import { KeyedMutex } from '../../utils/mutex';
import {
  GASTO_RELATIONS_SELECT_SQL,
  OPERATIVO_GASTO_SQL,
  formatGasto,
  sanitizeGastoWritePayload,
  syncHospedajeDias,
} from './gastoHelpers';

const gastoCreationMutex = new KeyedMutex();



export const ensureGastosConciliacionSchema = async (_pool?: any): Promise<void> => {
  // No-op intencional: el esquema se gestiona mediante migraciones SQL de base de datos.
  return;
};

export const reconcilePendingInvoicesForPool = async (pool: any): Promise<number> => {
  try {


    // 0. Restaurar gastos aprobados que en versiones anteriores se habían regresado a PENDING por factura detectada
    // para que permanezcan en APPROVED ("Pendientes de entrega") y no regresen a "Gastos pendientes"
    await pool.query(`
      UPDATE gastos
      SET status = 'APPROVED',
          devuelto_por_factura = FALSE
      WHERE status = 'PENDING'
        AND COALESCE(devuelto_por_factura, FALSE) = TRUE
    `);

    // 1. Limpiar sugerencias obsoletas (gastos ya facturados, ya no pendientes de factura, facturas canceladas/ocupadas o fuera de ventana [-15, +25] días)
    await pool.query(`
      UPDATE gastos g
      SET factura_sugerida_id = NULL,
          devuelto_por_factura = CASE WHEN g.facturado = TRUE THEN FALSE ELSE g.devuelto_por_factura END
      WHERE g.factura_sugerida_id IS NOT NULL
        AND (
          g.facturado = TRUE
          OR g.factura_recibida_id IS NOT NULL
          OR UPPER(COALESCE(g.motivo_sin_factura, '')) NOT LIKE '%PENDIENTE%'
          OR NOT EXISTS (
            SELECT 1 FROM facturas_recibidas f
            WHERE f.id = g.factura_sugerida_id
              AND COALESCE(f.estado_sat, 'VIGENTE') != 'CANCELADO'
              AND f.fecha_emision IS NOT NULL
              AND f.fecha_emision::date BETWEEN (COALESCE(g.fecha_comprobante, g.created_at::date) - INTERVAL '15 days')
                                          AND (COALESCE(g.fecha_comprobante, g.created_at::date) + INTERVAL '25 days')
          )
          OR EXISTS (
            SELECT 1 FROM gastos g2
            WHERE g2.id != g.id
              AND g2.factura_recibida_id = g.factura_sugerida_id
          )
        )
    `);

    // 2. Buscar gastos con conciliacion_activa = TRUE y factura pendiente que aún no tengan factura vinculada ni sugerida
    const { rows: candidatos } = await pool.query(`
      SELECT g.id, g.monto, g.status, g.devuelto_por_factura, g.facturas_descartadas_ids,
             COALESCE(g.fecha_comprobante, g.created_at::date) AS fecha_referencia
      FROM gastos g
      WHERE COALESCE(g.conciliacion_activa, FALSE) = TRUE
        AND g.facturado IS NOT TRUE
        AND UPPER(COALESCE(g.motivo_sin_factura, '')) LIKE '%PENDIENTE%'
        AND g.factura_recibida_id IS NULL
        AND g.factura_sugerida_id IS NULL
        AND g.status IN ('APPROVED', 'PENDING')
      ORDER BY g.created_at ASC
    `);

    let matchedCount = 0;

    for (const gasto of candidatos) {
      const monto = Number(gasto.monto) || 0;
      if (monto <= 0) continue;

      const descartadas: string[] = Array.isArray(gasto.facturas_descartadas_ids)
        ? gasto.facturas_descartadas_ids.map(String)
        : [];

      // Buscar facturas recibidas vigentes dentro de la ventana [-15 días, +25 días] respecto a fecha_referencia
      const { rows: facturasMatch } = await pool.query(
        `
        SELECT f.id, f.uuid, f.nombre_emisor, f.rfc_emisor, f.total, f.fecha_emision
        FROM facturas_recibidas f
        WHERE COALESCE(f.estado_sat, 'VIGENTE') != 'CANCELADO'
          AND ABS(COALESCE(f.total, 0) - $1) < 0.009
          AND f.fecha_emision IS NOT NULL
          AND f.fecha_emision::date BETWEEN ($4::date - INTERVAL '15 days') AND ($4::date + INTERVAL '25 days')
          AND NOT (f.id::text = ANY($2::text[]))
          AND NOT EXISTS (
            SELECT 1 FROM gastos g2
            WHERE g2.id != $3
              AND (g2.factura_recibida_id = f.id OR g2.factura_sugerida_id = f.id)
          )
        ORDER BY ABS(f.fecha_emision::date - $4::date) ASC, f.fecha_emision DESC NULLS LAST, f.created_at DESC NULLS LAST
        LIMIT 1
        `,
        [monto, descartadas, gasto.id, gasto.fecha_referencia]
      );

      if (facturasMatch.length > 0) {
        const factura = facturasMatch[0];
        // No regresar gastos APPROVED a PENDING: conservar su status actual (APPROVED o PENDING)
        // y únicamente asociar factura_sugerida_id para que aparezca el atajo en "Pendientes de entrega"
        await pool.query(
          `UPDATE gastos
           SET factura_sugerida_id = $1,
               devuelto_por_factura = FALSE
           WHERE id = $2`,
          [factura.id, gasto.id]
        );
        matchedCount++;
      }
    }

    return matchedCount;
  } catch (err: any) {
    console.warn('[reconcilePendingInvoicesForPool] Error:', err.message);
    return 0;
  }
};

export const getAdminReportes = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);



    const isPaginated = req.query.page !== undefined || (req.query.limit !== undefined && req.query.limit !== 'all');
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string, 10) || 25));
    const offset = (page - 1) * limit;

    const tab = req.query.tab as string; // 'pendientes' | 'por_revisar' | 'operativos' | 'historial' | 'todos'
    const facturaFilter = req.query.facturaFilter as string; // 'TODOS' | 'FACTURADOS' | 'PENDIENTE_ENTREGA' | 'NO_FACTURADOS'
    const pendingFilter = req.query.pendingFilter as string; // 'TODOS' | 'NUEVOS' | 'FACTURA_DETECTADA'
    const tipoGastoFilter = String(req.query.tipo_gasto || '').trim().toUpperCase();
    const proyectoIdFilter = String(req.query.proyecto_id || '').trim();
    const sinProyectoFilter = req.query.sin_proyecto === 'true' || req.query.sin_proyecto === '1';
    const includeActionRequired =
      req.query.includeActionRequired === 'true' ||
      req.query.includeActionRequired === '1' ||
      tab === 'por_revisar';
    const search = (req.query.search as string || '').trim();
    const startDate = (req.query.startDate as string || '').trim();
    const endDate = (req.query.endDate as string || '').trim();
    const skipCatalogs = req.query.skipCatalogs === 'true' || req.query.skipCatalogs === '1';

    if (isPaginated) {
      // 1. Condiciones base para filtros globales (fechas y búsqueda)
      const baseConditions: string[] = [];
      const baseParams: any[] = [];

      if (startDate) {
        baseParams.push(startDate);
        baseConditions.push(`COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) >= $${baseParams.length}`);
      }
      if (endDate) {
        baseParams.push(endDate);
        baseConditions.push(`COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) <= $${baseParams.length}`);
      }

      if (search) {
        baseParams.push(`%${search}%`);
        const pIdx = baseParams.length;

        const numericQuery = search.replace(/[$,\s]/g, '');
        let amountMatchSql = '';
        if (numericQuery && !isNaN(Number(numericQuery))) {
          baseParams.push(`%${numericQuery}%`);
          amountMatchSql = ` OR g.monto::text LIKE $${baseParams.length}`;
        }

        // Búsqueda flexible de UUID (ID del gasto o UUID de factura SAT, con o sin guiones)
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        let cleanMatchSql = '';
        let cleanParamIdx: number | null = null;
        if (cleanSearch.length >= 4) {
          baseParams.push(`%${cleanSearch}%`);
          cleanParamIdx = baseParams.length;
          cleanMatchSql = ` OR replace(g.id::text, '-', '') ILIKE $${cleanParamIdx}`;
        }

        baseConditions.push(`(
          g.id::text ILIKE $${pIdx}
          ${cleanMatchSql} OR
          g.empleado_nombre ILIKE $${pIdx} OR
          g.detalle_servicio_proyecto ILIKE $${pIdx} OR
          g.motivo_sin_factura ILIKE $${pIdx} OR
          EXISTS (SELECT 1 FROM proyectos pr WHERE pr.id = g.proyecto_id AND pr.nombre ILIKE $${pIdx}) OR
          EXISTS (SELECT 1 FROM proveedores p WHERE p.id = g.proveedor_id AND (p.nombre ILIKE $${pIdx} OR p.rfc ILIKE $${pIdx})) OR
          EXISTS (SELECT 1 FROM clientes cl WHERE cl.id = g.cliente_id AND cl.nombre ILIKE $${pIdx}) OR
          EXISTS (SELECT 1 FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id AND sc.nombre ILIKE $${pIdx}) OR
          EXISTS (SELECT 1 FROM subcategorias sub WHERE sub.id = g.subcategoria_id AND sub.nombre ILIKE $${pIdx}) OR
          EXISTS (
            SELECT 1 FROM subcategorias sub 
            JOIN categorias cat ON cat.id = sub.categoria_id 
            WHERE sub.id = g.subcategoria_id AND cat.nombre ILIKE $${pIdx}
          ) OR
          EXISTS (
            SELECT 1 FROM facturas_recibidas fr 
            WHERE (fr.id = g.factura_recibida_id OR fr.id = g.factura_sugerida_id) 
            AND (
              fr.uuid ILIKE $${pIdx}
              ${cleanParamIdx ? `OR replace(fr.uuid, '-', '') ILIKE $${cleanParamIdx}` : ''}
              OR fr.rfc_emisor ILIKE $${pIdx}
              OR fr.nombre_emisor ILIKE $${pIdx}
            )
          )
          ${amountMatchSql}
        )`);
      }

      const baseWhereSql = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

      const OPERATIVO_SQL = OPERATIVO_GASTO_SQL;

      // 2. Condiciones específicas para la vista activa (pestaña, alcance de proyecto/operativo y facturación)
      const viewConditions = [...baseConditions];
      const viewParams = [...baseParams];

      if (tipoGastoFilter === 'PROYECTO') {
        viewConditions.push(`g.tipo_gasto = 'PROYECTO'`);
      } else if (tipoGastoFilter === 'OPERATIVO' || tab === 'operativos') {
        viewConditions.push(OPERATIVO_SQL);
      }

      if (proyectoIdFilter) {
        viewParams.push(proyectoIdFilter);
        viewConditions.push(`g.proyecto_id = $${viewParams.length}`);
      } else if (sinProyectoFilter) {
        viewConditions.push(`g.proyecto_id IS NULL`);
        if (tab === 'historial') {
          viewConditions.push(`NOT ${OPERATIVO_SQL}`);
          viewConditions.push(`(g.tipo_gasto IS NULL OR g.status NOT IN ('PENDING', 'ACTION_REQUIRED'))`);
        }
      }

      const appendFacturaFilter = () => {
        if (facturaFilter === 'FACTURADOS') {
          viewConditions.push(`g.facturado = true`);
        } else if (facturaFilter === 'PENDIENTE_ENTREGA') {
          viewConditions.push(`(g.facturado IS NOT TRUE AND UPPER(COALESCE(g.motivo_sin_factura, '')) LIKE '%PENDIENTE%')`);
        } else if (facturaFilter === 'NO_FACTURADOS') {
          viewConditions.push(`(g.facturado IS NOT TRUE AND (g.motivo_sin_factura IS NULL OR UPPER(COALESCE(g.motivo_sin_factura, '')) NOT LIKE '%PENDIENTE%'))`);
        }
      };

      if (tab === 'pendientes' || tab === 'por_revisar') {
        viewConditions.push(
          tab === 'por_revisar'
            ? `g.status IN ('PENDING', 'ACTION_REQUIRED')`
            : `g.status = 'PENDING'`
        );
        if (pendingFilter === 'FACTURA_DETECTADA') {
          viewConditions.push(`(COALESCE(g.devuelto_por_factura, FALSE) = TRUE OR g.factura_sugerida_id IS NOT NULL)`);
        } else if (pendingFilter === 'NUEVOS') {
          viewConditions.push(`(COALESCE(g.devuelto_por_factura, FALSE) = FALSE AND g.factura_sugerida_id IS NULL)`);
        }
      } else if (tab === 'operativos') {
        appendFacturaFilter();
      } else if (tab === 'historial') {
        viewConditions.push(`g.status IN ('APPROVED', 'REJECTED', 'ACTION_REQUIRED')`);
        appendFacturaFilter();
      }

      const viewWhereSql = viewConditions.length > 0 ? `WHERE ${viewConditions.join(' AND ')}` : '';
      const pendingStatusFilterSql = includeActionRequired
        ? `g.status IN ('PENDING', 'ACTION_REQUIRED')`
        : `g.status = 'PENDING'`;

      // 3. Ejecutar consultas en paralelo
      const queryPromises: Promise<any>[] = [
        // Totales globales según filtros base
        pool.query(`
          SELECT 
            COUNT(*) FILTER (WHERE ${pendingStatusFilterSql}) AS count_pendientes,
            COALESCE(SUM(g.monto) FILTER (WHERE ${pendingStatusFilterSql}), 0) AS total_pendientes,
            COUNT(*) FILTER (WHERE g.status = 'APPROVED') AS count_aprobados,
            COALESCE(SUM(g.monto) FILTER (WHERE g.status = 'APPROVED'), 0) AS total_aprobados,
            COUNT(*) FILTER (WHERE g.status = 'PENDING' AND COALESCE(g.devuelto_por_factura, FALSE) = TRUE) AS count_devueltos_factura,
            COUNT(*) FILTER (WHERE g.status = 'PENDING' AND (COALESCE(g.devuelto_por_factura, FALSE) = TRUE OR g.factura_sugerida_id IS NOT NULL)) AS count_con_factura_detectada
          FROM gastos g
          ${baseWhereSql}
        `, baseParams),

        // Total de registros para la paginación de la vista
        pool.query(`SELECT COUNT(*) AS total_count FROM gastos g ${viewWhereSql}`, viewParams),

        // Gastos paginados
        pool.query(`
          SELECT g.*,
            ${GASTO_RELATIONS_SELECT_SQL}
          FROM gastos g
          ${viewWhereSql}
          ORDER BY COALESCE(g.devuelto_por_factura, FALSE) DESC, (g.factura_sugerida_id IS NOT NULL) DESC, g.created_at DESC
          LIMIT $${viewParams.length + 1} OFFSET $${viewParams.length + 2}
        `, [...viewParams, limit, offset])
      ];

      if (!skipCatalogs) {
        queryPromises.push(
          pool.query('SELECT * FROM usuarios ORDER BY nombre'),
          pool.query('SELECT * FROM vehiculos WHERE activo = true ORDER BY marca'),
          pool.query(`
            SELECT rg.*, 
                   (SELECT row_to_json(v_obj) FROM (SELECT marca, modelo FROM vehiculos v WHERE v.id = rg.vehiculo_id) v_obj) as vehiculos
            FROM registro_gasolina rg
            ORDER BY rg.created_at DESC
            LIMIT 250
          `),
          pool.query('SELECT id, nombre, rfc FROM proveedores ORDER BY nombre')
        );
      }

      const results = await Promise.all(queryPromises);
      const totalsRow = results[0].rows[0] || {};
      const totalCount = parseInt(results[1].rows[0]?.total_count || '0', 10);
      const rawGastos = results[2].rows || [];
      const enrichedGastos = rawGastos.map(formatGasto);

      const usersRes = !skipCatalogs ? results[3] : null;
      const vehiculosRes = !skipCatalogs ? results[4] : null;
      const gasolinaRes = !skipCatalogs ? results[5] : null;
      const provRes = !skipCatalogs ? results[6] : null;

      return res.json({
        gastos: enrichedGastos,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit) || 1,
        },
        totals: {
          totalPendientes: Number(totalsRow.total_pendientes) || 0,
          totalAprobados: Number(totalsRow.total_aprobados) || 0,
          countPendientes: Number(totalsRow.count_pendientes) || 0,
          countAprobados: Number(totalsRow.count_aprobados) || 0,
          countDevueltosFactura: Number(totalsRow.count_devueltos_factura) || 0,
          countConFacturaDetectada: Number(totalsRow.count_con_factura_detectada) || 0,
        },
        ...(skipCatalogs ? {} : {
          usuarios: usersRes?.rows || [],
          vehiculos: vehiculosRes?.rows || [],
          registrosGasolina: gasolinaRes?.rows || [],
          proveedores: provRes?.rows || [],
        })
      });
    }

    // Ruta de compatibilidad no paginada (si se llama sin page ni limit)
    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    let limitSql = '';
    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      limitSql = `LIMIT ${limitQuery}`;
    }

    const [gastosRes, usersRes, vehiculosRes, gasolinaRes, provRes] = await Promise.all([
      pool.query(`
        SELECT g.*,
          ${GASTO_RELATIONS_SELECT_SQL}
        FROM gastos g
        ORDER BY g.created_at DESC
        ${limitSql}
      `),
      pool.query('SELECT * FROM usuarios ORDER BY nombre'),
      pool.query('SELECT * FROM vehiculos WHERE activo = true ORDER BY marca'),
      pool.query(`
        SELECT rg.*, 
               (SELECT row_to_json(v_obj) FROM (SELECT marca, modelo FROM vehiculos v WHERE v.id = rg.vehiculo_id) v_obj) as vehiculos
        FROM registro_gasolina rg
        ORDER BY rg.created_at DESC
        LIMIT 250
      `),
      pool.query('SELECT id, nombre, rfc FROM proveedores ORDER BY nombre')
    ]);

    let rawGastos = gastosRes.rows || [];
    const enrichedGastos = rawGastos.map(formatGasto);

    return res.json({
      gastos: enrichedGastos,
      usuarios: usersRes.rows || [],
      vehiculos: vehiculosRes.rows || [],
      registrosGasolina: gasolinaRes.rows || [],
      proveedores: provRes.rows || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getEmpleadoGastos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    


    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const limitQuery = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    let limitSql = '';
    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      limitSql = `LIMIT ${limitQuery}`;
    }

    const gastosRes = await pool.query(`
        SELECT g.*,
          ${GASTO_RELATIONS_SELECT_SQL}
        FROM gastos g
        WHERE g.empleado_id = $1
        ORDER BY g.created_at DESC
        ${limitSql}
    `, [userId]);

    const rawGastos = gastosRes.rows || [];
    const gastosEnriquecidos = rawGastos.map((g: any) => {
      const formatted = formatGasto(g);
      // Si el gasto fue devuelto temporalmente al Admin por detección de factura recibida,
      // mantenerlo como APPROVED en la vista del empleado para que siga en su Historial
      if (g.devuelto_por_factura && g.status === 'PENDING') {
        formatted.status = 'APPROVED';
      }
      return formatted;
    });

    return res.json({ gastos: gastosEnriquecidos });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getGastoById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);



    const { id } = req.params;

    const gastosRes = await pool.query(`
        SELECT g.*,
          ${GASTO_RELATIONS_SELECT_SQL}
        FROM gastos g
        WHERE g.id = $1
    `, [id]);

    const data = gastosRes.rows[0];

    const formatted = data ? formatGasto(data) : null;
    return res.json({ gasto: formatted });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGastoStatus = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);



    const { id } = req.params;
    const { status, payload, actor_id, monto, force_unlink_venta } = req.body;

    const oldGastoRes = await pool.query(
      'SELECT venta_id, factura_sugerida_id, devuelto_por_factura, facturado FROM gastos WHERE id = $1',
      [id]
    );
    const oldGasto = oldGastoRes.rows[0];

    if (payload && Object.keys(payload).length > 0) {
      const finalPayload: any = sanitizeGastoWritePayload(payload);

      // Regla de negocio: NUNCA desvincular venta_id al devolver a PENDING o ACTION_REQUIRED
      // (a menos que sea REJECTED o se pida explícitamente force_unlink_venta)
      if (status !== 'REJECTED' && finalPayload.venta_id === null && !force_unlink_venta) {
        delete finalPayload.venta_id;
      }

      if (status === 'APPROVED') {
        finalPayload.devuelto_por_factura = false;
        finalPayload.factura_sugerida_id = null;
        if ((finalPayload.facturado === true || oldGasto?.facturado === true) && oldGasto?.factura_sugerida_id && !finalPayload.factura_recibida_id) {
          finalPayload.factura_recibida_id = oldGasto.factura_sugerida_id;
        }
      }

      const keys = Object.keys(finalPayload);
      const values = Object.values(finalPayload);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      
      await pool.query(`UPDATE gastos SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);

      // Recalcular totales de venta si el gasto estaba o quedó vinculado a una venta
      const targetVentaId = finalPayload.venta_id !== undefined ? finalPayload.venta_id : oldGasto?.venta_id;
      if (oldGasto?.venta_id && oldGasto.venta_id !== targetVentaId) {
        try { await recalculateVentaTotalsInternal(pool, oldGasto.venta_id); } catch (_) {}
      }
      if (targetVentaId) {
        try { await recalculateVentaTotalsInternal(pool, targetVentaId); } catch (_) {}
      }
    }

    let actionName = 'UPDATE';
    if (status === 'APPROVED') actionName = 'APPROVE';
    else if (status === 'REJECTED') actionName = 'REJECT';
    else if (status === 'PENDING') actionName = 'UPDATE';

    const details = req.body.audit_details || (status === 'PENDING'
      ? `Gasto por ${monto} devuelto a revisión por Admin.`
      : `Gasto por ${monto} revisado por Admin. Estado final: ${status}`);

    try {
      await pool.query(
        `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)`,
        [actionName, actor_id, id, details]
      );
    } catch (auditErr: any) {
      console.warn('[updateGastoStatus] Error en audit_logs insert:', auditErr.message);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSalesForLinking = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const limitQuery = req.query.limit !== undefined
      ? parseInt(req.query.limit as string, 10)
      : 5000;

    let limitSql = '';
    if (limitQuery && !isNaN(limitQuery) && limitQuery > 0) {
      limitSql = `LIMIT ${limitQuery}`;
    }

    const [ventasRes, cliRes, sucRes] = await Promise.all([
      pool.query(`SELECT * FROM ventas ORDER BY fecha DESC ${limitSql}`),
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre'),
    ]);

    return res.json({
      ventas: ventasRes.rows || [],
      clientes: cliRes.rows || [],
      sucursales: sucRes.rows || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getExportData = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { type } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    if (type === 'asistencias') {
      let query = 'SELECT * FROM asistencias';
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (req.query.empleado_id) {
        params.push(req.query.empleado_id);
        conditions.push(`empleado_id = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate);
        conditions.push(`fecha >= $${params.length}`);
      }
      if (endDate) {
        params.push(endDate);
        conditions.push(`fecha <= $${params.length}`);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY fecha DESC, creado_en ASC';
      
      const { rows } = await pool.query(query, params);
      const cleanRows = (rows || []).map((r: any) => ({
        ...r,
        fecha: r.fecha ? (typeof r.fecha === 'object' && r.fecha.toISOString ? r.fecha.toISOString().split('T')[0] : String(r.fecha).split('T')[0]) : r.fecha
      }));
      return res.json(cleanRows);
    } else if (type === 'inventario') {
      const [prodRes, catRes] = await Promise.all([
        pool.query('SELECT * FROM productos ORDER BY nombre_oficial'),
        pool.query('SELECT * FROM categorias_productos ORDER BY nombre'),
      ]);
      return res.json({ productos: prodRes.rows || [], categorias: catRes.rows || [] });
    } else if (type === 'consumos') {
      let query = `
        SELECT m.*, 
               (SELECT row_to_json(p_obj) FROM (SELECT nombre_oficial, sku_interno, precio_unitario FROM productos p WHERE p.id = m.producto_id) p_obj) as producto
        FROM movimientos_inventario m
        WHERE m.tipo = 'SALIDA'
      `;
      const params: any[] = [];
      if (startDate) {
        params.push(`${startDate}T00:00:00`);
        query += ` AND m.fecha >= $${params.length}`;
      }
      if (endDate) {
        params.push(`${endDate}T23:59:59.999Z`);
        query += ` AND m.fecha <= $${params.length}`;
      }
      query += ' ORDER BY m.fecha DESC';
      
      const [movRes, userRes] = await Promise.all([
        pool.query(query, params),
        pool.query('SELECT id, nombre, email FROM usuarios')
      ]);
      
      const userMap = new Map((userRes.rows || []).map((u: any) => [u.id, u]));
      const dataWithUsers = (movRes.rows || []).map((m: any) => {
        const u = userMap.get(m.creado_por || m.empleado_id);
        const uName = u?.nombre || m.empleado_nombre || m.usuario_nombre || 'No especificado / Almacén';
        return {
          ...m,
          usuario: u || null,
          usuario_nombre: uName,
          empleado_nombre: uName,
          producto_sku: m.producto?.sku_interno || m.producto_sku || '-',
          producto_nombre: m.producto?.nombre_oficial || m.producto_nombre || 'Producto',
          costo_total: m.costo_total !== undefined ? m.costo_total : ((Number(m.cantidad || 0) * Number(m.producto?.precio_unitario || 0)) || 0)
        };
      });
      return res.json(dataWithUsers);
    } else if (type === 'ventas') {
      let query = 'SELECT * FROM ventas';
      const params: any[] = [];
      const conditions: string[] = [];
      if (startDate) {
        params.push(startDate);
        conditions.push(`fecha >= $${params.length}`);
      }
      if (endDate) {
        params.push(endDate);
        conditions.push(`fecha <= $${params.length}`);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY fecha DESC';
      
      const [ventasRes, usersRes, gastosRes] = await Promise.all([
        pool.query(query, params),
        pool.query('SELECT id, nombre, email FROM usuarios'),
        pool.query('SELECT id, venta_id, monto, status FROM gastos')
      ]);
      
      const userMap = new Map((usersRes.rows || []).map((u: any) => [u.id, u]));

      // Mapear sumatoria de gastos vinculados por cada venta
      const gastosMap = new Map<string, { total: number; count: number }>();
      (gastosRes.rows || []).forEach((g: any) => {
        const st = String(g.status || '').toUpperCase();
        if (!g.venta_id || st === 'RECHAZADO' || st === 'REJECTED') return;
        const current = gastosMap.get(g.venta_id) || { total: 0, count: 0 };
        current.total += Number(g.monto) || 0;
        current.count += 1;
        gastosMap.set(g.venta_id, current);
      });
      
      const mappedData = (ventasRes.rows || []).map((v: any) => {
        const usuario = userMap.get(v.registrado_por);
        const gastoInfo = gastosMap.get(v.id) || { total: 0, count: 0 };
        const precioFacturado = Number(v.precio_total_facturado) || Number(v.total) || 0;
        const costoPartidas = Number(v.costo_total) || 0;
        const gastosVinculados = gastoInfo.total;
        const costoTotalReal = costoPartidas + gastosVinculados;
        const utilidadReal = precioFacturado - costoTotalReal;
        const margenRealPorcentual = precioFacturado > 0 ? (utilidadReal / precioFacturado) : 0;

        return {
          ...v,
          cliente_nombre: v.cliente,
          vendedor_nombre: usuario?.nombre || usuario?.email || 'Desconocido',
          estatus: v.estado_pago || v.cfdi_estado || 'PENDIENTE',
          total: precioFacturado,
          gastos_vinculados_total: gastosVinculados,
          gastos_vinculados_count: gastoInfo.count,
          costo_total_real: costoTotalReal,
          utilidad_real: utilidadReal,
          margen_real_porcentual: margenRealPorcentual,
        };
      });
      
      return res.json(mappedData);
    } else if (type === 'gastos') {
      const scope = String(req.query.scope || 'ALL').trim().toUpperCase();
      const proyectoId = String(req.query.proyecto_id || '').trim();
      const includeRejected = req.query.includeRejected !== 'false' && req.query.includeRejected !== '0';

      let query = `
        SELECT g.*,
          ${GASTO_RELATIONS_SELECT_SQL}
        FROM gastos g
      `;
      const params: any[] = [];
      const conditions: string[] = [];
      if (startDate) {
        params.push(startDate);
        conditions.push(`COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) >= $${params.length}`);
      }
      if (endDate) {
        params.push(endDate);
        conditions.push(`COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) <= $${params.length}`);
      }
      if (!includeRejected) {
        conditions.push(`COALESCE(g.status, '') != 'REJECTED'`);
      }
      if (scope === 'PROYECTO' && proyectoId) {
        params.push(proyectoId);
        conditions.push(`g.proyecto_id = $${params.length}`);
      } else if (scope === 'PROYECTOS') {
        conditions.push(`(g.proyecto_id IS NOT NULL OR COALESCE(g.tipo_gasto, '') = 'PROYECTO')`);
      } else if (scope === 'OPERATIVOS') {
        conditions.push(OPERATIVO_GASTO_SQL);
      } else if (scope === 'HISTORICO') {
        conditions.push(`g.status IN ('APPROVED', 'REJECTED', 'ACTION_REQUIRED')`);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY COALESCE(g.fecha_comprobante::text, substring(g.created_at::text, 1, 10)) DESC, g.created_at DESC';
      
      const { rows } = await pool.query(query, params);
      return res.json((rows || []).map(formatGasto));
    }

    return res.status(400).json({ error: 'Tipo de exportación inválido' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGasto = async (req: Request, res: Response) => {
  const tenant = (req as any).tenant;
  if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
  const { company, env } = tenant;
  const pool = getDbPool(company, env);

  const client = await pool.connect();
  let inTx = false;

  try {
    const { id } = req.params;
    const { updatePayload, gasolinaPayload, ...restPayload } = req.body;

    const payload: any = sanitizeGastoWritePayload(updatePayload || restPayload);

    if (payload.estado_reembolso !== undefined) {
      const userRole = req.user?.rol || req.user?.role;
      if (userRole && userRole !== 'ADMIN' && userRole !== 'DEV') {
        return res.status(403).json({ error: 'Solo administradores pueden modificar el estado de reembolso' });
      }
    }

    // Get old gasto to see if it's linked to a sale, has a suggested invoice, or has hospedaje dates
    const oldGastoRes = await client.query(
      `SELECT venta_id, factura_sugerida_id, devuelto_por_factura, facturado, motivo_sin_factura,
              monto, fecha_hospedaje_inicio, fecha_hospedaje_fin
       FROM gastos WHERE id = $1`,
      [id]
    );
    const oldGasto = oldGastoRes.rows[0];
    if (!oldGasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    // Si el gasto se marca con factura pendiente a partir de ahora, activar conciliación
    if (
      payload.motivo_sin_factura &&
      String(payload.motivo_sin_factura).toUpperCase().includes('PENDIENTE') &&
      payload.facturado !== true
    ) {
      payload.conciliacion_activa = true;
    }

    // Si se adjunta factura manualmente al gasto, limpiar sugerencia pendiente y vincular factura_recibida_id si existía sugerencia
    if (payload.facturado === true) {
      if (oldGasto?.factura_sugerida_id && payload.factura_recibida_id === undefined) {
        payload.factura_recibida_id = oldGasto.factura_sugerida_id;
      }
      payload.factura_sugerida_id = null;
    }

    await client.query('BEGIN');
    inTx = true;

    if (payload && Object.keys(payload).length > 0) {
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      await client.query(`UPDATE gastos SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);
    }

    // Recalcular desglose de hospedaje si cambiaron las fechas o el monto de un gasto de hospedaje
    const touchesHospedaje =
      payload.fecha_hospedaje_inicio !== undefined ||
      payload.fecha_hospedaje_fin !== undefined ||
      (payload.monto !== undefined && oldGasto.fecha_hospedaje_inicio && oldGasto.fecha_hospedaje_fin);

    if (touchesHospedaje) {
      const effectiveInicio =
        payload.fecha_hospedaje_inicio !== undefined
          ? payload.fecha_hospedaje_inicio
          : oldGasto.fecha_hospedaje_inicio;
      const effectiveFin =
        payload.fecha_hospedaje_fin !== undefined
          ? payload.fecha_hospedaje_fin
          : oldGasto.fecha_hospedaje_fin;
      const effectiveMonto =
        payload.monto !== undefined ? Number(payload.monto) : Number(oldGasto.monto || 0);

      if ((effectiveInicio && !effectiveFin) || (!effectiveInicio && effectiveFin)) {
        await client.query('ROLLBACK');
        inTx = false;
        return res.status(400).json({ error: 'Para hospedaje debes enviar tanto fecha_hospedaje_inicio como fecha_hospedaje_fin.' });
      }

      await syncHospedajeDias(client, id as string, effectiveInicio, effectiveFin, effectiveMonto);
    }

    if (gasolinaPayload) {
      if (gasolinaPayload.action === 'upsert') {
        const gasKeys = Object.keys(gasolinaPayload.data);
        const gasValues = Object.values(gasolinaPayload.data);
        gasKeys.push('gasto_id');
        gasValues.push(id);

        const placeholders = gasKeys.map((_, i) => `$${i + 1}`).join(', ');
        const updates = gasKeys.map((k) => `${k} = EXCLUDED.${k}`).join(', ');

        await client.query(
          `INSERT INTO registro_gasolina (${gasKeys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (gasto_id) DO UPDATE SET ${updates}`,
          gasValues
        );
      } else if (gasolinaPayload.action === 'delete') {
        await client.query('DELETE FROM registro_gasolina WHERE gasto_id = $1', [id]);
      }
    }

    await client.query('COMMIT');
    inTx = false;

    if (payload.venta_id !== undefined && payload.venta_id !== oldGasto?.venta_id) {
      if (oldGasto && oldGasto.venta_id) {
        await recalculateVentaTotalsInternal(pool, oldGasto.venta_id);
      }
      if (payload.venta_id) {
        await recalculateVentaTotalsInternal(pool, payload.venta_id);
      }
    } else if (oldGasto && oldGasto.venta_id) {
      await recalculateVentaTotalsInternal(pool, oldGasto.venta_id);
    }

    // Disparar conciliación inmediata si el gasto quedó con factura pendiente
    const isNowPendiente =
      payload.facturado !== true &&
      (
        String(payload.motivo_sin_factura ?? oldGasto.motivo_sin_factura ?? '').toUpperCase().includes('PENDIENTE')
      );
    if (isNowPendiente) {
      await reconcilePendingInvoicesForPool(pool);
    }

    return res.json({ success: true });
  } catch (error: any) {
    if (inTx) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    const isValidationError = error.message?.includes('Fecha') || error.message?.includes('hospedaje');
    return res.status(isValidationError ? 400 : 500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const assignGastoProyecto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { proyecto_id, tipo_gasto, actor_id } = req.body;

    const gastoRes = await pool.query('SELECT id, proyecto_id, tipo_gasto, justificacion, detalle_servicio_proyecto FROM gastos WHERE id = $1', [id]);
    const gasto = gastoRes.rows[0];
    if (!gasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const newProyectoId =
      proyecto_id && typeof proyecto_id === 'string' && proyecto_id.trim()
        ? proyecto_id.trim()
        : null;

    let newTipoGasto: 'PROYECTO' | 'OPERATIVO' | null = null;
    if (tipo_gasto !== undefined && tipo_gasto !== null && String(tipo_gasto).trim() !== '') {
      const normalizedTipo = String(tipo_gasto).trim().toUpperCase();
      if (normalizedTipo !== 'PROYECTO' && normalizedTipo !== 'OPERATIVO') {
        return res.status(400).json({ error: 'tipo_gasto inválido. Use PROYECTO u OPERATIVO' });
      }
      newTipoGasto = normalizedTipo;
    } else if (newProyectoId) {
      newTipoGasto = 'PROYECTO';
    }

    let proyectoInfo: any = null;
    if (newProyectoId) {
      const prRes = await pool.query('SELECT id, nombre FROM proyectos WHERE id = $1', [newProyectoId]);
      if (prRes.rows.length === 0) {
        return res.status(404).json({ error: 'El proyecto seleccionado no existe' });
      }
      proyectoInfo = prRes.rows[0];
      if (!newTipoGasto) newTipoGasto = 'PROYECTO';
    }

    const cleanedJust =
      newProyectoId || newTipoGasto === 'OPERATIVO'
        ? String(gasto.justificacion || '').replace(/\[Proyecto a agregar:\s*[^\]]+\]\s*\n*/gi, '').trim()
        : gasto.justificacion;
    const updatedDetalle = proyectoInfo?.nombre || gasto.detalle_servicio_proyecto || null;

    await pool.query(
      'UPDATE gastos SET proyecto_id = $1, tipo_gasto = $2, justificacion = $3, detalle_servicio_proyecto = $4 WHERE id = $5',
      [newProyectoId, newTipoGasto, cleanedJust, updatedDetalle, id]
    );

    try {
      const actor = req.user?.id || actor_id || null;
      const details = newProyectoId
        ? `Gasto asignado al proyecto "${proyectoInfo?.nombre || newProyectoId}".`
        : newTipoGasto === 'OPERATIVO'
          ? 'Gasto clasificado como Operativo / General (sin proyecto).'
          : 'Gasto desasignado de proyecto.';
      await pool.query(
        'INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)',
        ['UPDATE', actor, id, details]
      );
    } catch (auditErr: any) {
      console.warn('[assignGastoProyecto] Error en audit log:', auditErr.message);
    }

    const updatedRes = await pool.query(
      `SELECT g.*,
        ${GASTO_RELATIONS_SELECT_SQL}
       FROM gastos g
       WHERE g.id = $1`,
      [id]
    );

    return res.json({
      success: true,
      gasto: updatedRes.rows[0] ? formatGasto(updatedRes.rows[0]) : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const relinkGastoVenta = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { venta_id, actor_id } = req.body;
    const newVentaId = (venta_id && typeof venta_id === 'string' && venta_id.trim()) ? venta_id.trim() : null;

    // Obtener el gasto actual
    const gastoRes = await pool.query('SELECT id, venta_id, monto, status FROM gastos WHERE id = $1', [id]);
    const gasto = gastoRes.rows[0];

    if (!gasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const oldVentaId = gasto.venta_id;

    if (oldVentaId === newVentaId) {
      return res.json({ 
        success: true, 
        message: newVentaId ? 'El gasto ya está vinculado a esa venta' : 'El gasto ya se encuentra desvinculado',
        old_venta_id: oldVentaId,
        new_venta_id: newVentaId,
      });
    }

    let targetVenta: any = null;
    if (newVentaId) {
      const vDataRes = await pool.query('SELECT id, cliente, fecha, sucursal, tipo_proyecto, factura_referencia, precio_total_facturado FROM ventas WHERE id = $1', [newVentaId]);
      const vData = vDataRes.rows[0];
      if (!vData) {
        return res.status(404).json({ error: 'La venta seleccionada no existe' });
      }
      targetVenta = vData;
    }

    // Actualizar el venta_id del gasto
    await pool.query('UPDATE gastos SET venta_id = $1 WHERE id = $2', [newVentaId, id]);

    // Recalcular venta anterior si existía
    if (oldVentaId) {
      try {
        await recalculateVentaTotalsInternal(pool, oldVentaId);
      } catch (e: any) {
        console.warn(`[relinkGastoVenta] Error recalculando venta previa ${oldVentaId}:`, e.message);
      }
    }

    // Recalcular nueva venta asignada
    if (newVentaId) {
      try {
        await recalculateVentaTotalsInternal(pool, newVentaId);
      } catch (e: any) {
        console.warn(`[relinkGastoVenta] Error recalculando nueva venta ${newVentaId}:`, e.message);
      }
    }

    // Auditoría
    const actor = req.user?.id || actor_id;
    const details = newVentaId
      ? (oldVentaId 
          ? `Gasto reasignado de la venta ${oldVentaId} a la venta ${newVentaId} (${targetVenta?.cliente || ''}).` 
          : `Gasto vinculado a la venta ${newVentaId} (${targetVenta?.cliente || ''}).`)
      : `Gasto desvinculado de la venta ${oldVentaId}.`;

    try {
      await pool.query(
        'INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)',
        ['UPDATE', actor, id, details]
      );
    } catch (auditErr: any) {
      console.warn('[relinkGastoVenta] Error en audit log:', auditErr.message);
    }

    return res.json({
      success: true,
      old_venta_id: oldVentaId,
      new_venta_id: newVentaId,
      venta_rel: targetVenta,
      message: newVentaId ? 'Gasto vinculado correctamente' : 'Gasto desvinculado correctamente',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const recalculateVentaTotalsInternal = async (pool: any, id: string) => {
  await ensureGastosConciliacionSchema(pool);

  const ventaRes = await pool.query('SELECT precio_total_facturado FROM ventas WHERE id = $1', [id]);
  const venta = ventaRes.rows[0];
  if (!venta) throw new Error('Sale not found');

  const partidasRes = await pool.query('SELECT costo_total_proveedor FROM ventas_partidas WHERE venta_id = $1', [id]);
  const partidas = partidasRes.rows;

  const costoPartidas = (partidas || []).reduce((sum: number, p: any) => sum + (Number(p.costo_total_proveedor) || 0), 0);

  // Incluir gastos APPROVED y también aquellos temporalmente en PENDING porque fueron devueltos por detección de factura
  const gastosRes = await pool.query(
    `SELECT monto FROM gastos WHERE venta_id = $1 AND (status = 'APPROVED' OR (status = 'PENDING' AND COALESCE(devuelto_por_factura, FALSE) = TRUE))`,
    [id]
  );
  const gastos = gastosRes.rows;

  const costoGastos = (gastos || []).reduce((sum: number, g: any) => sum + (Number(g.monto) || 0), 0);

  const costoTotal = Math.round((costoPartidas + costoGastos) * 100) / 100;
  const precioTotal = Number(venta.precio_total_facturado) || 0;
  const utilidadBruta = Math.round((precioTotal - costoTotal) * 100) / 100;
  const margenPorcentual = precioTotal > 0 ? Math.round((utilidadBruta / precioTotal) * 10000) / 10000 : 0;

  await pool.query(
    'UPDATE ventas SET costo_total = $1, utilidad_bruta = $2, margen_porcentual = $3 WHERE id = $4',
    [costoTotal, utilidadBruta, margenPorcentual, id]
  );
  
  return { costoTotal, utilidadBruta, margenPorcentual };
};

export const recalculateVentaTotals = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const result = await recalculateVentaTotalsInternal(pool, id as string);
    
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;

    await pool.query('DELETE FROM gastos WHERE id = $1', [id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const saveQuickSale = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { ventaPayload, partidasPayload } = req.body;

    const vKeys = Object.keys(ventaPayload);
    const vValues = Object.values(ventaPayload);
    const vPlaceholders = vKeys.map((_, i) => `$${i + 1}`).join(', ');

    const ventaRes = await pool.query(
      `INSERT INTO ventas (${vKeys.join(', ')}) VALUES (${vPlaceholders}) RETURNING *`,
      vValues
    );
    const ventaData = ventaRes.rows[0];

    if (partidasPayload && partidasPayload.length > 0) {
      for (const p of partidasPayload) {
        const pKeys = Object.keys(p);
        pKeys.push('venta_id');
        const pValues = Object.values(p);
        pValues.push(ventaData.id);
        const pPlaceholders = pKeys.map((_, i) => `$${i + 1}`).join(', ');
        
        await pool.query(
          `INSERT INTO ventas_partidas (${pKeys.join(', ')}) VALUES (${pPlaceholders})`,
          pValues
        );
      }
    }

    return res.json({ success: true, ventaId: ventaData.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getFormCatalogs = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const [catRes, subRes, cliRes, usersRes, sucRes, provRes, vehRes, proyectosRes] = await Promise.all([
      pool.query('SELECT * FROM categorias ORDER BY nombre'),
      pool.query('SELECT * FROM subcategorias ORDER BY nombre'),
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT * FROM usuarios ORDER BY nombre'),
      pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre'),
      pool.query('SELECT * FROM proveedores ORDER BY nombre'),
      pool.query('SELECT * FROM vehiculos WHERE activo = true ORDER BY marca ASC'),
      pool.query(`
        SELECT pr.id, pr.nombre, pr.cliente_id, pr.sucursal_id, pr.venta_id, pr.status, pr.notas, pr.created_at,
               (SELECT cl.nombre FROM clientes cl WHERE cl.id = pr.cliente_id) AS cliente_nombre,
               (SELECT sc.nombre FROM sucursales_cliente sc WHERE sc.id = pr.sucursal_id) AS sucursal_nombre
        FROM proyectos pr
        WHERE pr.status = 'ACTIVO'
        ORDER BY pr.created_at DESC, pr.nombre ASC
      `),
    ]);

    return res.json({
      categorias: catRes.rows || [],
      subcategorias: subRes.rows || [],
      clientes: cliRes.rows || [],
      usuarios: usersRes.rows || [],
      sucursales: sucRes.rows || [],
      proveedores: provRes.rows || [],
      vehiculos: vehRes.rows || [],
      proyectos: proyectosRes.rows || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createGastos = async (req: Request, res: Response) => {
  const tenant = (req as any).tenant;
  if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
  const { company, env } = tenant;
  const pool = getDbPool(company, env);

  const { payloadsToInsert, gasolinaPayload, createNotifications, employeeName, totalGasto, categoriaNombre, allow_duplicate, ...singleGastoBody } = req.body;

  // Soportar tanto arreglo payloadsToInsert (formulario) como objeto directo (sync offline)
  const listToInsert: any[] = Array.isArray(payloadsToInsert) && payloadsToInsert.length > 0
    ? payloadsToInsert
    : (singleGastoBody && singleGastoBody.monto !== undefined ? [singleGastoBody] : []);

  const employeeId = req.user?.id || listToInsert[0]?.empleado_id || 'anonymous';
  const mutexKey = `${company}_${env}_${employeeId}`;

  return await gastoCreationMutex.runExclusive(mutexKey, async () => {
    const client = await pool.connect();
    let inTx = false;

    try {
      await client.query('BEGIN');
      inTx = true;

      const insertedGastos = [];
      if (listToInsert.length > 0) {
        for (const rawPayload of listToInsert) {
          const cleanPayload = sanitizeGastoWritePayload(rawPayload);
          if (cleanPayload.proyecto_id && !cleanPayload.tipo_gasto) {
            cleanPayload.tipo_gasto = 'PROYECTO';
          }
          if (
            (cleanPayload.fecha_hospedaje_inicio && !cleanPayload.fecha_hospedaje_fin) ||
            (!cleanPayload.fecha_hospedaje_inicio && cleanPayload.fecha_hospedaje_fin)
          ) {
            await client.query('ROLLBACK');
            inTx = false;
            return res.status(400).json({ error: 'Para hospedaje debes enviar tanto fecha_hospedaje_inicio como fecha_hospedaje_fin.' });
          }

          // Bloqueo estricto de duplicados idénticos en la última hora
          if (!allow_duplicate && cleanPayload.empleado_id && cleanPayload.monto && cleanPayload.fecha_comprobante) {
            const dupCheckSql = `
              SELECT id, created_at, monto FROM gastos
              WHERE empleado_id = $1::uuid
                AND ABS(monto - $2) < 0.01
                AND fecha_comprobante = $3::date
                AND created_at >= NOW() - INTERVAL '1 hour'
                AND status != 'REJECTED'
                AND COALESCE(subcategoria_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                AND COALESCE(proveedor_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                AND LOWER(TRIM(COALESCE(justificacion, ''))) = LOWER(TRIM(COALESCE($6::text, '')))
              LIMIT 1
            `;
            const dupRes = await client.query(dupCheckSql, [
              cleanPayload.empleado_id,
              cleanPayload.monto,
              cleanPayload.fecha_comprobante,
              cleanPayload.subcategoria_id || null,
              cleanPayload.proveedor_id || null,
              cleanPayload.justificacion || '',
            ]);

            if (dupRes.rows.length > 0) {
              await client.query('ROLLBACK');
              inTx = false;
              return res.status(409).json({
                error: `Ya existe un gasto idéntico registrado en la última hora para este empleado ($${Number(cleanPayload.monto).toFixed(2)}). Se ha bloqueado el registro para evitar duplicados.`,
                duplicate: true,
                existingGastoId: dupRes.rows[0].id,
              });
            }
          }

          const payload: any = {
            ...cleanPayload,
            // Regla de corte: Todo gasto creado a partir de ahora tiene conciliacion_activa = true
            conciliacion_activa: true,
          };
          const keys = Object.keys(payload);
          const values = Object.values(payload);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const insertRes = await client.query(
            `INSERT INTO gastos (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values
          );
          const insertedRow = insertRes.rows[0];

          let hospedajeDias: any[] = [];
          if (insertedRow.fecha_hospedaje_inicio && insertedRow.fecha_hospedaje_fin) {
            hospedajeDias = await syncHospedajeDias(
              client,
              insertedRow.id,
              insertedRow.fecha_hospedaje_inicio,
              insertedRow.fecha_hospedaje_fin,
              Number(insertedRow.monto || 0)
            );
          }

          insertedGastos.push({
            ...insertedRow,
            hospedaje_dias: hospedajeDias,
          });
        }
      }

      if (gasolinaPayload && insertedGastos.length > 0) {
        const gasData = { ...gasolinaPayload, gasto_id: insertedGastos[0].id };
        const gasKeys = Object.keys(gasData);
        const gasValues = Object.values(gasData);
        const placeholders = gasKeys.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO registro_gasolina (${gasKeys.join(', ')}) VALUES (${placeholders})`,
          gasValues
        );
      }

      await client.query('COMMIT');
      inTx = false;

      // Caso 2: Si el gasto recién creado viene con factura pendiente y ya existe una factura recibida dentro de [-15, +25] días, relacionarla al instante
      const hasPendingInvoice = insertedGastos.some(
        (g: any) => g.facturado !== true && String(g.motivo_sin_factura || '').toUpperCase().includes('PENDIENTE')
      );
      if (hasPendingInvoice) {
        await reconcilePendingInvoicesForPool(pool);
      }

      if (createNotifications && insertedGastos.length > 0) {
        try {
          const adminsRes = await pool.query(`SELECT id FROM usuarios WHERE rol = 'ADMIN'`);
          const admins = adminsRes.rows;
          if (admins && admins.length > 0) {
            for (const admin of admins) {
              await pool.query(
                `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
                [
                  admin.id,
                  'Nuevo Gasto Registrado',
                  `${employeeName || 'Un empleado'} ha registrado un gasto de $${Number(totalGasto || 0).toFixed(2)} (${categoriaNombre || 'Sin categoría'})`,
                  'GASTO_NUEVO',
                  insertedGastos[0].id
                ]
              );
            }
          }
        } catch (notifErr) {
          console.warn('Error inserting notifications:', notifErr);
        }
      }

      return res.json({ success: true, insertedGastos });
    } catch (error: any) {
      if (inTx) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      const isValidationError = error.message?.includes('Fecha') || error.message?.includes('hospedaje');
      return res.status(isValidationError ? 400 : 500).json({ error: error.message });
    } finally {
      client.release();
    }
  });
};

export const attachSatFacturaToGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { 
      factura_id, 
      approve_directly, 
      factura_url: customFacturaUrl, 
      actor_id,
      monto_propina = 0,
      es_compartida = false,
      motivo_diferencia = null,
      detalle_diferencia = null
    } = req.body;

    const gastoRes = await pool.query('SELECT * FROM gastos WHERE id = $1', [id]);
    const gasto = gastoRes.rows[0];
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    const targetFacturaId = factura_id || gasto.factura_sugerida_id;
    if (!targetFacturaId) {
      return res.status(400).json({ error: 'No se especificó la factura recibida a vincular' });
    }

    const facRes = await pool.query('SELECT * FROM facturas_recibidas WHERE id = $1', [targetFacturaId]);
    const factura = facRes.rows[0];
    if (!factura) {
      return res.status(404).json({ error: 'Factura recibida no encontrada' });
    }

    // Validar si hay otros gastos vinculados a esta misma factura
    const otrosGastosRes = await pool.query(
      'SELECT id, monto, COALESCE(monto_propina, 0) as monto_propina, COALESCE(es_factura_compartida, false) as es_factura_compartida FROM gastos WHERE factura_recibida_id = $1 AND id != $2',
      [factura.id, id]
    );
    const otrosGastos = otrosGastosRes.rows;

    const gastoMonto = Number(gasto.monto || 0);
    const facTotal = Number(factura.total || 0);
    const propinaNum = Math.max(0, Number(monto_propina) || 0);
    const consumoActual = gastoMonto - propinaNum;

    if (otrosGastos.length > 0) {
      // Si la factura ya fue vinculada a otro gasto, debe estar registrada como factura compartida
      const esPreviamenteCompartida = otrosGastos.some(g => g.es_factura_compartida === true);
      if (!esPreviamenteCompartida && !es_compartida) {
        return res.status(400).json({
          error: `Esta factura ya se encuentra vinculada exclusivamente a otro gasto (#${otrosGastos[0].id}) y no está registrada como Factura Compartida.`,
        });
      }

      // Validar saldo disponible de la factura compartida
      const consumidoOtros = otrosGastos.reduce(
        (sum, g) => sum + (Number(g.monto || 0) - Number(g.monto_propina || 0)),
        0
      );
      const saldoDisponible = Math.max(0, facTotal - consumidoOtros);

      if (consumoActual > saldoDisponible + 0.05) {
        return res.status(400).json({
          error: `Saldo insuficiente en la factura compartida. Saldo disponible: $${saldoDisponible.toFixed(2)}, pero este gasto requiere $${consumoActual.toFixed(2)}.`,
        });
      }
    } else {
      // Primera vinculación de esta factura
      if (facTotal > gastoMonto + 0.05 && !es_compartida) {
        return res.status(400).json({
          error: `El total de la factura ($${facTotal.toFixed(2)}) es mayor al monto del gasto ($${gastoMonto.toFixed(2)}). Para usar una factura mayor debe marcarse como Factura Compartida.`,
        });
      }

      if (gastoMonto > facTotal + 0.05) {
        const diff = gastoMonto - facTotal;
        const motivoValido = Boolean(motivo_diferencia && motivo_diferencia !== 'NINGUNO');
        if (!motivoValido && Math.abs(diff - propinaNum) > 0.05) {
          return res.status(400).json({
            error: `El monto del gasto ($${gastoMonto.toFixed(2)}) es mayor al CFDI ($${facTotal.toFixed(2)}). Debes justificar la diferencia de $${diff.toFixed(2)} (ej. Propina o Comisión de plataforma).`,
          });
        }
      }
    }

    // Determinar propina final y motivo_sin_factura
    let newMotivoSinFactura: string | null = null;
    let propinaFinal = 0;
    if (gastoMonto > facTotal + 0.05) {
      const diff = gastoMonto - facTotal;
      if (motivo_diferencia === 'COMISION_PLATAFORMA') {
        newMotivoSinFactura = `COMISION_PLATAFORMA: $${diff.toFixed(2)}${detalle_diferencia ? ` - ${detalle_diferencia}` : ''}`;
        propinaFinal = 0;
      } else if (motivo_diferencia === 'DIFERENCIA_AUTORIZADA') {
        newMotivoSinFactura = `DIFERENCIA_AUTORIZADA: $${diff.toFixed(2)}${detalle_diferencia ? ` - ${detalle_diferencia}` : ''}`;
        propinaFinal = 0;
      } else {
        // PROPINA
        propinaFinal = propinaNum > 0 ? propinaNum : diff;
        newMotivoSinFactura = null;
      }
    }

    const esCompartidaEfectiva = Boolean(es_compartida || otrosGastos.length > 0);

    // Si es compartida, actualizar la bandera en todos los gastos asociados
    if (esCompartidaEfectiva) {
      await pool.query(
        'UPDATE gastos SET es_factura_compartida = TRUE WHERE factura_recibida_id = $1',
        [factura.id]
      );
    }

    // Conservar la factura_url que el usuario ya tenía (archivos subidos). No concatenar cfdi:// ni volverlo array JSON.
    const newFacturaUrlStr = gasto.factura_url || factura.pdf_url || null;

    // Determinar si debe aprobarse directamente (por defecto sí cuando devuelto_por_factura es true o approve_directly = true)
    const shouldApproveDirectly = approve_directly !== undefined ? Boolean(approve_directly) : Boolean(gasto.devuelto_por_factura);

    const newStatus = shouldApproveDirectly ? 'APPROVED' : gasto.status;
    const newApprovedAt = shouldApproveDirectly ? (gasto.approved_at || new Date().toISOString()) : gasto.approved_at;

    await pool.query(
      `UPDATE gastos
       SET facturado = TRUE,
           motivo_sin_factura = $1,
           factura_url = $2,
           factura_recibida_id = $3,
           factura_sugerida_id = NULL,
           monto_propina = $4,
           es_factura_compartida = $5,
           devuelto_por_factura = CASE WHEN $6 = 'APPROVED' THEN FALSE ELSE devuelto_por_factura END,
           status = $6,
           approved_at = $7
       WHERE id = $8`,
      [
        newMotivoSinFactura,
        newFacturaUrlStr, 
        factura.id, 
        propinaFinal, 
        esCompartidaEfectiva, 
        newStatus, 
        newApprovedAt, 
        id
      ]
    );

    if (gasto.venta_id) {
      try {
        await recalculateVentaTotalsInternal(pool, gasto.venta_id);
      } catch (e: any) {
        console.warn('[attachSatFacturaToGasto] Error recalculando venta:', e.message);
      }
    }

    try {
      const actor = req.user?.id || actor_id;
      let diffAudit = '';
      if (gastoMonto > facTotal + 0.05) {
        const diff = gastoMonto - facTotal;
        if (motivo_diferencia === 'COMISION_PLATAFORMA') {
          diffAudit = ` (Comisión de plataforma no comprobable: $${diff.toFixed(2)})`;
        } else if (motivo_diferencia === 'DIFERENCIA_AUTORIZADA') {
          diffAudit = ` (Diferencia autorizada: $${diff.toFixed(2)})`;
        } else {
          diffAudit = ` (Propina: $${propinaFinal.toFixed(2)})`;
        }
      }
      const compartidaText = esCompartidaEfectiva ? ' [Factura Compartida]' : '';
      const auditDetails = `Factura recibida SAT (${factura.uuid} - ${factura.nombre_emisor || factura.rfc_emisor}) vinculada al gasto por $${gastoMonto.toFixed(2)}${diffAudit}.${compartidaText}${shouldApproveDirectly ? ' Enviado directamente a Historial (Aprobado).' : ''}`;

      await pool.query(
        `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)`,
        [
          shouldApproveDirectly ? 'APPROVE' : 'UPDATE',
          actor,
          id,
          auditDetails
        ]
      );
    } catch (_) {}

    const updatedRes = await pool.query(`
      SELECT g.*,
        ${GASTO_RELATIONS_SELECT_SQL}
      FROM gastos g
      WHERE g.id = $1
    `, [id]);

    return res.json({
      success: true,
      gasto: updatedRes.rows[0] ? formatGasto(updatedRes.rows[0]) : null,
      approvedDirectly: shouldApproveDirectly,
    });
  } catch (error: any) {
    console.error('[attachSatFacturaToGasto] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const detachSatFacturaFromGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { actor_id } = req.body;

    const gastoRes = await pool.query('SELECT * FROM gastos WHERE id = $1', [id]);
    const gasto = gastoRes.rows[0];
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    const oldFacturaId = gasto.factura_recibida_id;
    if (!oldFacturaId) {
      return res.status(400).json({ error: 'Este gasto no tiene ninguna factura SAT vinculada' });
    }

    // Desvincular factura en el gasto
    await pool.query(
      `UPDATE gastos
       SET factura_recibida_id = NULL,
           monto_propina = 0,
           es_factura_compartida = FALSE
       WHERE id = $1`,
      [id]
    );

    // Revisar si la factura sigue compartida con otros gastos
    const restantesRes = await pool.query(
      'SELECT id FROM gastos WHERE factura_recibida_id = $1',
      [oldFacturaId]
    );
    if (restantesRes.rows.length <= 1) {
      // Si sólo queda 1 o ninguno, ya no es factura compartida
      await pool.query(
        'UPDATE gastos SET es_factura_compartida = FALSE WHERE factura_recibida_id = $1',
        [oldFacturaId]
      );
    }

    if (gasto.venta_id) {
      try {
        await recalculateVentaTotalsInternal(pool, gasto.venta_id);
      } catch (e: any) {
        console.warn('[detachSatFacturaFromGasto] Error recalculando venta:', e.message);
      }
    }

    try {
      const actor = req.user?.id || actor_id;
      await pool.query(
        `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)`,
        [
          'UPDATE',
          actor,
          id,
          `Factura SAT recibida desvinculada del gasto por administración.`
        ]
      );
    } catch (_) {}

    const updatedRes = await pool.query(`
      SELECT g.*,
        ${GASTO_RELATIONS_SELECT_SQL}
      FROM gastos g
      WHERE g.id = $1
    `, [id]);

    return res.json({
      success: true,
      gasto: updatedRes.rows[0] ? formatGasto(updatedRes.rows[0]) : null,
    });
  } catch (error: any) {
    console.error('[detachSatFacturaFromGasto] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const dismissSatFacturaFromGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);



    const { id } = req.params;
    const { factura_id, actor_id } = req.body;

    const gastoRes = await pool.query('SELECT * FROM gastos WHERE id = $1', [id]);
    const gasto = gastoRes.rows[0];
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    const targetFacturaId = String(factura_id || gasto.factura_sugerida_id || '').trim();
    const currentDismissed: string[] = Array.isArray(gasto.facturas_descartadas_ids)
      ? gasto.facturas_descartadas_ids.map(String)
      : [];
    if (targetFacturaId && !currentDismissed.includes(targetFacturaId)) {
      currentDismissed.push(targetFacturaId);
    }

    // Si el gasto había sido devuelto de Historial por esta factura detectada, regresarlo a APPROVED (Historial)
    const wasReturned = Boolean(gasto.devuelto_por_factura);
    const restoredStatus = wasReturned ? 'APPROVED' : gasto.status;

    await pool.query(
      `UPDATE gastos
       SET factura_sugerida_id = NULL,
           facturas_descartadas_ids = $1,
           devuelto_por_factura = FALSE,
           status = $2
       WHERE id = $3`,
      [currentDismissed, restoredStatus, id]
    );

    // Re-ejecutar conciliación por si existe otra factura distinta del mismo monto


    try {
      const actor = req.user?.id || actor_id;
      await pool.query(
        `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)`,
        [
          'UPDATE',
          actor,
          id,
          `Factura recibida sugerida (${targetFacturaId}) descartada por no coincidir con el gasto.${wasReturned ? ' El gasto regresó a Historial.' : ''}`
        ]
      );
    } catch (_) {}

    const updatedRes = await pool.query(`
      SELECT g.*,
        ${GASTO_RELATIONS_SELECT_SQL}
      FROM gastos g
      WHERE g.id = $1
    `, [id]);

    return res.json({
      success: true,
      gasto: updatedRes.rows[0] ? formatGasto(updatedRes.rows[0]) : null,
      returnedToHistory: wasReturned && updatedRes.rows[0]?.status === 'APPROVED',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
