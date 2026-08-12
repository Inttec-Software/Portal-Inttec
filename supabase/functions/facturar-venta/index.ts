// @ts-nocheck
// Silenciamos los errores de TypeScript aquí porque este archivo se ejecuta en Deno (Edge Functions de Supabase)
// y tu editor (VS Code) probablemente está configurado para React Native (Node.js), lo que marca 'Deno' o las URLs como error.

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
    // Usamos el cliente normal con la anon key.
    // (Nota: Como la app usa autenticación personalizada con rpc('login_usuario'), 
    // no podemos usar supabaseClient.auth.getUser() ya que no hay un JWT nativo de Supabase).
    // Usamos el Service Role Key para tener permisos completos en la DB (ignora RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Leer payload
    const { venta_id } = await req.json()
    if (!venta_id) throw new Error('venta_id es requerido')

    // 1. Obtener la venta
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('*')
      .eq('id', venta_id)
      .single()

    if (ventaError || !venta) throw new Error('Venta no encontrada')
    if (venta.cfdi_estado === 'TIMBRADA') throw new Error('La venta ya se encuentra timbrada')

    // 2. Obtener cliente (ignorando mayúsculas/minúsculas y espacios extras)
    let cliente = null;
    const { data: clienteData } = await supabaseClient
      .from('clientes')
      .select('*')
      .ilike('nombre', venta.cliente.trim())
      .maybeSingle()

    if (clienteData) {
      cliente = clienteData;
    } else {
      // Si el cliente no existe en el catálogo, hacemos un fallback a "Público en General"
      cliente = {
        nombre: venta.cliente,
        razon_social: 'PUBLICO EN GENERAL',
        rfc: 'XAXX010101000',
        regimen_fiscal: '616', // Sin obligaciones fiscales
        uso_cfdi: 'S01', // Sin efectos fiscales
        codigo_postal: '77500' // IMPORTANTE: Para RFC genérico en CFDI 4.0, el CP debe ser el mismo que el del emisor (tu empresa). Pondré uno por defecto, pero cámbialo al tuyo.
      }
    }

    // 3. Obtener partidas
    const { data: partidas, error: partidasError } = await supabaseClient
      .from('ventas_partidas')
      .select('*')
      .eq('venta_id', venta_id)

    if (partidasError || !partidas || partidas.length === 0) {
      throw new Error('La venta no tiene partidas o productos')
    }

    // Configurar Finkok
    const FINKOK_USERNAME = Deno.env.get('FINKOK_USERNAME')
    const FINKOK_PASSWORD = Deno.env.get('FINKOK_PASSWORD')
    const FINKOK_ENV = Deno.env.get('FINKOK_ENV') || 'sandbox' // 'sandbox' o 'production'
    const isProduction = FINKOK_ENV === 'production';

    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      throw new Error('Credenciales de Finkok no configuradas en el entorno')
    }

    // Importar dependencias de Finkok
    // Nota: Necesitamos usar importaciones relativas o absolutas dinámicas en Deno.
    // Usaremos un hack local si el import de arriba fallara, pero Deno maneja imports locales bien.
    const { buildUnsignedCFDI } = await import('./finkok/xmlBuilder.ts')
    const { signStampFinkok } = await import('./finkok/soapClient.ts')

    // 4. Construir el XML del CFDI 4.0 sin sellar
    // Al usar el método sign_stamp, Finkok utilizará el CSD subido a su portal para sellar y timbrar.
    const xmlSinSellar = await buildUnsignedCFDI(venta, cliente, partidas);

    // 5. Solicitar sellado y timbrado a Finkok (SOAP sign_stamp)
    const { success, uuid: sat_uuid, xml: xmlTimbrado } = await signStampFinkok(xmlSinSellar, FINKOK_USERNAME, FINKOK_PASSWORD, isProduction);

    if (!success || !sat_uuid) {
      throw new Error('Finkok no devolvió un UUID válido');
    }

    // 6. Subir el XML timbrado a Supabase Storage
    const xmlFileName = `${sat_uuid}.xml`;
    const { data: storageData, error: storageError } = await supabaseClient
      .storage
      .from('facturas')
      .upload(xmlFileName, xmlTimbrado, {
        contentType: 'text/xml',
        upsert: true
      });

    if (storageError) {
      console.error("Error al guardar XML en storage:", storageError);
      // No lanzamos error para no perder la factura que ya se timbró (costó un timbre),
      // pero se registra el error.
    }

    const { data: publicUrlData } = supabaseClient.storage.from('facturas').getPublicUrl(xmlFileName);
    const xmlUrl = publicUrlData?.publicUrl || '';

    // 7. Actualizar Venta en base de datos
    await supabaseClient
      .from('ventas')
      .update({
        cfdi_uuid: sat_uuid,
        cfdi_estado: 'TIMBRADA'
        // cfdi_facturapi_id ya no aplica para Finkok, usaríamos otra columna si fuera necesario
      })
      .eq('id', venta_id)

    // Respondemos con el UUID y la URL del XML. 
    // Nota: Con Finkok, el PDF debe generarse a partir del XML en el frontend o mediante otra función.
    return new Response(JSON.stringify({ 
      success: true, 
      cfdi_uuid: sat_uuid,
      xml_url: xmlUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("Edge Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
