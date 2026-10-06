import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const pool = getDbPool(company, env);

    const [cliRes, sucRes, usersRes] = await Promise.all([
      pool.query('SELECT * FROM clientes ORDER BY nombre'),
      pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre'),
      pool.query('SELECT id, nombre, email, rol FROM usuarios ORDER BY nombre'),
    ]);
    
    let prodRes = { rows: [] };
    if (user?.id) {
      prodRes = await pool.query(`
        SELECT ie.id, ie.cantidad_disponible, ie.producto_id, ie.empleado_id, 
               (SELECT row_to_json(p_obj) FROM (SELECT id, sku_interno, nombre_oficial, unidad FROM productos WHERE id = ie.producto_id) p_obj) as productos
        FROM inventario_empleados ie
        WHERE ie.empleado_id = $1 AND ie.cantidad_disponible > 0
      `, [user.id]);
    }

    const allUsers = usersRes.rows || [];
    const colaboradoresDisponibles = allUsers.filter((u: any) => u.id !== user?.id);

    return res.json({
      clientes: cliRes.rows || [],
      sucursales: sucRes.rows || [],
      inventario: prodRes.rows || [],
      empleados: colaboradoresDisponibles,
      todosLosEmpleados: allUsers,
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// 1.1 GET /api/evidencias/inventario-colaboradores?ids=id1,id2
export const getInventarioColaboradores = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const { ids } = req.query;
    if (!ids) {
      return res.json({ inventario: [] });
    }

    const idList = (typeof ids === 'string' ? ids.split(',') : (ids as string[])).map((s: string) => s.trim()).filter(Boolean);
    if (idList.length === 0) {
      return res.json({ inventario: [] });
    }

    const placeholders = idList.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: data } = await pool.query(`
      SELECT ie.id, ie.cantidad_disponible, ie.producto_id, ie.empleado_id, 
             (SELECT row_to_json(p_obj) FROM (SELECT id, sku_interno, nombre_oficial, unidad FROM productos WHERE id = ie.producto_id) p_obj) as productos
      FROM inventario_empleados ie
      WHERE ie.empleado_id IN (${placeholders}) AND ie.cantidad_disponible > 0
    `, idList);

    return res.json({ inventario: data || [] });
  } catch (error: any) {
    console.error('Error en getInventarioColaboradores:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/evidencias
export const crearEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const pool = getDbPool(company, env);

    const {
      cliente,
      descripcion_trabajo,
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
      colaboradores,
    } = req.body;

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    let trabajosPayload: any[] = [];
    try {
      if (descripcion_trabajo) {
        trabajosPayload = JSON.parse(descripcion_trabajo);
      }
    } catch (e) {}

    // 1. Agrupar y calcular uso total por (empleado_id + material) para soportar múltiples colaboradores
    const materialUsage: Record<string, { 
      empleadoId: string;
      empleadoNombre: string;
      productoId: string;
      usado: number;
      nombre: string;
      dbId?: string;
      currentStock?: number;
      motivos: string[];
    }> = {};
    for (const t of trabajosPayload) {
      for (const m of (t.materiales_usados || [])) {
        if (m.usado > 0) {
          const targetEmpleadoId = m.empleadoId || user.id;
          const targetEmpleadoNombre = m.empleadoNombre || (targetEmpleadoId === user.id ? user.nombre : 'Colaborador');
          const compositeKey = `${targetEmpleadoId}___${m.productoId}`;

          if (!materialUsage[compositeKey]) {
            materialUsage[compositeKey] = {
              empleadoId: targetEmpleadoId,
              empleadoNombre: targetEmpleadoNombre,
              productoId: m.productoId,
              usado: 0,
              nombre: m.nombre,
              motivos: []
            };
          }
          materialUsage[compositeKey].usado += m.usado;
          if (t.descripcion) {
            materialUsage[compositeKey].motivos.push(`Trabajo: ${t.descripcion.substring(0, 50)}`);
          }
        }
      }
    }

    // 2. Validar que exista suficiente stock en el inventario del empleado correspondiente para cada material
    for (const key of Object.keys(materialUsage)) {
      const item = materialUsage[key];
      const { rows } = await pool.query(
        `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
        [item.empleadoId, item.productoId]
      );
      const invEmp = rows[0];

      if (!invEmp) {
        return res.status(400).json({ 
          error: `No se encontró inventario para el material: ${item.nombre} en el stock de ${item.empleadoNombre}` 
        });
      }

      if (invEmp.cantidad_disponible < item.usado) {
        return res.status(400).json({ 
          error: `Stock insuficiente para: ${item.nombre} (${item.empleadoNombre}). Disponible: ${invEmp.cantidad_disponible}, Requerido: ${item.usado}` 
        });
      }
      
      item.dbId = invEmp.id;
      item.currentStock = invEmp.cantidad_disponible;
    }

    const cleanMateriales = typeof materiales_usados === 'string'
      ? materiales_usados
      : (materiales_usados ? JSON.stringify(materiales_usados) : null);

    const cleanFotosAdicionales = Array.isArray(fotos_adicionales_urls)
      ? fotos_adicionales_urls
      : (fotos_adicionales_urls ? [fotos_adicionales_urls] : []);

    const cleanColaboradores = typeof colaboradores === 'string'
      ? colaboradores
      : (colaboradores ? JSON.stringify(colaboradores) : null);

    let evidenciaData;
    try {
      const { rows } = await pool.query(
        `INSERT INTO evidencias (empleado_id, empleado_nombre, cliente, descripcion_trabajo, materiales_usados, observaciones, foto_antes_url, foto_despues_url, fotos_adicionales_urls, colaboradores)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [user.id, user.nombre, cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales, cleanColaboradores]
      );
      evidenciaData = rows[0];
    } catch (e: any) {
      if (e.message?.includes('colaboradores') || e.code === '42703') { // undefined column
        console.warn('Columna colaboradores no detectada en tabla evidencias, guardando sin columna dedicada.');
        const { rows } = await pool.query(
          `INSERT INTO evidencias (empleado_id, empleado_nombre, cliente, descripcion_trabajo, materiales_usados, observaciones, foto_antes_url, foto_despues_url, fotos_adicionales_urls)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [user.id, user.nombre, cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales]
        );
        evidenciaData = rows[0];
      } else {
        throw e;
      }
    }

    // 4. Descontar del inventario y registrar movimientos de forma individual para cada empleado
    for (const key of Object.keys(materialUsage)) {
      const item = materialUsage[key];
      if (item.dbId && item.currentStock !== undefined) {
        await pool.query(
          `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
          [item.currentStock - item.usado, new Date().toISOString(), item.dbId]
        );
          
        const esPropio = item.empleadoId === user.id;
        const motivoDetalle = esPropio
          ? `Utilizado en evidencia (${cliente || 'Sin cliente'}). ${item.motivos.join(' | ')}`
          : `Utilizado como colaborador en reporte de ${user.nombre} (${cliente || 'Sin cliente'}). ${item.motivos.join(' | ')}`;

        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, empleado_id, cantidad, tipo, motivo, empresa) VALUES ($1, $2, $3, $4, $5, $6)`,
          [item.productoId, item.empleadoId, item.usado, 'USO_EVIDENCIA', motivoDetalle, company]
        );
      }
    }
    return res.status(201).json(evidenciaData);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAdminEvidencias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);

    const evidencesRes = await pool.query('SELECT * FROM evidencias ORDER BY created_at DESC');
    const employeesRes = await pool.query("SELECT * FROM usuarios WHERE rol = 'EMPLEADO' ORDER BY nombre");

    return res.json({
      evidencias: evidencesRes.rows || [],
      employees: employeesRes.rows || []
    });

  } catch (error: any) {
    console.error('[GET MIS EVIDENCIAS ERROR]:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getMisEvidencias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const pool = getDbPool(company, env);

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { rows: data } = await pool.query(
      'SELECT * FROM evidencias WHERE empleado_id = $1 ORDER BY created_at DESC',
      [user.id]
    );

    return res.json({ evidencias: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const actualizarEvidencia = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const pool = getDbPool(company, env);
    const { id } = req.params;

    if (!user || (user.rol !== 'ADMIN' && user.rol !== 'DEV')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const {
      cliente,
      descripcion_trabajo,
      materiales_usados,
      observaciones,
      foto_antes_url,
      foto_despues_url,
      fotos_adicionales_urls,
      colaboradores,
    } = req.body;

    const cleanMateriales = typeof materiales_usados === 'string'
      ? materiales_usados
      : (materiales_usados ? JSON.stringify(materiales_usados) : null);

    const cleanFotosAdicionales = Array.isArray(fotos_adicionales_urls)
      ? fotos_adicionales_urls
      : (fotos_adicionales_urls ? [fotos_adicionales_urls] : []);

    const cleanColaboradores = typeof colaboradores === 'string'
      ? colaboradores
      : (colaboradores ? JSON.stringify(colaboradores) : null);

    let resultData;
    try {
      const { rows } = await pool.query(
        `UPDATE evidencias SET 
          cliente = $1, descripcion_trabajo = $2, materiales_usados = $3, observaciones = $4, 
          foto_antes_url = $5, foto_despues_url = $6, fotos_adicionales_urls = $7, colaboradores = $8
         WHERE id = $9 RETURNING *`,
        [cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales, cleanColaboradores, id]
      );
      resultData = rows[0];
    } catch (e: any) {
      if (e.message?.includes('colaboradores') || e.code === '42703') {
        const { rows } = await pool.query(
          `UPDATE evidencias SET 
            cliente = $1, descripcion_trabajo = $2, materiales_usados = $3, observaciones = $4, 
            foto_antes_url = $5, foto_despues_url = $6, fotos_adicionales_urls = $7
           WHERE id = $8 RETURNING *`,
          [cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales, id]
        );
        resultData = rows[0];
      } else {
        throw e;
      }
    }

    return res.json(resultData);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAdminEvidenciaById = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const pool = getDbPool(company, env);
    const { id } = req.params;

    const { rows: data } = await pool.query('SELECT * FROM evidencias WHERE id = $1', [id]);

    return res.json({ evidencia: data[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
