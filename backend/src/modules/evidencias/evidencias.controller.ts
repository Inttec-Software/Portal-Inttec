import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const user = req.user;
    const pool = getDbPool(company, env);

    const cliRes = await pool.query('SELECT * FROM clientes ORDER BY nombre');
    const sucRes = await pool.query('SELECT * FROM sucursales_cliente ORDER BY nombre');
    
    let prodRes = { rows: [] };
    if (user?.id) {
      prodRes = await pool.query(`
        SELECT ie.cantidad_disponible, ie.producto_id, row_to_json(p.*) as productos
        FROM inventario_empleados ie
        LEFT JOIN productos p ON ie.producto_id = p.id
        WHERE ie.empleado_id = $1 AND ie.cantidad_disponible > 0
      `, [user.id]);
    }

    return res.json({
      clientes: cliRes.rows || [],
      sucursales: sucRes.rows || [],
      inventario: prodRes.rows || []
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

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

    const materialUsage: Record<string, { usado: number; nombre: string; dbId?: string; currentStock?: number; motivos: string[] }> = {};
    for (const t of trabajosPayload) {
      for (const m of (t.materiales_usados || [])) {
        if (m.usado > 0) {
          if (!materialUsage[m.productoId]) {
            materialUsage[m.productoId] = { usado: 0, nombre: m.nombre, motivos: [] };
          }
          materialUsage[m.productoId].usado += m.usado;
          if (t.descripcion) {
            materialUsage[m.productoId].motivos.push(`Trabajo: ${t.descripcion.substring(0, 50)}`);
          }
        }
      }
    }

    for (const prodId of Object.keys(materialUsage)) {
      const item = materialUsage[prodId];
      const { rows } = await pool.query(
        `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
        [user.id, prodId]
      );
      const invEmp = rows[0];

      if (!invEmp) {
        return res.status(400).json({ error: `No se encontró inventario para el material: ${item.nombre}` });
      }

      if (invEmp.cantidad_disponible < item.usado) {
        return res.status(400).json({ error: `Stock insuficiente para: ${item.nombre}. Disponible: ${invEmp.cantidad_disponible}, Requerido: ${item.usado}` });
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

    const { rows: evidenciaDataRows } = await pool.query(
      `INSERT INTO evidencias (empleado_id, empleado_nombre, cliente, descripcion_trabajo, materiales_usados, observaciones, foto_antes_url, foto_despues_url, fotos_adicionales_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [user.id, user.nombre, cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales]
    );
    const evidenciaData = evidenciaDataRows[0];

    for (const prodId of Object.keys(materialUsage)) {
      const item = materialUsage[prodId];
      if (item.dbId && item.currentStock !== undefined) {
        await pool.query(
          `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
          [item.currentStock - item.usado, new Date().toISOString(), item.dbId]
        );
          
        await pool.query(
          `INSERT INTO movimientos_inventario (producto_id, empleado_id, cantidad, tipo, motivo, empresa) VALUES ($1, $2, $3, $4, $5, $6)`,
          [prodId, user.id, item.usado, 'USO_EVIDENCIA', `Utilizado en evidencia. ${item.motivos.join(' | ')}`, company]
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
    } = req.body;

    const cleanMateriales = typeof materiales_usados === 'string'
      ? materiales_usados
      : (materiales_usados ? JSON.stringify(materiales_usados) : null);

    const cleanFotosAdicionales = Array.isArray(fotos_adicionales_urls)
      ? fotos_adicionales_urls
      : (fotos_adicionales_urls ? [fotos_adicionales_urls] : []);

    const { rows: data } = await pool.query(
      `UPDATE evidencias SET 
        cliente = $1, descripcion_trabajo = $2, materiales_usados = $3, observaciones = $4, 
        foto_antes_url = $5, foto_despues_url = $6, fotos_adicionales_urls = $7
       WHERE id = $8 RETURNING *`,
      [cliente, descripcion_trabajo, cleanMateriales, observaciones, foto_antes_url, foto_despues_url, cleanFotosAdicionales, id]
    );

    return res.json(data[0]);
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
