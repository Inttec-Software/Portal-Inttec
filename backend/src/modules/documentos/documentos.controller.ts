import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

export const obtenerDocumentosAdmin = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const pool = getDbPool(tenant.company, tenant.env);
    const { rows: data } = await pool.query(`
      SELECT d.*, 
        COALESCE(
          (SELECT json_agg(json_build_object('id', df.id, 'estado', df.estado)) 
           FROM documentos_firmados df WHERE df.documento_id = d.id),
          '[]'::json
        ) as documentos_firmados
      FROM documentos d
      ORDER BY d.created_at DESC
    `);

    const formattedData = data.map((doc: any) => ({
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
    const pool = getDbPool(tenant.company, tenant.env);
    const { doc, empleadosIds } = req.body;

    let newDoc;
    try {
      const keys = Object.keys(doc);
      const values = Object.values(doc);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO documentos (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      newDoc = rows[0];
    } catch (docError: any) {
      if (docError.message?.includes('posicion_firma') || docError.code === 'PGRST204' || docError.details?.includes('posicion_firma')) {
        const { posicion_firma, ...docSinPosicion } = doc;
        const keys = Object.keys(docSinPosicion);
        const values = Object.values(docSinPosicion);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const { rows: retryRows } = await pool.query(
          `INSERT INTO documentos (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        newDoc = retryRows[0];
      } else {
        throw docError;
      }
    }

    let targetEmpleados: any[] = [];
    if (doc.requiere_todos || !empleadosIds || empleadosIds.length === 0) {
      const { rows } = await pool.query(`SELECT * FROM usuarios`);
      targetEmpleados = rows;
    } else {
      const placeholders = empleadosIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(`SELECT * FROM usuarios WHERE id IN (${placeholders})`, empleadosIds);
      targetEmpleados = rows;
    }

    if (targetEmpleados.length > 0) {
      const asignaciones = targetEmpleados.map((emp) => [
        newDoc.id, emp.id, emp.nombre, emp.email, 'PENDIENTE'
      ]);
      try {
        for (const asig of asignaciones) {
          await pool.query(
            `INSERT INTO documentos_firmados (documento_id, empleado_id, empleado_nombre, empleado_email, estado) VALUES ($1, $2, $3, $4, $5)`,
            asig
          );
        }
      } catch (asigError) {
        console.error('Error asignando empleados:', asigError);
      }

      const docTitulo = newDoc.titulo || doc.titulo || 'Documento Corporativo';

      try {
        for (const emp of targetEmpleados) {
          await pool.query(
            `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
            [emp.id, '📝 Nuevo Documento por Firmar', `Se te ha asignado el documento "${docTitulo}" para tu firma digital.`, 'DOCUMENTO_NUEVO', newDoc.id]
          );
        }
      } catch (notifErr) {
        console.warn('[Documentos] No se pudieron insertar notificaciones en BD:', notifErr);
      }

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
    const pool = getDbPool(tenant.company, tenant.env);
    const { empleadoId } = req.params;
    const { rows: data } = await pool.query(
      `SELECT df.*, row_to_json(d.*) as documentos 
       FROM documentos_firmados df 
       LEFT JOIN documentos d ON df.documento_id = d.id 
       WHERE df.empleado_id = $1 
       ORDER BY df.created_at DESC`,
      [empleadoId]
    );
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const obtenerFirmas = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const pool = getDbPool(tenant.company, tenant.env);
    const { documentoId } = req.params;
    const { rows: data } = await pool.query(
      `SELECT * FROM documentos_firmados WHERE documento_id = $1 ORDER BY empleado_nombre ASC`,
      [documentoId]
    );
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const registrarFirma = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const pool = getDbPool(tenant.company, tenant.env);
    const { idAsignacion } = req.params;
    const params = req.body;
    const { rows: data } = await pool.query(
      `UPDATE documentos_firmados 
       SET estado = 'FIRMADO', firma_base64 = $1, pdf_firmado_url = $2, ip_registro = $3, ubicacion_gps = $4, dispositivo_info = $5, hash_sha256 = $6, firmado_at = $7 
       WHERE id = $8 RETURNING *`,
      [params.firmaBase64, params.pdfUrl, params.ipRegistro, params.ubicacionGps, params.dispositivoInfo, params.hashSha256, new Date().toISOString(), idAsignacion]
    );
    return res.json(data[0] || { id: idAsignacion, estado: 'FIRMADO' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const eliminarDocumento = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const pool = getDbPool(tenant.company, tenant.env);
    const { id } = req.params;
    await pool.query(`DELETE FROM documentos WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};
