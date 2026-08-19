import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
import forge from "https://esm.sh/node-forge@1.3.1";
import { SatSoapClient } from "./satSoapClient.ts";
import { parseCfdiXml, FacturaParsed } from "./xmlParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper para subir XML a Supabase Storage y retornar la URL pública
async function uploadXmlToStorage(supabase: any, uuid: string, xmlContent: string): Promise<string> {
  try {
    const fileName = `${uuid}.xml`;
    const { error: uploadError } = await supabase.storage
      .from("facturas_recibidas")
      .upload(fileName, xmlContent, {
        contentType: "text/xml;charset=utf-8",
        upsert: true,
      });

    if (uploadError) {
      console.warn(`Aviso al subir XML a storage (${uuid}):`, uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage.from("facturas_recibidas").getPublicUrl(fileName);
    return publicUrlData?.publicUrl || "";
  } catch (err: any) {
    console.warn(`Error en storage para ${uuid}:`, err.message);
    return "";
  }
}

// Helper para guardar una factura parseada en la tabla facturas_recibidas
async function saveFacturaToDb(supabase: any, parsed: FacturaParsed, xmlUrl: string) {
  const { data, error } = await supabase
    .from("facturas_recibidas")
    .upsert(
      {
        uuid: parsed.uuid,
        rfc_emisor: parsed.rfcEmisor,
        nombre_emisor: parsed.nombreEmisor,
        rfc_receptor: parsed.rfcReceptor,
        fecha_emision: parsed.fechaEmision,
        subtotal: parsed.subtotal,
        descuento: parsed.descuento,
        iva: parsed.iva,
        retencion_isr: parsed.retencionIsr,
        retencion_iva: parsed.retencionIva,
        total: parsed.total,
        moneda: parsed.moneda,
        tipo_comprobante: parsed.tipoComprobante,
        estado_sat: parsed.estadoSat,
        xml_url: xmlUrl || null,
        conceptos_json: parsed.conceptos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "uuid" }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}

serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const reqData = await req.json().catch(() => ({}));
    const action = reqData.action || "sync";

    // =========================================================================
    // ACCIÓN 1: Importación Manual o en Lote de XML
    // =========================================================================
    if (action === "import_xml") {
      const xmlInput = reqData.xml;
      if (!xmlInput) {
        return new Response(
          JSON.stringify({ success: false, error: "El parámetro 'xml' es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const xmlList = Array.isArray(xmlInput) ? xmlInput : [xmlInput];
      const resultados: any[] = [];
      const errores: any[] = [];

      for (const rawXml of xmlList) {
        try {
          const parsed = parseCfdiXml(rawXml);
          const xmlUrl = await uploadXmlToStorage(supabase, parsed.uuid, rawXml);
          const savedFactura = await saveFacturaToDb(supabase, parsed, xmlUrl);
          resultados.push(savedFactura);
        } catch (err: any) {
          errores.push({ error: err.message, raw: String(rawXml).substring(0, 100) });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          importadas: resultados.length,
          errores: errores.length,
          facturas: resultados,
          detallesErrores: errores,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACCIÓN 2: Estado del Módulo y Solicitudes
    // =========================================================================
    if (action === "status") {
      const { data: solicitudesPendientes } = await supabase
        .from("sat_descarga_solicitudes")
        .select("*")
        .in("estado_sat", ["PENDIENTE", "EN_PROCESO"])
        .order("created_at", { ascending: false });

      const { count: totalFacturas } = await supabase
        .from("facturas_recibidas")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          success: true,
          solicitudesPendientes: solicitudesPendientes || [],
          totalFacturasEnBd: totalFacturas || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // CONFIGURACIÓN DE CREDENCIALES SAT / FINKOK
    // =========================================================================
    const satRfc = (Deno.env.get("SAT_RFC") || reqData.sat_rfc || "").trim().toUpperCase();
    const satCerB64 = Deno.env.get("SAT_CER_B64") || reqData.sat_cer_b64 || "";
    const satKeyB64 = Deno.env.get("SAT_KEY_B64") || reqData.sat_key_b64 || "";
    const satPassword = Deno.env.get("SAT_PASSWORD") || reqData.sat_password || "";

    const finkokUsername = Deno.env.get("FINKOK_USERNAME");
    const finkokPassword = Deno.env.get("FINKOK_PASSWORD");
    const isProduction = (Deno.env.get("FINKOK_ENV") || "").toLowerCase() === "production";

    const hasSatCreds = Boolean(satCerB64 && satKeyB64 && satPassword && satRfc);

    if (!hasSatCreds) {
      return new Response(
        JSON.stringify({
          success: false,
          missingCredentials: true,
          error: "Faltan credenciales de e.firma en Supabase (SAT_RFC, SAT_CER_B64, SAT_KEY_B64, SAT_PASSWORD).",
          message: "Para sincronizar automáticamente con el SAT, configura la e.firma de la empresa en los Secrets de Supabase.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACCIÓN: Diagnóstico de Certificados e.firma
    // =========================================================================
    if (action === "diagnostico") {
      let infoCert: any = null;
      try {
        const certDerBytes = forge.util.decode64(satCerB64.replace(/[\r\n\s]/g, ""));
        const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDerBytes));
        const subjectAttrs: any = {};
        for (const attr of cert.subject.attributes) {
          subjectAttrs[attr.shortName || attr.name] = attr.value;
        }
        infoCert = {
          validoDesde: cert.validity.notBefore,
          validoHasta: cert.validity.notAfter,
          numeroSerie: cert.serialNumber,
          sujeto: subjectAttrs,
        };
      } catch (cErr: any) {
        infoCert = { errorLecturaCert: cErr.message };
      }

      try {
        const satClient = new SatSoapClient({
          rfc: satRfc,
          cerB64: satCerB64,
          keyB64: satKeyB64,
          password: satPassword,
        });

        // Intentar autenticación
        const token = await satClient.autenticar();

        return new Response(
          JSON.stringify({
            success: true,
            rfcConfigurado: satRfc,
            tokenObtenido: token ? "OK" : "NO",
            infoCert,
            mensaje: "Autenticación con el SAT exitosa. Las credenciales de la e.firma son válidas.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (diagErr: any) {
        return new Response(
          JSON.stringify({
            success: false,
            rfcConfigurado: satRfc,
            infoCert,
            error: diagErr.message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =========================================================================
    // ACCIÓN: Prueba de Descarga de Paquete
    // =========================================================================
    if (action === "test_descarga") {
      const idPaquete = reqData.id_paquete || "7D75C65E-51A3-486A-B37B-E4301B490FD8_01";
      try {
        console.log(`📦 [TEST DESCARGA] Descargando paquete: ${idPaquete}`);
        const satClient = new SatSoapClient({
          rfc: satRfc,
          cerB64: satCerB64,
          keyB64: satKeyB64,
          password: satPassword,
        });

        const zipBytes = await satClient.descargarPaquete(idPaquete);
        console.log(`📦 [TEST DESCARGA] Paquete recibido: ${zipBytes.length} bytes`);

        const zip = new JSZip();
        const unzipped = await zip.loadAsync(zipBytes);
        const files = Object.keys(unzipped.files);
        console.log(`📦 [TEST DESCARGA] Archivos en ZIP: ${files.length}`);

        const procesados: any[] = [];
        const errores: any[] = [];

        for (const [filename, fileObj] of Object.entries(unzipped.files)) {
          if (!fileObj.dir && filename.toLowerCase().endsWith(".xml")) {
            const xmlContent = await fileObj.async("text");
            try {
              const parsed = parseCfdiXml(xmlContent);
              const xmlUrl = await uploadXmlToStorage(supabase, parsed.uuid, xmlContent);
              const saved = await saveFacturaToDb(supabase, parsed, xmlUrl);
              procesados.push({ uuid: parsed.uuid, emisor: parsed.nombreEmisor, total: parsed.total });
            } catch (pErr: any) {
              errores.push({ file: filename, error: pErr.message });
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            idPaquete,
            bytesRecibidos: zipBytes.length,
            archivosEnZip: files.length,
            facturasGuardadas: procesados.length,
            erroresGuardado: errores.length,
            muestraFacturas: procesados.slice(0, 5),
            muestraErrores: errores.slice(0, 5),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (dErr: any) {
        console.error(`💥 [TEST DESCARGA] Error:`, dErr.message);
        return new Response(
          JSON.stringify({ success: false, error: dErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const satClient = new SatSoapClient({
      rfc: satRfc,
      cerB64: satCerB64,
      keyB64: satKeyB64,
      password: satPassword,
      finkokUsername,
      finkokPassword,
      isProduction,
    });

    // =========================================================================
    // ACCIÓN 3: Sincronización Completa Inteligente (sync) o Verificación
    // =========================================================================
    console.log(`\n======================================================`);
    console.log(`📥 [EDGE FUNCTION] Solicitud de sincronización recibida para RFC: ${satRfc}`);
    console.log(`⏰ [EDGE FUNCTION] Timestamp: ${new Date().toISOString()}`);

    const resumen = {
      solicitudesVerificadas: 0,
      paquetesDescargados: 0,
      facturasProcesadas: 0,
      nuevaSolicitudCreada: false,
      idNuevaSolicitud: null as string | null,
      mensajes: [] as string[],
    };

    // -------------------------------------------------------------------------
    // FASE 1: Verificar y Procesar Solicitudes Previas Pendientes
    // -------------------------------------------------------------------------
    console.log(`🔍 [EDGE FUNCTION] Consultando solicitudes pendientes en Base de Datos...`);
    const { data: solicitudesPendientes, error: solError } = await supabase
      .from("sat_descarga_solicitudes")
      .select("*")
      .in("estado_sat", ["PENDIENTE", "EN_PROCESO"])
      .order("created_at", { ascending: true });

    if (solError) {
      console.error(`❌ [EDGE FUNCTION] Error consultando solicitudes pendientes:`, solError.message);
    } else {
      console.log(`📋 [EDGE FUNCTION] Solicitudes pendientes encontradas: ${solicitudesPendientes?.length || 0}`);
    }

    if (!solError && solicitudesPendientes && solicitudesPendientes.length > 0) {
      for (const sol of solicitudesPendientes) {
        try {
          resumen.solicitudesVerificadas++;
          console.log(`📡 [EDGE FUNCTION] Verificando solicitud ${sol.id_solicitud} ante el SAT...`);
          const verifResult = await satClient.verificarSolicitud(sol.id_solicitud);
          console.log(`📊 [EDGE FUNCTION] Estatus SAT para ${sol.id_solicitud}: estado=${verifResult.estadoSolicitud}, paquetes=${verifResult.paquetesIds?.length || 0}`);

          // Estado del SAT: 1: Aceptada, 2: En Proceso, 3: Terminada, 4: Error, 5: Rechazada
          const estadoNum = String(verifResult.estadoSolicitud || "0");

          if (estadoNum === "3") {
            // Solicitud terminada y lista para descarga
            const paquetes = verifResult.paquetesIds || [];
            let facturasEnSolicitud = 0;

            for (const idPaquete of paquetes) {
              try {
                // Descargar bytes del ZIP
                const zipBytes = await satClient.descargarPaquete(idPaquete);
                resumen.paquetesDescargados++;

                // Descomprimir ZIP en memoria con JSZip
                const zip = new JSZip();
                const unzipped = await zip.loadAsync(zipBytes);

                for (const [filename, fileObj] of Object.entries(unzipped.files)) {
                  if (!fileObj.dir && filename.toLowerCase().endsWith(".xml")) {
                    const xmlContent = await fileObj.async("text");
                    try {
                      const parsed = parseCfdiXml(xmlContent);
                      const xmlUrl = await uploadXmlToStorage(supabase, parsed.uuid, xmlContent);
                      await saveFacturaToDb(supabase, parsed, xmlUrl);
                      facturasEnSolicitud++;
                      resumen.facturasProcesadas++;
                    } catch (parseErr: any) {
                      console.warn(`Error parseando XML ${filename}:`, parseErr.message);
                    }
                  }
                }
              } catch (pkgErr: any) {
                console.error(`Error descargando paquete ${idPaquete}:`, pkgErr);
              }
            }

            // Actualizar registro de solicitud a TERMINADA
            await supabase
              .from("sat_descarga_solicitudes")
              .update({
                estado_sat: "TERMINADA",
                paquetes_ids: paquetes,
                total_facturas_procesadas: facturasEnSolicitud,
                mensaje_sat: verifResult.mensaje || "Descarga y procesamiento completado",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sol.id);

            resumen.mensajes.push(
              `Solicitud ${sol.id_solicitud} procesada: ${facturasEnSolicitud} facturas descargadas de ${paquetes.length} paquetes.`
            );
          } else if (estadoNum === "4" || estadoNum === "5") {
            // Error o rechazada
            await supabase
              .from("sat_descarga_solicitudes")
              .update({
                estado_sat: estadoNum === "4" ? "ERROR" : "RECHAZADA",
                mensaje_sat: verifResult.mensaje || "El SAT rechazó la solicitud",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sol.id);

            resumen.mensajes.push(`Solicitud ${sol.id_solicitud} terminada con estatus: ${verifResult.mensaje || "Rechazada"}`);
          } else {
            // Continúa en proceso en los servidores del SAT
            await supabase
              .from("sat_descarga_solicitudes")
              .update({
                estado_sat: "EN_PROCESO",
                codigo_estatus: verifResult.codEstatus,
                mensaje_sat: "El SAT continúa preparando el paquete de descarga.",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sol.id);

            resumen.mensajes.push(`Solicitud ${sol.id_solicitud} en proceso en el SAT.`);
          }
        } catch (verifErr: any) {
          console.error(`Error verificando solicitud ${sol.id_solicitud}:`, verifErr);
        }
      }
    }

    // -------------------------------------------------------------------------
    // FASE 2: Crear Nueva Solicitud si aplica (action === 'sync' o action === 'solicitar')
    // -------------------------------------------------------------------------
    if (action === "sync" || action === "solicitar") {
      // Verificar si ya existe una solicitud reciente creada en las últimas 2 horas para no saturar al SAT
      const dosHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: solicitudesRecientes } = await supabase
        .from("sat_descarga_solicitudes")
        .select("id, id_solicitud, created_at")
        .gte("created_at", dosHorasAtras)
        .limit(1);

      const debeCrearNueva = action === "solicitar" || !solicitudesRecientes || solicitudesRecientes.length === 0;

      if (debeCrearNueva) {
        const fechaFin = new Date().toISOString().substring(0, 10) + "T23:59:59";
        const fechaInicio =
          reqData.fecha_inicio ||
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10) + "T00:00:00";

        console.log(`📤 [EDGE FUNCTION] Enviando nueva solicitud de descarga al SAT (${fechaInicio} a ${fechaFin})...`);
        const solResult = await satClient.solicitarDescargaRecibidos(fechaInicio, fechaFin);
        console.log(`📥 [EDGE FUNCTION] Respuesta SAT a solicitud: success=${solResult.success}, idSolicitud=${solResult.idSolicitud}, mensaje=${solResult.mensaje}`);

        if (solResult.success && solResult.idSolicitud) {
          await supabase.from("sat_descarga_solicitudes").insert({
            id_solicitud: solResult.idSolicitud,
            rfc: satRfc,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            tipo_solicitud: "RECIBIDOS",
            estado_sat: "PENDIENTE",
            codigo_estatus: solResult.codEstatus,
            mensaje_sat: solResult.mensaje,
          });

          resumen.nuevaSolicitudCreada = true;
          resumen.idNuevaSolicitud = solResult.idSolicitud;
          resumen.mensajes.push(
            `Nueva solicitud enviada al SAT (ID: ${solResult.idSolicitud}). El SAT preparará los comprobantes.`
          );
        } else {
          resumen.mensajes.push(`Respuesta SAT al solicitar: ${solResult.mensaje || "Error al solicitar"}`);
        }
      } else {
        console.log(`ℹ️ [EDGE FUNCTION] Ya existe solicitud reciente en curso. No se creará duplicado.`);
        resumen.mensajes.push("Ya existe una solicitud reciente ante el SAT en curso.");
      }
    }

    console.log(`✅ [EDGE FUNCTION] Resumen final del proceso:`, JSON.stringify(resumen));
    console.log(`======================================================\n`);

    return new Response(
      JSON.stringify({
        success: true,
        resumen,
        message:
          resumen.facturasProcesadas > 0
            ? `Sincronización completada: ${resumen.facturasProcesadas} facturas importadas.`
            : resumen.nuevaSolicitudCreada
            ? `Solicitud de descarga enviada al SAT (ID: ${resumen.idNuevaSolicitud}). Los paquetes estarán listos en unos minutos.`
            : "Sincronización en curso. No hay paquetes nuevos listos por el momento.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("💥 [EDGE FUNCTION] Error general:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Error al procesar facturas recibidas" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
