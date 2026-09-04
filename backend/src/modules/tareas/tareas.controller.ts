import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// GET /api/tareas
export const getTareas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const user = req.user;

    let query = supabase
      .from('tareas')
      .select(`
        *,
        creador:usuarios!tareas_creado_por_fkey(nombre),
        responsable:usuarios!tareas_responsable_id_fkey(nombre),
        corresponsables:tarea_corresponsables(usuario_id, usuarios(nombre))
      `)
      .order('fecha_compromiso', { ascending: true });

    if (user?.rol === 'EMPLEADO') {
      const { data: corrData } = await supabase.from('tarea_corresponsables').select('tarea_id').eq('usuario_id', user.id);
      const corrIds = corrData?.map(c => c.tarea_id) || [];
      
      let orCondition = `responsable_id.eq.${user.id},creado_por.eq.${user.id}`;
      if (corrIds.length > 0) {
        orCondition += `,id.in.(${corrIds.join(',')})`;
      }
      query = query.or(orCondition);
    }

    const { data, error } = await query;
    if (error) throw error;

    const clientIds = (data || []).filter(t => t.vinculo_tipo === 'Cliente' && t.vinculo_id).map(t => t.vinculo_id);
    const ventaIds = (data || []).filter(t => t.vinculo_tipo === 'Venta' && t.vinculo_id).map(t => t.vinculo_id);

    let clientsMap: any = {};
    let ventasMap: any = {};

    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase.from('clientes').select('id, nombre').in('id', clientIds);
      (clientsData || []).forEach(c => clientsMap[c.id] = c.nombre);
    }
    
    if (ventaIds.length > 0) {
      const { data: ventasData } = await supabase.from('ventas').select('id, cliente, factura_referencia').in('id', ventaIds);
      (ventasData || []).forEach(v => ventasMap[v.id] = { cliente: v.cliente, referencia: v.factura_referencia });
    }

    const formattedTasks = (data || []).map(t => {
      let vinculo_nombre = '';
      if (t.vinculo_tipo === 'Cliente' && clientsMap[t.vinculo_id]) {
        vinculo_nombre = clientsMap[t.vinculo_id];
      } else if (t.vinculo_tipo === 'Venta' && ventasMap[t.vinculo_id]) {
        vinculo_nombre = `${ventasMap[t.vinculo_id].cliente} - ${ventasMap[t.vinculo_id].referencia}`;
      }

      return {
        ...t,
        creado_por_nombre: Array.isArray(t.creador) ? t.creador[0]?.nombre : (t.creador as any)?.nombre,
        responsable_nombre: Array.isArray(t.responsable) ? t.responsable[0]?.nombre : (t.responsable as any)?.nombre,
        vinculo_nombre,
        corresponsables: (t.corresponsables as any[])?.map((c: any) => ({
          usuario_id: c.usuario_id,
          usuario_nombre: Array.isArray(c.usuarios) ? c.usuarios[0]?.nombre : c.usuarios?.nombre
        })) || []
      };
    });

    res.json(formattedTasks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/tareas/:id
export const getTareaById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);

    const { data: taskData, error: taskError } = await supabase
      .from('tareas')
      .select(`
        *,
        creador:usuarios!tareas_creado_por_fkey(nombre),
        responsable:usuarios!tareas_responsable_id_fkey(nombre),
        corresponsables:tarea_corresponsables(usuario_id, usuarios(nombre))
      `)
      .eq('id', id)
      .single();

    if (taskError) throw taskError;

    let vinculo_nombre = '';
    if (taskData.vinculo_tipo === 'Cliente' && taskData.vinculo_id) {
      const { data: clientData } = await supabase.from('clientes').select('nombre').eq('id', taskData.vinculo_id).single();
      if (clientData) vinculo_nombre = clientData.nombre;
    } else if (taskData.vinculo_tipo === 'Venta' && taskData.vinculo_id) {
      const { data: ventaData } = await supabase.from('ventas').select('cliente, factura_referencia').eq('id', taskData.vinculo_id).single();
      if (ventaData) vinculo_nombre = `${ventaData.cliente} - ${ventaData.factura_referencia}`;
    }

    const { data: notesData } = await supabase
      .from('tarea_notas')
      .select('*, usuario:usuarios!tarea_notas_usuario_id_fkey(nombre)')
      .eq('tarea_id', id)
      .order('creado_en', { ascending: true });

    res.json({
      ...taskData,
      creado_por_nombre: Array.isArray(taskData.creador) ? taskData.creador[0]?.nombre : (taskData.creador as any)?.nombre,
      responsable_nombre: Array.isArray(taskData.responsable) ? taskData.responsable[0]?.nombre : (taskData.responsable as any)?.nombre,
      vinculo_nombre,
      corresponsables: (taskData.corresponsables as any[])?.map((c: any) => ({
        usuario_id: c.usuario_id,
        usuario_nombre: Array.isArray(c.usuarios) ? c.usuarios[0]?.nombre : c.usuarios?.nombre
      })) || [],
      notas: notesData || []
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/tareas/form/lookups
export const getFormLookups = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const user = req.user;

    let userQuery = supabase.from('usuarios').select('id, nombre');
    if (user?.rol === 'EMPLEADO') {
      userQuery = userQuery.in('id', [user.id, '634289dd-c4fb-4b50-ac4e-9d2aab11f114']); // Hack that was in frontend for admin id
    }
    const { data: usersData } = await userQuery;

    const { data: clientsData } = await supabase.from('clientes').select('id, nombre');
    const { data: ventasData } = await supabase.from('ventas').select('id, cliente, factura_referencia, fecha, sucursal');

    res.json({
      usuarios: usersData || [],
      clientes: clientsData || [],
      ventas: ventasData || []
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/tareas
export const createTarea = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const { corresponsables, ...nuevaTarea } = req.body;

    const { data: tarea, error } = await supabase.from('tareas').insert(nuevaTarea).select().single();
    if (error) throw error;

    if (corresponsables && corresponsables.length > 0) {
      const corrInserts = corresponsables.map((uid: string) => ({
        tarea_id: tarea.id,
        usuario_id: uid
      }));
      await supabase.from('tarea_corresponsables').insert(corrInserts);
    }

    res.json(tarea);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/tareas/:id
export const updateTarea = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    
    // Extracted note info from frontend
    const { nota_texto, ...updates } = req.body;

    const { error } = await supabase.from('tareas').update(updates).eq('id', id);
    if (error) throw error;

    if (nota_texto) {
      await supabase.from('tarea_notas').insert({
        tarea_id: id,
        usuario_id: req.user?.id,
        comentario: nota_texto
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/tareas/:id/notas
export const addNota = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    
    const { comentario } = req.body;
    
    const { data, error } = await supabase
      .from('tarea_notas')
      .insert({
        tarea_id: id,
        usuario_id: req.user?.id,
        comentario
      })
      .select('*, usuario:usuarios!tarea_notas_usuario_id_fkey(nombre)')
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
