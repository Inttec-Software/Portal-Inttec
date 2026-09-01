import { Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';

export const obtenerDocumentosAdmin = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { data, error } = await client
      .from('documentos')
      .select('*, documentos_firmados(id, estado)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const crearDocumento = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { doc, empleadosIds } = req.body;

    let { data: newDoc, error: docError } = await client
      .from('documentos')
      .insert([doc])
      .select()
      .single();

    if (docError) {
      if (docError.message?.includes('posicion_firma') || docError.code === 'PGRST204' || docError.details?.includes('posicion_firma')) {
        const { posicion_firma, ...docSinPosicion } = doc;
        const { data: retryDoc, error: retryErr } = await client
          .from('documentos')
          .insert([docSinPosicion])
          .select()
          .single();
        if (retryErr) throw retryErr;
        newDoc = retryDoc;
      } else {
        throw docError;
      }
    }

    let targetEmpleados: any[] = [];
    if (doc.requiere_todos || !empleadosIds || empleadosIds.length === 0) {
      const { data: users } = await client.from('usuarios').select('*');
      targetEmpleados = users || [];
    } else {
      const { data: users } = await client.from('usuarios').select('*').in('id', empleadosIds);
      targetEmpleados = users || [];
    }

    if (targetEmpleados.length > 0) {
      const asignaciones = targetEmpleados.map((emp) => ({
        documento_id: newDoc.id,
        empleado_id: emp.id,
        empleado_nombre: emp.nombre,
        empleado_email: emp.email,
        estado: 'PENDIENTE',
      }));
      const { error: asigError } = await client.from('documentos_firmados').insert(asignaciones);
      if (asigError) console.error('Error asignando empleados:', asigError);
    }
    return res.json(newDoc);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const obtenerMisDocumentos = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { empleadoId } = req.params;
    const { data, error } = await client
      .from('documentos_firmados')
      .select('*, documentos(*)')
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const obtenerFirmas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { documentoId } = req.params;
    const { data, error } = await client
      .from('documentos_firmados')
      .select('*')
      .eq('documento_id', documentoId)
      .order('empleado_nombre', { ascending: true });
    if (error) throw error;
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarFirma = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { idAsignacion } = req.params;
    const params = req.body;
    const { data, error } = await client
      .from('documentos_firmados')
      .update({
        estado: 'FIRMADO',
        firma_base64: params.firmaBase64,
        pdf_firmado_url: params.pdfUrl,
        ip_registro: params.ipRegistro,
        ubicacion_gps: params.ubicacionGps,
        dispositivo_info: params.dispositivoInfo,
        hash_sha256: params.hashSha256,
        firmado_at: new Date().toISOString(),
      })
      .eq('id', idAsignacion)
      .select()
      .maybeSingle();
    if (error) throw error;
    return res.json(data || { id: idAsignacion, estado: 'FIRMADO' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const eliminarDocumento = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const client = getSupabaseClient(tenant.company, tenant.env);
    const { id } = req.params;
    const { error } = await client.from('documentos').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

