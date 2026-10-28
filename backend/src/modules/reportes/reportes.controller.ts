import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

const formatGasto = (g: any) => {
  let cat = 'Sin clasificar';
  let subcat = 'Sin clasificar';
  let prov = '';
  let cli = '';
  let suc = '';
  
  let catRel = null;

  if (g.subcategoria_rel) {
    subcat = g.subcategoria_rel.nombre;
    if (g.subcategoria_rel.categorias) {
      cat = g.subcategoria_rel.categorias.nombre;
      catRel = g.subcategoria_rel.categorias;
    }
  }
  if (g.proveedor_rel) prov = g.proveedor_rel.nombre;
  if (g.cliente_rel) cli = g.cliente_rel.nombre;
  if (g.sucursal_rel) suc = g.sucursal_rel.nombre;

  return {
    ...g,
    cat, subcat, prov, cli, suc, // Props legadas
    categoria_nombre: cat,
    subcategoria_nombre: subcat,
    proveedor_nombre: prov,
    cliente_nombre: cli,
    sucursal_nombre: suc,
    categoria_rel: catRel,
    venta_rel: g.venta_rel || null,
  };
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

    const tab = req.query.tab as string; // 'pendientes' | 'historial' | 'todos'
    const facturaFilter = req.query.facturaFilter as string; // 'TODOS' | 'FACTURADOS' | 'PENDIENTE_ENTREGA' | 'NO_FACTURADOS'
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

        baseConditions.push(`(
          g.empleado_nombre ILIKE $${pIdx} OR
          g.detalle_servicio_proyecto ILIKE $${pIdx} OR
          g.motivo_sin_factura ILIKE $${pIdx} OR
          EXISTS (SELECT 1 FROM proveedores p WHERE p.id = g.proveedor_id AND (p.nombre ILIKE $${pIdx} OR p.rfc ILIKE $${pIdx})) OR
          EXISTS (SELECT 1 FROM clientes cl WHERE cl.id = g.cliente_id AND cl.nombre ILIKE $${pIdx}) OR
          EXISTS (SELECT 1 FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id AND sc.nombre ILIKE $${pIdx}) OR
          EXISTS (SELECT 1 FROM subcategorias sub WHERE sub.id = g.subcategoria_id AND sub.nombre ILIKE $${pIdx}) OR
          EXISTS (
            SELECT 1 FROM subcategorias sub 
            JOIN categorias cat ON cat.id = sub.categoria_id 
            WHERE sub.id = g.subcategoria_id AND cat.nombre ILIKE $${pIdx}
          )
          ${amountMatchSql}
        )`);
      }

      const baseWhereSql = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

      // 2. Condiciones específicas para la vista activa (tab y facturación)
      const viewConditions = [...baseConditions];
      const viewParams = [...baseParams];

      if (tab === 'pendientes') {
        viewConditions.push(`g.status = 'PENDING'`);
      } else if (tab === 'historial') {
        viewConditions.push(`g.status IN ('APPROVED', 'REJECTED', 'ACTION_REQUIRED')`);
        
        if (facturaFilter === 'FACTURADOS') {
          viewConditions.push(`g.facturado = true`);
        } else if (facturaFilter === 'PENDIENTE_ENTREGA') {
          viewConditions.push(`(g.facturado IS NOT TRUE AND UPPER(COALESCE(g.motivo_sin_factura, '')) LIKE '%PENDIENTE%')`);
        } else if (facturaFilter === 'NO_FACTURADOS') {
          viewConditions.push(`(g.facturado IS NOT TRUE AND (g.motivo_sin_factura IS NULL OR UPPER(g.motivo_sin_factura) NOT LIKE '%PENDIENTE%'))`);
        }
      }

      const viewWhereSql = viewConditions.length > 0 ? `WHERE ${viewConditions.join(' AND ')}` : '';

      // 3. Ejecutar consultas en paralelo
      const queryPromises: Promise<any>[] = [
        // Totales globales según filtros base
        pool.query(`
          SELECT 
            COUNT(*) FILTER (WHERE g.status = 'PENDING') AS count_pendientes,
            COALESCE(SUM(g.monto) FILTER (WHERE g.status = 'PENDING'), 0) AS total_pendientes,
            COUNT(*) FILTER (WHERE g.status = 'APPROVED') AS count_aprobados,
            COALESCE(SUM(g.monto) FILTER (WHERE g.status = 'APPROVED'), 0) AS total_aprobados
          FROM gastos g
          ${baseWhereSql}
        `, baseParams),

        // Total de registros para la paginación de la vista
        pool.query(`SELECT COUNT(*) AS total_count FROM gastos g ${viewWhereSql}`, viewParams),

        // Gastos paginados
        pool.query(`
          SELECT g.*,
            (SELECT row_to_json(s_obj) FROM (
              SELECT s.id, s.nombre, s.categoria_id,
                     (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
              FROM subcategorias s WHERE s.id = g.subcategoria_id
            ) s_obj) as subcategoria_rel,
            (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
            (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
            (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel,
            (SELECT row_to_json(v_obj) FROM (SELECT v.id, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto, v.factura_referencia, v.precio_total_facturado FROM ventas v WHERE v.id = g.venta_id) v_obj) as venta_rel
          FROM gastos g
          ${viewWhereSql}
          ORDER BY g.created_at DESC
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
          (SELECT row_to_json(s_obj) FROM (
            SELECT s.id, s.nombre, s.categoria_id,
                   (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
            FROM subcategorias s WHERE s.id = g.subcategoria_id
          ) s_obj) as subcategoria_rel,
          (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
          (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
          (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel,
          (SELECT row_to_json(v_obj) FROM (SELECT v.id, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto, v.factura_referencia, v.precio_total_facturado FROM ventas v WHERE v.id = g.venta_id) v_obj) as venta_rel
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
          (SELECT row_to_json(s_obj) FROM (
            SELECT s.id, s.nombre, s.categoria_id,
                   (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
            FROM subcategorias s WHERE s.id = g.subcategoria_id
          ) s_obj) as subcategoria_rel,
          (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
          (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
          (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel
        FROM gastos g
        WHERE g.empleado_id = $1
        ORDER BY g.created_at DESC
        ${limitSql}
    `, [userId]);

    const rawGastos = gastosRes.rows || [];
    const gastosEnriquecidos = rawGastos.map(formatGasto);

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
          (SELECT row_to_json(s_obj) FROM (
            SELECT s.id, s.nombre, s.categoria_id,
                   (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
            FROM subcategorias s WHERE s.id = g.subcategoria_id
          ) s_obj) as subcategoria_rel,
          (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
          (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
          (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel,
          (SELECT row_to_json(v_obj) FROM (SELECT v.id, v.cliente, v.fecha, v.sucursal, v.tipo_proyecto, v.factura_referencia, v.precio_total_facturado FROM ventas v WHERE v.id = g.venta_id) v_obj) as venta_rel
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
    const { status, payload, actor_id, monto } = req.body;

    if (payload && Object.keys(payload).length > 0) {
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      
      await pool.query(`UPDATE gastos SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);
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
      let query = `
        SELECT g.*,
          (SELECT row_to_json(s_obj) FROM (
            SELECT s.id, s.nombre, s.categoria_id,
                   (SELECT row_to_json(c_obj) FROM (SELECT c.id, c.nombre FROM categorias c WHERE c.id = s.categoria_id) c_obj) as categorias
            FROM subcategorias s WHERE s.id = g.subcategoria_id
          ) s_obj) as subcategoria_rel,
          (SELECT row_to_json(p_obj) FROM (SELECT p.id, p.nombre FROM proveedores p WHERE p.id = g.proveedor_id) p_obj) as proveedor_rel,
          (SELECT row_to_json(cl_obj) FROM (SELECT cl.id, cl.nombre FROM clientes cl WHERE cl.id = g.cliente_id) cl_obj) as cliente_rel,
          (SELECT row_to_json(sc_obj) FROM (SELECT sc.id, sc.nombre FROM sucursales_cliente sc WHERE sc.id = g.sucursal_id) sc_obj) as sucursal_rel
        FROM gastos g
      `;
      const params: any[] = [];
      const conditions: string[] = [];
      if (startDate) {
        params.push(`${startDate}T00:00:00`);
        conditions.push(`g.created_at >= $${params.length}`);
      }
      if (endDate) {
        params.push(`${endDate}T23:59:59.999Z`);
        conditions.push(`g.created_at <= $${params.length}`);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY g.created_at DESC';
      
      const { rows } = await pool.query(query, params);
      return res.json((rows || []).map(formatGasto));
    }

    return res.status(400).json({ error: 'Tipo de exportación inválido' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGasto = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { id } = req.params;
    const { updatePayload, gasolinaPayload, ...restPayload } = req.body;
    
    const payload = updatePayload || restPayload;

    if (payload.estado_reembolso !== undefined) {
      const userRole = req.user?.rol || req.user?.role;
      if (userRole && userRole !== 'ADMIN' && userRole !== 'DEV') {
        return res.status(403).json({ error: 'Solo administradores pueden modificar el estado de reembolso' });
      }
    }

    // Get old gasto to see if it's linked to a sale
    const oldGastoRes = await pool.query('SELECT venta_id FROM gastos WHERE id = $1', [id]);
    const oldGasto = oldGastoRes.rows[0];

    if (payload && Object.keys(payload).length > 0) {
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      
      await pool.query(`UPDATE gastos SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);
    }

    if (gasolinaPayload) {
      if (gasolinaPayload.action === 'upsert') {
        const gasKeys = Object.keys(gasolinaPayload.data);
        const gasValues = Object.values(gasolinaPayload.data);
        gasKeys.push('gasto_id');
        gasValues.push(id);
        
        const placeholders = gasKeys.map((_, i) => `$${i + 1}`).join(', ');
        const updates = gasKeys.map((k) => `${k} = EXCLUDED.${k}`).join(', ');
        
        await pool.query(
          `INSERT INTO registro_gasolina (${gasKeys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (gasto_id) DO UPDATE SET ${updates}`,
          gasValues
        );
      } else if (gasolinaPayload.action === 'delete') {
        await pool.query('DELETE FROM registro_gasolina WHERE gasto_id = $1', [id]);
      }
    }

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


    return res.json({ success: true });
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
  const ventaRes = await pool.query('SELECT precio_total_facturado FROM ventas WHERE id = $1', [id]);
  const venta = ventaRes.rows[0];
  if (!venta) throw new Error('Sale not found');

  const partidasRes = await pool.query('SELECT costo_total_proveedor FROM ventas_partidas WHERE venta_id = $1', [id]);
  const partidas = partidasRes.rows;

  const costoPartidas = (partidas || []).reduce((sum: number, p: any) => sum + (Number(p.costo_total_proveedor) || 0), 0);

  const gastosRes = await pool.query(`SELECT monto FROM gastos WHERE venta_id = $1 AND status = 'APPROVED'`, [id]);
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

    const [catRes, subRes, cliRes, usersRes, sucRes, provRes] = await Promise.all([
      pool.query('SELECT * FROM categorias ORDER BY nombre'),
      pool.query('SELECT * FROM subcategorias ORDER BY nombre'),
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT * FROM usuarios ORDER BY nombre'),
      pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre'),
      pool.query('SELECT * FROM proveedores ORDER BY nombre'),
    ]);

    return res.json({
      categorias: catRes.rows || [],
      subcategorias: subRes.rows || [],
      clientes: cliRes.rows || [],
      usuarios: usersRes.rows || [],
      sucursales: sucRes.rows || [],
      proveedores: provRes.rows || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createGastos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { payloadsToInsert, gasolinaPayload } = req.body;

    const insertedGastos = [];
    if (payloadsToInsert && payloadsToInsert.length > 0) {
      for (const payload of payloadsToInsert) {
        const keys = Object.keys(payload);
        const values = Object.values(payload);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const res = await pool.query(
          `INSERT INTO gastos (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        insertedGastos.push(res.rows[0]);
      }
    }

    if (gasolinaPayload && insertedGastos.length > 0) {
      gasolinaPayload.gasto_id = insertedGastos[0].id;
      const gasKeys = Object.keys(gasolinaPayload);
      const gasValues = Object.values(gasolinaPayload);
      const placeholders = gasKeys.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO registro_gasolina (${gasKeys.join(', ')}) VALUES (${placeholders})`,
        gasValues
      );
    }

    const { createNotifications, employeeName, totalGasto, categoriaNombre } = req.body;
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
    return res.status(500).json({ error: error.message });
  }
};
