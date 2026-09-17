import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase';
import { buildUnsignedCFDI } from './finkok/xmlBuilder';
import { signStampFinkok, signCancelFinkok } from './finkok/soapClient';

const router = Router();

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

    if (resolvedVentaId) {
      const { data: ventaDB, error: ventaError } = await supabaseClient
        .from('ventas')
        .select('*')
        .eq('id', resolvedVentaId)
        .single();

      if (ventaError || !ventaDB) throw new Error('Venta no encontrada');
      if (ventaDB.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada');

      venta = { ...ventaDB, ...effectiveCondiciones };

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

      const serieFinal = effectiveCondiciones.serie || 'F';
      const folioFinal = effectiveCondiciones.folio || String(Date.now()).slice(-5);
      const formaPagoFinal = effectiveCondiciones.forma_pago || '03';
      const metodoPagoFinal = effectiveCondiciones.metodo_pago_cfdi || 'PUE';
      const ordenCompraFinal = effectiveCondiciones.orden_compra || null;

      const { data: createdVenta, error: createVentaError } = await supabaseClient
        .from('ventas')
        .insert({
          cliente: cliente.razon_social || cliente.nombre || 'PUBLICO EN GENERAL',
          fecha: new Date().toISOString().split('T')[0],
          folio: `${serieFinal}${folioFinal}`,
          precio_total_facturado: totalCalculado,
          estado_pago: 'PAGADO',
          cfdi_estado: 'PENDIENTE',
          orden_compra: ordenCompraFinal,
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
      await supabaseClient
        .from('ventas')
        .update({
          cfdi_uuid: sat_uuid,
          cfdi_estado: 'TIMBRADA',
          cfdi_xml_url: xmlUrl || xmlFileName
        })
        .eq('id', resolvedVentaId);
    }

    return res.json({
      success: true,
      cfdi_uuid: sat_uuid,
      xml_url: xmlUrl,
      xml: xmlTimbrado,
      venta_id: resolvedVentaId
    });

  } catch (error: any) {
    console.error("Error al timbrar factura:", error);
    return res.status(400).json({ error: error.message || 'Error al timbrar factura' });
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

export default router;
