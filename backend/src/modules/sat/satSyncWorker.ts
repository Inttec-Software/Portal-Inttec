import { getDbPool } from '../../config/database';
import { uploadFileToStorage } from '../../config/storage';
import { SatSoapClient } from './satSoapClient';
import { parseCfdiXml } from './xmlParser';
import JSZip from 'jszip';

export async function processSatSync(company: string, env: string, options: any = {}) {
  const action = options.action || 'sync';
  const pool = getDbPool(company, env);
  
  const resumen = {
    facturasProcesadas: 0,
    solicitudesVerificadas: 0,
    paquetesDescargados: 0,
    mensajes: [] as string[],
    nuevaSolicitudCreada: false,
    idNuevaSolicitud: null as string | null
  };

  const satRfc = (process.env.SAT_RFC || process.env[`${company.toUpperCase()}_SAT_RFC`] || '').trim().toUpperCase();
  const satCerB64 = process.env.SAT_CER_B64 || process.env[`${company.toUpperCase()}_SAT_CER_B64`] || '';
  const satKeyB64 = process.env.SAT_KEY_B64 || process.env[`${company.toUpperCase()}_SAT_KEY_B64`] || '';
  const satPassword = process.env.SAT_PASSWORD || process.env[`${company.toUpperCase()}_SAT_PASSWORD`] || '';

  if (!satRfc || !satCerB64 || !satKeyB64 || !satPassword) {
    return { missingCredentials: true, message: 'Faltan credenciales SAT (RFC, CER, KEY, PASSWORD)' };
  }

  const satClient = new SatSoapClient({
    rfc: satRfc,
    cerB64: satCerB64,
    keyB64: satKeyB64,
    password: satPassword
  });

  if (action === 'sync' || action === 'verificar') {
    const { rows: solicitudesPendientes } = await pool.query(
      `SELECT * FROM sat_descarga_solicitudes 
       WHERE estado_sat IN ('PENDIENTE', 'EN_PROCESO', 'ACEPTADA') 
       ORDER BY created_at ASC`
    );

    for (const sol of solicitudesPendientes) {
      try {
        resumen.solicitudesVerificadas++;
        console.log(`[SAT Worker] ${company} - Verificando solicitud ${sol.id_solicitud}`);
        
        const verifResult = await satClient.verificarSolicitud(sol.id_solicitud);
        const estadoNum = String(verifResult.estadoSolicitud || '0');

        if (estadoNum === '3') {
          const paquetes = verifResult.paquetesIds || [];
          let facturasEnSolicitud = 0;

          for (const idPaquete of paquetes) {
            try {
              const zipBytes = await satClient.descargarPaquete(idPaquete);
              resumen.paquetesDescargados++;
              const zip = new JSZip();
              const unzipped = await zip.loadAsync(zipBytes);
              
              for (const [filename, fileObj] of Object.entries(unzipped.files)) {
                if (!fileObj.dir && filename.toLowerCase().endsWith('.xml')) {
                  const xmlContent = await fileObj.async('string');
                  try {
                    const parsed = parseCfdiXml(xmlContent);
                    const xmlBuffer = Buffer.from(xmlContent, 'utf-8');
                    const xmlUrl = await uploadFileToStorage(xmlBuffer, parsed.uuid + '.xml', `${company}/facturas_recibidas`, 'text/xml');
                    
                    await pool.query(
                      `INSERT INTO facturas_recibidas (
                        uuid, rfc_emisor, nombre_emisor, rfc_receptor, fecha_emision,
                        subtotal, descuento, iva, retencion_isr, retencion_iva, total,
                        moneda, tipo_comprobante, estado_sat, xml_url, conceptos_json, updated_at
                      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
                      ON CONFLICT (uuid) DO UPDATE SET
                        estado_sat = EXCLUDED.estado_sat, xml_url = EXCLUDED.xml_url, updated_at = NOW()`,
                      [
                        parsed.uuid, parsed.rfcEmisor, parsed.nombreEmisor, parsed.rfcReceptor, parsed.fechaEmision,
                        parsed.subtotal, parsed.descuento, parsed.iva, parsed.retencionIsr, parsed.retencionIva, parsed.total,
                        parsed.moneda, parsed.tipoComprobante, parsed.estadoSat, xmlUrl, JSON.stringify(parsed.conceptos)
                      ]
                    );
                    facturasEnSolicitud++;
                    resumen.facturasProcesadas++;
                  } catch (parseErr) {
                    console.warn(`Error parseando XML ${filename}`, parseErr);
                  }
                }
              }
            } catch (pkgErr) {
              console.error(`Error descargando paquete ${idPaquete}`, pkgErr);
            }
          }

          await pool.query(
            `UPDATE sat_descarga_solicitudes 
             SET estado_sat = 'TERMINADA', paquetes_ids = $1, total_facturas_procesadas = $2, mensaje_sat = $3, updated_at = NOW()
             WHERE id = $4`,
            [paquetes, facturasEnSolicitud, verifResult.mensaje || 'Descarga completada', sol.id]
          );
        } else if (estadoNum === '4' || estadoNum === '5') {
          await pool.query(
            `UPDATE sat_descarga_solicitudes SET estado_sat = $1, mensaje_sat = $2, updated_at = NOW() WHERE id = $3`,
            [estadoNum === '4' ? 'ERROR' : 'RECHAZADA', verifResult.mensaje || 'Rechazada', sol.id]
          );
        } else {
          await pool.query(
            `UPDATE sat_descarga_solicitudes SET estado_sat = 'EN_PROCESO', codigo_estatus = $1, mensaje_sat = $2, updated_at = NOW() WHERE id = $3`,
            [verifResult.codEstatus, 'SAT en proceso...', sol.id]
          );
        }
      } catch (err) {
        console.error('Error verificando sol', err);
      }
    }
  }

  if (action === 'sync' || action === 'solicitar') {
    const { rows: recientes } = await pool.query(
      `SELECT id FROM sat_descarga_solicitudes WHERE created_at >= NOW() - INTERVAL '2 hours' LIMIT 1`
    );

    if (recientes.length === 0) {
      const fechaFin = options.fecha_fin || new Date().toISOString().substring(0, 10) + 'T23:59:59';
      const fechaInicio = options.fecha_inicio || new Date(Date.now() - 30*24*60*60*1000).toISOString().substring(0, 10) + 'T00:00:00';
      
      const solResult = await satClient.solicitarDescargaRecibidos(fechaInicio, fechaFin);
      if (solResult.success && solResult.idSolicitud) {
        await pool.query(
          `INSERT INTO sat_descarga_solicitudes (id_solicitud, rfc, fecha_inicio, fecha_fin, tipo_solicitud, estado_sat, codigo_estatus, mensaje_sat)
           VALUES ($1, $2, $3, $4, 'RECIBIDOS', 'PENDIENTE', $5, $6)`,
          [solResult.idSolicitud, satRfc, fechaInicio, fechaFin, solResult.codEstatus, solResult.mensaje]
        );
        resumen.nuevaSolicitudCreada = true;
        resumen.idNuevaSolicitud = solResult.idSolicitud;
      }
    }
  }

  return { success: true, resumen, message: 'Operación completada' };
}
