// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

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
    const id = url.searchParams.get('id')
    const format = url.searchParams.get('format') // 'pdf' o 'xml'

    if (!id || !format) {
      throw new Error('Faltan parámetros: id o format')
    }

    if (format !== 'pdf' && format !== 'xml' && format !== 'zip' && format !== 'json') {
      throw new Error('Formato inválido. Debe ser pdf, xml, zip o json.')
    }

    const FACTURAPI_KEY = Deno.env.get('FACTURAPI_KEY')
    if (!FACTURAPI_KEY) throw new Error('FACTURAPI_KEY no configurado en entorno')

    // Solicitar archivo o datos a Facturapi
    const facturapiEndpoint = format === 'json' 
      ? `https://www.facturapi.io/v2/invoices/${id}`
      : `https://www.facturapi.io/v2/invoices/${id}/${format}`

    const fileResponse = await fetch(facturapiEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FACTURAPI_KEY}`
      }
    })

    if (!fileResponse.ok) {
      const errorData = await fileResponse.text()
      console.error("Facturapi Error Response:", errorData)
      throw new Error('Error al descargar el archivo desde Facturapi')
    }

    if (format === 'json') {
      const jsonData = await fileResponse.json()
      return new Response(JSON.stringify(jsonData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const fileBlob = await fileResponse.blob()

    // Configurar Content-Type y Content-Disposition para forzar descarga
    const contentType = format === 'pdf' ? 'application/pdf' : 'text/xml'
    const extension = format === 'pdf' ? 'pdf' : 'xml'
    
    // Si viene un filename en la URL, lo usamos; si no, usamos el default
    const customFilename = url.searchParams.get('filename')
    const filename = customFilename ? `${customFilename}.${extension}` : `factura_${id}.${extension}`

    return new Response(fileBlob, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      },
      status: 200,
    })

  } catch (error: any) {
    console.error("Edge Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
