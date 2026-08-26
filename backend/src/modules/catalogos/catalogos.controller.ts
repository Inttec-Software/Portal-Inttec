import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

// Helper for syncing cross-company
const getOtherCompany = (company: 'inttec' | 'daravisa'): 'inttec' | 'daravisa' => {
  return company === 'inttec' ? 'daravisa' : 'inttec';
};

const syncToOtherCompany = async (table: string, data: any, company: 'inttec' | 'daravisa', env: 'cloud' | 'test') => {
  try {
    const otherCompany = getOtherCompany(company);
    const secondaryClient = getSupabaseClient(otherCompany, env);
    // Upsert expects an array
    await secondaryClient.from(table).upsert([data]);
  } catch (error) {
    console.error(`Error syncing ${table} to ${getOtherCompany(company)}:`, error);
  }
};

const executeSyncUpdate = async (table: string, id: string, updates: any, env: 'cloud' | 'test') => {
  try {
    await Promise.allSettled([
      getSupabaseClient('inttec', env).from(table).update(updates).eq('id', id),
      getSupabaseClient('daravisa', env).from(table).update(updates).eq('id', id)
    ]);
  } catch (error) {
    console.error(`Error updating ${table}:`, error);
  }
};

const executeSyncDelete = async (table: string, id: string, env: 'cloud' | 'test') => {
  try {
    await Promise.allSettled([
      getSupabaseClient('inttec', env).from(table).delete().eq('id', id),
      getSupabaseClient('daravisa', env).from(table).delete().eq('id', id)
    ]);
  } catch (error) {
    console.error(`Error deleting ${table}:`, error);
  }
};

export const getAllCatalogos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const client = getSupabaseClient(company, env);

    const [catRes, subRes, cliRes, provRes] = await Promise.all([
      client.from('categorias').select('*').order('nombre'),
      client.from('subcategorias').select('*').order('nombre'),
      client.from('clientes').select('*').order('nombre'),
      client.from('proveedores').select('*').order('nombre'),
    ]);

    if (catRes.error) throw catRes.error;
    if (subRes.error) throw subRes.error;
    if (cliRes.error) throw cliRes.error;
    if (provRes.error) throw provRes.error;

    return res.json({
      categorias: catRes.data || [],
      subcategorias: subRes.data || [],
      clientes: cliRes.data || [],
      proveedores: provRes.data || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSucursales = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { clienteId } = req.params;
    const client = getSupabaseClient(company, env);

    const { data, error } = await client
      .from('sucursales_cliente')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('nombre');
      
    if (error) throw error;
    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getClienteSummary = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { clienteId } = req.params;
    const clienteNombre = req.query.clienteNombre as string; // Pasa el nombre por querystring para ventas
    const client = getSupabaseClient(company, env);

    const [gastosRes, ventasRes] = await Promise.all([
      client.from('gastos').select('monto').eq('cliente_id', clienteId).neq('status', 'REJECTED'),
      client.from('ventas').select('precio_total_facturado, costo_total').eq('cliente', clienteNombre)
    ]);

    return res.json({
      gastos: gastosRes.data || [],
      ventas: ventasRes.data || []
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const createCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { company, env } = tenant;
    const { table, data } = req.body;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    const client = getSupabaseClient(company, env);
    const { data: inserted, error } = await client.from(table).insert([data]).select().single();
    if (error) throw error;

    await syncToOtherCompany(table, inserted, company, env);

    return res.status(201).json(inserted);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const { table, id, updates } = req.body;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    await executeSyncUpdate(table, id, updates, env);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteCatalogo = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const { env } = tenant;
    const table = req.params.table as string;
    const id = req.params.id as string;
    
    if (!['categorias', 'subcategorias', 'clientes', 'proveedores', 'sucursales_cliente'].includes(table)) {
      return res.status(400).json({ error: 'Tabla no permitida' });
    }

    await executeSyncDelete(table, id, env);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
