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

// Helper para evitar que cadenas temporales (blob:, file:, ph:) se guarden en la base de datos
const sanitizeEvidenceUrl = (url: any): string | null => {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('file:') || trimmed.startsWith('ph:') || trimmed.startsWith('content:')) {
    return null;
  }
  return trimmed;
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

    let finalDescripcionTrabajo = descripcion_trabajo;
    if (Array.isArray(trabajosPayload) && trabajosPayload.length > 0) {
      for (const t of trabajosPayload) {
        if (t) {
          t.antesImg = sanitizeEvidenceUrl(t.antesImg);
          t.despuesImg = sanitizeEvidenceUrl(t.despuesImg);
          if (Array.isArray(t.fotosAdicionales)) {
            t.fotosAdicionales = t.fotosAdicionales.map(sanitizeEvidenceUrl).filter(Boolean);
          }
        }
      }
      finalDescripcionTrabajo = JSON.stringify(trabajosPayload);
    }

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

    const cleanFotosAdicionales = (Array.isArray(fotos_adicionales_urls)
      ? fotos_adicionales_urls
      : (fotos_adicionales_urls ? [fotos_adicionales_urls] : []))
      .map(sanitizeEvidenceUrl)
      .filter(Boolean);

    const cleanFotoAntesUrl = sanitizeEvidenceUrl(foto_antes_url);
    const cleanFotoDespuesUrl = sanitizeEvidenceUrl(foto_despues_url);

    const cleanColaboradores = typeof colaboradores === 'string'
      ? colaboradores
      : (colaboradores ? JSON.stringify(colaboradores) : null);

    let evidenciaData;
    try {
      const { rows } = await pool.query(
        `INSERT INTO evidencias (empleado_id, empleado_nombre, cliente, descripcion_trabajo, materiales_usados, observaciones, foto_antes_url, foto_despues_url, fotos_adicionales_urls, colaboradores)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [user.id, user.nombre, cliente, finalDescripcionTrabajo, cleanMateriales, observaciones, cleanFotoAntesUrl, cleanFotoDespuesUrl, cleanFotosAdicionales, cleanColaboradores]
      );
      evidenciaData = rows[0];
    } catch (e: any) {
      if (e.message?.includes('colaboradores') || e.code === '42703') { // undefined column
        console.warn('Columna colaboradores no detectada en tabla evidencias, guardando sin columna dedicada.');
        const { rows } = await pool.query(
          `INSERT INTO evidencias (empleado_id, empleado_nombre, cliente, descripcion_trabajo, materiales_usados, observaciones, foto_antes_url, foto_despues_url, fotos_adicionales_urls)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [user.id, user.nombre, cliente, finalDescripcionTrabajo, cleanMateriales, observaciones, cleanFotoAntesUrl, cleanFotoDespuesUrl, cleanFotosAdicionales]
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

        try {
          await pool.query(
            `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por, fecha) VALUES ($1, $2, $3, $4, $5, $6)`,
            [item.productoId, 'SALIDA', item.usado, motivoDetalle, item.empleadoId || user.id, new Date().toISOString()]
          );
        } catch (movErr: any) {
          console.warn('Aviso al registrar movimiento de inventario:', movErr?.message);
        }
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

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { rows: existingRows } = await pool.query('SELECT * FROM evidencias WHERE id = $1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Evidencia no encontrada' });
    }

    const existingEvidencia = existingRows[0];
    const esAdminODev = user.rol === 'ADMIN' || user.rol === 'DEV';
    const esPropietario = existingEvidencia.empleado_id === user.id;

    if (!esAdminODev && !esPropietario) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta evidencia' });
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

    let trabajosPayload: any[] = [];
    try {
      if (descripcion_trabajo) {
        trabajosPayload = typeof descripcion_trabajo === 'string'
          ? JSON.parse(descripcion_trabajo)
          : descripcion_trabajo;
      }
    } catch (e) {}

    let finalDescripcionTrabajo = descripcion_trabajo;
    if (Array.isArray(trabajosPayload) && trabajosPayload.length > 0) {
      for (const t of trabajosPayload) {
        if (t) {
          t.antesImg = sanitizeEvidenceUrl(t.antesImg);
          t.despuesImg = sanitizeEvidenceUrl(t.despuesImg);
          if (Array.isArray(t.fotosAdicionales)) {
            t.fotosAdicionales = t.fotosAdicionales.map(sanitizeEvidenceUrl).filter(Boolean);
          }
        }
      }
      finalDescripcionTrabajo = JSON.stringify(trabajosPayload);
    }

    // 1. Reconstruir uso PREVIO de materiales desde la evidencia existente
    let prevTrabajosPayload: any[] = [];
    try {
      if (existingEvidencia.descripcion_trabajo) {
        prevTrabajosPayload = typeof existingEvidencia.descripcion_trabajo === 'string'
          ? JSON.parse(existingEvidencia.descripcion_trabajo)
          : existingEvidencia.descripcion_trabajo;
      }
    } catch {}

    const previousUsage: Record<string, {
      empleadoId: string;
      empleadoNombre: string;
      productoId: string;
      usado: number;
      nombre: string;
    }> = {};

    if (Array.isArray(prevTrabajosPayload)) {
      for (const t of prevTrabajosPayload) {
        for (const m of (t.materiales_usados || [])) {
          if (Number(m.usado) > 0) {
            const targetEmpId = m.empleadoId || existingEvidencia.empleado_id;
            const targetEmpName = m.empleadoNombre || 'Empleado';
            const key = `${targetEmpId}___${m.productoId}`;
            if (!previousUsage[key]) {
              previousUsage[key] = {
                empleadoId: targetEmpId,
                empleadoNombre: targetEmpName,
                productoId: m.productoId,
                usado: 0,
                nombre: m.nombre || 'Material'
              };
            }
            previousUsage[key].usado += Number(m.usado) || 0;
          }
        }
      }
    }

    // 2. Reconstruir NUEVO uso de materiales a partir del payload enviado
    const newUsage: Record<string, {
      empleadoId: string;
      empleadoNombre: string;
      productoId: string;
      usado: number;
      nombre: string;
      motivos: string[];
    }> = {};

    if (Array.isArray(trabajosPayload)) {
      for (const t of trabajosPayload) {
        for (const m of (t.materiales_usados || [])) {
          if (Number(m.usado) > 0) {
            const targetEmpId = m.empleadoId || user.id;
            const targetEmpName = m.empleadoNombre || (targetEmpId === user.id ? user.nombre : 'Colaborador');
            const key = `${targetEmpId}___${m.productoId}`;
            if (!newUsage[key]) {
              newUsage[key] = {
                empleadoId: targetEmpId,
                empleadoNombre: targetEmpName,
                productoId: m.productoId,
                usado: 0,
                nombre: m.nombre || 'Material',
                motivos: []
              };
            }
            newUsage[key].usado += Number(m.usado) || 0;
            if (t.descripcion) {
              newUsage[key].motivos.push(`Trabajo: ${String(t.descripcion).substring(0, 50)}`);
            }
          }
        }
      }
    }

    // 3. Calcular deltas (nuevo - previo)
    const allKeys = Array.from(new Set([...Object.keys(previousUsage), ...Object.keys(newUsage)]));
    const inventoryDeltas: Array<{
      empleadoId: string;
      empleadoNombre: string;
      productoId: string;
      nombre: string;
      delta: number;
      dbId?: string;
      currentStock?: number;
      motivos: string[];
    }> = [];

    for (const key of allKeys) {
      const prevItem = previousUsage[key];
      const newItem = newUsage[key];
      const empId = newItem?.empleadoId || prevItem?.empleadoId;
      const empName = newItem?.empleadoNombre || prevItem?.empleadoNombre || 'Empleado';
      const prodId = newItem?.productoId || prevItem?.productoId;
      const prodName = newItem?.nombre || prevItem?.nombre || 'Material';
      const prevQty = prevItem?.usado || 0;
      const newQty = newItem?.usado || 0;
      const delta = Math.round((newQty - prevQty) * 100) / 100;

      if (delta !== 0) {
        inventoryDeltas.push({
          empleadoId: empId,
          empleadoNombre: empName,
          productoId: prodId,
          nombre: prodName,
          delta,
          motivos: newItem?.motivos || []
        });
      }
    }

    // 4. Validar stock suficiente para deltas positivos (descuentos adicionales)
    for (const d of inventoryDeltas) {
      const { rows } = await pool.query(
        `SELECT id, cantidad_disponible FROM inventario_empleados WHERE empleado_id = $1 AND producto_id = $2`,
        [d.empleadoId, d.productoId]
      );
      const invEmp = rows[0];

      if (d.delta > 0) {
        if (!invEmp) {
          return res.status(400).json({
            error: `No se encontró inventario para el material: ${d.nombre} en el stock de ${d.empleadoNombre}`
          });
        }
        if (Number(invEmp.cantidad_disponible) < d.delta) {
          return res.status(400).json({
            error: `Stock insuficiente para: ${d.nombre} (${d.empleadoNombre}). Disponible: ${invEmp.cantidad_disponible}, Requerido adicional: ${d.delta}`
          });
        }
        d.dbId = invEmp.id;
        d.currentStock = Number(invEmp.cantidad_disponible);
      } else if (d.delta < 0 && invEmp) {
        d.dbId = invEmp.id;
        d.currentStock = Number(invEmp.cantidad_disponible);
      }
    }

    const cleanMateriales = typeof materiales_usados === 'string'
      ? materiales_usados
      : (materiales_usados ? JSON.stringify(materiales_usados) : null);

    const cleanFotosAdicionales = (Array.isArray(fotos_adicionales_urls)
      ? fotos_adicionales_urls
      : (fotos_adicionales_urls ? [fotos_adicionales_urls] : []))
      .map(sanitizeEvidenceUrl)
      .filter(Boolean);

    const cleanFotoAntesUrl = sanitizeEvidenceUrl(foto_antes_url);
    const cleanFotoDespuesUrl = sanitizeEvidenceUrl(foto_despues_url);

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
        [cliente, finalDescripcionTrabajo, cleanMateriales, observaciones, cleanFotoAntesUrl, cleanFotoDespuesUrl, cleanFotosAdicionales, cleanColaboradores, id]
      );
      resultData = rows[0];
    } catch (e: any) {
      if (e.message?.includes('colaboradores') || e.code === '42703') {
        const { rows } = await pool.query(
          `UPDATE evidencias SET 
            cliente = $1, descripcion_trabajo = $2, materiales_usados = $3, observaciones = $4, 
            foto_antes_url = $5, foto_despues_url = $6, fotos_adicionales_urls = $7
           WHERE id = $8 RETURNING *`,
          [cliente, finalDescripcionTrabajo, cleanMateriales, observaciones, cleanFotoAntesUrl, cleanFotoDespuesUrl, cleanFotosAdicionales, id]
        );
        resultData = rows[0];
      } else {
        throw e;
      }
    }

    // 5. Aplicar deltas al inventario de los empleados y registrar movimientos
    for (const d of inventoryDeltas) {
      if (d.dbId && d.currentStock !== undefined) {
        const newStock = Math.max(0, Math.round((d.currentStock - d.delta) * 100) / 100);
        await pool.query(
          `UPDATE inventario_empleados SET cantidad_disponible = $1, updated_at = $2 WHERE id = $3`,
          [newStock, new Date().toISOString(), d.dbId]
        );

        const esPropio = d.empleadoId === user.id;
        if (d.delta > 0) {
          const motivoDetalle = esPropio
            ? `Utilizado en edición de evidencia (${cliente || 'Sin cliente'}). ${d.motivos.join(' | ')}`
            : `Utilizado como colaborador en edición de reporte de ${user.nombre} (${cliente || 'Sin cliente'}). ${d.motivos.join(' | ')}`;

          try {
            await pool.query(
              `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por, fecha) VALUES ($1, $2, $3, $4, $5, $6)`,
              [d.productoId, 'SALIDA', d.delta, motivoDetalle, d.empleadoId || user.id, new Date().toISOString()]
            );
          } catch (movErr: any) {
            console.warn('Aviso al registrar movimiento de salida:', movErr?.message);
          }
        } else if (d.delta < 0) {
          const devuelto = Math.abs(d.delta);
          const motivoDetalle = esPropio
            ? `Reintegro por corrección en edición de evidencia (${cliente || 'Sin cliente'}).`
            : `Reintegro por corrección en edición de reporte de ${user.nombre} (${cliente || 'Sin cliente'}).`;

          try {
            await pool.query(
              `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, folio_factura, creado_por, fecha) VALUES ($1, $2, $3, $4, $5, $6)`,
              [d.productoId, 'ENTRADA', devuelto, motivoDetalle, d.empleadoId || user.id, new Date().toISOString()]
            );
          } catch (movErr: any) {
            console.warn('Aviso al registrar movimiento de reintegro:', movErr?.message);
          }
        }
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
    const user = req.user;
    const pool = getDbPool(company, env);
    const { id } = req.params;

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { rows: data } = await pool.query('SELECT * FROM evidencias WHERE id = $1', [id]);
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Evidencia no encontrada' });
    }

    const ev = data[0];
    const esAdminODev = user.rol === 'ADMIN' || user.rol === 'DEV';
    const esPropietario = ev.empleado_id === user.id;

    if (!esAdminODev && !esPropietario) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta evidencia' });
    }

    return res.json({ evidencia: ev });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
