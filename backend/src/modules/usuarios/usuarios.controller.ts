import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

export const getUsuarios = async (req: Request, res: Response) => {
  try {
    const { company, env } = req.tenant!;
    const supabase = getSupabaseClient(company, env);
    const { data, error } = await supabase.from('usuarios').select('*').order('nombre');
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createUsuario = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password, rol, telefono } = req.body;
    
    // We need both clients for the active environment to sync the user across companies
    const { company: activeCompany, env } = req.tenant!;
    const secondaryCompany = activeCompany === 'inttec' ? 'daravisa' : 'inttec';
    
    const primaryClient = getSupabaseClient(activeCompany, env);
    const secondaryClient = getSupabaseClient(secondaryCompany, env);

    const usuarioData = { nombre, email, password, rol, telefono };

    const { data, error } = await primaryClient
      .from('usuarios')
      .insert([usuarioData])
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('usuarios').upsert([data]);
    } catch (syncErr: any) {
      console.error('[UsuariosController] Error syncing user to secondary db:', syncErr);
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const { env } = req.tenant!;
    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    let userEmail = updates.email?.trim().toLowerCase();
    if (!userEmail) {
      const { data: uInttec } = await clientInttec.from('usuarios').select('email').eq('id', id).maybeSingle();
      const { data: uDaravisa } = await clientDaravisa.from('usuarios').select('email').eq('id', id).maybeSingle();
      userEmail = (uInttec?.email || uDaravisa?.email)?.trim().toLowerCase();
    }

    const updateInttec = async () => {
      await clientInttec.from('usuarios').update(updates).eq('id', id);
      if (userEmail) {
        await clientInttec.from('usuarios').update(updates).eq('email', userEmail);
      }
    };

    const updateDaravisa = async () => {
      await clientDaravisa.from('usuarios').update(updates).eq('id', id);
      if (userEmail) {
        await clientDaravisa.from('usuarios').update(updates).eq('email', userEmail);
      }
    };

    await Promise.allSettled([updateInttec(), updateDaravisa()]);

    res.json({ success: true, message: 'Usuario actualizado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { env } = req.tenant!;
    const clientInttec = getSupabaseClient('inttec', env);
    const clientDaravisa = getSupabaseClient('daravisa', env);

    const { data: uInttec } = await clientInttec.from('usuarios').select('email').eq('id', id).maybeSingle();
    const { data: uDaravisa } = await clientDaravisa.from('usuarios').select('email').eq('id', id).maybeSingle();
    const userEmail = (uInttec?.email || uDaravisa?.email)?.trim().toLowerCase();

    const deleteInttec = async () => {
      const { error } = await clientInttec.from('usuarios').delete().eq('id', id);
      if (error) throw error;
      if (userEmail) {
        await clientInttec.from('usuarios').delete().eq('email', userEmail);
      }
    };

    const deleteDaravisa = async () => {
      const { error } = await clientDaravisa.from('usuarios').delete().eq('id', id);
      if (error) throw error;
      if (userEmail) {
        await clientDaravisa.from('usuarios').delete().eq('email', userEmail);
      }
    };

    // We use Promise.all to catch errors like Foreign Key Constraints (23503)
    await Promise.all([deleteInttec(), deleteDaravisa()]);

    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: error.message, code: error.code });
  }
};
