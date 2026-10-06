import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';
import * as XLSX from 'xlsx';

// ==========================================
// 1. CATÁLOGO MAESTRO DE HERRAMIENTAS
// ==========================================

// GET /api/herramientas
export const getHerramientas = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { categoria, soloActivos } = req.query;

    let sql = 'SELECT * FROM herramientas WHERE 1=1';
    let values: any[] = [];
    let paramIndex = 1;

    if (soloActivos === 'true') {
      sql += ` AND activo = $${paramIndex++}`;
      values.push(true);
    }
    if (categoria && typeof categoria === 'string' && categoria !== 'Todas') {
      sql += ` AND categoria = $${paramIndex++}`;
      values.push(categoria);
    }

    sql += ' ORDER BY codigo ASC';

    const { rows: tools } = await pool.query(sql, values);

    if (!tools || tools.length === 0) {
      return res.json([]);
    }

    // Obtener asignaciones actuales de empleados y vehículos para saber custodia y último usuario
    const empResPromise = pool.query(`
      SELECT h.id, h.empleado_id, h.herramienta_id, h.cantidad, h.condicion, h.notas, h.fecha_asignacion,
             json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email) as empleado
      FROM inventario_herramientas_empleado h
      LEFT JOIN usuarios u ON h.empleado_id = u.id
    `);

    const vehResPromise = pool.query(`
      SELECT h.id, h.vehiculo_id, h.herramienta_id, h.cantidad, h.condicion, h.notas, h.fecha_asignacion,
             json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas) as vehiculo
      FROM inventario_herramientas_vehiculo h
      LEFT JOIN vehiculos v ON h.vehiculo_id = v.id
    `);

    const checkResPromise = pool.query(`
      SELECT c.id, c.vehiculo_id, c.empleado_id, c.fecha, c.hora, c.items,
             json_build_object('id', u.id, 'nombre', u.nombre) as empleado
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      ORDER BY c.fecha DESC, c.hora DESC
      LIMIT 100
    `);

    const [empRes, vehRes, checkRes] = await Promise.all([empResPromise, vehResPromise, checkResPromise]);

    const empAssignments = empRes.rows || [];
    const vehAssignments = vehRes.rows || [];
    const recentChecklists = checkRes.rows || [];

    const enrichedTools = tools.map((tool: any) => {
      const empAssign = empAssignments.find((a: any) => a.herramienta_id === tool.id);
      const vehAssign = vehAssignments.find((a: any) => a.herramienta_id === tool.id);

      let estadoActual = tool.estado || 'BUENO';

      let custodia_actual: any = {
        tipo: 'BODEGA',
        descripcion: 'En Almacén Central (Disponible)',
      };

      let ultimo_usuario: any = {
        nombre: 'Sin uso registrado',
        tipo: 'SIN_REGISTRO',
      };

      if (empAssign && empAssign.empleado && empAssign.empleado.id) {
        custodia_actual = {
          tipo: 'EMPLEADO',
          descripcion: `Kit Personal: ${(empAssign.empleado as any).nombre}`,
          entidad: empAssign.empleado,
          fecha_asignacion: empAssign.fecha_asignacion,
        };
        ultimo_usuario = {
          nombre: (empAssign.empleado as any).nombre,
          tipo: 'ASIGNACION_PERSONAL',
          fecha: empAssign.fecha_asignacion,
          detalles: 'Asignada a Kit Personal',
          condicion_reportada: empAssign.condicion,
        };
        if (empAssign.condicion === 'DANADO') {
          estadoActual = 'DANADO';
        }
      } else if (vehAssign && vehAssign.vehiculo && vehAssign.vehiculo.id) {
        const v = vehAssign.vehiculo as any;
        custodia_actual = {
          tipo: 'VEHICULO',
          descripcion: `Camioneta: ${v.marca} ${v.modelo} (${v.placas})`,
          entidad: vehAssign.vehiculo,
          fecha_asignacion: vehAssign.fecha_asignacion,
        };

        // Buscar el último checklist donde aparezca esta herramienta
        const lastChecklist = recentChecklists.find(
          (c: any) =>
            c.vehiculo_id === vehAssign.vehiculo_id &&
            Array.isArray(c.items) &&
            c.items.some((it: any) => it.herramienta_id === tool.id)
        );

        if (lastChecklist && lastChecklist.empleado && lastChecklist.empleado.id) {
          const checkItem = (lastChecklist.items as any[]).find((it: any) => it.herramienta_id === tool.id);
          const isFaltante = checkItem ? checkItem.presente === false : false;

          if (isFaltante) {
            estadoActual = 'FALTANTE';
            custodia_actual.descripcion = `⚠️ FALTANTE en ${v.marca} ${v.modelo} (${v.placas})`;
            ultimo_usuario = {
              nombre: (lastChecklist.empleado as any).nombre,
              tipo: 'CHECKLIST_VEHICULO',
              fecha: `${lastChecklist.fecha} ${lastChecklist.hora || ''}`.trim(),
              detalles: `Reportada como FALTANTE en ${v.placas}`,
              condicion_reportada: 'FALTANTE',
            };
          } else {
            if (checkItem?.estado === 'DANADO') {
              estadoActual = 'DANADO';
            } else if (checkItem?.estado) {
              estadoActual = checkItem.estado;
            }
            ultimo_usuario = {
              nombre: (lastChecklist.empleado as any).nombre,
              tipo: 'CHECKLIST_VEHICULO',
              fecha: `${lastChecklist.fecha} ${lastChecklist.hora || ''}`.trim(),
              detalles: `Revisión en Camioneta ${v.placas}`,
              condicion_reportada: checkItem?.estado || 'BUENO',
            };
          }
        } else {
          ultimo_usuario = {
            nombre: `Asignada a Camioneta ${v.placas}`,
            tipo: 'CHECKLIST_VEHICULO',
            fecha: vehAssign.fecha_asignacion,
            detalles: 'Asignada a vehículo (sin checklist reciente)',
          };
          if (vehAssign.condicion === 'DANADO' || (vehAssign.notas && vehAssign.notas.includes('[FALTANTE]'))) {
            estadoActual = vehAssign.notas && vehAssign.notas.includes('[FALTANTE]') ? 'FALTANTE' : 'DANADO';
          }
        }
      }

      if (tool.estado === 'BAJA' || tool.estado === 'FALTANTE') {
        estadoActual = tool.estado;
      }

      return {
        ...tool,
        estado: estadoActual,
        custodia_actual,
        ultimo_usuario,
      };
    });

    return res.json(enrichedTools);
  } catch (error: any) {
    console.error('[Herramientas] Error in getHerramientas:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper para calcular el siguiente código secuencial H-1, H-2, H-3...
export const getNextToolCodeHelper = async (pool: any): Promise<string> => {
  const { rows } = await pool.query('SELECT codigo FROM herramientas');
  let maxNum = 0;
  (rows || []).forEach((t: any) => {
    if (!t.codigo) return;
    const match = t.codigo.trim().match(/^H-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  return `H-${maxNum + 1}`;
};

// GET /api/herramientas/siguiente-codigo
export const getSiguienteCodigo = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const siguienteCodigo = await getNextToolCodeHelper(pool);
    return res.json({ codigo: siguienteCodigo });
  } catch (error: any) {
    console.error('[Herramientas] Error in getSiguienteCodigo:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas
export const createHerramienta = async (req: Request, res: Response) => {
  try {
    const { company: activeCompany, env } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const body = { ...req.body };
    if (!body.codigo || typeof body.codigo !== 'string' || body.codigo.trim() === '') {
      body.codigo = await getNextToolCodeHelper(primaryPool);
    } else {
      body.codigo = body.codigo.trim().toUpperCase();
    }

    const cols = Object.keys(body);
    const vals = Object.values(body);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await primaryPool.query(
      `INSERT INTO herramientas (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );

    const data = rows[0];

    // Sync con base secundaria
    try {
      const updateSet = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await secondaryPool.query(
        `INSERT INTO herramientas (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
        vals
      );
    } catch (syncErr: any) {
      console.warn('[Herramientas] Error syncing to secondary db:', syncErr?.message);
    }

    return res.status(201).json(data);
  } catch (error: any) {
    console.error('[Herramientas] Error in createHerramienta:', error);
    return res.status(500).json({ error: error.message });
  }
};

// PUT /api/herramientas/:id
export const updateHerramienta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company: activeCompany, env } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const params = [...values, id];

    const { rows } = await primaryPool.query(
      `UPDATE herramientas SET ${setClause} WHERE id = $${params.length} RETURNING *`,
      params
    );

    const data = rows[0];

    try {
      await secondaryPool.query(
        `UPDATE herramientas SET ${setClause} WHERE id = $${params.length}`,
        params
      );
    } catch (syncErr: any) {
      console.warn('[Herramientas] Error updating in secondary db:', syncErr?.message);
    }

    return res.json(data);
  } catch (error: any) {
    console.error('[Herramientas] Error in updateHerramienta:', error);
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /api/herramientas/:id
export const deleteHerramienta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { env } = req.tenant!;

    const poolInttec = getDbPool('inttec', env);
    const poolDaravisa = getDbPool('daravisa', env);

    await Promise.allSettled([
      poolInttec.query('DELETE FROM herramientas WHERE id = $1', [id]),
      poolDaravisa.query('DELETE FROM herramientas WHERE id = $1', [id]),
    ]);

    return res.json({ success: true, message: 'Herramienta eliminada' });
  } catch (error: any) {
    console.error('[Herramientas] Error in deleteHerramienta:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 2. KITS PERSONALES DE EMPLEADOS
// ==========================================

// GET /api/herramientas/empleados
export const getKitsEmpleados = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { empleado_id } = req.query;

    let sql = `
      SELECT 
        i.id, i.empleado_id, i.herramienta_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
        json_build_object(
          'id', h.id, 'codigo', h.codigo, 'nombre', h.nombre, 'categoria', h.categoria,
          'descripcion', h.descripcion, 'numero_serie', h.numero_serie, 'foto_url', h.foto_url,
          'estado', h.estado, 'activo', h.activo
        ) as herramienta,
        json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email, 'rol', u.rol) as empleado
      FROM inventario_herramientas_empleado i
      LEFT JOIN herramientas h ON i.herramienta_id = h.id
      LEFT JOIN usuarios u ON i.empleado_id = u.id
    `;
    let values: any[] = [];
    
    if (empleado_id && typeof empleado_id === 'string') {
      sql += ` WHERE i.empleado_id = $1`;
      values.push(empleado_id);
    }
    
    sql += ` ORDER BY i.fecha_asignacion DESC`;

    const { rows } = await pool.query(sql, values);
    return res.json(rows || []);
  } catch (error: any) {
    console.error('[Herramientas] Error in getKitsEmpleados:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas/empleados/asignar
export const asignarHerramientaEmpleado = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { empleado_id, herramienta_id, cantidad = 1, condicion = 'BUENO', notas = '', asignado_por = null } = req.body;

    if (!empleado_id || !herramienta_id) {
      return res.status(400).json({ error: 'empleado_id y herramienta_id son requeridos' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT id FROM inventario_herramientas_empleado WHERE empleado_id = $1 AND herramienta_id = $2 LIMIT 1',
      [empleado_id, herramienta_id]
    );
    const existing = existingRows[0];

    let resultData;
    const fetchFullDataSql = `
      SELECT i.id, i.empleado_id, i.herramienta_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
             json_build_object('id', h.id, 'codigo', h.codigo, 'nombre', h.nombre, 'categoria', h.categoria, 'descripcion', h.descripcion, 'numero_serie', h.numero_serie, 'estado', h.estado, 'activo', h.activo) as herramienta
      FROM inventario_herramientas_empleado i
      LEFT JOIN herramientas h ON i.herramienta_id = h.id
      WHERE i.id = $1
    `;

    if (existing) {
      const updatePayload: any = {
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
        updated_at: new Date().toISOString(),
      };
      if (asignado_por) updatePayload.asignado_por = asignado_por;

      const keys = Object.keys(updatePayload);
      const values = Object.values(updatePayload);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const params = [...values, existing.id];

      await pool.query(`UPDATE inventario_herramientas_empleado SET ${setClause} WHERE id = $${params.length}`, params);
      const { rows } = await pool.query(fetchFullDataSql, [existing.id]);
      resultData = rows[0];
      return res.status(200).json(resultData);
    } else {
      const insertPayload: any = {
        empleado_id,
        herramienta_id,
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
      };
      if (asignado_por) insertPayload.asignado_por = asignado_por;

      const keys = Object.keys(insertPayload);
      const values = Object.values(insertPayload);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      const { rows: insertedRows } = await pool.query(
        `INSERT INTO inventario_herramientas_empleado (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values
      );
      const newId = insertedRows[0].id;
      
      const { rows } = await pool.query(fetchFullDataSql, [newId]);
      resultData = rows[0];
      return res.status(201).json(resultData);
    }
  } catch (error: any) {
    console.error('[Herramientas] Error in asignarHerramientaEmpleado:', error);
    return res.status(500).json({ error: error.message || 'Error al asignar herramienta al empleado' });
  }
};

// DELETE /api/herramientas/empleados/:id
export const desasignarHerramientaEmpleado = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);

    await pool.query('DELETE FROM inventario_herramientas_empleado WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Herramienta desasignada del empleado' });
  } catch (error: any) {
    console.error('[Herramientas] Error in desasignarHerramientaEmpleado:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 3. KITS DE HERRAMIENTAS POR VEHÍCULO
// ==========================================

// GET /api/herramientas/vehiculos
export const getKitsVehiculos = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { vehiculo_id } = req.query;

    let sql = `
      SELECT 
        i.id, i.vehiculo_id, i.herramienta_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
        json_build_object('id', h.id, 'codigo', h.codigo, 'nombre', h.nombre, 'categoria', h.categoria, 'descripcion', h.descripcion, 'numero_serie', h.numero_serie, 'foto_url', h.foto_url, 'estado', h.estado, 'activo', h.activo) as herramienta,
        json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas, 'numero_economico', v.numero_economico) as vehiculo
      FROM inventario_herramientas_vehiculo i
      LEFT JOIN herramientas h ON i.herramienta_id = h.id
      LEFT JOIN vehiculos v ON i.vehiculo_id = v.id
    `;
    let values: any[] = [];

    if (vehiculo_id && typeof vehiculo_id === 'string') {
      sql += ` WHERE i.vehiculo_id = $1`;
      values.push(vehiculo_id);
    }
    sql += ` ORDER BY i.fecha_asignacion DESC`;

    const { rows: data } = await pool.query(sql, values);

    // Consultar últimos checklists
    const { rows: recentChecklists } = await pool.query(`
      SELECT c.id, c.vehiculo_id, c.fecha, c.hora, c.items,
             json_build_object('nombre', u.nombre) as empleado
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      ORDER BY c.fecha DESC, c.hora DESC
      LIMIT 60
    `);

    const enrichedKits = (data || []).map((item: any) => {
      const lastCheck = (recentChecklists || []).find(
        (c: any) =>
          c.vehiculo_id === item.vehiculo_id &&
          Array.isArray(c.items) &&
          c.items.some((it: any) => it.herramienta_id === item.herramienta_id)
      );

      if (lastCheck) {
        const checkItem = (lastCheck.items as any[]).find((it: any) => it.herramienta_id === item.herramienta_id);
        if (checkItem) {
          if (checkItem.presente === false) {
            return {
              ...item,
              condicion: 'DANADO',
              notas: `[FALTANTE] Reportada faltante por ${(lastCheck.empleado as any)?.nombre || 'Empleado'} el ${lastCheck.fecha}${checkItem.observaciones ? `: ${checkItem.observaciones}` : ''}`,
              herramienta: item.herramienta
                ? { ...item.herramienta, estado: 'FALTANTE' }
                : item.herramienta,
            };
          } else if (checkItem.estado) {
            return {
              ...item,
              condicion: checkItem.estado,
              herramienta: item.herramienta
                ? { ...item.herramienta, estado: checkItem.estado }
                : item.herramienta,
            };
          }
        }
      }

      return item;
    });

    return res.json(enrichedKits);
  } catch (error: any) {
    console.error('[Herramientas] Error in getKitsVehiculos:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas/vehiculos/asignar
export const asignarHerramientaVehiculo = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { vehiculo_id, herramienta_id, cantidad = 1, condicion = 'BUENO', notas = '', asignado_por = null } = req.body;

    if (!vehiculo_id || !herramienta_id) {
      return res.status(400).json({ error: 'vehiculo_id y herramienta_id son requeridos' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT id FROM inventario_herramientas_vehiculo WHERE vehiculo_id = $1 AND herramienta_id = $2 LIMIT 1',
      [vehiculo_id, herramienta_id]
    );
    const existing = existingRows[0];

    const fetchFullDataSql = `
      SELECT i.id, i.vehiculo_id, i.herramienta_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
             json_build_object('id', h.id, 'codigo', h.codigo, 'nombre', h.nombre, 'categoria', h.categoria, 'descripcion', h.descripcion, 'numero_serie', h.numero_serie, 'estado', h.estado, 'activo', h.activo) as herramienta
      FROM inventario_herramientas_vehiculo i
      LEFT JOIN herramientas h ON i.herramienta_id = h.id
      WHERE i.id = $1
    `;

    if (existing) {
      const updatePayload: any = {
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
        updated_at: new Date().toISOString(),
      };
      if (asignado_por) updatePayload.asignado_por = asignado_por;

      const keys = Object.keys(updatePayload);
      const values = Object.values(updatePayload);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const params = [...values, existing.id];

      await pool.query(`UPDATE inventario_herramientas_vehiculo SET ${setClause} WHERE id = $${params.length}`, params);
      const { rows } = await pool.query(fetchFullDataSql, [existing.id]);
      return res.status(200).json(rows[0]);
    } else {
      const insertPayload: any = {
        vehiculo_id,
        herramienta_id,
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
      };
      if (asignado_por) insertPayload.asignado_por = asignado_por;

      const keys = Object.keys(insertPayload);
      const values = Object.values(insertPayload);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      const { rows: insertedRows } = await pool.query(
        `INSERT INTO inventario_herramientas_vehiculo (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        values
      );
      const newId = insertedRows[0].id;
      
      const { rows } = await pool.query(fetchFullDataSql, [newId]);
      return res.status(201).json(rows[0]);
    }
  } catch (error: any) {
    console.error('[Herramientas] Error in asignarHerramientaVehiculo:', error);
    return res.status(500).json({ error: error.message || 'Error al asignar herramienta al vehículo' });
  }
};

// DELETE /api/herramientas/vehiculos/:id
export const desasignarHerramientaVehiculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);

    await pool.query('DELETE FROM inventario_herramientas_vehiculo WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Herramienta desasignada del vehículo' });
  } catch (error: any) {
    console.error('[Herramientas] Error in desasignarHerramientaVehiculo:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 4. CHECKLISTS DE VEHÍCULOS AL INICIAR TRABAJO
// ==========================================

// GET /api/herramientas/checklists
export const getChecklists = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);
    const { vehiculo_id, empleado_id, fecha, limit = '50' } = req.query;

    let sql = `
      SELECT c.*,
             json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas, 'numero_economico', v.numero_economico) as vehiculo,
             json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email) as empleado
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN vehiculos v ON c.vehiculo_id = v.id
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      WHERE 1=1
    `;
    let values: any[] = [];
    let paramIndex = 1;

    if (vehiculo_id && typeof vehiculo_id === 'string') {
      sql += ` AND c.vehiculo_id = $${paramIndex++}`;
      values.push(vehiculo_id);
    }
    if (empleado_id && typeof empleado_id === 'string') {
      sql += ` AND c.empleado_id = $${paramIndex++}`;
      values.push(empleado_id);
    }
    if (fecha && typeof fecha === 'string') {
      sql += ` AND c.fecha = $${paramIndex++}`;
      values.push(fecha);
    }

    const limitNum = parseInt(limit as string, 10) || 50;
    sql += ` ORDER BY c.created_at DESC LIMIT $${paramIndex}`;
    values.push(limitNum);

    const { rows } = await pool.query(sql, values);
    return res.json(rows || []);
  } catch (error: any) {
    console.error('[Herramientas] Error in getChecklists:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas/checklists
export const createChecklist = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);

    const {
      vehiculo_id,
      empleado_id,
      items = [],
      observaciones_generales = '',
      ubicacion_gps = null,
      foto_evidencia_url = null,
    } = req.body;

    if (!vehiculo_id || !empleado_id) {
      return res.status(400).json({ error: 'vehiculo_id y empleado_id son requeridos' });
    }

    const itemsList = Array.isArray(items) ? items : [];
    const total_herramientas = itemsList.length;
    let total_presentes = 0;
    let total_faltantes = 0;
    let total_danadas = 0;

    itemsList.forEach((it: any) => {
      if (it.presente) {
        total_presentes++;
      } else {
        total_faltantes++;
      }
      if (it.estado === 'DANADO') {
        total_danadas++;
      }
    });

    const now = new Date();
    const hora = now.toTimeString().split(' ')[0]; // HH:mm:ss
    const todayStr = now.toISOString().split('T')[0];

    const insertPayload = {
      vehiculo_id,
      empleado_id,
      fecha: todayStr,
      hora,
      items: JSON.stringify(itemsList),
      total_herramientas,
      total_presentes,
      total_faltantes,
      total_danadas,
      observaciones_generales,
      ubicacion_gps: ubicacion_gps ? JSON.stringify(ubicacion_gps) : null,
      foto_evidencia_url,
    };

    const keys = Object.keys(insertPayload);
    const values = Object.values(insertPayload);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const { rows: inserted } = await pool.query(
      `INSERT INTO checklists_vehiculo_herramientas (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values
    );

    const { rows: dataRows } = await pool.query(`
      SELECT c.*,
             json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas) as vehiculo,
             json_build_object('id', u.id, 'nombre', u.nombre) as empleado
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN vehiculos v ON c.vehiculo_id = v.id
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      WHERE c.id = $1
    `, [inserted[0].id]);
    
    const data = dataRows[0];

    // Sincronizar automáticamente el estado de cada herramienta
    try {
      for (const it of itemsList) {
        if (!it.herramienta_id) continue;

        if (!it.presente) {
          const missingNote = `[FALTANTE] Reportada como faltante en revisión de vehículo el ${todayStr}${it.observaciones ? `: ${it.observaciones}` : ''}`;
          await pool.query(
            `UPDATE inventario_herramientas_vehiculo SET condicion = 'DANADO', notas = $1, updated_at = $2 WHERE vehiculo_id = $3 AND herramienta_id = $4`,
            [missingNote, new Date().toISOString(), vehiculo_id, it.herramienta_id]
          );

          await pool.query(
            `UPDATE herramientas SET estado = 'BAJA' WHERE id = $1`,
            [it.herramienta_id]
          );
        } else {
          await pool.query(
            `UPDATE inventario_herramientas_vehiculo SET condicion = $1, updated_at = $2 WHERE vehiculo_id = $3 AND herramienta_id = $4`,
            [it.estado || 'BUENO', new Date().toISOString(), vehiculo_id, it.herramienta_id]
          );

          if (it.estado) {
            await pool.query(
              `UPDATE herramientas SET estado = $1 WHERE id = $2`,
              [it.estado, it.herramienta_id]
            );
          }
        }
      }
    } catch (syncErr: any) {
      console.warn('[Herramientas] Error synchronizing tool status from checklist items:', syncErr?.message);
    }

    return res.status(201).json(data);
  } catch (error: any) {
    console.error('[Herramientas] Error in createChecklist:', error);
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/herramientas/checklists/ultimo/:vehiculoId
export const getUltimoChecklistVehiculo = async (req: Request, res: Response) => {
  try {
    const { vehiculoId } = req.params;
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);

    const { rows } = await pool.query(`
      SELECT c.*, json_build_object('id', u.id, 'nombre', u.nombre) as empleado
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      WHERE c.vehiculo_id = $1
      ORDER BY c.created_at DESC
      LIMIT 1
    `, [vehiculoId]);

    return res.json(rows[0] || null);
  } catch (error: any) {
    console.error('[Herramientas] Error in getUltimoChecklistVehiculo:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 5. TRAZABILIDAD E HISTORIAL DE HERRAMIENTA
// ==========================================

// GET /api/herramientas/:id/trazabilidad
export const getTrazabilidadHerramienta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const pool = getDbPool(company, env);

    // 1. Obtener la herramienta
    const { rows: toolRows } = await pool.query('SELECT * FROM herramientas WHERE id = $1', [id]);
    const herramienta = toolRows[0];

    if (!herramienta) {
      return res.status(404).json({ error: 'Herramienta no encontrada' });
    }

    // 2. Obtener asignación actual de empleado
    const { rows: empRows } = await pool.query(`
      SELECT i.id, i.empleado_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
             json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email, 'rol', u.rol) as empleado
      FROM inventario_herramientas_empleado i
      LEFT JOIN usuarios u ON i.empleado_id = u.id
      WHERE i.herramienta_id = $1 LIMIT 1
    `, [id]);
    const empAssign = empRows[0];

    // 3. Obtener asignación actual de vehículo
    const { rows: vehRows } = await pool.query(`
      SELECT i.id, i.vehiculo_id, i.cantidad, i.condicion, i.notas, i.fecha_asignacion, i.updated_at,
             json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas, 'numero_economico', v.numero_economico) as vehiculo
      FROM inventario_herramientas_vehiculo i
      LEFT JOIN vehiculos v ON i.vehiculo_id = v.id
      WHERE i.herramienta_id = $1 LIMIT 1
    `, [id]);
    const vehAssign = vehRows[0];

    // 4. Obtener todos los checklists
    const { rows: allChecklists } = await pool.query(`
      SELECT c.id, c.vehiculo_id, c.empleado_id, c.fecha, c.hora, c.items, c.observaciones_generales, c.ubicacion_gps, c.created_at,
             json_build_object('id', u.id, 'nombre', u.nombre, 'email', u.email) as empleado,
             json_build_object('id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'placas', v.placas) as vehiculo
      FROM checklists_vehiculo_herramientas c
      LEFT JOIN usuarios u ON c.empleado_id = u.id
      LEFT JOIN vehiculos v ON c.vehiculo_id = v.id
      ORDER BY c.fecha DESC, c.hora DESC
      LIMIT 60
    `);

    const checklistEvents = (allChecklists || [])
      .filter((c: any) => Array.isArray(c.items) && c.items.some((it: any) => it.herramienta_id === id))
      .map((c: any) => {
        const it = (c.items as any[]).find((x: any) => x.herramienta_id === id);
        return {
          id: c.id,
          tipo: 'CHECKLIST_VEHICULO',
          fecha: c.fecha,
          hora: c.hora,
          usuario: (c.empleado as any)?.nombre || 'Empleado',
          vehiculo: `${(c.vehiculo as any)?.marca || ''} ${(c.vehiculo as any)?.modelo || ''} (${(c.vehiculo as any)?.placas || ''})`.trim(),
          presente: it?.presente ?? true,
          estado_reportado: it?.estado || 'BUENO',
          observaciones: it?.observaciones || c.observaciones_generales || '',
          ubicacion_gps: c.ubicacion_gps,
        };
      });

    return res.json({
      herramienta,
      custodia_actual: empAssign && empAssign.empleado && empAssign.empleado.id
        ? {
            tipo: 'EMPLEADO',
            nombre: (empAssign.empleado as any)?.nombre,
            email: (empAssign.empleado as any)?.email,
            fecha_asignacion: empAssign.fecha_asignacion,
            condicion: empAssign.condicion,
            notas: empAssign.notas,
          }
        : vehAssign && vehAssign.vehiculo && vehAssign.vehiculo.id
        ? {
            tipo: 'VEHICULO',
            vehiculo: vehAssign.vehiculo,
            fecha_asignacion: vehAssign.fecha_asignacion,
            condicion: vehAssign.condicion,
            notas: vehAssign.notas,
          }
        : {
            tipo: 'BODEGA',
            descripcion: 'En Almacén Central (Disponible)',
          },
      historial_checklists: checklistEvents,
    });
  } catch (error: any) {
    console.error('[Herramientas] Error in getTrazabilidadHerramienta:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 5. IMPORTACIÓN MASIVA DESDE EXCEL / CSV
// ==========================================

// POST /api/herramientas/importar-excel
export const importarHerramientasExcel = async (req: Request, res: Response) => {
  try {
    const { company: activeCompany, env } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';

    const primaryPool = getDbPool(activeCompany, env);
    const secondaryPool = getDbPool(secondaryCompany, env);

    const { fileBase64, previewOnly, overwriteExisting = true } = req.body;

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'Se requiere el archivo Excel en formato Base64' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ error: 'El archivo Excel no contiene hojas de cálculo' });
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'El archivo Excel no contiene filas de datos' });
    }

    // 1. Obtener herramientas existentes para detectar duplicados por código o nombre
    const { rows: existingTools } = await primaryPool.query('SELECT id, codigo, nombre FROM herramientas');
    const existingByCode = new Map<string, any>((existingTools || []).map((t: any) => [String(t.codigo || '').trim().toUpperCase(), t]));
    const existingByName = new Map<string, any>((existingTools || []).map((t: any) => [String(t.nombre || '').trim().toLowerCase(), t]));

    // Calcular próximo código numérico H-X
    let nextNum = 0;
    (existingTools || []).forEach((t: any) => {
      if (!t.codigo) return;
      const match = String(t.codigo).trim().match(/^H-(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > nextNum) nextNum = n;
      }
    });

    const parsedTools: any[] = [];
    const errors: string[] = [];

    const normalizeCol = (str: string) =>
      String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '_');

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowKeys = Object.keys(row);
      if (rowKeys.length === 0) continue;

      let rawCode = '';
      let rawName = '';
      let rawCat = '';
      let rawDesc = '';
      let rawSerie = '';
      let rawEstado = '';
      let rawActivo: any = true;

      for (const key of rowKeys) {
        const normKey = normalizeCol(key);
        const val = String(row[key] ?? '').trim();

        if (normKey === 'codigo' || normKey === 'code' || normKey === 'clave' || normKey === 'sku' || normKey === 'id') {
          if (!rawCode) rawCode = val;
        } else if (normKey.includes('nombre') || normKey.includes('herramienta') || normKey.includes('articulo') || normKey.includes('item') || normKey === 'name') {
          if (!rawName) rawName = val;
        } else if (normKey.includes('categoria') || normKey.includes('category') || normKey === 'tipo' || normKey === 'familia') {
          if (!rawCat) rawCat = val;
        } else if (normKey.includes('descrip') || normKey.includes('detalle') || normKey.includes('nota') || normKey.includes('observaci')) {
          if (!rawDesc) rawDesc = val;
        } else if (normKey.includes('serie') || normKey.includes('serial') || normKey === 'sn') {
          if (!rawSerie) rawSerie = val;
        } else if (normKey.includes('estado') || normKey.includes('condicion') || normKey.includes('status')) {
          if (!rawEstado) rawEstado = val;
        } else if (normKey.includes('activ') || normKey === 'status_activo') {
          rawActivo = val;
        }
      }

      if (!rawName) {
        const firstVal = Object.values(row).find((v: any) => v && typeof v === 'string' && v.trim().length > 1);
        if (firstVal) {
          rawName = String(firstVal).trim();
        }
      }

      if (!rawName || rawName === '') {
        continue;
      }

      const normCatLower = rawCat.toLowerCase();
      let finalCat = 'Manual';
      if (normCatLower.includes('elec')) finalCat = 'Eléctrica';
      else if (normCatLower.includes('med')) finalCat = 'Medición';
      else if (normCatLower.includes('segur') || normCatLower.includes('epp') || normCatLower.includes('protec')) finalCat = 'Seguridad';
      else if (normCatLower.includes('cort')) finalCat = 'Corte';
      else if (normCatLower.includes('fij') || normCatLower.includes('tornill') || normCatLower.includes('clav')) finalCat = 'Fijación';
      else if (normCatLower.includes('gen')) finalCat = 'General';
      else if (rawCat.trim()) finalCat = rawCat.trim();

      const normEstadoLower = rawEstado.toLowerCase();
      let finalEstado: 'NUEVO' | 'BUENO' | 'REGULAR' | 'INCOMPLETO' | 'DANADO' | 'EN_REPARACION' | 'BAJA' = 'BUENO';
      if (normEstadoLower.includes('nuev') || normEstadoLower.includes('new')) finalEstado = 'NUEVO';
      else if (normEstadoLower.includes('buen') || normEstadoLower.includes('opt') || normEstadoLower.includes('excel')) finalEstado = 'BUENO';
      else if (normEstadoLower.includes('reg') || normEstadoLower.includes('usad') || normEstadoLower.includes('med')) finalEstado = 'REGULAR';
      else if (normEstadoLower.includes('incomple') || normEstadoLower.includes('falt') || normEstadoLower.includes('perd') || normEstadoLower.includes('extrav')) finalEstado = 'INCOMPLETO';
      else if (normEstadoLower.includes('dan') || normEstadoLower.includes('dañ') || normEstadoLower.includes('rot') || normEstadoLower.includes('aver') || normEstadoLower.includes('mal')) finalEstado = 'DANADO';
      else if (normEstadoLower.includes('repar') || normEstadoLower.includes('tall')) finalEstado = 'EN_REPARACION';
      else if (normEstadoLower.includes('baj') || normEstadoLower.includes('desech')) finalEstado = 'BAJA';

      let finalActivo = true;
      if (typeof rawActivo === 'string') {
        const aLow = rawActivo.toLowerCase();
        if (aLow === 'no' || aLow === 'false' || aLow === '0' || aLow === 'inactivo' || aLow === 'desactivado') {
          finalActivo = false;
        }
      } else if (rawActivo === false || rawActivo === 0) {
        finalActivo = false;
      }

      let finalCode = rawCode ? rawCode.toUpperCase() : '';
      let isExisting = false;
      let existingId = '';

      if (finalCode) {
        const found = existingByCode.get(finalCode);
        if (found) {
          isExisting = true;
          existingId = found.id;
        }
      } else {
        const foundByName = existingByName.get(rawName.toLowerCase());
        if (foundByName) {
          isExisting = true;
          existingId = foundByName.id;
          finalCode = foundByName.codigo;
        } else {
          nextNum++;
          finalCode = `H-${nextNum}`;
        }
      }

      parsedTools.push({
        id: existingId || undefined,
        codigo: finalCode,
        nombre: rawName,
        categoria: finalCat,
        descripcion: rawDesc || null,
        numero_serie: rawSerie || null,
        estado: finalEstado,
        activo: finalActivo,
        es_existente: isExisting,
        accion: isExisting ? (overwriteExisting ? 'ACTUALIZAR' : 'OMITIR') : 'CREAR',
        fila: i + 2,
      });
    }

    if (parsedTools.length === 0) {
      return res.status(400).json({ error: 'No se encontraron herramientas legibles en el archivo Excel.' });
    }

    if (previewOnly) {
      return res.json({
        success: true,
        previewOnly: true,
        totalEncontrados: parsedTools.length,
        totalNuevos: parsedTools.filter(t => !t.es_existente).length,
        totalExistentes: parsedTools.filter(t => t.es_existente).length,
        herramientas: parsedTools,
      });
    }

    let insertCount = 0;
    let updateCount = 0;

    for (const tool of parsedTools) {
      const payload: any = {
        codigo: tool.codigo,
        nombre: tool.nombre,
        categoria: tool.categoria,
        descripcion: tool.descripcion,
        numero_serie: tool.numero_serie,
        estado: tool.estado,
        activo: tool.activo,
      };

      if (tool.es_existente && tool.id) {
        if (overwriteExisting) {
          const keys = Object.keys(payload);
          const values = Object.values(payload);
          const setClause = keys.map((k, idx) => `${k} = $${idx + 1}`).join(', ');
          const params = [...values, tool.id];

          try {
            await primaryPool.query(`UPDATE herramientas SET ${setClause} WHERE id = $${params.length}`, params);
            updateCount++;
            try {
              await secondaryPool.query(`UPDATE herramientas SET ${setClause} WHERE id = $${params.length}`, params);
            } catch (_) {}
          } catch (upErr: any) {
            errors.push(`Fila ${tool.fila} (${tool.nombre}): Error al actualizar - ${upErr.message}`);
          }
        }
      } else {
        const keys = Object.keys(payload);
        const values = Object.values(payload);
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
        try {
          const { rows } = await primaryPool.query(`INSERT INTO herramientas (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`, values);
          insertCount++;
          try {
            if (rows[0]) {
              const updateSet = keys.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
              await secondaryPool.query(
                `INSERT INTO herramientas (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
                values
              );
            }
          } catch (_) {}
        } catch (insErr: any) {
          errors.push(`Fila ${tool.fila} (${tool.nombre}): Error al insertar - ${insErr.message}`);
        }
      }
    }

    return res.json({
      success: true,
      previewOnly: false,
      totalProcesados: parsedTools.length,
      insertCount,
      updateCount,
      errores: errors,
      mensaje: `Se importaron ${insertCount} herramientas nuevas y se actualizaron ${updateCount} existentes con éxito.`,
    });
  } catch (error: any) {
    console.error('[Herramientas] Error in importarHerramientasExcel:', error);
    return res.status(500).json({ error: error.message || 'Error al procesar el archivo Excel' });
  }
};
