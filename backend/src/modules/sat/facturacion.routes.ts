import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { buildUnsignedCFDI } from './finkok/xmlBuilder';
import { buildUnsignedCFDIPagos, CFDIPagoParams, DoctoRelacionadoParam } from './finkok/xmlBuilderPagos';
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

    let resolvedVentaId: string | number | null = venta_id
      ? (typeof venta_id === 'number' ? venta_id : String(venta_id).trim())
      : null;
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

// ==============================================================================
// SECCIÓN: COMPLEMENTOS DE RECEPCIÓN DE PAGOS (REP - CFDI 4.0 / PAGOS 2.0)
// ==============================================================================

/**
 * Resuelve el siguiente folio consecutivo para Complementos de Pago (ej. P0001, P0002...)
 */
async function resolveConsecutiveFolioPago(
  supabaseClient: any,
  requestedSerie: string = 'P'
): Promise<{ serie: string; folio: string; fullFolio: string; siguienteNumero: number }> {
  const serie = (requestedSerie || 'P').toUpperCase().trim();
  let maxNum = 0;

  try {
    const { data: existingPagos } = await supabaseClient
      .from('complementos_pago')
      .select('folio, serie');

    (existingPagos || []).forEach((p: any) => {
      const raw = cleanFolio(p.folio).toUpperCase();
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
  } catch (err) {
    console.warn('Tabla complementos_pago aún no existe o está vacía:', err);
  }

  const nextAutoNum = maxNum + 1;
  const padded = String(nextAutoNum).padStart(4, '0');

  return {
    serie,
    folio: padded,
    fullFolio: `${serie}${padded}`,
    siguienteNumero: nextAutoNum
  };
}

/**
 * Sincroniza saldo y estado de pago de una venta después de registrar un pago
 */
async function syncVentaPagoInterno(supabaseClient: any, ventaId: any) {
  try {
    const vId = ventaId ? (typeof ventaId === 'number' ? ventaId : String(ventaId).trim()) : null;
    if (!vId) return;

    const [ventaRes, pagosRes] = await Promise.all([
      supabaseClient.from('ventas').select('precio_total_facturado, precio_total_venta').eq('id', vId).maybeSingle(),
      supabaseClient.from('ventas_pagos').select('monto').eq('venta_id', vId)
    ]);

    const venta = ventaRes.data;
    if (!venta) return;

    const totalVenta = Number(venta.precio_total_facturado || venta.precio_total_venta || 0);
    const totalPagado = (pagosRes.data || []).reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);
    const saldoPendiente = Math.max(0, totalVenta - totalPagado);

    let estadoPago = 'PENDIENTE';
    if (totalPagado >= totalVenta && totalVenta > 0) {
      estadoPago = 'PAGADA';
    } else if (totalPagado > 0) {
      estadoPago = 'PARCIAL';
    }

    await supabaseClient
      .from('ventas')
      .update({
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        estado_pago: estadoPago
      })
      .eq('id', vId);
  } catch (err) {
    console.warn('Aviso sincronizando pago interno de venta:', err);
  }
}

/**
 * GET /api/sat/siguiente-folio-pago
 * Retorna el siguiente folio consecutivo para Complementos de Pago (ej. P0001).
 */
router.get('/siguiente-folio-pago', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const serieTarget = (req.query.serie as string) || 'P';
    const result = await resolveConsecutiveFolioPago(supabaseClient, serieTarget);

    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al obtener folio consecutivo de pago' });
  }
});

/**
 * GET /api/sat/facturas-pendientes-cliente
 * Busca y lista todas las facturas emitidas (timbradas) de un cliente que tienen saldo pendiente.
 */
router.get('/facturas-pendientes-cliente', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { cliente_id, cliente_nombre, cliente_rfc } = req.query;

    let query = supabaseClient
      .from('ventas')
      .select('id, folio, cfdi_folio, cfdi_serie, cfdi_uuid, cfdi_estado, cliente, precio_total_facturado, total_pagado, saldo_pendiente, estado_pago, fecha, created_at')
      .not('cfdi_uuid', 'is', null)
      .neq('cfdi_estado', 'CANCELADA');

    let resolvedNames: string[] = [];
    if (cliente_id) {
      try {
        const { data: cli } = await supabaseClient
          .from('clientes')
          .select('nombre, razon_social')
          .eq('id', cliente_id)
          .maybeSingle();
        if (cli) {
          if (cli.nombre) resolvedNames.push(cli.nombre.trim());
          if (cli.razon_social && cli.razon_social !== cli.nombre) resolvedNames.push(cli.razon_social.trim());
        }
      } catch (_) {}
    } else if (cliente_rfc) {
      try {
        const { data: clis } = await supabaseClient
          .from('clientes')
          .select('nombre, razon_social')
          .ilike('rfc', String(cliente_rfc).trim());
        (clis || []).forEach((cli: any) => {
          if (cli.nombre && !resolvedNames.includes(cli.nombre.trim())) resolvedNames.push(cli.nombre.trim());
          if (cli.razon_social && !resolvedNames.includes(cli.razon_social.trim())) resolvedNames.push(cli.razon_social.trim());
        });
      } catch (_) {}
    }

    if (cliente_nombre) {
      const nom = String(cliente_nombre).trim();
      if (nom && !resolvedNames.includes(nom)) {
        resolvedNames.push(nom);
      }
    }

    if (resolvedNames.length > 0) {
      const orClauses = resolvedNames.map(n => `cliente.ilike.%${n}%`).join(',');
      query = query.or(orClauses);
    }

    const { data: facturas, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Calcular saldos reales consultando ventas_pagos para exactitud contable
    const ventaIds = (facturas || []).map(f => f.id);
    let pagosPorVenta: Record<number, any[]> = {};

    if (ventaIds.length > 0) {
      try {
        const { data: pagosData } = await supabaseClient
          .from('ventas_pagos')
          .select('id, venta_id, monto, fecha_pago, parcialidad')
          .in('venta_id', ventaIds);

        (pagosData || []).forEach((p: any) => {
          if (!pagosPorVenta[p.venta_id]) pagosPorVenta[p.venta_id] = [];
          pagosPorVenta[p.venta_id].push(p);
        });
      } catch (_) {}
    }

    const pendientes = (facturas || []).map(f => {
      const total = Number(f.precio_total_facturado || 0);
      const pagosVenta = pagosPorVenta[f.id] || [];
      const pagado = pagosVenta.reduce((acc: number, p: any) => acc + (Number(p.monto) || 0), 0);
      const saldo = Math.max(0, Math.round((total - pagado) * 100) / 100);
      const cleanFolioVal = cleanFolio(f.cfdi_folio || f.folio) || String(f.id);

      return {
        id: f.id,
        folio: cleanFolioVal,
        serie: (f.cfdi_serie || 'A').toUpperCase().trim(),
        fullFolio: `${(f.cfdi_serie || 'A').toUpperCase().trim()}${cleanFolioVal}`,
        cfdi_uuid: f.cfdi_uuid,
        cliente: f.cliente,
        cliente_rfc: (f as any).cliente_rfc || null,
        fecha: f.fecha || f.created_at?.slice(0, 10),
        precio_total: total,
        total_pagado: pagado,
        saldo_pendiente: saldo,
        num_parcialidad_siguiente: pagosVenta.length + 1,
        metodo_pago: (f as any).metodo_pago_cfdi || (f as any).metodo_pago || 'PPD'
      };
    }).filter(f => f.saldo_pendiente > 0.05); // Solo las que tienen saldo pendiente mayor a 5 centavos

    return res.json({ success: true, facturas: pendientes });
  } catch (err: any) {
    console.error("Error al obtener facturas pendientes del cliente:", err);
    return res.status(500).json({ error: err.message || 'Error al obtener facturas pendientes' });
  }
});

/**
 * POST /api/sat/timbrar-pago
 * Genera y timbra un CFDI 4.0 con Complemento de Recepción de Pagos 2.0 (REP).
 * Soporta de 1 a N facturas (pagos individuales o multi-factura agrupados por cliente).
 */
router.post('/timbrar-pago', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const body = req.body || {};
    const {
      cliente, // { id, nombre, rfc, codigo_postal, regimen_fiscal }
      fecha_pago,
      forma_pago, // '03', '01', etc.
      referencia,
      serie: requestedSerie,
      folio: requestedFolio,
      doctos, // Array de { venta_id, importe_a_pagar }
      finkok_env: envOverride
    } = body;

    if (!cliente || !cliente.nombre || !cliente.rfc) {
      return res.status(400).json({ error: 'Datos fiscales del receptor (cliente) incompletos' });
    }

    if (!Array.isArray(doctos) || doctos.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos una factura relacionada para este pago' });
    }

    const FINKOK_USERNAME = process.env.FINKOK_USERNAME;
    const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD;
    const FINKOK_ENV = (envOverride || process.env.FINKOK_ENV || 'production').toLowerCase();
    const isProduction = FINKOK_ENV === 'production';

    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      return res.status(500).json({ error: 'Credenciales de Finkok no configuradas en el backend' });
    }

    // Configuración del Emisor
    const emisorRfc = process.env.EMISOR_RFC || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');
    const emisorNombre = process.env.EMISOR_NOMBRE || (isProduction ? 'RAFAEL ALONSO FERNANDEZ TINAJERO' : 'ESCUELA KEMPER URATE');
    const emisorRegimen = process.env.EMISOR_REGIMEN || (isProduction ? '612' : '601');
    const emisorCP = process.env.EMISOR_CP || (isProduction ? '31110' : '77500');

    // 1. Resolver y calcular cada Documento Relacionado
    const doctosRelacionados: DoctoRelacionadoParam[] = [];
    const doctosDetallesParaGuardar: any[] = [];
    let montoTotalPagos = 0;

    for (const item of doctos) {
      const vId = item.venta_id ? (typeof item.venta_id === 'number' ? item.venta_id : String(item.venta_id).trim()) : null;
      if (!vId) continue;

      // Obtener venta
      const { data: vData, error: vErr } = await supabaseClient
        .from('ventas')
        .select('*')
        .eq('id', vId)
        .single();

      if (vErr || !vData) {
        throw new Error(`No se encontró la factura/venta con ID ${vId}`);
      }

      if (!vData.cfdi_uuid) {
        throw new Error(`La venta #${vData.folio || vId} no tiene un UUID fiscal registrado (no ha sido timbrada como factura).`);
      }

      // Obtener historial de pagos previos para calcular saldo y parcialidad exacta
      const { data: pagosPrevios } = await supabaseClient
        .from('ventas_pagos')
        .select('monto')
        .eq('venta_id', vId);

      const totalVenta = Number(vData.precio_total_facturado || vData.precio_total_venta || 0);
      const pagadoPrevio = (pagosPrevios || []).reduce((acc: number, p: any) => acc + (Number(p.monto) || 0), 0);
      const saldoAnterior = Math.max(0, Math.round((totalVenta - pagadoPrevio) * 100) / 100);

      const importeAbono = Math.min(Number(item.importe_a_pagar || 0), saldoAnterior);
      if (importeAbono <= 0) continue;

      const saldoInsoluto = Math.max(0, Math.round((saldoAnterior - importeAbono) * 100) / 100);
      const numParcialidad = (pagosPrevios || []).length + 1;

      const cleanFolioVal = cleanFolio(vData.cfdi_folio || vData.folio) || String(vId);
      const serieFactura = (vData.cfdi_serie || 'A').toUpperCase().trim();

      const baseDR = Number((importeAbono / 1.16).toFixed(2));
      const ivaDR = Number((importeAbono - baseDR).toFixed(2));

      montoTotalPagos += importeAbono;

      doctosRelacionados.push({
        uuid: vData.cfdi_uuid,
        serie: serieFactura,
        folio: cleanFolioVal,
        moneda: 'MXN',
        numParcialidad,
        saldoAnterior,
        importePagado: importeAbono,
        saldoInsoluto,
        tasaIva: 0.16
      });

      doctosDetallesParaGuardar.push({
        venta_id: vId,
        uuid_documento: vData.cfdi_uuid,
        serie: serieFactura,
        folio: cleanFolioVal,
        fecha: vData.fecha,
        moneda_dr: 'MXN',
        num_parcialidad: numParcialidad,
        saldo_anterior: saldoAnterior,
        importe_pagado: importeAbono,
        saldo_insoluto: saldoInsoluto,
        objeto_imp_dr: '02',
        base_iva: baseDR,
        importe_iva: ivaDR
      });
    }

    if (doctosRelacionados.length === 0) {
      return res.status(400).json({ error: 'No se encontraron facturas con saldo pendiente para aplicar el abono.' });
    }

    // 2. Consecutivo del Complemento de Pago
    const serieFinal = (requestedSerie || 'P').toUpperCase().trim();
    let folioFinal = cleanFolio(requestedFolio);
    if (!folioFinal) {
      const folioRes = await resolveConsecutiveFolioPago(supabaseClient, serieFinal);
      folioFinal = folioRes.folio;
    } else {
      if (folioFinal.toUpperCase().startsWith(serieFinal)) {
        folioFinal = folioFinal.slice(serieFinal.length).trim();
      }
      if (/^\d+$/.test(folioFinal)) {
        folioFinal = String(parseInt(folioFinal, 10)).padStart(4, '0');
      }
    }

    // 3. Normalización Receptor
    const isPublicoGeneral = !cliente.rfc || cliente.rfc.trim().toUpperCase() === 'XAXX010101000';
    const receptorRfc = isPublicoGeneral ? 'XAXX010101000' : cliente.rfc.trim().toUpperCase();
    const receptorNombre = isPublicoGeneral ? 'PUBLICO EN GENERAL' : cliente.nombre.trim();
    const receptorCP = isPublicoGeneral ? emisorCP : (cliente.codigo_postal || emisorCP);
    const receptorRegimen = isPublicoGeneral ? '616' : (cliente.regimen_fiscal || '601');

    const fechaPagoStr = fecha_pago ? String(fecha_pago).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const formaPagoStr = forma_pago || '03';

    // 4. Construir XML 4.0 sin sellar
    const cfdiPagoParams: CFDIPagoParams = {
      serie: serieFinal,
      folio: folioFinal,
      emisor: {
        rfc: emisorRfc,
        nombre: emisorNombre,
        regimenFiscal: emisorRegimen,
        cp: emisorCP
      },
      receptor: {
        rfc: receptorRfc,
        nombre: receptorNombre,
        domicilioFiscalReceptor: receptorCP,
        regimenFiscalReceptor: receptorRegimen
      },
      pago: {
        fechaPago: fechaPagoStr,
        formaDePagoP: formaPagoStr,
        monedaP: 'MXN',
        monto: Number(montoTotalPagos.toFixed(2)),
        numOperacion: referencia ? String(referencia).trim() : undefined,
        doctosRelacionados
      }
    };

    const xmlSinSellar = buildUnsignedCFDIPagos(cfdiPagoParams);

    // 5. Timbrar ante Finkok
    const stampResult = await signStampFinkok(
      xmlSinSellar,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      isProduction
    );

    const { success, uuid: sat_uuid, xml: xmlTimbrado } = stampResult;
    if (!success || !sat_uuid) {
      throw new Error('Finkok no devolvió un UUID fiscal válido para el Complemento de Pago');
    }

    // 6. Subir XML a Supabase Storage
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
      console.warn("Storage aviso al guardar XML de pago:", sErr);
    }

    // 7. Guardar en Base de Datos: complementos_pago
    let complementoCreado: any = null;
    try {
      const { data: compData, error: compErr } = await supabaseClient
        .from('complementos_pago')
        .insert([{
          serie: serieFinal,
          folio: `${serieFinal}${folioFinal}`,
          cliente_id: cliente.id || null,
          cliente_nombre: receptorNombre,
          cliente_rfc: receptorRfc,
          cliente_cp: receptorCP,
          cliente_regimen: receptorRegimen,
          monto_total: montoTotalPagos,
          fecha_pago: `${fechaPagoStr}T12:00:00Z`,
          forma_pago_sat: formaPagoStr,
          moneda: 'MXN',
          num_operacion: referencia || null,
          cfdi_uuid: sat_uuid,
          cfdi_xml_url: xmlUrl,
          cfdi_estado: 'TIMBRADA'
        }])
        .select('*')
        .single();

      if (compErr) {
        console.warn("Error guardando cabecera complementos_pago (posible tabla faltante):", compErr);
      } else {
        complementoCreado = compData;
      }
    } catch (dbErr) {
      console.warn("Aviso insertando en complementos_pago:", dbErr);
    }

    // Guardar detalles en complementos_pago_doctos
    if (complementoCreado?.id) {
      try {
        const doctosToInsert = doctosDetallesParaGuardar.map(d => ({
          ...d,
          complemento_pago_id: complementoCreado.id
        }));
        await supabaseClient.from('complementos_pago_doctos').insert(doctosToInsert);
      } catch (dErr) {
        console.warn("Aviso insertando en complementos_pago_doctos:", dErr);
      }
    }

    // 8. Actualizar ventas_pagos y estado de cada venta afectada
    for (const d of doctosDetallesParaGuardar) {
      try {
        await supabaseClient.from('ventas_pagos').insert([{
          venta_id: d.venta_id,
          monto: d.importe_pagado,
          fecha_pago: fechaPagoStr,
          metodo_pago: formaPagoStr === '03' ? 'Transferencia' : formaPagoStr === '01' ? 'Efectivo' : 'Tarjeta',
          referencia: referencia ? `CFDI REP ${serieFinal}${folioFinal} - ${referencia}` : `CFDI REP ${serieFinal}${folioFinal}`,
          complemento_pago_id: complementoCreado?.id || null,
          cfdi_uuid: sat_uuid,
          parcialidad: d.num_parcialidad,
          saldo_anterior: d.saldo_anterior,
          saldo_insoluto: d.saldo_insoluto
        }]);

        // Sincronizar saldo de la venta
        await syncVentaPagoInterno(supabaseClient, d.venta_id);
      } catch (pErr) {
        console.warn(`Aviso registrando pago en ventas_pagos para venta ${d.venta_id}:`, pErr);
      }
    }

    invalidateCache('facturas');
    invalidateCache('ventas');

    return res.json({
      success: true,
      uuid: sat_uuid,
      folio: `${serieFinal}${folioFinal}`,
      monto_total: montoTotalPagos,
      xml: xmlTimbrado,
      xml_url: xmlUrl,
      complemento: complementoCreado || {
        serie: serieFinal,
        folio: `${serieFinal}${folioFinal}`,
        cliente_nombre: receptorNombre,
        cliente_rfc: receptorRfc,
        cliente_cp: receptorCP,
        cliente_regimen: receptorRegimen,
        fecha_pago: `${fechaPagoStr}T12:00:00Z`,
        forma_pago_sat: formaPagoStr,
        num_operacion: referencia || null,
        monto_total: montoTotalPagos,
        cfdi_uuid: sat_uuid,
        cfdi_xml_url: xmlUrl,
        cfdi_estado: 'TIMBRADA'
      },
      doctos: doctosDetallesParaGuardar
    });
  } catch (err: any) {
    console.error("Error al timbrar complemento de pago:", err);
    return res.status(500).json({ error: err.message || 'Error al timbrar complemento de pago' });
  }
});

/**
 * GET /api/sat/complementos-pago
 * Lista todos los complementos de pago emitidos con sus documentos relacionados.
 */
router.get('/complementos-pago', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { data: complementos, error } = await supabaseClient
      .from('complementos_pago')
      .select('*, complementos_pago_doctos(*)')
      .order('created_at', { ascending: false });

    if (error) {
      const isMissingTable = error?.code === '42P01' || error?.message?.includes('complementos_pago');
      if (isMissingTable) {
        return res.json({
          success: true,
          complementos: [],
          warning: 'La tabla complementos_pago no existe aún en Supabase. Ejecuta scripts/create_complementos_pago.sql'
        });
      }
      throw error;
    }

    return res.json({ success: true, complementos: complementos || [] });
  } catch (err: any) {
    console.error("Error al obtener complementos de pago:", err);
    return res.status(500).json({ error: err.message || 'Error al obtener complementos de pago' });
  }
});

/**
 * POST /api/sat/cancelar-pago
 * Cancela un comprobante de pago timbrado ante el SAT vía Finkok.
 */
router.post('/cancelar-pago', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { complemento_id, uuid, motivo, folio_sustitucion } = req.body || {};

    let targetUuid = uuid;
    let compRecord: any = null;

    if (complemento_id) {
      const { data: c } = await supabaseClient
        .from('complementos_pago')
        .select('*')
        .eq('id', complemento_id)
        .maybeSingle();
      if (c) {
        compRecord = c;
        targetUuid = c.cfdi_uuid;
      }
    }

    if (!targetUuid) {
      return res.status(400).json({ error: 'UUID fiscal requerido para cancelar' });
    }

    const FINKOK_USERNAME = process.env.FINKOK_USERNAME;
    const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD;
    const FINKOK_ENV = (req.body.finkok_env || process.env.FINKOK_ENV || 'production').toLowerCase();
    const isProduction = FINKOK_ENV === 'production';
    const emisorRfc = process.env.EMISOR_RFC || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');

    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      return res.status(500).json({ error: 'Credenciales de Finkok no configuradas' });
    }

    const cancelResult = await signCancelFinkok(
      targetUuid,
      emisorRfc,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      motivo || '02',
      folio_sustitucion || '',
      isProduction
    );

    // Actualizar estado en complementos_pago
    if (complemento_id || targetUuid) {
      try {
        let updateQuery = supabaseClient.from('complementos_pago').update({ cfdi_estado: 'CANCELADA' });
        if (complemento_id) {
          updateQuery = updateQuery.eq('id', complemento_id);
        } else {
          updateQuery = updateQuery.eq('cfdi_uuid', targetUuid);
        }
        await updateQuery;
      } catch (_) {}
    }

    invalidateCache('facturas');

    return res.json({
      success: true,
      uuid: targetUuid,
      mensaje: 'Complemento de pago cancelado ante el SAT exitosamente',
      details: cancelResult
    });
  } catch (err: any) {
    console.error("Error al cancelar complemento de pago:", err);
    return res.status(500).json({ error: err.message || 'Error al cancelar complemento de pago' });
  }
});

export default router;

