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
    const { venta_id, custom_receptor, custom_condiciones, custom_partidas } = body
    if (!venta_id) throw new Error('venta_id es requerido')

    // 1. Obtener la venta
    const { data: ventaDB, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('*')
      .eq('id', venta_id)
      .single()

    if (ventaError || !ventaDB) throw new Error('Venta no encontrada')
    if (ventaDB.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada')

    let venta = { ...ventaDB, ...(custom_condiciones || {}) }

    // 2. Obtener cliente (o usar custom_receptor)
    let cliente = null;
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
      // Fallback a "Público en General"
      cliente = {
        nombre: venta.cliente || 'Público en General',
        razon_social: 'PUBLICO EN GENERAL',
        rfc: 'XAXX010101000',
        regimen_fiscal: '616',
        uso_cfdi: 'S01',
        codigo_postal: Deno.env.get('EMISOR_CP') || '77500'
      }
    }

    if (custom_receptor) {
      cliente = { ...cliente, ...custom_receptor };
    }

    // 3. Obtener partidas (o usar custom_partidas editadas en la UI)
    let partidas = [];
    if (custom_partidas && Array.isArray(custom_partidas) && custom_partidas.length > 0) {
      partidas = custom_partidas;
    } else {
      const { data: partidasDB, error: partidasError } = await supabaseClient
        .from('ventas_partidas')
        .select('*')
        .eq('venta_id', venta_id)

      if (partidasError || !partidasDB || partidasDB.length === 0) {
        throw new Error('La venta no tiene partidas o productos para facturar')
      }
      partidas = partidasDB;
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
    const { error: updateError } = await supabaseClient
      .from('ventas')
      .update({
        cfdi_uuid: sat_uuid,
        cfdi_estado: 'TIMBRADA',
        cfdi_xml_url: xmlUrl || xmlFileName
      })
      .eq('id', venta_id)

    if (updateError) {
      console.error("Error al actualizar estado en DB:", updateError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      cfdi_uuid: sat_uuid,
      xml_url: xmlUrl,
      xml: xmlTimbrado
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
