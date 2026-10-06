import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const getTareas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    const user = (req as any).user;

    let query = `
      SELECT t.*, 
             c.nombre AS creador_nombre,
             r.nombre AS responsable_nombre
      FROM tareas t
      LEFT JOIN usuarios c ON t.creado_por = c.id
      LEFT JOIN usuarios r ON t.responsable_id = r.id
      WHERE 1=1
    `;
    const values: any[] = [];

    if (user?.rol === 'EMPLEADO') {
      const { rows: corrData } = await pool.query(`SELECT tarea_id FROM tarea_corresponsables WHERE usuario_id = $1`, [user.id]);
      const corrIds = corrData.map((c: any) => c.tarea_id);
      
      const conditions = [];
      conditions.push(`t.responsable_id = $${values.length + 1}`);
      values.push(user.id);
      
      conditions.push(`t.creado_por = $${values.length + 1}`);
      values.push(user.id);
      
      if (corrIds.length > 0) {
        const placeholders = corrIds.map((_: any, i: number) => `$${values.length + i + 1}`).join(',');
        conditions.push(`t.id IN (${placeholders})`);
        values.push(...corrIds);
      }
      
      query += ` AND (${conditions.join(' OR ')})`;
    }

    query += ` ORDER BY t.fecha_compromiso ASC`;

    const { rows: data } = await pool.query(query, values);

    // Obtener corresponsables para estas tareas
    const taskIds = data.map((t: any) => t.id);
    let corresponsablesMap: any = {};
    if (taskIds.length > 0) {
      const placeholders = taskIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const corrQuery = `
        SELECT tc.tarea_id, tc.usuario_id, u.nombre
        FROM tarea_corresponsables tc
        JOIN usuarios u ON tc.usuario_id = u.id
        WHERE tc.tarea_id IN (${placeholders})
      `;
      const { rows: corrRows } = await pool.query(corrQuery, taskIds);
      corrRows.forEach((row: any) => {
        if (!corresponsablesMap[row.tarea_id]) corresponsablesMap[row.tarea_id] = [];
        corresponsablesMap[row.tarea_id].push({ usuario_id: row.usuario_id, usuario_nombre: row.nombre });
      });
    }

    const clientIds = data.filter((t: any) => t.vinculo_tipo === 'Cliente' && t.vinculo_id).map((t: any) => t.vinculo_id);
    const ventaIds = data.filter((t: any) => t.vinculo_tipo === 'Venta' && t.vinculo_id).map((t: any) => t.vinculo_id);

    let clientsMap: any = {};
    let ventasMap: any = {};

    if (clientIds.length > 0) {
      const placeholders = clientIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const { rows: clientsData } = await pool.query(`SELECT id, nombre FROM clientes WHERE id IN (${placeholders})`, clientIds);
      clientsData.forEach((c: any) => clientsMap[c.id] = c.nombre);
    }
    
    if (ventaIds.length > 0) {
      const placeholders = ventaIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const { rows: ventasData } = await pool.query(`SELECT id, cliente, factura_referencia FROM ventas WHERE id IN (${placeholders})`, ventaIds);
      ventasData.forEach((v: any) => ventasMap[v.id] = { cliente: v.cliente, referencia: v.factura_referencia });
    }

    const formattedTasks = data.map((t: any) => {
      let vinculo_nombre = '';
      if (t.vinculo_tipo === 'Cliente' && clientsMap[t.vinculo_id]) {
        vinculo_nombre = clientsMap[t.vinculo_id];
      } else if (t.vinculo_tipo === 'Venta' && ventasMap[t.vinculo_id]) {
        vinculo_nombre = `${ventasMap[t.vinculo_id].cliente} - ${ventasMap[t.vinculo_id].referencia}`;
      }

      return {
        ...t,
        creado_por_nombre: t.creador_nombre,
        responsable_nombre: t.responsable_nombre,
        vinculo_nombre,
        corresponsables: corresponsablesMap[t.id] || []
      };
    });

    res.json(formattedTasks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTareaById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);

    const { rows } = await pool.query(`
      SELECT t.*, 
             c.nombre AS creador_nombre,
             r.nombre AS responsable_nombre
      FROM tareas t
      LEFT JOIN usuarios c ON t.creado_por = c.id
      LEFT JOIN usuarios r ON t.responsable_id = r.id
      WHERE t.id = $1
    `, [id]);

    if (rows.length === 0) {
      res.status(404).json({ message: 'Tarea no encontrada' });
      return;
    }
    const taskData = rows[0];

    const { rows: corrRows } = await pool.query(`
      SELECT tc.usuario_id, u.nombre
      FROM tarea_corresponsables tc
      JOIN usuarios u ON tc.usuario_id = u.id
      WHERE tc.tarea_id = $1
    `, [id]);

    let vinculo_nombre = '';
    if (taskData.vinculo_tipo === 'Cliente' && taskData.vinculo_id) {
      const { rows: clientData } = await pool.query(`SELECT nombre FROM clientes WHERE id = $1`, [taskData.vinculo_id]);
      if (clientData.length > 0) vinculo_nombre = clientData[0].nombre;
    } else if (taskData.vinculo_tipo === 'Venta' && taskData.vinculo_id) {
      const { rows: ventaData } = await pool.query(`SELECT cliente, factura_referencia FROM ventas WHERE id = $1`, [taskData.vinculo_id]);
      if (ventaData.length > 0) vinculo_nombre = `${ventaData[0].cliente} - ${ventaData[0].factura_referencia}`;
    }

    const { rows: notesData } = await pool.query(`
      SELECT tn.*, u.nombre AS usuario_nombre
      FROM tarea_notas tn
      LEFT JOIN usuarios u ON tn.usuario_id = u.id
      WHERE tn.tarea_id = $1
      ORDER BY tn.created_at DESC
    `, [id]);

    res.json({
      ...taskData,
      creado_por_nombre: taskData.creador_nombre,
      responsable_nombre: taskData.responsable_nombre,
      vinculo_nombre,
      corresponsables: corrRows.map((c: any) => ({
        usuario_id: c.usuario_id,
        usuario_nombre: c.nombre
      })),
      notas: notesData
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFormLookups = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    const user = (req as any).user;

    let userQuery = `SELECT id, nombre, rol FROM usuarios`;
    let userParams: any[] = [];

    if (user?.rol === 'EMPLEADO') {
      userQuery += ` WHERE rol = $1`;
      userParams = ['EMPLEADO'];
    }

    userQuery += ` ORDER BY nombre ASC`;

    const { rows: usersData } = await pool.query(userQuery, userParams);
    const { rows: clientsData } = await pool.query(`SELECT id, nombre FROM clientes ORDER BY nombre ASC`);
    const { rows: ventasData } = await pool.query(`SELECT id, cliente, factura_referencia, fecha, sucursal FROM ventas ORDER BY fecha DESC`);

    res.json({
      usuarios: usersData,
      clientes: clientsData,
      ventas: ventasData
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createTarea = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    const { corresponsables, ...nuevaTarea } = req.body;

    const keys = Object.keys(nuevaTarea);
    const values = Object.values(nuevaTarea);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: insertedTasks } = await pool.query(
      `INSERT INTO tareas (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const tarea = insertedTasks[0];

    let targetIds: string[] = [];
    if (tarea.responsable_id) targetIds.push(tarea.responsable_id);

    if (corresponsables && corresponsables.length > 0) {
      for (const uid of corresponsables) {
        await pool.query(
          `INSERT INTO tarea_corresponsables (tarea_id, usuario_id) VALUES ($1, $2)`,
          [tarea.id, uid]
        );
      }
      targetIds = targetIds.concat(corresponsables);
    }

    targetIds = [...new Set(targetIds)];

    if (targetIds.length > 0) {
      try {
        const p = targetIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const { rows: targetEmpleados } = await pool.query(`SELECT * FROM usuarios WHERE id IN (${p})`, targetIds);
        
        if (targetEmpleados && targetEmpleados.length > 0) {
          const docTitulo = tarea.titulo || 'Nueva Tarea Asignada';
          
          for (const emp of targetEmpleados) {
            await pool.query(
              `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
              [emp.id, '📋 Nueva Tarea Asignada', `Se te ha asignado la tarea "${docTitulo}".`, 'TAREA_NUEVA', tarea.id]
            );
          }

          const pushMessages = targetEmpleados
            .filter((emp: any) => emp.expo_push_token && typeof emp.expo_push_token === 'string' && emp.expo_push_token.trim().length > 0)
            .map((emp: any) => ({
              to: emp.expo_push_token.trim(),
              sound: 'default',
              title: '📋 Nueva Tarea Asignada',
              body: `Se te ha asignado la tarea "${docTitulo}".`,
              data: { screen: '/(empleado)/tareas', tareaId: tarea.id, type: 'TAREA_NUEVA' },
              priority: 'high',
              channelId: 'default',
            }));

          if (pushMessages.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < pushMessages.length; i += chunkSize) {
              const chunk = pushMessages.slice(i, i + chunkSize);
              fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
                body: JSON.stringify(chunk),
              }).catch(err => console.warn('[Tareas] Error al enviar lote push notifications:', err));
            }
          }
        }
      } catch (notifErr) {
        console.warn('[Tareas] Error al procesar notificaciones:', notifErr);
      }
    }

    res.json(tarea);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTarea = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    
    const { nota_texto, corresponsables, ...updates } = req.body;

    const keys = Object.keys(updates);
    if (keys.length > 0) {
      const values = Object.values(updates);
      const setString = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      values.push(id);
      await pool.query(`UPDATE tareas SET ${setString} WHERE id = $${values.length}`, values);
    }

    if (corresponsables !== undefined) {
      await pool.query(`DELETE FROM tarea_corresponsables WHERE tarea_id = $1`, [id]);
      if (Array.isArray(corresponsables) && corresponsables.length > 0) {
        for (const uid of corresponsables) {
          await pool.query(
            `INSERT INTO tarea_corresponsables (tarea_id, usuario_id) VALUES ($1, $2)`,
            [id, uid]
          );
        }
      }
    }

    if (nota_texto) {
      await pool.query(
        `INSERT INTO tarea_notas (tarea_id, usuario_id, comentario) VALUES ($1, $2, $3)`,
        [id, (req as any).user?.id, nota_texto]
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addNota = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    
    const { comentario } = req.body;
    
    const { rows: insertedNotes } = await pool.query(
      `INSERT INTO tarea_notas (tarea_id, usuario_id, comentario) VALUES ($1, $2, $3) RETURNING *`,
      [id, (req as any).user?.id, comentario]
    );
    const data = insertedNotes[0];

    const { rows: users } = await pool.query(`SELECT nombre FROM usuarios WHERE id = $1`, [data.usuario_id]);

    const formattedNote = {
      ...data,
      usuario_nombre: users.length > 0 ? users[0].nombre : ((req as any).user?.nombre || 'Usuario')
    };

    res.json(formattedNote);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
