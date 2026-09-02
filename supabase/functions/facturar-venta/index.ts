// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Leer payload
    const body = await req.json()
    const { 
      venta_id, 
      custom_receptor, 
      cliente_override, 
      custom_condiciones, 
      cfdi_config, 
      custom_partidas 
    } = body

    let resolvedVentaId = venta_id ? parseInt(venta_id, 10) : null;
    let venta = null;
    let cliente = null;
    let partidas = [];

    const effectiveReceptor = cliente_override || custom_receptor || null;
    const effectiveCondiciones = { ...(custom_condiciones || {}), ...(cfdi_config || {}) };

    if (resolvedVentaId) {
      // 1. Obtener venta existente
      const { data: ventaDB, error: ventaError } = await supabaseClient
        .from('ventas')
        .select('*')
        .eq('id', resolvedVentaId)
        .single()

      if (ventaError || !ventaDB) throw new Error('Venta no encontrada')
      if (ventaDB.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada')

      venta = { ...ventaDB, ...effectiveCondiciones }

      // 2. Obtener cliente (o usar receptor personalizado)
      if (venta.cliente) {
        const { data: clienteData } = await supabaseClient
          .from('clientes')
          .select('*')
          .ilike('nombre', venta.cliente.trim())
          .maybeSingle()

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
          codigo_postal: Deno.env.get('EMISOR_CP') || '77500'
        }
      }

      if (effectiveReceptor) {
        cliente = { ...cliente, ...effectiveReceptor };
      }

      // 3. Obtener partidas
      if (custom_partidas && Array.isArray(custom_partidas) && custom_partidas.length > 0) {
        partidas = custom_partidas;
      } else {
        const { data: partidasDB, error: partidasError } = await supabaseClient
          .from('ventas_partidas')
          .select('*')
          .eq('venta_id', resolvedVentaId)

        if (partidasError || !partidasDB || partidasDB.length === 0) {
          throw new Error('La venta no tiene partidas o productos para facturar')
        }
        partidas = partidasDB;
      }
    } else {
      // CASO: Factura directa sin venta previa (Módulo de Facturación)
      if (!effectiveReceptor) {
        throw new Error('Los datos fiscales del cliente son obligatorios para facturar directamente')
      }

      cliente = {
        nombre: effectiveReceptor.nombre || effectiveReceptor.razon_social || 'PUBLICO EN GENERAL',
        razon_social: effectiveReceptor.razon_social || effectiveReceptor.nombre || 'PUBLICO EN GENERAL',
        rfc: (effectiveReceptor.rfc || 'XAXX010101000').toUpperCase().trim(),
        regimen_fiscal: effectiveReceptor.regimen_fiscal || '616',
        uso_cfdi: effectiveReceptor.uso_cfdi || 'G03',
        codigo_postal: effectiveReceptor.codigo_postal || Deno.env.get('EMISOR_CP') || '77500',
        ...effectiveReceptor
      };

      if (!custom_partidas || !Array.isArray(custom_partidas) || custom_partidas.length === 0) {
        throw new Error('Debes incluir al menos una partida para generar la factura')
      }
      partidas = custom_partidas;

      // Calcular subtotales
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

      // Crear venta en base de datos para guardar el registro de la factura
      const { data: createdVenta, error: createVentaError } = await supabaseClient
        .from('ventas')
        .insert({
          cliente: cliente.razon_social || cliente.nombre || 'PUBLICO EN GENERAL',
          fecha: new Date().toISOString().split('T')[0],
          folio: `${serieFinal}${folioFinal}`,
          cfdi_serie: serieFinal,
          cfdi_folio: folioFinal,
          forma_pago: formaPagoFinal,
          metodo_pago: formaPagoFinal,
          metodo_pago_cfdi: metodoPagoFinal,
          precio_total_facturado: totalCalculado,
          estado_pago: 'PAGADO',
          cfdi_estado: 'PENDIENTE',
        })
        .select()
        .single();

      if (createVentaError) {
        console.error("Error al registrar venta para la factura:", createVentaError);
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

    // Configurar Finkok
    const FINKOK_USERNAME = Deno.env.get('FINKOK_USERNAME')
    const FINKOK_PASSWORD = Deno.env.get('FINKOK_PASSWORD')
    const FINKOK_ENV = (Deno.env.get('FINKOK_ENV') || 'sandbox').toLowerCase()
    const isProduction = FINKOK_ENV === 'production';

    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      throw new Error('Credenciales de Finkok no configuradas en el entorno (FINKOK_USERNAME / FINKOK_PASSWORD)')
    }

    // Importar módulos de Finkok
    const { buildUnsignedCFDI } = await import('./finkok/xmlBuilder.ts')
    const { signStampFinkok } = await import('./finkok/soapClient.ts')

    // 4. Construir el XML del CFDI 4.0 sin sellar
    const xmlSinSellar = await buildUnsignedCFDI(venta, cliente, partidas, isProduction);

    // 5. Solicitar sellado y timbrado a Finkok (SOAP sign_stamp)
    const { success, uuid: sat_uuid, xml: xmlTimbrado } = await signStampFinkok(
      xmlSinSellar,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      isProduction
    );

    if (!success || !sat_uuid) {
      throw new Error('Finkok no devolvió un UUID fiscal válido');
    }

    // 6. Subir el XML timbrado a Supabase Storage
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

      if (storageError) {
        console.error("Aviso: Error al subir XML a storage:", storageError);
      } else {
        const { data: publicUrlData } = supabaseClient.storage.from('facturas').getPublicUrl(xmlFileName);
        xmlUrl = publicUrlData?.publicUrl || '';
      }
    } catch (sErr) {
      console.error("Excepción en Storage:", sErr);
    }

    // 7. Actualizar Venta en base de datos
    if (resolvedVentaId) {
      const { error: updateError } = await supabaseClient
        .from('ventas')
        .update({
          cfdi_uuid: sat_uuid,
          cfdi_estado: 'TIMBRADA',
          cfdi_xml_url: xmlUrl || xmlFileName
        })
        .eq('id', resolvedVentaId)

      if (updateError) {
        console.error("Error al actualizar estado en DB:", updateError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      cfdi_uuid: sat_uuid,
      xml_url: xmlUrl,
      xml: xmlTimbrado,
      venta_id: resolvedVentaId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Edge Function facturar-venta Error:", error)
    return new Response(JSON.stringify({ error: error.message || 'Error al timbrar factura' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
