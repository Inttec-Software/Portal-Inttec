import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { buildUnsignedCFDI } from './finkok/xmlBuilder';
import { buildUnsignedCFDIPagos, CFDIPagoParams, DoctoRelacionadoParam } from './finkok/xmlBuilderPagos';
import { signStampFinkok, signCancelFinkok } from './finkok/soapClient';
import { invalidateCache } from '../../middlewares/cache.middleware';
import { folioMutex } from '../../utils/mutex';

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
 * Resuelve o calcula el folio consecutivo estándar para facturación (ej. A0000, A0001, A0002...).
 * - Si no existen folios previos para la serie, inicia en "0000" (ej. A0000).
 * - Incrementa de 1 en 1: 0000 -> 0001 -> 0002 -> ...
 * - Siempre formateado a 4+ dígitos con ceros iniciales (String(n).padStart(4, '0')).
 * - Considera todos los estados (BORRADOR, TIMBRADA, CANCELADA, PENDIENTE) para que los
 *   borradores mantengan su folio consecutivo permanentemente reservado sin colisiones.
 * - Si el usuario envió un número o folio explícito (ej. 0, '0', '0000', 'A0000'), se normaliza a 4+ dígitos ('0000').
 */
export async function resolveConsecutiveFolio(
  supabaseClient: any,
  requestedSerie?: string,
  requestedFolio?: string
): Promise<{ serie: string; folio: string; fullFolio: string; ultimoNumero: number; siguienteNumero: number }> {
  const serie = (requestedSerie || 'A').toUpperCase().trim();
  let folio = cleanFolio(requestedFolio);

  if (folio.toUpperCase().startsWith(serie)) {
    folio = folio.slice(serie.length).trim();
  }

  // Consultar folios reservados en facturas_emitidas y ventas
  let maxNum: number | null = null;
  const inspectFolio = (c: any) => {
    const raw = cleanFolio(c).toUpperCase();
    let numPart = '';
    if (raw.startsWith(serie)) {
      numPart = raw.slice(serie.length).replace(/^[-_\s]+/, '');
    } else if (/^\d+$/.test(raw) && serie === 'A') {
      numPart = raw;
    }
    if (numPart && /^\d+$/.test(numPart)) {
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < 1000000) {
        if (maxNum === null || parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }
  };

  try {
    const { data: existingFacturas } = await supabaseClient
      .from('facturas_emitidas')
      .select('folio, serie');

    if (existingFacturas) {
      existingFacturas.forEach((f: any) => {
        inspectFolio(f.folio);
      });
    }

    const { data: existingVentas } = await supabaseClient
      .from('ventas')
      .select('folio, cfdi_folio, factura_referencia');

    if (existingVentas) {
      existingVentas.forEach((v: any) => {
        [v.folio, v.cfdi_folio, v.factura_referencia].filter(Boolean).forEach(inspectFolio);
      });
    }
  } catch (err) {
    console.warn('Error consultando folios anteriores:', err);
  }

  // Si no existe ningún folio previo, arranca en 0 ("0000")
  const nextAutoNum = maxNum === null ? 0 : maxNum + 1;

  if (/^\d+$/.test(folio)) {
    const num = parseInt(folio, 10);
    const padded = String(num).padStart(4, '0');
    return {
      serie,
      folio: padded,
      fullFolio: `${serie}${padded}`,
      ultimoNumero: maxNum === null ? 0 : maxNum,
      siguienteNumero: num
    };
  }

  const padded = String(nextAutoNum).padStart(4, '0');
  return {
    serie,
    folio: padded,
    fullFolio: `${serie}${padded}`,
    ultimoNumero: maxNum === null ? 0 : maxNum,
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

    let serieFinal: string;
    let folioFinal: string;
    let fullFolio: string;

    let isDraftInFacturas = false;
    let existingFactura: any = null;
    let actualVentaId: string | number | null = null;

    if (resolvedVentaId) {
      // 1. Verificar si es un borrador en facturas_emitidas
      const { data: fDB } = await supabaseClient
        .from('facturas_emitidas')
        .select('*')
        .eq('id', resolvedVentaId)
        .maybeSingle();

      if (fDB) {
        isDraftInFacturas = true;
        existingFactura = fDB;
        actualVentaId = fDB.venta_id || null;
      } else {
        // 2. Si no es borrador en facturas_emitidas, buscar en ventas (origen venta)
        const { data: vDB } = await supabaseClient
          .from('ventas')
          .select('*')
          .eq('id', resolvedVentaId)
          .maybeSingle();

        if (vDB) {
          actualVentaId = vDB.id;
          venta = vDB;
        }
      }
    }

    if (existingFactura) {
      if (existingFactura.cfdi_estado === 'TIMBRADA') throw new Error('La factura ya se encuentra timbrada');

      const requestedSerie = effectiveCondiciones.serie || existingFactura.serie || 'A';
      const requestedFolio = effectiveCondiciones.folio || existingFactura.folio || cleanFolio(existingFactura.folio);

      const lockKey = `${company}:${env}:${(requestedSerie || 'A').toUpperCase()}`;
      const resolved = await folioMutex.runExclusive(lockKey, async () => {
        return await resolveConsecutiveFolio(supabaseClient, requestedSerie, requestedFolio);
      });

      serieFinal = resolved.serie;
      folioFinal = resolved.folio;
      fullFolio = resolved.fullFolio;

      let draftNotas: any = {};
      if (existingFactura.notas && typeof existingFactura.notas === 'object') {
        draftNotas = existingFactura.notas;
      } else if (typeof existingFactura.notas === 'string' && existingFactura.notas.startsWith('{')) {
        try { draftNotas = JSON.parse(existingFactura.notas); } catch (_) {}
      }

      cliente = {
        nombre: existingFactura.cliente_nombre || 'PUBLICO EN GENERAL',
        razon_social: existingFactura.cliente_nombre || 'PUBLICO EN GENERAL',
        rfc: existingFactura.cliente_rfc || 'XAXX010101000',
        regimen_fiscal: existingFactura.cliente_regimen || '616',
        uso_cfdi: existingFactura.cliente_uso_cfdi || 'G03',
        codigo_postal: existingFactura.cliente_cp || process.env.EMISOR_CP || '31110',
        ...(draftNotas.receptor || {}),
        ...(effectiveReceptor || {})
      };

      if (custom_partidas && Array.isArray(custom_partidas) && custom_partidas.length > 0) {
        partidas = custom_partidas;
      } else {
        const { data: pDB } = await supabaseClient
          .from('facturas_emitidas_partidas')
          .select('*')
          .eq('factura_id', existingFactura.id);

        if (pDB && pDB.length > 0) {
          partidas = pDB.map((p: any) => ({
            ...p,
            precio_unitario_venta: p.precio_unitario
          }));
        } else {
          partidas = [{
            descripcion: 'Concepto',
            cantidad: 1,
            precio_unitario_venta: existingFactura.subtotal || existingFactura.total || 0,
            clave_sat: '01010101',
            clave_unidad: 'H87',
            unidad: 'Pieza'
          }];
        }
      }

      venta = {
        id: existingFactura.id,
        folio: fullFolio,
        cfdi_serie: serieFinal,
        cfdi_folio: folioFinal,
        forma_pago: effectiveCondiciones.forma_pago || existingFactura.forma_pago || '03',
        metodo_pago: effectiveCondiciones.forma_pago || existingFactura.forma_pago || '03',
        metodo_pago_cfdi: effectiveCondiciones.metodo_pago_cfdi || existingFactura.metodo_pago || 'PUE',
        precio_total_facturado: Number(existingFactura.total || 0),
        orden_compra: effectiveCondiciones.orden_compra || existingFactura.orden_compra || null
      };
    } else if (actualVentaId && venta) {
      if (venta.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada');

      const requestedSerie = effectiveCondiciones.serie || venta.cfdi_serie || (venta.folio ? venta.folio.replace(/\d+$/, '') : 'A');
      const requestedFolio = effectiveCondiciones.folio || venta.cfdi_folio || cleanFolio(venta.folio);

      const lockKey = `${company}:${env}:${(requestedSerie || 'A').toUpperCase()}`;
      const resolved = await folioMutex.runExclusive(lockKey, async () => {
        return await resolveConsecutiveFolio(supabaseClient, requestedSerie, requestedFolio);
      });

      serieFinal = resolved.serie;
      folioFinal = resolved.folio;
      fullFolio = resolved.fullFolio;

      venta = {
        ...venta,
        ...effectiveCondiciones,
        cfdi_serie: serieFinal,
        cfdi_folio: folioFinal,
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
          .eq('venta_id', actualVentaId);

        if (partidasError || !partidasDB || partidasDB.length === 0) {
          throw new Error('La venta no tiene partidas o productos para facturar');
        }
        partidas = partidasDB;
      }
    } else {
      if (!effectiveReceptor) {
        throw new Error('Los datos fiscales del cliente son obligatorios para facturar');
      }

      const requestedSerie = effectiveCondiciones.serie || 'A';
      const lockKey = `${company}:${env}:${(requestedSerie || 'A').toUpperCase()}`;
      const resolved = await folioMutex.runExclusive(lockKey, async () => {
        return await resolveConsecutiveFolio(supabaseClient, requestedSerie, effectiveCondiciones.folio);
      });

      serieFinal = resolved.serie;
      folioFinal = resolved.folio;
      fullFolio = resolved.fullFolio;

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

      venta = {
        folio: `${serieFinal}${folioFinal}`,
        cfdi_serie: serieFinal,
        cfdi_folio: folioFinal,
        forma_pago: formaPagoFinal,
        metodo_pago: formaPagoFinal,
        metodo_pago_cfdi: metodoPagoFinal,
        precio_total_facturado: totalCalculado,
        orden_compra: ordenCompraFinal,
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

    // Calcular montos finales
    const subtotalFinal = partidas.reduce((sum, p) => {
      const cant = parseFloat(p.cantidad) || 1;
      const prec = parseFloat(p.precio_unitario_venta || p.precio_unitario || 0);
      return sum + (cant * prec);
    }, 0);
    const ivaFinal = Math.round(subtotalFinal * 0.16 * 100) / 100;
    const totalFinal = Math.round((subtotalFinal + ivaFinal) * 100) / 100;

    // Guardar en tabla independiente facturas_emitidas
    const facturaPayload: any = {
      serie: serieFinal,
      folio: folioFinal,
      cliente_nombre: cliente.razon_social || cliente.nombre || 'PUBLICO EN GENERAL',
      cliente_rfc: (cliente.rfc || 'XAXX010101000').toUpperCase().trim(),
      cliente_cp: cliente.codigo_postal || '31110',
      cliente_regimen: cliente.regimen_fiscal || '616',
      cliente_uso_cfdi: cliente.uso_cfdi || 'G03',
      forma_pago: venta.forma_pago || '03',
      metodo_pago: venta.metodo_pago_cfdi || 'PUE',
      moneda: 'MXN',
      subtotal: subtotalFinal,
      iva: ivaFinal,
      total: totalFinal,
      total_pagado: totalFinal, // PUE liquidado
      saldo_pendiente: 0,
      estado_pago: 'PAGADO',
      cfdi_uuid: sat_uuid,
      cfdi_estado: 'TIMBRADA',
      cfdi_xml_url: xmlUrl || xmlFileName,
      fecha_emision: new Date().toISOString(),
      orden_compra: effectiveCondiciones.orden_compra || venta.orden_compra || null,
      venta_id: actualVentaId || null
    };

    let targetFacturaId = existingFactura?.id || null;
    if (existingFactura) {
      await supabaseClient
        .from('facturas_emitidas')
        .update(facturaPayload)
        .eq('id', existingFactura.id);
    } else {
      const { data: newF } = await supabaseClient
        .from('facturas_emitidas')
        .insert(facturaPayload)
        .select('id')
        .single();
      targetFacturaId = newF?.id || null;
    }

    // Insertar partidas fiscales en facturas_emitidas_partidas
    if (targetFacturaId) {
      await supabaseClient
        .from('facturas_emitidas_partidas')
        .delete()
        .eq('factura_id', targetFacturaId);

      const factPartidas = partidas.map((p: any) => ({
        factura_id: targetFacturaId,
        descripcion: p.descripcion || 'Concepto',
        cantidad: parseFloat(p.cantidad) || 1,
        precio_unitario: parseFloat(p.precio_unitario_venta || p.precio_unitario || 0),
        importe: (parseFloat(p.cantidad) || 1) * parseFloat(p.precio_unitario_venta || p.precio_unitario || 0),
        clave_sat: p.clave_sat || '01010101',
        clave_unidad: p.clave_unidad || 'H87',
        unidad: p.unidad || 'Pieza',
        objeto_imp: p.objeto_imp || '02'
      }));
      await supabaseClient.from('facturas_emitidas_partidas').insert(factPartidas);
    }

    // Si provenía de una venta operativa en ventas.tsx, actualizar la venta para vincularla sin duplicar
    if (actualVentaId) {
      await supabaseClient
        .from('ventas')
        .update({
          cfdi_uuid: sat_uuid,
          cfdi_estado: 'TIMBRADA',
          cfdi_xml_url: xmlUrl || xmlFileName,
          cfdi_serie: serieFinal,
          cfdi_folio: folioFinal,
        })
        .eq('id', actualVentaId);
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
 * Formato estándar: 4+ dígitos con ceros iniciales (ej. A0000, A0001, etc.)
 */
router.get('/siguiente-folio', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const serieParam = String(req.query.serie || 'A').toUpperCase().trim();
    const lockKey = `${company}:${env}:${serieParam}`;

    const result = await folioMutex.runExclusive(lockKey, async () => {
      return await resolveConsecutiveFolio(supabaseClient, serieParam);
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error("Error al calcular siguiente folio:", error);
    return res.json({
      success: true,
      serie: 'A',
      folio: '0000',
      fullFolio: 'A0000',
      ultimoNumero: 0,
      siguienteNumero: 0
    });
  }
});

// ==============================================================================
// SECCIÓN: GESTIÓN DE BORRADORES Y CLIENTES PARA CFDI 4.0
// ==============================================================================

/**
 * GET /api/sat/clientes-search
 * Búsqueda reactiva de clientes por razón social, nombre o RFC.
 * Limita a 20 resultados con datos fiscales completos para CFDI 4.0.
 */
router.get('/clientes-search', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const q = String(req.query.q || '').trim();

    let query = supabaseClient
      .from('clientes')
      .select('id, nombre, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi');

    if (q) {
      query = query.or(`razon_social.ilike.%${q}%,nombre.ilike.%${q}%,rfc.ilike.%${q}%`);
    }

    const { data, error } = await query
      .order('nombre', { ascending: true })
      .limit(20);

    if (error) throw error;

    return res.json({
      success: true,
      clientes: data || []
    });
  } catch (err: any) {
    console.error("Error en búsqueda reactiva de clientes:", err);
    return res.status(500).json({ error: err.message || 'Error al buscar clientes' });
  }
});

/**
 * POST /api/sat/borrador
 * Crea un borrador de factura en ventas con cfdi_estado = 'BORRADOR'.
 * Reserva un folio incremental único de forma atómica bajo lock de serie/tenant.
 * Inserta las partidas asociadas en ventas_partidas.
 */
router.post('/borrador', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const body = req.body || {};
    const requestedSerie = String(body.serie || body.cfdi_serie || 'A').toUpperCase().trim();
    const lockKey = `${company}:${env}:${requestedSerie}`;

    const createdDraft = await folioMutex.runExclusive(lockKey, async () => {
      // 1. Resolver siguiente folio consecutivo seguro atómicamente dentro del mutex
      const { serie: serieFinal, folio: folioFinal, fullFolio } = await resolveConsecutiveFolio(
        supabaseClient,
        requestedSerie,
        body.folio || body.cfdi_folio
      );

      // 2. Extraer datos del receptor y configuración
      const receptor = body.receptor || {};
      const clienteNombre = String(
        body.cliente ||
        body.razon_social ||
        receptor.razon_social ||
        receptor.nombre ||
        'PUBLICO EN GENERAL'
      ).trim();

      const receptorRfc = String(
        receptor.rfc || body.cliente_rfc || body.rfc || 'XAXX010101000'
      ).trim().toUpperCase();

      const receptorCp = String(
        receptor.codigo_postal || body.cliente_cp || body.codigo_postal || process.env.EMISOR_CP || '31110'
      ).trim();

      const receptorRegimen = String(
        receptor.regimen_fiscal || body.cliente_regimen || body.regimen_fiscal || '616'
      ).trim();

      const receptorUso = String(
        receptor.uso_cfdi || body.cliente_uso || body.uso_cfdi || 'G03'
      ).trim();

      // 3. Procesar partidas
      const rawPartidas = Array.isArray(body.partidas) ? body.partidas : [];
      let subtotalCalculado = 0;

      const sanitizedPartidas = rawPartidas.map((p: any) => {
        const cant = Math.max(0.0001, parseFloat(p.cantidad) || 1);
        const precioUnit = parseFloat(p.precio_unitario_venta || p.precio_unitario || 0) || 0;
        const importe = cant * precioUnit;
        subtotalCalculado += importe;

        return {
          descripcion: String(p.descripcion || 'Concepto').trim(),
          cantidad: cant,
          precio_unitario_venta: precioUnit,
          precio_total_venta: importe,
          clave_sat: p.clave_sat || '01010101',
          clave_unidad: p.clave_unidad || 'H87',
          unidad: p.unidad || 'Pieza',
          objeto_imp: p.objeto_imp || '02'
        };
      });

      const totalFacturado = body.precio_total_facturado !== undefined
        ? parseFloat(body.precio_total_facturado) || 0
        : (body.total !== undefined
            ? parseFloat(body.total) || 0
            : subtotalCalculado * 1.16);

      const subtotalCalc = Math.round((totalFacturado / 1.16) * 100) / 100;
      const ivaCalc = Math.round((totalFacturado - subtotalCalc) * 100) / 100;

      const draftMetadata = {
        receptor: {
          nombre: receptor.nombre || clienteNombre,
          razon_social: receptor.razon_social || clienteNombre,
          rfc: receptorRfc,
          codigo_postal: receptorCp,
          regimen_fiscal: receptorRegimen,
          uso_cfdi: receptorUso
        },
        config: {
          serie: serieFinal,
          folio: folioFinal,
          forma_pago: body.forma_pago || '03',
          metodo_pago: body.metodo_pago || body.metodo_pago_cfdi || 'PUE',
          moneda: body.moneda || 'MXN',
          tipo_comprobante: body.tipo_comprobante || 'I',
          orden_compra: body.orden_compra || null
        },
        user_notas: body.notas || null
      };

      const facturaPayload: any = {
        serie: serieFinal,
        folio: folioFinal,
        cliente_nombre: clienteNombre,
        cliente_rfc: receptorRfc,
        cliente_cp: receptorCp,
        cliente_regimen: receptorRegimen,
        cliente_uso_cfdi: receptorUso,
        forma_pago: body.forma_pago || '03',
        metodo_pago: body.metodo_pago || body.metodo_pago_cfdi || 'PUE',
        moneda: body.moneda || 'MXN',
        subtotal: subtotalCalc,
        iva: ivaCalc,
        total: totalFacturado,
        total_pagado: 0,
        saldo_pendiente: totalFacturado,
        estado_pago: 'PENDIENTE DE PAGO',
        cfdi_estado: 'BORRADOR',
        orden_compra: body.orden_compra ? String(body.orden_compra).trim() : null,
        notas: draftMetadata,
        fecha_emision: body.fecha || new Date().toISOString()
      };

      const { data: createdFactura, error: insertErr } = await supabaseClient
        .from('facturas_emitidas')
        .insert(facturaPayload)
        .select()
        .single();

      if (insertErr) {
        throw new Error(`Error al insertar borrador en facturas_emitidas: ${insertErr.message}`);
      }

      const facturaId = createdFactura.id;
      let insertedPartidas: any[] = [];

      if (sanitizedPartidas.length > 0) {
        const partidasToInsert = sanitizedPartidas.map((p: any) => ({
          factura_id: facturaId,
          descripcion: p.descripcion,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario_venta,
          importe: p.precio_total_venta,
          clave_sat: p.clave_sat,
          clave_unidad: p.clave_unidad,
          unidad: p.unidad,
          objeto_imp: p.objeto_imp || '02'
        }));

        try {
          const { data: pData, error: pErr } = await supabaseClient
            .from('facturas_emitidas_partidas')
            .insert(partidasToInsert)
            .select();

          if (pErr) {
            console.warn("Aviso insertando partidas de borrador en facturas_emitidas_partidas:", pErr);
          } else {
            insertedPartidas = pData || partidasToInsert;
          }
        } catch (pEx) {
          console.warn("Excepción al insertar partidas:", pEx);
        }
      }

      try {
        invalidateCache('sat');
      } catch (_) {}

      return {
        ...createdFactura,
        id: facturaId,
        serie: serieFinal,
        folio: folioFinal,
        fullFolio,
        cliente: clienteNombre,
        receptor: draftMetadata.receptor,
        forma_pago: draftMetadata.config.forma_pago,
        metodo_pago: draftMetadata.config.metodo_pago,
        moneda: draftMetadata.config.moneda,
        tipo_comprobante: draftMetadata.config.tipo_comprobante,
        orden_compra: draftMetadata.config.orden_compra || '',
        precio_total_facturado: totalFacturado,
        cfdi_estado: 'BORRADOR',
        es_borrador: true,
        partidas: insertedPartidas.length > 0 ? insertedPartidas : sanitizedPartidas,
        notas: draftMetadata.user_notas
      };
    });

    return res.status(201).json({
      success: true,
      mensaje: 'Borrador creado exitosamente con reserva de folio',
      borrador: createdDraft
    });
  } catch (error: any) {
    console.error("Error al crear borrador:", error);
    return res.status(400).json({ error: error.message || 'Error al crear borrador' });
  }
});

/**
 * GET /api/sat/borrador/:id
 * Obtiene el borrador y sus partidas de facturas_emitidas (o fallback ventas) para poblar el editor.
 */
router.get('/borrador/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID de borrador requerido' });

    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Buscar primero en facturas_emitidas
    const { data: factura, error: factError } = await supabaseClient
      .from('facturas_emitidas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (factura) {
      const { data: partidas } = await supabaseClient
        .from('facturas_emitidas_partidas')
        .select('*')
        .eq('factura_id', id);

      let draftNotas: any = {};
      if (factura.notas && typeof factura.notas === 'object') {
        draftNotas = factura.notas;
      } else if (typeof factura.notas === 'string' && factura.notas.startsWith('{')) {
        try { draftNotas = JSON.parse(factura.notas); } catch (_) {}
      }

      const receptor = draftNotas.receptor || {
        nombre: factura.cliente_nombre || 'PUBLICO EN GENERAL',
        razon_social: factura.cliente_nombre || 'PUBLICO EN GENERAL',
        rfc: factura.cliente_rfc || 'XAXX010101000',
        codigo_postal: factura.cliente_cp || process.env.EMISOR_CP || '31110',
        regimen_fiscal: factura.cliente_regimen || '616',
        uso_cfdi: factura.cliente_uso_cfdi || 'G03'
      };

      const serie = factura.serie || 'A';
      const cleanFolioVal = cleanFolio(factura.folio);
      const fullFolio = `${serie}${cleanFolioVal}`;

      const formattedPartidas = (partidas || []).map((p: any) => ({
        id: p.id,
        descripcion: p.descripcion,
        cantidad: String(p.cantidad || 1),
        precio_unitario: String(p.precio_unitario || 0),
        unidad: p.unidad || 'Pieza',
        clave_sat: p.clave_sat || '01010101',
        clave_unidad: p.clave_unidad || 'H87',
        objeto_imp: p.objeto_imp || '02'
      }));

      return res.json({
        success: true,
        borrador: {
          id: factura.id,
          serie,
          folio: cleanFolioVal,
          fullFolio,
          cliente: factura.cliente_nombre,
          receptor,
          forma_pago: factura.forma_pago || '03',
          metodo_pago: factura.metodo_pago || 'PUE',
          moneda: factura.moneda || 'MXN',
          orden_compra: factura.orden_compra || '',
          notas: draftNotas.user_notas || '',
          precio_total_facturado: Number(factura.total || 0),
          cfdi_estado: factura.cfdi_estado,
          es_borrador: factura.cfdi_estado === 'BORRADOR',
          partidas: formattedPartidas,
          created_at: factura.created_at
        }
      });
    }

    // 2. Fallback a tabla legacy ventas
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('*')
      .eq('id', id)
      .single();

    if (ventaError || !venta) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const { data: partidas } = await supabaseClient
      .from('ventas_partidas')
      .select('*')
      .eq('venta_id', id);

    let receptor: any = null;
    let config: any = null;
    let userNotas = venta.notas || '';

    if (venta.notas && venta.notas.startsWith('{') && venta.notas.includes('receptor')) {
      try {
        const parsedMeta = JSON.parse(venta.notas);
        receptor = parsedMeta.receptor || null;
        config = parsedMeta.config || null;
        userNotas = parsedMeta.user_notas || '';
      } catch (_) {}
    }

    if (!receptor) {
      receptor = {
        nombre: venta.cliente || 'PUBLICO EN GENERAL',
        razon_social: venta.cliente || 'PUBLICO EN GENERAL',
        rfc: 'XAXX010101000',
        codigo_postal: process.env.EMISOR_CP || '31110',
        regimen_fiscal: '616',
        uso_cfdi: 'G03'
      };
    }

    const serie = config?.serie || venta.cfdi_serie || (venta.folio ? venta.folio.replace(/\d+$/, '') : 'A');
    const cleanFolioVal = cleanFolio(config?.folio || venta.cfdi_folio || venta.folio);
    const folio = cleanFolioVal.startsWith(serie) ? cleanFolioVal.slice(serie.length) : cleanFolioVal;
    const fullFolio = `${serie}${folio}`;

    const formattedPartidas = (partidas || []).map((p: any) => ({
      id: p.id,
      descripcion: p.descripcion,
      cantidad: String(p.cantidad || 1),
      precio_unitario: String(p.precio_unitario_venta || p.precio_unitario || 0),
      unidad: p.unidad || 'Pieza',
      clave_sat: p.clave_sat || '01010101',
      clave_unidad: p.clave_unidad || 'H87',
      objeto_imp: p.objeto_imp || '02'
    }));

    return res.json({
      success: true,
      borrador: {
        id: venta.id,
        serie,
        folio,
        fullFolio,
        cliente: venta.cliente,
        receptor,
        forma_pago: config?.forma_pago || '03',
        metodo_pago: config?.metodo_pago || 'PUE',
        moneda: config?.moneda || 'MXN',
        tipo_comprobante: config?.tipo_comprobante || 'I',
        orden_compra: venta.orden_compra || config?.orden_compra || '',
        notas: userNotas,
        precio_total_facturado: venta.precio_total_facturado,
        cfdi_estado: venta.cfdi_estado,
        es_borrador: venta.cfdi_estado === 'BORRADOR',
        partidas: formattedPartidas,
        created_at: venta.created_at
      }
    });
  } catch (err: any) {
    console.error("Error al obtener borrador:", err);
    return res.status(500).json({ error: err.message || 'Error al obtener borrador' });
  }
});

/**
 * PUT /api/sat/borrador/:id
 * Actualiza los datos de un borrador existente manteniendo estrictamente su folio reservado.
 */
router.put('/borrador/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID de borrador requerido' });

    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Buscar en facturas_emitidas
    const { data: facturaDB } = await supabaseClient
      .from('facturas_emitidas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const body = req.body || {};
    const receptor = body.receptor || {};
    const clienteNombre = String(
      body.cliente ||
      body.razon_social ||
      receptor.razon_social ||
      receptor.nombre ||
      facturaDB?.cliente_nombre ||
      'PUBLICO EN GENERAL'
    ).trim();

    const receptorRfc = String(
      receptor.rfc || body.cliente_rfc || body.rfc || 'XAXX010101000'
    ).trim().toUpperCase();

    const receptorCp = String(
      receptor.codigo_postal || body.cliente_cp || body.codigo_postal || process.env.EMISOR_CP || '31110'
    ).trim();

    const receptorRegimen = String(
      receptor.regimen_fiscal || body.cliente_regimen || body.regimen_fiscal || '616'
    ).trim();

    const receptorUso = String(
      receptor.uso_cfdi || body.cliente_uso || body.uso_cfdi || 'G03'
    ).trim();

    // Procesar partidas
    const rawPartidas = Array.isArray(body.partidas) ? body.partidas : [];
    let subtotalCalculado = 0;

    const sanitizedPartidas = rawPartidas.map((p: any) => {
      const cant = Math.max(0.0001, parseFloat(p.cantidad) || 1);
      const precioUnit = parseFloat(p.precio_unitario_venta || p.precio_unitario || 0) || 0;
      const importe = cant * precioUnit;
      subtotalCalculado += importe;

      return {
        descripcion: String(p.descripcion || 'Concepto').trim(),
        cantidad: cant,
        precio_unitario_venta: precioUnit,
        precio_total_venta: importe,
        clave_sat: p.clave_sat || '01010101',
        clave_unidad: p.clave_unidad || 'H87',
        unidad: p.unidad || 'Pieza',
        objeto_imp: p.objeto_imp || '02'
      };
    });

    const totalFacturado = body.precio_total_facturado !== undefined
      ? parseFloat(body.precio_total_facturado) || 0
      : (body.total !== undefined
          ? parseFloat(body.total) || 0
          : subtotalCalculado * 1.16);

    const subtotalCalc = Math.round((totalFacturado / 1.16) * 100) / 100;
    const ivaCalc = Math.round((totalFacturado - subtotalCalc) * 100) / 100;

    const serieFinal = facturaDB?.serie || 'A';
    const folioFinal = cleanFolio(facturaDB?.folio || '0000');
    const fullFolio = `${serieFinal}${folioFinal}`;

    const draftMetadata = {
      receptor: {
        nombre: receptor.nombre || clienteNombre,
        razon_social: receptor.razon_social || clienteNombre,
        rfc: receptorRfc,
        codigo_postal: receptorCp,
        regimen_fiscal: receptorRegimen,
        uso_cfdi: receptorUso
      },
      config: {
        serie: serieFinal,
        folio: folioFinal,
        forma_pago: body.forma_pago || '03',
        metodo_pago: body.metodo_pago || body.metodo_pago_cfdi || 'PUE',
        moneda: body.moneda || 'MXN',
        tipo_comprobante: body.tipo_comprobante || 'I',
        orden_compra: body.orden_compra || null
      },
      user_notas: body.notas !== undefined ? body.notas : null
    };

    if (facturaDB) {
      if (facturaDB.cfdi_estado !== 'BORRADOR') {
        return res.status(400).json({
          error: `Solo se pueden modificar comprobantes en estado BORRADOR. El comprobante actual está ${facturaDB.cfdi_estado}`
        });
      }

      await supabaseClient
        .from('facturas_emitidas')
        .update({
          cliente_nombre: clienteNombre,
          cliente_rfc: receptorRfc,
          cliente_cp: receptorCp,
          cliente_regimen: receptorRegimen,
          cliente_uso_cfdi: receptorUso,
          subtotal: subtotalCalc,
          iva: ivaCalc,
          total: totalFacturado,
          saldo_pendiente: totalFacturado,
          orden_compra: body.orden_compra ? String(body.orden_compra).trim() : null,
          notas: draftMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (Array.isArray(body.partidas)) {
        await supabaseClient.from('facturas_emitidas_partidas').delete().eq('factura_id', id);
        if (sanitizedPartidas.length > 0) {
          const partsToInsert = sanitizedPartidas.map((p: any) => ({
            factura_id: id,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario_venta,
            importe: p.precio_total_venta,
            clave_sat: p.clave_sat,
            clave_unidad: p.clave_unidad,
            unidad: p.unidad,
            objeto_imp: p.objeto_imp || '02'
          }));
          await supabaseClient.from('facturas_emitidas_partidas').insert(partsToInsert);
        }
      }
    } else {
      // Fallback update en tabla ventas legacy si no existe en facturas_emitidas
      await supabaseClient
        .from('ventas')
        .update({
          cliente: clienteNombre,
          precio_total_facturado: totalFacturado,
          orden_compra: body.orden_compra ? String(body.orden_compra).trim() : null,
          notas: JSON.stringify(draftMetadata),
          descripcion: body.descripcion || `Borrador ${fullFolio} - ${clienteNombre}`
        })
        .eq('id', id);
    }

    try {
      invalidateCache('sat');
      invalidateCache('ventas');
    } catch (_) {}

    return res.json({
      success: true,
      mensaje: 'Borrador actualizado exitosamente manteniendo su folio reservado',
      borrador: {
        id,
        serie: serieFinal,
        folio: folioFinal,
        fullFolio,
        cliente: clienteNombre,
        receptor: draftMetadata.receptor,
        forma_pago: draftMetadata.config.forma_pago,
        metodo_pago: draftMetadata.config.metodo_pago,
        moneda: draftMetadata.config.moneda,
        tipo_comprobante: draftMetadata.config.tipo_comprobante,
        orden_compra: draftMetadata.config.orden_compra || '',
        precio_total_facturado: totalFacturado,
        cfdi_estado: 'BORRADOR',
        es_borrador: true,
        partidas: sanitizedPartidas,
        notas: draftMetadata.user_notas
      }
    });
  } catch (err: any) {
    console.error("Error al actualizar borrador:", err);
    return res.status(400).json({ error: err.message || 'Error al actualizar borrador' });
  }
});

/**
 * DELETE /api/sat/borrador/:id
 * Elimina el borrador de facturas_emitidas (o ventas) únicamente si cfdi_estado === 'BORRADOR'.
 */
router.delete('/borrador/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID de borrador requerido' });

    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Intentar borrar en facturas_emitidas
    const { data: factDB } = await supabaseClient
      .from('facturas_emitidas')
      .select('id, cfdi_estado, folio')
      .eq('id', id)
      .maybeSingle();

    if (factDB) {
      if (factDB.cfdi_estado !== 'BORRADOR') {
        return res.status(400).json({
          error: `Solo se pueden eliminar comprobantes en estado BORRADOR. El comprobante actual está ${factDB.cfdi_estado}`
        });
      }

      await supabaseClient.from('facturas_emitidas_partidas').delete().eq('factura_id', id);
      await supabaseClient.from('facturas_emitidas').delete().eq('id', id);

      try {
        invalidateCache('sat');
      } catch (_) {}

      return res.json({
        success: true,
        mensaje: 'Borrador eliminado exitosamente de facturas_emitidas',
        id,
        folio: factDB.folio
      });
    }

    // 2. Fallback a ventas legacy
    const { data: venta } = await supabaseClient
      .from('ventas')
      .select('id, cfdi_estado, folio')
      .eq('id', id)
      .maybeSingle();

    if (!venta) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    if (venta.cfdi_estado !== 'BORRADOR') {
      return res.status(400).json({
        error: `Solo se pueden eliminar comprobantes en estado BORRADOR. El comprobante actual está ${venta.cfdi_estado}`
      });
    }

    await supabaseClient.from('ventas_partidas').delete().eq('venta_id', id);
    await supabaseClient.from('ventas').delete().eq('id', id);

    try {
      invalidateCache('ventas');
      invalidateCache('sat');
    } catch (_) {}

    return res.json({
      success: true,
      mensaje: 'Borrador eliminado exitosamente',
      id,
      folio: venta.folio
    });
  } catch (err: any) {
    console.error("Error al eliminar borrador:", err);
    return res.status(400).json({ error: err.message || 'Error al eliminar borrador' });
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
    if (!venta_id) throw new Error('Falta el ID del comprobante');

    const FINKOK_USERNAME = process.env.FINKOK_USERNAME || '';
    const FINKOK_PASSWORD = process.env.FINKOK_PASSWORD || '';
    const FINKOK_ENV = (req.body.finkok_env || process.env.FINKOK_ENV || 'production').toLowerCase();
    const isProduction = FINKOK_ENV === 'production';

    // 1. Buscar en facturas_emitidas
    const { data: factData } = await supabaseClient
      .from('facturas_emitidas')
      .select('id, cfdi_uuid, cfdi_estado, venta_id')
      .or(`id.eq.${venta_id},cfdi_uuid.eq.${venta_id}`)
      .maybeSingle();

    // 2. Fallback a ventas
    let targetUUID = factData?.cfdi_uuid;
    let targetEstado = factData?.cfdi_estado;
    let actualVentaId = factData?.venta_id;

    if (!targetUUID) {
      const { data: venta } = await supabaseClient
        .from('ventas')
        .select('id, cfdi_uuid, cfdi_estado')
        .eq('id', venta_id)
        .maybeSingle();
      if (venta) {
        targetUUID = venta.cfdi_uuid;
        targetEstado = venta.cfdi_estado;
        actualVentaId = venta.id;
      }
    }

    if (!targetUUID) {
      throw new Error('No se encontró el comprobante para cancelar');
    }
    if (targetEstado !== 'TIMBRADA') {
      throw new Error('El comprobante no se encuentra timbrado o ya fue cancelado');
    }

    const rfcEmisor = process.env.EMISOR_RFC || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');

    const cancelResult = await signCancelFinkok(
      targetUUID,
      rfcEmisor,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      motivo,
      folio_sustitucion,
      isProduction
    );

    // Actualizar en facturas_emitidas
    if (factData?.id) {
      await supabaseClient
        .from('facturas_emitidas')
        .update({ cfdi_estado: 'CANCELADA', updated_at: new Date().toISOString() })
        .eq('id', factData.id);
    } else {
      await supabaseClient
        .from('facturas_emitidas')
        .update({ cfdi_estado: 'CANCELADA', updated_at: new Date().toISOString() })
        .eq('cfdi_uuid', targetUUID);
    }

    // Actualizar en ventas si existe enlace
    if (actualVentaId) {
      await supabaseClient
        .from('ventas')
        .update({ cfdi_estado: 'CANCELADA' })
        .eq('id', actualVentaId);
    }

    try {
      invalidateCache('ventas');
      invalidateCache('sat');
    } catch (_) {}

    return res.json({
      success: true,
      mensaje: 'Factura cancelada exitosamente ante el SAT',
      estatus: cancelResult.estatus,
      uuid: targetUUID
    });
  } catch (error: any) {
    console.error("Error al cancelar factura:", error);
    return res.status(400).json({ error: error.message || 'Error al cancelar factura' });
  }
});

/**
 * GET /api/sat/facturas-emitidas
 * Obtiene el listado completo de facturas emitidas desde la tabla independiente facturas_emitidas
 * (con fallback a ventas legacy si aún no hay registros).
 */
router.get('/facturas-emitidas', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Consultar facturas_emitidas
    const { data: factsData, error: factsErr } = await supabaseClient
      .from('facturas_emitidas')
      .select('*')
      .order('created_at', { ascending: false });

    if (!factsErr && factsData && factsData.length > 0) {
      const facturas = factsData.map((f: any) => {
        const isBorrador = f.cfdi_estado === 'BORRADOR';
        const cleanFolioVal = cleanFolio(f.folio);
        const fullFolio = `${f.serie || 'A'}${cleanFolioVal}`;

        return {
          id: f.id,
          cliente: f.cliente_nombre,
          fecha: f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : '',
          folio: fullFolio,
          cfdi_folio: cleanFolioVal,
          cfdi_serie: f.serie || 'A',
          cfdi_uuid: f.cfdi_uuid,
          cfdi_estado: f.cfdi_estado || (isBorrador ? 'BORRADOR' : 'TIMBRADA'),
          es_borrador: isBorrador,
          cfdi_xml_url: f.cfdi_xml_url,
          cfdi_pdf_url: f.cfdi_pdf_url,
          precio_total_facturado: Number(f.total || 0),
          subtotal: Number(f.subtotal || 0),
          iva: Number(f.iva || 0),
          total_pagado: Number(f.total_pagado || 0),
          saldo_pendiente: Number(f.saldo_pendiente || 0),
          estado_pago: f.estado_pago,
          orden_compra: f.orden_compra,
          venta_id: f.venta_id,
          created_at: f.created_at,
          origen: isBorrador ? 'BORRADOR' : (f.venta_id ? 'VENTA' : 'FACTURA_DIRECTA'),
          origenLabel: isBorrador ? `Borrador ${cleanFolioVal}` : (f.venta_id ? 'Venta vinculada' : 'Factura Directa')
        };
      });

      return res.json({ success: true, facturas });
    }

    // 2. Fallback a ventas legacy
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
      .or('cfdi_estado.eq.TIMBRADA,cfdi_estado.eq.CANCELADA,cfdi_estado.eq.BORRADOR')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const facturas = (data || []).map((f: any) => {
      const isDirecta = f.tipo_proyecto === 'Factura Directa';
      const isBorrador = String(f.cfdi_estado || '').toUpperCase() === 'BORRADOR';
      let origen = 'FACTURA_DIRECTA';
      let origenLabel = 'Factura Directa';

      const cleanFolioVal = cleanFolio(f.folio);

      if (isBorrador) {
        origen = 'BORRADOR';
        origenLabel = `Borrador ${cleanFolioVal || f.folio}`;
      } else if (!isDirecta) {
        origen = 'VENTA';
        const numRef = cleanFolioVal || f.factura_referencia || f.cotizaciones?.folio || `#${f.id}`;
        origenLabel = `Venta ${numRef}`;
      }

      return {
        ...f,
        folio: cleanFolioVal || f.folio,
        es_borrador: isBorrador,
        cfdi_estado: f.cfdi_estado || (isBorrador ? 'BORRADOR' : 'PENDIENTE'),
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
 * Obtiene el contenido del XML timbrado de una factura, buscando por UUID, URL o ID
 * en facturas_emitidas (o fallback ventas).
 */
router.get('/factura-xml/:identificador', async (req: Request, res: Response) => {
  try {
    const { identificador } = req.params;
    if (!identificador) return res.status(400).json({ error: 'Identificador requerido' });

    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    // 1. Buscar en facturas_emitidas
    const { data: factura } = await supabaseClient
      .from('facturas_emitidas')
      .select('id, cfdi_uuid, cfdi_xml_url')
      .or(`cfdi_uuid.eq.${identificador},id.eq.${identificador}`)
      .maybeSingle();

    // 2. Si no, buscar en ventas
    let uuid = factura?.cfdi_uuid;
    let xmlUrl = factura?.cfdi_xml_url;

    if (!uuid) {
      const { data: venta } = await supabaseClient
        .from('ventas')
        .select('id, cfdi_uuid, cfdi_xml_url')
        .or(`cfdi_uuid.eq.${identificador},id.eq.${identificador}`)
        .maybeSingle();
      uuid = venta?.cfdi_uuid || identificador;
      xmlUrl = venta?.cfdi_xml_url;
    }

    // 3. Si tiene URL pública de storage, intentar fetch directo
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

    // 4. Descargar desde storage probando variaciones de nombre
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
 * Busca y lista todas las facturas emitidas (timbradas) de un cliente que tienen saldo pendiente
 * en facturas_emitidas (con fallback a ventas legacy).
 */
router.get('/facturas-pendientes-cliente', async (req: Request, res: Response) => {
  try {
    const company = (req as any).tenant?.company || 'inttec';
    const env = (req as any).tenant?.env || 'cloud';
    const supabaseClient = getSupabaseClient(company, env);

    const { cliente_id, cliente_nombre, cliente_rfc } = req.query;

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

    // 1. Intentar consultar en facturas_emitidas
    let facturasEmitidasQuery = supabaseClient
      .from('facturas_emitidas')
      .select('*')
      .eq('cfdi_estado', 'TIMBRADA')
      .not('cfdi_uuid', 'is', null);

    if (resolvedNames.length > 0) {
      const orClauses = resolvedNames.map(n => `cliente_nombre.ilike.%${n}%`).join(',');
      facturasEmitidasQuery = facturasEmitidasQuery.or(orClauses);
    } else if (cliente_rfc) {
      facturasEmitidasQuery = facturasEmitidasQuery.ilike('cliente_rfc', String(cliente_rfc).trim());
    }

    const { data: factsData, error: factsErr } = await facturasEmitidasQuery.order('created_at', { ascending: false });

    if (!factsErr && factsData && factsData.length > 0) {
      const factIds = factsData.map((f: any) => f.id);
      const factUuids = factsData.map((f: any) => f.cfdi_uuid).filter(Boolean);
      let doctosPorFactura: Record<string, any[]> = {};
      try {
        const { data: compDocs } = await supabaseClient
          .from('complementos_pago_doctos')
          .select('factura_id, uuid_documento, importe_pagado')
          .or(`factura_id.in.(${factIds.join(',')}),uuid_documento.in.(${factUuids.join(',')})`);
        (compDocs || []).forEach((cd: any) => {
          if (cd.factura_id) {
            if (!doctosPorFactura[cd.factura_id]) doctosPorFactura[cd.factura_id] = [];
            doctosPorFactura[cd.factura_id].push(cd);
          }
          if (cd.uuid_documento) {
            if (!doctosPorFactura[cd.uuid_documento]) doctosPorFactura[cd.uuid_documento] = [];
            doctosPorFactura[cd.uuid_documento].push(cd);
          }
        });
      } catch (_) {}

      const pendientes = factsData.map((f: any) => {
        const total = Number(f.total || 0);
        const docsPrev = doctosPorFactura[f.id] || (f.cfdi_uuid ? doctosPorFactura[f.cfdi_uuid] : []) || [];
        const pagadoFromDocs = docsPrev.reduce((acc: number, p: any) => acc + (Number(p.importe_pagado) || 0), 0);
        const pagado = f.total_pagado !== undefined && Number(f.total_pagado) > 0 ? Number(f.total_pagado) : pagadoFromDocs;
        const saldo = f.saldo_pendiente !== undefined && f.saldo_pendiente !== null ? Number(f.saldo_pendiente) : Math.max(0, Math.round((total - pagado) * 100) / 100);
        const cleanFolioVal = cleanFolio(f.folio) || String(f.id);

        return {
          id: f.id,
          folio: cleanFolioVal,
          serie: (f.serie || 'A').toUpperCase().trim(),
          fullFolio: `${(f.serie || 'A').toUpperCase().trim()}${cleanFolioVal}`,
          cfdi_uuid: f.cfdi_uuid,
          cliente: f.cliente_nombre,
          cliente_rfc: f.cliente_rfc || null,
          fecha: f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : '',
          precio_total: total,
          total_pagado: pagado,
          saldo_pendiente: saldo,
          num_parcialidad_siguiente: docsPrev.length + 1,
          metodo_pago: f.metodo_pago || 'PPD'
        };
      }).filter((f: any) => f.saldo_pendiente > 0.05);

      if (pendientes.length > 0) {
        return res.json({ success: true, facturas: pendientes });
      }
    }

    // 2. Fallback a ventas legacy
    let query = supabaseClient
      .from('ventas')
      .select('id, folio, cfdi_folio, cfdi_serie, cfdi_uuid, cfdi_estado, cliente, precio_total_facturado, total_pagado, saldo_pendiente, estado_pago, fecha, created_at')
      .not('cfdi_uuid', 'is', null)
      .neq('cfdi_estado', 'CANCELADA');

    if (resolvedNames.length > 0) {
      const orClauses = resolvedNames.map(n => `cliente.ilike.%${n}%`).join(',');
      query = query.or(orClauses);
    }

    const { data: facturas, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

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
    }).filter(f => f.saldo_pendiente > 0.05);

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
      const docId = item.factura_id || item.venta_id || item.id;
      const cleanDocId = docId ? (typeof docId === 'number' ? docId : String(docId).trim()) : null;
      if (!cleanDocId) continue;

      let cfdiUuid = '';
      let serieFactura = 'A';
      let cleanFolioVal = '';
      let fechaDoc = '';
      let totalDoc = 0;
      let pagadoPrevio = 0;
      let numParcialidad = 1;
      let facturaId: string | null = null;
      let ventaId: any = null;

      // 1.1 Intentar buscar en facturas_emitidas
      const { data: fData } = await supabaseClient
        .from('facturas_emitidas')
        .select('*')
        .eq('id', cleanDocId)
        .maybeSingle();

      if (fData) {
        facturaId = fData.id;
        ventaId = fData.venta_id || null;
        cfdiUuid = fData.cfdi_uuid;
        serieFactura = (fData.serie || 'A').toUpperCase().trim();
        cleanFolioVal = cleanFolio(fData.folio) || String(fData.id);
        fechaDoc = fData.fecha_emision ? String(fData.fecha_emision).slice(0, 10) : '';
        totalDoc = Number(fData.total || 0);

        if (!cfdiUuid) {
          throw new Error(`La factura #${serieFactura}${cleanFolioVal} no tiene un UUID fiscal registrado.`);
        }

        // Historial de abonos previos en complementos_pago_doctos
        let compDocs: any[] = [];
        try {
          const { data: cd } = await supabaseClient
            .from('complementos_pago_doctos')
            .select('importe_pagado, num_parcialidad')
            .or(`factura_id.eq.${facturaId},uuid_documento.eq.${cfdiUuid}`);
          compDocs = cd || [];
        } catch (_) {}

        pagadoPrevio = compDocs.reduce((acc: number, p: any) => acc + (Number(p.importe_pagado) || 0), 0);
        if (pagadoPrevio === 0 && fData.total_pagado) {
          pagadoPrevio = Number(fData.total_pagado || 0);
        }
        numParcialidad = compDocs.length + 1;
      } else {
        // 1.2 Fallback a ventas legacy
        const { data: vData, error: vErr } = await supabaseClient
          .from('ventas')
          .select('*')
          .eq('id', cleanDocId)
          .single();

        if (vErr || !vData) {
          throw new Error(`No se encontró la factura/venta con ID ${cleanDocId}`);
        }

        if (!vData.cfdi_uuid) {
          throw new Error(`La venta #${vData.folio || cleanDocId} no tiene un UUID fiscal registrado (no ha sido timbrada como factura).`);
        }

        ventaId = vData.id;
        cfdiUuid = vData.cfdi_uuid;
        serieFactura = (vData.cfdi_serie || 'A').toUpperCase().trim();
        cleanFolioVal = cleanFolio(vData.cfdi_folio || vData.folio) || String(cleanDocId);
        fechaDoc = vData.fecha ? String(vData.fecha).slice(0, 10) : '';
        totalDoc = Number(vData.precio_total_facturado || vData.precio_total_venta || 0);

        const { data: pagosPrevios } = await supabaseClient
          .from('ventas_pagos')
          .select('monto')
          .eq('venta_id', ventaId);

        pagadoPrevio = (pagosPrevios || []).reduce((acc: number, p: any) => acc + (Number(p.monto) || 0), 0);
        numParcialidad = (pagosPrevios || []).length + 1;
      }

      const saldoAnterior = Math.max(0, Math.round((totalDoc - pagadoPrevio) * 100) / 100);
      const importeAbono = Math.min(Number(item.importe_a_pagar || 0), saldoAnterior);
      if (importeAbono <= 0) continue;

      const saldoInsoluto = Math.max(0, Math.round((saldoAnterior - importeAbono) * 100) / 100);

      const baseDR = Number((importeAbono / 1.16).toFixed(2));
      const ivaDR = Number((importeAbono - baseDR).toFixed(2));

      montoTotalPagos += importeAbono;

      doctosRelacionados.push({
        uuid: cfdiUuid,
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
        factura_id: facturaId,
        venta_id: ventaId,
        uuid_documento: cfdiUuid,
        serie: serieFactura,
        folio: cleanFolioVal,
        fecha: fechaDoc,
        moneda_dr: 'MXN',
        num_parcialidad: numParcialidad,
        pagado_previo: pagadoPrevio,
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
          complemento_pago_id: complementoCreado.id,
          factura_id: d.factura_id || null,
          venta_id: d.venta_id || null,
          uuid_documento: d.uuid_documento,
          serie: d.serie,
          folio: d.folio,
          fecha: d.fecha ? `${d.fecha}T12:00:00Z` : new Date().toISOString(),
          moneda_dr: d.moneda_dr || 'MXN',
          num_parcialidad: d.num_parcialidad,
          saldo_anterior: d.saldo_anterior,
          importe_pagado: d.importe_pagado,
          saldo_insoluto: d.saldo_insoluto,
          objeto_imp_dr: d.objeto_imp_dr || '02',
          base_iva: d.base_iva,
          importe_iva: d.importe_iva
        }));
        await supabaseClient.from('complementos_pago_doctos').insert(doctosToInsert);
      } catch (dErr) {
        console.warn("Aviso insertando en complementos_pago_doctos:", dErr);
      }
    }

    // 8. Actualizar facturas_emitidas y/o ventas_pagos según corresponda
    for (const d of doctosDetallesParaGuardar) {
      // 8.1 Si corresponde a facturas_emitidas, actualizar su total pagado y saldo pendiente
      if (d.factura_id) {
        try {
          const nuevoSaldo = d.saldo_insoluto;
          const nuevoTotalPagado = Number(((d.pagado_previo || 0) + d.importe_pagado).toFixed(2));
          const estadoPago = nuevoSaldo <= 0.01 ? 'PAGADA' : 'PARCIAL';

          await supabaseClient
            .from('facturas_emitidas')
            .update({
              total_pagado: nuevoTotalPagado,
              saldo_pendiente: nuevoSaldo,
              estado_pago: estadoPago,
              updated_at: new Date().toISOString()
            })
            .eq('id', d.factura_id);
        } catch (fErr) {
          console.warn(`Aviso actualizando saldo en facturas_emitidas para factura ${d.factura_id}:`, fErr);
        }
      }

      // 8.2 Si está vinculada a una venta en el módulo comercial, sincronizar el pago interno
      if (d.venta_id) {
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

    // Actualizar estado en complementos_pago y revertir saldos de documentos afectados
    let compId = complemento_id || compRecord?.id;
    if (!compId && targetUuid) {
      try {
        const { data: cFound } = await supabaseClient
          .from('complementos_pago')
          .select('id')
          .eq('cfdi_uuid', targetUuid)
          .maybeSingle();
        compId = cFound?.id;
      } catch (_) {}
    }

    if (compId) {
      try {
        await supabaseClient.from('complementos_pago').update({ cfdi_estado: 'CANCELADA' }).eq('id', compId);

        // Obtener doctos para restaurar saldos
        const { data: compDocs } = await supabaseClient
          .from('complementos_pago_doctos')
          .select('*')
          .eq('complemento_pago_id', compId);

        for (const d of compDocs || []) {
          if (d.factura_id) {
            const { data: f } = await supabaseClient.from('facturas_emitidas').select('total, total_pagado').eq('id', d.factura_id).maybeSingle();
            if (f) {
              const nuevoPagado = Math.max(0, Number((Number(f.total_pagado || 0) - Number(d.importe_pagado || 0)).toFixed(2)));
              const nuevoSaldo = Math.max(0, Number((Number(f.total || 0) - nuevoPagado).toFixed(2)));
              const nuevoEstado = nuevoPagado <= 0.01 ? 'PENDIENTE DE PAGO' : 'PARCIAL';
              await supabaseClient.from('facturas_emitidas').update({
                total_pagado: nuevoPagado,
                saldo_pendiente: nuevoSaldo,
                estado_pago: nuevoEstado,
                updated_at: new Date().toISOString()
              }).eq('id', d.factura_id);
            }
          }

          if (d.venta_id) {
            await supabaseClient.from('ventas_pagos').delete().eq('complemento_pago_id', compId);
            await syncVentaPagoInterno(supabaseClient, d.venta_id);
          }
        }
      } catch (errRev) {
        console.warn("Aviso revirtiendo saldos al cancelar complemento:", errRev);
      }
    } else if (targetUuid) {
      try {
        await supabaseClient.from('complementos_pago').update({ cfdi_estado: 'CANCELADA' }).eq('cfdi_uuid', targetUuid);
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

