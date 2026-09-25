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

    const formattedData = (data || []).map((doc: any) => ({
      ...doc,
      total_asignados: doc.documentos_firmados ? doc.documentos_firmados.length : 0,
      total_firmados: doc.documentos_firmados ? doc.documentos_firmados.filter((f: any) => f.estado === 'FIRMADO').length : 0,
    }));

    return res.json(formattedData);
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

      const docTitulo = newDoc.titulo || doc.titulo || 'Documento Corporativo';

      // 1. Guardar notificaciones internas en la base de datos (In-App)
      try {
        const notificaciones = targetEmpleados.map((emp) => ({
          usuario_id: emp.id,
          titulo: '📝 Nuevo Documento por Firmar',
          mensaje: `Se te ha asignado el documento "${docTitulo}" para tu firma digital.`,
          tipo: 'DOCUMENTO_NUEVO',
          referencia_id: newDoc.id,
        }));
        await client.from('notificaciones').insert(notificaciones);
      } catch (notifErr) {
        console.warn('[Documentos] No se pudieron insertar notificaciones en BD:', notifErr);
      }

      // 2. Enviar notificaciones push a los dispositivos móviles de los empleados mediante Expo
      try {
        const pushMessages = targetEmpleados
          .filter(
            (emp) =>
              emp.expo_push_token &&
              typeof emp.expo_push_token === 'string' &&
              emp.expo_push_token.trim().length > 0
          )
          .map((emp) => ({
            to: emp.expo_push_token.trim(),
            sound: 'default',
            title: '📝 Nuevo Documento por Firmar',
            body: `Tienes un nuevo documento pendiente de firma: "${docTitulo}".`,
            data: {
              screen: '/(empleado)/documentos',
              documentoId: newDoc.id,
              type: 'DOCUMENTO_NUEVO',
            },
            priority: 'high',
            channelId: 'default',
          }));

        if (pushMessages.length > 0) {
          console.log(`[Documentos] Enviando ${pushMessages.length} notificaciones push a empleados...`);
          // Expo Push API permite lotes de hasta 100 mensajes
          const chunkSize = 100;
          for (let i = 0; i < pushMessages.length; i += chunkSize) {
            const chunk = pushMessages.slice(i, i + chunkSize);
            fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(chunk),
            })
              .then(async (r) => {
                const resJson = await r.json();
                console.log('[Documentos] Push notifications enviadas:', resJson);
              })
              .catch((err) => {
                console.warn('[Documentos] Error al enviar lote push notifications:', err);
              });
          }
        }
      } catch (pushErr) {
        console.warn('[Documentos] Error procesando push notifications:', pushErr);
      }
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

