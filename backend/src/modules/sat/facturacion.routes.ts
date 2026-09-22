import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { buildUnsignedCFDI } from './finkok/xmlBuilder';
import { signStampFinkok, signCancelFinkok } from './finkok/soapClient';
import { invalidateCache } from '../../middlewares/cache.middleware';

const router = Router();

/**
 * Limpia el folio eliminando cualquier texto descriptivo adicional (ej. '- Caja gris (1)', descripciones, etc.),
 * garantizando que sólo quede el identificador limpio (ej. 'A0001', '4301442723', etc.).
 */
export function cleanFolio(rawFolio?: any): string {
  if (!rawFolio && rawFolio !== 0) return '';
  let str = String(rawFolio).trim();
  if (str.includes(' - ')) {
    str = str.split(' - ')[0].trim();
  } else if (/\s*-\s*[a-zA-Z]/.test(str)) {
    str = str.split(/\s*-\s*/)[0].trim();
  } else if (/\s+[a-zA-Z(]/.test(str)) {
    str = str.split(/\s+/)[0].trim();
  }
  return str;
}

/**
 * Resuelve o calcula el folio consecutivo estándar para facturación (ej. A0001, A0002...).
 * Si el usuario envió un número o folio explícito (ej. 1, '1', '0001', 'A0001'), se normaliza a 4 dígitos ('0001').
 * Si no se envió ningún folio, se calcula automáticamente consultando la base de datos para obtener el último folio y sumar 1.
 */
async function resolveConsecutiveFolio(
  supabaseClient: any,
  requestedSerie?: string,
  requestedFolio?: string
): Promise<{ serie: string; folio: string; fullFolio: string; ultimoNumero: number; siguienteNumero: number }> {
  const serie = (requestedSerie || 'A').toUpperCase().trim();
  let folio = cleanFolio(requestedFolio);

  if (folio.toUpperCase().startsWith(serie)) {
    folio = folio.slice(serie.length).trim();
  }

  // Consultar siempre las ventas timbradas/emitidas para conocer el estado actual
  let maxNum = 0;
  try {
    const { data: existingVentas } = await supabaseClient
      .from('ventas')
      .select('folio, cfdi_folio')
      .or('cfdi_estado.eq.TIMBRADA,cfdi_estado.eq.CANCELADA,tipo_proyecto.eq.Factura Directa');

    (existingVentas || []).forEach((v: any) => {
      [v.folio, v.cfdi_folio].filter(Boolean).forEach((c: any) => {
        const raw = cleanFolio(c).toUpperCase();
        let numPart = '';
        if (raw.startsWith(serie)) {
          numPart = raw.slice(serie.length);
        } else if (/^\d+$/.test(raw)) {
          numPart = raw;
        }
        if (numPart && /^\d+$/.test(numPart)) {
          const parsed = parseInt(numPart, 10);
          if (!isNaN(parsed) && parsed > maxNum && parsed < 1000000) {
            maxNum = parsed;
          }
        }
      });
    });
  } catch (err) {
    console.warn('Error consultando folios anteriores:', err);
  }

  const nextAutoNum = maxNum + 1;

  if (/^\d+$/.test(folio)) {
    const num = parseInt(folio, 10);
    const padded = String(num).padStart(4, '0');
    return {
      serie,
      folio: padded,
      fullFolio: `${serie}${padded}`,
      ultimoNumero: maxNum,
      siguienteNumero: num
    };
  }

  const padded = String(nextAutoNum).padStart(4, '0');
  return {
    serie,
    folio: padded,
    fullFolio: `${serie}${padded}`,
    ultimoNumero: maxNum,
    siguienteNumero: nextAutoNum
  };
}

/**
 * POST /api/sat/timbrar-factura
 * Timbra una factura CFDI 4.0 directamente a través del backend usando Finkok.
 */
router.post('/timbrar-factura', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const body = req.body || {};
    const { 
      venta_id, 
      custom_receptor, 
      cliente_override, 
      custom_condiciones, 
      cfdi_config, 
      custom_partidas 
    } = body;

    let resolvedVentaId = venta_id ? parseInt(venta_id, 10) : null;
    let venta: any = null;
    let cliente: any = null;
    let partidas: any[] = [];

    const effectiveReceptor = cliente_override || custom_receptor || null;
    const effectiveCondiciones = { ...(custom_condiciones || {}), ...(cfdi_config || {}) };

    const { serie: serieFinal, folio: folioFinal, fullFolio } = await resolveConsecutiveFolio(
      supabaseClient,
      effectiveCondiciones.serie,
      effectiveCondiciones.folio
    );

    if (resolvedVentaId) {
      const { data: ventaDB, error: ventaError } = await supabaseClient
        .from('ventas')
        .select('*')
        .eq('id', resolvedVentaId)
        .single();

      if (ventaError || !ventaDB) throw new Error('Venta no encontrada');
      if (ventaDB.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada');

      venta = {
        ...ventaDB,
        ...effectiveCondiciones,
        cfdi_serie: serieFinal,
        cfdi_folio: folioFinal,
        factura_serie: serieFinal,
        factura_folio: folioFinal,
        folio: fullFolio,
      };

      if (venta.cliente) {
        const { data: clienteData } = await supabaseClient
          .from('clientes')
          .select('*')
          .ilike('nombre', venta.cliente.trim())
          .maybeSingle();

        if (clienteData) {
          cliente = clienteData;
        }
      }

      if (!cliente) {
        cliente = {
          nombre: venta.cliente || 'Público en General',
          razon_social: 'PUBLICO EN GENERAL',
          rfc: 'XAXX010101000',
          regimen_fiscal: '616',
          uso_cfdi: 'S01',
          codigo_postal: process.env.EMISOR_CP || '31110'
        };
      }

      if (effectiveReceptor) {
        cliente = { ...cliente, ...effectiveReceptor };
      }

      if (custom_partidas && Array.isArray(custom_partidas) && custom_partidas.length > 0) {
        partidas = custom_partidas;
      } else {
        const { data: partidasDB, error: partidasError } = await supabaseClient
          .from('ventas_partidas')
          .select('*')
          .eq('venta_id', resolvedVentaId);

        if (partidasError || !partidasDB || partidasDB.length === 0) {
          throw new Error('La venta no tiene partidas o productos para facturar');
        }
        partidas = partidasDB;
      }
    } else {
      if (!effectiveReceptor) {
        throw new Error('Los datos fiscales del cliente son obligatorios para facturar');
      }

      cliente = {
        nombre: effectiveReceptor.nombre || effectiveReceptor.razon_social || 'PUBLICO EN GENERAL',
        razon_social: effectiveReceptor.razon_social || effectiveReceptor.nombre || 'PUBLICO EN GENERAL',
        rfc: (effectiveReceptor.rfc || 'XAXX010101000').toUpperCase().trim(),
        regimen_fiscal: effectiveReceptor.regimen_fiscal || '616',
        uso_cfdi: effectiveReceptor.uso_cfdi || 'G03',
        codigo_postal: effectiveReceptor.codigo_postal || process.env.EMISOR_CP || '31110',
        ...effectiveReceptor
      };

      if (!custom_partidas || !Array.isArray(custom_partidas) || custom_partidas.length === 0) {
        throw new Error('Debes incluir al menos una partida para generar la factura');
      }
      partidas = custom_partidas;

      const subtotalCalculado = partidas.reduce((sum, p) => {
        const cant = parseFloat(p.cantidad) || 1;
        const prec = parseFloat(p.precio_unitario_venta || p.precio_unitario || 0);
        return sum + (cant * prec);
      }, 0);
      const ivaCalculado = subtotalCalculado * 0.16;
      const totalCalculado = subtotalCalculado + ivaCalculado;

      const formaPagoFinal = effectiveCondiciones.forma_pago || '03';
      const metodoPagoFinal = effectiveCondiciones.metodo_pago_cfdi || 'PUE';
      const ordenCompraFinal = effectiveCondiciones.orden_compra || null;

      const { data: createdVenta, error: createVentaError } = await supabaseClient
        .from('ventas')
        .insert({
          cliente: cliente.razon_social || cliente.nombre || 'PUBLICO EN GENERAL',
          fecha: new Date().toISOString().split('T')[0],
          folio: fullFolio,
          cfdi_serie: serieFinal,
          cfdi_folio: folioFinal,
          precio_total_facturado: totalCalculado,
          estado_pago: 'PAGADO',
          cfdi_estado: 'PENDIENTE',
          orden_compra: ordenCompraFinal,
          tipo_proyecto: 'Factura Directa',
        })
        .select()
        .single();

      if (createVentaError) {
        console.error("Error al registrar venta:", createVentaError);
      }

      resolvedVentaId = createdVenta?.id || null;

      if (resolvedVentaId) {
        const partidasToInsert = partidas.map(p => ({
          venta_id: resolvedVentaId,
          descripcion: p.descripcion || 'Concepto',
          cantidad: parseFloat(p.cantidad) || 1,
          precio_unitario_venta: parseFloat(p.precio_unitario_venta || p.precio_unitario || 0),
          clave_sat: p.clave_sat || '01010101',
          clave_unidad: p.clave_unidad || 'H87',
          unidad: p.unidad || 'Pieza',
        }));
        await supabaseClient.from('ventas_partidas').insert(partidasToInsert);
      }

      venta = {
        id: resolvedVentaId,
        folio: `${serieFinal}${folioFinal}`,
        cfdi_serie: serieFinal,
        cfdi_folio: folioFinal,
        forma_pago: formaPagoFinal,
        metodo_pago: formaPagoFinal,
        metodo_pago_cfdi: metodoPagoFinal,
        precio_total_facturado: totalCalculado,
        ...(createdVenta || {}),
        ...effectiveCondiciones
      };
    }

    const FINKOK_USERNAME = process.env.FINKOK_USERNAME;
    const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD;
    const FINKOK_ENV = (body.finkok_env || process.env.FINKOK_ENV || 'production').toLowerCase();
    const isProduction = FINKOK_ENV === 'production';

    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      throw new Error('Credenciales de Finkok no configuradas en el entorno');
    }

    // Construir CFDI 4.0 XML con hora local correcta
    const xmlSinSellar = await buildUnsignedCFDI(venta, cliente, partidas, isProduction);

    // Timbrar en Finkok
    const stampResult = await signStampFinkok(
      xmlSinSellar,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      isProduction
    );

    const { success, uuid: sat_uuid, xml: xmlTimbrado } = stampResult;

    if (!success || !sat_uuid) {
      throw new Error('Finkok no devolvió un UUID fiscal válido');
    }

    // Subir a Storage
    const xmlFileName = `${sat_uuid}.xml`;
    let xmlUrl = '';

    try {
      const { error: storageError } = await supabaseClient
        .storage
        .from('facturas')
        .upload(xmlFileName, xmlTimbrado, {
          contentType: 'text/xml',
          upsert: true
        });

      if (!storageError) {
        const { data: publicUrlData } = supabaseClient.storage.from('facturas').getPublicUrl(xmlFileName);
        xmlUrl = publicUrlData?.publicUrl || '';
      }
    } catch (sErr) {
      console.error("Storage aviso:", sErr);
    }

    // Actualizar venta
    if (resolvedVentaId) {
      const updateData: any = {
        cfdi_uuid: sat_uuid,
        cfdi_estado: 'TIMBRADA',
        cfdi_xml_url: xmlUrl || xmlFileName,
        folio: fullFolio,
        cfdi_folio: folioFinal,
        cfdi_serie: serieFinal,
      };
      if (effectiveCondiciones.orden_compra) {
        updateData.orden_compra = effectiveCondiciones.orden_compra.trim();
      }

      await supabaseClient
        .from('ventas')
        .update(updateData)
        .eq('id', resolvedVentaId);
    }

    try {
      invalidateCache('ventas');
      invalidateCache('sat');
    } catch (_) {}

    return res.json({
      success: true,
      mensaje: 'Factura timbrada exitosamente con Finkok',
      cfdi_uuid: sat_uuid,
      folio: fullFolio,
      fullFolio,
      xml_url: xmlUrl,
      xml: xmlTimbrado,
      venta_id: resolvedVentaId,
      fecha_timbrado: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error en timbrado SAT Finkok:", error);
    return res.status(400).json({ error: error.message || 'Error en proceso de timbrado' });
  }
});

/**
 * GET /api/sat/siguiente-folio
 * Calcula el siguiente folio consecutivo para una serie determinada (por defecto 'A').
 * Formato estándar: 4 dígitos con ceros iniciales (ej. A0001, A0002, etc.)
 */
router.get('/siguiente-folio', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const serieParam = String(req.query.serie || 'A').toUpperCase().trim();
    const result = await resolveConsecutiveFolio(supabaseClient, serieParam);

    return res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error("Error al calcular siguiente folio:", error);
    return res.json({
      success: true,
      serie: 'A',
      folio: '0001',
      fullFolio: 'A0001',
      ultimoNumero: 0,
      siguienteNumero: 1
    });
  }
});

/**
 * POST /api/sat/cancelar-factura
 */
router.post('/cancelar-factura', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { venta_id, motivo = '02', folio_sustitucion = '' } = req.body || {};
    if (!venta_id) throw new Error('Falta el ID de la venta (venta_id)');

    const FINKOK_USERNAME = process.env.FINKOK_USERNAME || '';
    const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD || '';
    const FINKOK_ENV = (req.body.finkok_env || process.env.FINKOK_ENV || 'production').toLowerCase();
    const isProduction = FINKOK_ENV === 'production';

    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('cfdi_uuid, cfdi_estado')
      .eq('id', venta_id)
      .single();

    if (ventaError || !venta) throw new Error('No se encontró la venta');
    if (venta.cfdi_estado !== 'TIMBRADA' || !venta.cfdi_uuid) {
      throw new Error('La venta no se encuentra timbrada o no tiene Folio Fiscal');
    }

    const rfcEmisor = process.env.EMISOR_RFC || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');

    const cancelResult = await signCancelFinkok(
      venta.cfdi_uuid,
      rfcEmisor,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      motivo,
      folio_sustitucion,
      isProduction
    );

    await supabaseClient
      .from('ventas')
      .update({
        cfdi_estado: 'CANCELADA'
      })
      .eq('id', venta_id);

    try {
      invalidateCache('ventas');
      invalidateCache('sat');
    } catch (_) {}

    return res.json({
      success: true,
      mensaje: 'Factura cancelada exitosamente ante el SAT',
      estatus: cancelResult.estatus,
      uuid: venta.cfdi_uuid
    });
  } catch (error: any) {
    console.error("Error al cancelar factura:", error);
    return res.status(400).json({ error: error.message || 'Error al cancelar factura' });
  }
});

/**
 * GET /api/sat/facturas-emitidas
 * Obtiene el listado completo de facturas emitidas (timbradas o canceladas),
 * identificando con precisión su origen (desde Venta o Emisión Directa).
 */
router.get('/facturas-emitidas', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { data, error } = await supabaseClient
      .from('ventas')
      .select(`
        id,
        cliente,
        fecha,
        factura_referencia,
        folio,
        cfdi_uuid,
        cfdi_estado,
        cfdi_xml_url,
        precio_total_facturado,
        created_at,
        orden_compra,
        descripcion,
        tipo_proyecto,
        costo_total,
        cotizacion_id,
        cotizaciones(folio)
      `)
      .or('cfdi_estado.eq.TIMBRADA,cfdi_estado.eq.CANCELADA')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const facturas = (data || []).map((f: any) => {
      const isDirecta = f.tipo_proyecto === 'Factura Directa';
      let origen = 'FACTURA_DIRECTA';
      let origenLabel = 'Factura Directa';

      const cleanFolioVal = cleanFolio(f.folio);

      if (!isDirecta) {
        origen = 'VENTA';
        const numRef = cleanFolioVal || f.factura_referencia || f.cotizaciones?.folio || `#${f.id}`;
        origenLabel = `Venta ${numRef}`;
      }

      return {
        ...f,
        folio: cleanFolioVal || f.folio,
        origen,
        origenLabel
      };
    });

    return res.json({ success: true, facturas });
  } catch (err: any) {
    console.error("Error al obtener facturas emitidas:", err);
    return res.status(500).json({ error: err.message || 'Error al obtener facturas emitidas' });
  }
});

/**
 * GET /api/sat/factura-xml/:identificador
 * Obtiene el contenido del XML timbrado de una factura, buscando por UUID (mayúsculas/minúsculas),
 * URL pública en storage o ID de venta.
 */
router.get('/factura-xml/:identificador', async (req: Request, res: Response) => {
  try {
    const { identificador } = req.params;
    if (!identificador) return res.status(400).json({ error: 'Identificador requerido' });

    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Buscar venta si el identificador es UUID o ID
    const { data: venta } = await supabaseClient
      .from('ventas')
      .select('id, cfdi_uuid, cfdi_xml_url')
      .or(`cfdi_uuid.eq.${identificador},id.eq.${identificador}`)
      .maybeSingle();

    const uuid = venta?.cfdi_uuid || identificador;
    const xmlUrl = venta?.cfdi_xml_url;

    // 2. Si tiene URL pública de storage, intentar fetch directo
    if (xmlUrl && xmlUrl.startsWith('http')) {
      try {
        const fetchResp = await fetch(xmlUrl);
        if (fetchResp.ok) {
          const text = await fetchResp.text();
          if (text && text.includes('<')) {
            return res.json({ success: true, xml: text });
          }
        }
      } catch (_) {}
    }

    // 3. Descargar desde storage probando variaciones de nombre (mayúsculas y minúsculas)
    const fileNamesToTry = [
      `${uuid.toUpperCase()}.xml`,
      `${uuid.toLowerCase()}.xml`,
      `${uuid}.xml`
    ];

    for (const fName of fileNamesToTry) {
      try {
        const { data: fileBlob, error: downErr } = await supabaseClient
          .storage
          .from('facturas')
          .download(fName);

        if (!downErr && fileBlob) {
          const text = await fileBlob.text();
          if (text && text.includes('<')) {
            return res.json({ success: true, xml: text });
          }
        }
      } catch (_) {}
    }

    return res.status(404).json({ error: 'No se encontró el XML en el servidor' });
  } catch (err: any) {
    console.error("Error al obtener XML de factura:", err);
    return res.status(500).json({ error: err.message || 'Error al obtener XML' });
  }
});

export default router;
