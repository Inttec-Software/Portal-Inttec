import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import * as XLSX from 'xlsx';

// ==========================================
// 1. CATÁLOGO MAESTRO DE HERRAMIENTAS
// ==========================================

// GET /api/herramientas
export const getHerramientas = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const { categoria, soloActivos } = req.query;

    let query = supabase.from('herramientas').select('*');

    if (soloActivos === 'true') {
      query = query.eq('activo', true);
    }
    if (categoria && typeof categoria === 'string' && categoria !== 'Todas') {
      query = query.eq('categoria', categoria);
    }

    const { data: tools, error } = await query.order('codigo', { ascending: true });
    if (error) throw error;

    if (!tools || tools.length === 0) {
      return res.json([]);
    }

    // Obtener asignaciones actuales de empleados y vehículos para saber custodia y último usuario
    const [empRes, vehRes, checkRes] = await Promise.all([
      supabase
        .from('inventario_herramientas_empleado')
        .select('id, empleado_id, herramienta_id, cantidad, condicion, notas, fecha_asignacion, empleado:usuarios!empleado_id(id, nombre, email)'),
      supabase
        .from('inventario_herramientas_vehiculo')
        .select('id, vehiculo_id, herramienta_id, cantidad, condicion, notas, fecha_asignacion, vehiculo:vehiculos!vehiculo_id(id, marca, modelo, placas)'),
      supabase
        .from('checklists_vehiculo_herramientas')
        .select('id, vehiculo_id, empleado_id, fecha, hora, items, empleado:usuarios!empleado_id(id, nombre)')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .limit(100),
    ]);

    const empAssignments = empRes.data || [];
    const vehAssignments = vehRes.data || [];
    const recentChecklists = checkRes.data || [];

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

      if (empAssign && empAssign.empleado) {
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
      } else if (vehAssign && vehAssign.vehiculo) {
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

        if (lastChecklist && lastChecklist.empleado) {
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
export const getNextToolCodeHelper = async (client: any): Promise<string> => {
  const { data } = await client.from('herramientas').select('codigo');
  let maxNum = 0;
  (data || []).forEach((t: any) => {
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
    const supabase = getSupabaseClient(company, env);
    const siguienteCodigo = await getNextToolCodeHelper(supabase);
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

    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

    const body = { ...req.body };
    if (!body.codigo || typeof body.codigo !== 'string' || body.codigo.trim() === '') {
      body.codigo = await getNextToolCodeHelper(primaryClient);
    } else {
      body.codigo = body.codigo.trim().toUpperCase();
    }

    const { data, error } = await primaryClient
      .from('herramientas')
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    // Sync con base secundaria
    try {
      await secondaryClient.from('herramientas').upsert([data]);
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

    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

    const { data, error } = await primaryClient
      .from('herramientas')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('herramientas').update(req.body).eq('id', id);
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

    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    await Promise.allSettled([
      clientInttec.from('herramientas').delete().eq('id', id),
      clientDaravisa.from('herramientas').delete().eq('id', id),
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
    const supabase = getSupabaseClient(company, env);
    const { empleado_id } = req.query;

    let query = supabase
      .from('inventario_herramientas_empleado')
      .select(`
        id,
        empleado_id,
        herramienta_id,
        cantidad,
        condicion,
        notas,
        fecha_asignacion,
        updated_at,
        herramienta:herramientas (
          id,
          codigo,
          nombre,
          categoria,
          descripcion,
          numero_serie,
          foto_url,
          estado,
          activo
        ),
        empleado:usuarios!empleado_id (
          id,
          nombre,
          email,
          rol
        )
      `);

    if (empleado_id && typeof empleado_id === 'string') {
      query = query.eq('empleado_id', empleado_id);
    }

    const { data, error } = await query.order('fecha_asignacion', { ascending: false });
    if (error) throw error;

    return res.json(data || []);
  } catch (error: any) {
    console.error('[Herramientas] Error in getKitsEmpleados:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas/empleados/asignar
export const asignarHerramientaEmpleado = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const { empleado_id, herramienta_id, cantidad = 1, condicion = 'BUENO', notas = '', asignado_por = null } = req.body;

    if (!empleado_id || !herramienta_id) {
      return res.status(400).json({ error: 'empleado_id y herramienta_id son requeridos' });
    }

    // Comprobar si ya existe asignación previa de esta herramienta al empleado
    const { data: existing, error: checkErr } = await supabase
      .from('inventario_herramientas_empleado')
      .select('id')
      .eq('empleado_id', empleado_id)
      .eq('herramienta_id', herramienta_id)
      .maybeSingle();

    if (checkErr) {
      console.warn('[Herramientas] Error checking existing employee tool assignment:', checkErr);
    }

    let savedId = existing?.id;

    if (existing) {
      const updatePayload: any = {
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
        updated_at: new Date().toISOString(),
      };
      if (asignado_por) updatePayload.asignado_por = asignado_por;

      const { data: updated, error: updateErr } = await supabase
        .from('inventario_herramientas_empleado')
        .update(updatePayload)
        .eq('id', existing.id)
        .select(`
          id,
          empleado_id,
          herramienta_id,
          cantidad,
          condicion,
          notas,
          fecha_asignacion,
          updated_at,
          herramienta:herramientas (*)
        `)
        .single();

      if (updateErr) throw updateErr;
      return res.status(200).json(updated);
    } else {
      const insertPayload: any = {
        empleado_id,
        herramienta_id,
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
      };
      if (asignado_por) insertPayload.asignado_por = asignado_por;

      const { data: inserted, error: insertErr } = await supabase
        .from('inventario_herramientas_empleado')
        .insert(insertPayload)
        .select(`
          id,
          empleado_id,
          herramienta_id,
          cantidad,
          condicion,
          notas,
          fecha_asignacion,
          updated_at,
          herramienta:herramientas (*)
        `)
        .single();

      if (insertErr) throw insertErr;
      return res.status(201).json(inserted);
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
    const supabase = getSupabaseClient(company, env);

    const { error } = await supabase
      .from('inventario_herramientas_empleado')
      .delete()
      .eq('id', id);

    if (error) throw error;
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
    const supabase = getSupabaseClient(company, env);
    const { vehiculo_id } = req.query;

    let query = supabase
      .from('inventario_herramientas_vehiculo')
      .select(`
        id,
        vehiculo_id,
        herramienta_id,
        cantidad,
        condicion,
        notas,
        fecha_asignacion,
        updated_at,
        herramienta:herramientas (
          id,
          codigo,
          nombre,
          categoria,
          descripcion,
          numero_serie,
          foto_url,
          estado,
          activo
        ),
        vehiculo:vehiculos!vehiculo_id (
          id,
          marca,
          modelo,
          placas,
          numero_economico
        )
      `);

    if (vehiculo_id && typeof vehiculo_id === 'string') {
      query = query.eq('vehiculo_id', vehiculo_id);
    }

    const { data, error } = await query.order('fecha_asignacion', { ascending: false });
    if (error) throw error;

    // Consultar últimos checklists para reflejar el estado vivo de las herramientas en los vehículos
    const { data: recentChecklists } = await supabase
      .from('checklists_vehiculo_herramientas')
      .select('id, vehiculo_id, fecha, hora, items, empleado:usuarios!empleado_id(nombre)')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(60);

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
    const supabase = getSupabaseClient(company, env);
    const { vehiculo_id, herramienta_id, cantidad = 1, condicion = 'BUENO', notas = '', asignado_por = null } = req.body;

    if (!vehiculo_id || !herramienta_id) {
      return res.status(400).json({ error: 'vehiculo_id y herramienta_id son requeridos' });
    }

    const { data: existing, error: checkErr } = await supabase
      .from('inventario_herramientas_vehiculo')
      .select('id')
      .eq('vehiculo_id', vehiculo_id)
      .eq('herramienta_id', herramienta_id)
      .maybeSingle();

    if (checkErr) {
      console.warn('[Herramientas] Error checking existing vehicle tool assignment:', checkErr);
    }

    if (existing) {
      const updatePayload: any = {
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
        updated_at: new Date().toISOString(),
      };
      if (asignado_por) updatePayload.asignado_por = asignado_por;

      const { data: updated, error: updateErr } = await supabase
        .from('inventario_herramientas_vehiculo')
        .update(updatePayload)
        .eq('id', existing.id)
        .select(`
          id,
          vehiculo_id,
          herramienta_id,
          cantidad,
          condicion,
          notas,
          fecha_asignacion,
          updated_at,
          herramienta:herramientas (*)
        `)
        .single();

      if (updateErr) throw updateErr;
      return res.status(200).json(updated);
    } else {
      const insertPayload: any = {
        vehiculo_id,
        herramienta_id,
        cantidad: Number(cantidad) || 1,
        condicion,
        notas: notas || '',
      };
      if (asignado_por) insertPayload.asignado_por = asignado_por;

      const { data: inserted, error: insertErr } = await supabase
        .from('inventario_herramientas_vehiculo')
        .insert(insertPayload)
        .select(`
          id,
          vehiculo_id,
          herramienta_id,
          cantidad,
          condicion,
          notas,
          fecha_asignacion,
          updated_at,
          herramienta:herramientas (*)
        `)
        .single();

      if (insertErr) throw insertErr;
      return res.status(201).json(inserted);
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
    const supabase = getSupabaseClient(company, env);

    const { error } = await supabase
      .from('inventario_herramientas_vehiculo')
      .delete()
      .eq('id', id);

    if (error) throw error;
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
    const supabase = getSupabaseClient(company, env);
    const { vehiculo_id, empleado_id, fecha, limit = '50' } = req.query;

    let query = supabase
      .from('checklists_vehiculo_herramientas')
      .select(`
        *,
        vehiculo:vehiculos (
          id,
          marca,
          modelo,
          placas,
          numero_economico
        ),
        empleado:usuarios (
          id,
          nombre,
          email
        )
      `);

    if (vehiculo_id && typeof vehiculo_id === 'string') {
      query = query.eq('vehiculo_id', vehiculo_id);
    }
    if (empleado_id && typeof empleado_id === 'string') {
      query = query.eq('empleado_id', empleado_id);
    }
    if (fecha && typeof fecha === 'string') {
      query = query.eq('fecha', fecha);
    }

    const limitNum = parseInt(limit as string, 10) || 50;
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limitNum);

    if (error) throw error;
    return res.json(data || []);
  } catch (error: any) {
    console.error('[Herramientas] Error in getChecklists:', error);
    return res.status(500).json({ error: error.message });
  }
};

// POST /api/herramientas/checklists
export const createChecklist = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);

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

    const { data, error } = await supabase
      .from('checklists_vehiculo_herramientas')
      .insert([{
        vehiculo_id,
        empleado_id,
        fecha: todayStr,
        hora,
        items: itemsList,
        total_herramientas,
        total_presentes,
        total_faltantes,
        total_danadas,
        observaciones_generales,
        ubicacion_gps,
        foto_evidencia_url,
      }])
      .select(`
        *,
        vehiculo:vehiculos (id, marca, modelo, placas),
        empleado:usuarios (id, nombre)
      `)
      .single();

    if (error) throw error;

    // Sincronizar automáticamente el estado de cada herramienta en el inventario del vehículo y catálogo maestro
    try {
      for (const it of itemsList) {
        if (!it.herramienta_id) continue;

        if (!it.presente) {
          // 1. Marcar como FALTANTE en el inventario del vehículo
          const missingNote = `[FALTANTE] Reportada como faltante en revisión de vehículo el ${todayStr}${it.observaciones ? `: ${it.observaciones}` : ''}`;
          await supabase
            .from('inventario_herramientas_vehiculo')
            .update({
              condicion: 'DANADO',
              notas: missingNote,
              updated_at: new Date().toISOString(),
            })
            .eq('vehiculo_id', vehiculo_id)
            .eq('herramienta_id', it.herramienta_id);

          // 2. Marcar en catálogo maestro como BAJA / Faltante
          await supabase
            .from('herramientas')
            .update({
              estado: 'BAJA',
            })
            .eq('id', it.herramienta_id);
        } else {
          // Si está presente, sincronizar la condición reportada en el checklist
          await supabase
            .from('inventario_herramientas_vehiculo')
            .update({
              condicion: it.estado || 'BUENO',
              updated_at: new Date().toISOString(),
            })
            .eq('vehiculo_id', vehiculo_id)
            .eq('herramienta_id', it.herramienta_id);

          if (it.estado) {
            await supabase
              .from('herramientas')
              .update({
                estado: it.estado,
              })
              .eq('id', it.herramienta_id);
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
    const supabase = getSupabaseClient(company, env);

    const { data, error } = await supabase
      .from('checklists_vehiculo_herramientas')
      .select(`
        *,
        empleado:usuarios (id, nombre)
      `)
      .eq('vehiculo_id', vehiculoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return res.json(data || null);
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
    const supabase = getSupabaseClient(company, env);

    // 1. Obtener la herramienta
    const { data: herramienta, error: toolErr } = await supabase
      .from('herramientas')
      .select('*')
      .eq('id', id)
      .single();

    if (toolErr || !herramienta) {
      return res.status(404).json({ error: 'Herramienta no encontrada' });
    }

    // 2. Obtener asignación actual de empleado
    const { data: empAssign } = await supabase
      .from('inventario_herramientas_empleado')
      .select('id, empleado_id, cantidad, condicion, notas, fecha_asignacion, updated_at, empleado:usuarios!empleado_id(id, nombre, email, rol)')
      .eq('herramienta_id', id)
      .maybeSingle();

    // 3. Obtener asignación actual de vehículo
    const { data: vehAssign } = await supabase
      .from('inventario_herramientas_vehiculo')
      .select('id, vehiculo_id, cantidad, condicion, notas, fecha_asignacion, updated_at, vehiculo:vehiculos!vehiculo_id(id, marca, modelo, placas, numero_economico)')
      .eq('herramienta_id', id)
      .maybeSingle();

    // 4. Obtener todos los checklists donde aparece esta herramienta
    const { data: allChecklists } = await supabase
      .from('checklists_vehiculo_herramientas')
      .select('id, vehiculo_id, empleado_id, fecha, hora, items, observaciones_generales, ubicacion_gps, created_at, empleado:usuarios!empleado_id(id, nombre, email), vehiculo:vehiculos!vehiculo_id(id, marca, modelo, placas)')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(60);

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
      custodia_actual: empAssign
        ? {
            tipo: 'EMPLEADO',
            nombre: (empAssign.empleado as any)?.nombre,
            email: (empAssign.empleado as any)?.email,
            fecha_asignacion: empAssign.fecha_asignacion,
            condicion: empAssign.condicion,
            notas: empAssign.notas,
          }
        : vehAssign
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

    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

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
    const { data: existingTools } = await primaryClient.from('herramientas').select('id, codigo, nombre');
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

      // Si no encontró el nombre por header, pero la fila tiene valores
      if (!rawName) {
        const firstVal = Object.values(row).find((v: any) => v && typeof v === 'string' && v.trim().length > 1);
        if (firstVal) {
          rawName = String(firstVal).trim();
        }
      }

      if (!rawName || rawName === '') {
        continue;
      }

      // Normalizar Categoría
      const normCatLower = rawCat.toLowerCase();
      let finalCat = 'Manual';
      if (normCatLower.includes('elec')) finalCat = 'Eléctrica';
      else if (normCatLower.includes('med')) finalCat = 'Medición';
      else if (normCatLower.includes('segur') || normCatLower.includes('epp') || normCatLower.includes('protec')) finalCat = 'Seguridad';
      else if (normCatLower.includes('cort')) finalCat = 'Corte';
      else if (normCatLower.includes('fij') || normCatLower.includes('tornill') || normCatLower.includes('clav')) finalCat = 'Fijación';
      else if (normCatLower.includes('gen')) finalCat = 'General';
      else if (rawCat.trim()) finalCat = rawCat.trim();

      // Normalizar Estado
      const normEstadoLower = rawEstado.toLowerCase();
      let finalEstado: 'NUEVO' | 'BUENO' | 'REGULAR' | 'DANADO' | 'EN_REPARACION' | 'BAJA' | 'FALTANTE' = 'BUENO';
      if (normEstadoLower.includes('nuev') || normEstadoLower.includes('new')) finalEstado = 'NUEVO';
      else if (normEstadoLower.includes('buen') || normEstadoLower.includes('opt') || normEstadoLower.includes('excel')) finalEstado = 'BUENO';
      else if (normEstadoLower.includes('reg') || normEstadoLower.includes('usad')) finalEstado = 'REGULAR';
      else if (normEstadoLower.includes('dan') || normEstadoLower.includes('dañ') || normEstadoLower.includes('rot') || normEstadoLower.includes('aver')) finalEstado = 'DANADO';
      else if (normEstadoLower.includes('repar') || normEstadoLower.includes('tall')) finalEstado = 'EN_REPARACION';
      else if (normEstadoLower.includes('baj') || normEstadoLower.includes('desech')) finalEstado = 'BAJA';
      else if (normEstadoLower.includes('falt') || normEstadoLower.includes('perd') || normEstadoLower.includes('extrav')) finalEstado = 'FALTANTE';

      // Normalizar Activo
      let finalActivo = true;
      if (typeof rawActivo === 'string') {
        const aLow = rawActivo.toLowerCase();
        if (aLow === 'no' || aLow === 'false' || aLow === '0' || aLow === 'inactivo' || aLow === 'desactivado') {
          finalActivo = false;
        }
      } else if (rawActivo === false || rawActivo === 0) {
        finalActivo = false;
      }

      // Código
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

    // Guardar en Base de Datos
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
          const { error: upErr } = await primaryClient
            .from('herramientas')
            .update(payload)
            .eq('id', tool.id);
          if (!upErr) {
            updateCount++;
            try {
              await secondaryClient.from('herramientas').update(payload).eq('id', tool.id);
            } catch (_) {}
          } else {
            errors.push(`Fila ${tool.fila} (${tool.nombre}): Error al actualizar - ${upErr.message}`);
          }
        }
      } else {
        const { data: insData, error: insErr } = await primaryClient
          .from('herramientas')
          .insert([payload])
          .select()
          .single();
        if (!insErr) {
          insertCount++;
          try {
            if (insData) await secondaryClient.from('herramientas').upsert([insData]);
          } catch (_) {}
        } else {
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
