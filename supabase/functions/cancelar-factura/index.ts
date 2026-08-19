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
    const { venta_id, motivo = '02', folio_sustitucion = '' } = await req.json()
    if (!venta_id) throw new Error('Falta el ID de la venta (venta_id)')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const FINKOK_USERNAME = Deno.env.get('FINKOK_USERNAME') || ''
    const FINKOK_PASSWORD = Deno.env.get('FINKOK_PASSWORD') || ''
    const FINKOK_ENV = (Deno.env.get('FINKOK_ENV') || 'sandbox').toLowerCase()
    const isProduction = FINKOK_ENV === 'production'
    
    if (!FINKOK_USERNAME || !FINKOK_PASSWORD) {
      throw new Error('Credenciales de Finkok no configuradas en el entorno')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey)

    // 1. Obtener la venta
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('cfdi_uuid, cfdi_estado')
      .eq('id', venta_id)
      .single()

    if (ventaError || !venta) throw new Error('No se encontró la venta')
    if (venta.cfdi_estado !== 'TIMBRADA' || !venta.cfdi_uuid) {
      throw new Error('La venta no se encuentra timbrada o no tiene Folio Fiscal (UUID)')
    }

    // 2. Determinar RFC Emisor
    const rfcEmisor = Deno.env.get('EMISOR_RFC') || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');

    // 3. Importar cliente SOAP de Finkok
    const { signCancelFinkok } = await import('../facturar-venta/finkok/soapClient.ts')

    // 4. Cancelar ante el SAT vía Finkok
    const cancelResult = await signCancelFinkok(
      venta.cfdi_uuid,
      rfcEmisor,
      FINKOK_USERNAME,
      FINKOK_PASSWORD,
      motivo,
      folio_sustitucion,
      isProduction
    );

    // 5. Actualizar estado en Supabase
    const { error: updateError } = await supabaseClient
      .from('ventas')
      .update({ cfdi_estado: 'CANCELADA' })
      .eq('id', venta_id)

    if (updateError) {
      console.error("Error al actualizar estado en DB:", updateError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      estatus: cancelResult.estatus,
      message: 'Factura cancelada correctamente ante el SAT'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error("Edge Function cancelar-factura Error:", error)
    return new Response(JSON.stringify({ error: error.message || 'Error al cancelar factura' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
