// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.10.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { venta_id } = await req.json()
    if (!venta_id) throw new Error('Falta el ID de la venta')

    // 1. Configurar Supabase con llave de servicio (para brincar RLS internamente)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const FACTURAPI_KEY = Deno.env.get('FACTURAPI_KEY') || ''
    
    if (!FACTURAPI_KEY) throw new Error('FACTURAPI_KEY no está configurada')

    const supabaseClient = createClient(supabaseUrl, supabaseKey)

    // 2. Obtener la venta
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('cfdi_facturapi_id, cfdi_estado')
      .eq('id', venta_id)
      .single()

    if (ventaError || !venta) throw new Error('No se encontró la venta')
    if (venta.cfdi_estado !== 'TIMBRADA' || !venta.cfdi_facturapi_id) {
      throw new Error('La venta no está timbrada o no tiene ID de Facturapi')
    }

    // 3. Llamar a Facturapi para cancelar
    const cancelResponse = await fetch(`https://www.facturapi.io/v2/invoices/${venta.cfdi_facturapi_id}?motive=02`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${FACTURAPI_KEY}`
      }
    })

    if (!cancelResponse.ok) {
      const errorData = await cancelResponse.text()
      console.error("Facturapi Cancel Error:", errorData)
      throw new Error(`Error al cancelar en Facturapi: ${errorData}`)
    }

    // 4. Actualizar estado en Supabase
    const { error: updateError } = await supabaseClient
      .from('ventas')
      .update({ cfdi_estado: 'CANCELADA' })
      .eq('id', venta_id)

    if (updateError) throw new Error('Error al actualizar el estado de la venta en la base de datos')

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
