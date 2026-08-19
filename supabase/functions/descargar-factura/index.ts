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
    const url = new URL(req.url)
    const uuid = url.searchParams.get('uuid') || url.searchParams.get('id')
    const format = (url.searchParams.get('format') || 'xml').toLowerCase()

    if (!uuid) {
      throw new Error('Falta parámetro: uuid')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Descargar XML desde el bucket facturas
    const fileName = uuid.endsWith('.xml') ? uuid : `${uuid}.xml`
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('facturas')
      .download(fileName)

    if (downloadError || !fileData) {
      throw new Error(`No se encontró el archivo XML para el folio fiscal ${uuid}`)
    }

    const xmlText = await fileData.text()

    if (format === 'text' || format === 'xml') {
      const customFilename = url.searchParams.get('filename') || `Factura_${uuid}.xml`
      return new Response(xmlText, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="${customFilename}"`
        },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ success: true, uuid, xml: xmlText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Edge Function descargar-factura Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
