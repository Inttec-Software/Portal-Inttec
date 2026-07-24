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

    // Configurar Facturapi
    const FACTURAPI_KEY = Deno.env.get('FACTURAPI_KEY')
    if (!FACTURAPI_KEY) throw new Error('FACTURAPI_KEY no configurado en entorno')

    const facturapiBaseUrl = 'https://www.facturapi.io/v2'
    const headers = {
      'Authorization': `Bearer ${FACTURAPI_KEY}`,
      'Content-Type': 'application/json'
    }

    // 4. Mapear items
    const items = partidas.map((p: any) => {
      // Calcular taxes si aplica
      const taxes = venta.agregar_iva ? [{ type: 'IVA', rate: 0.16 }] : []
      
      return {
        product: {
          description: p.descripcion,
          product_key: "01010101", // Clave genérica (o buscar en tabla productos si se asocia)
          price: p.precio_unitario_venta,
          unit_key: "H87", // H87: Pieza (Clave genérica recomendada por el SAT para productos físicos)
          taxes
        },
        quantity: p.cantidad
      }
    })

    // 5. Construir payload de factura
    const invoicePayload = {
      customer: {
        legal_name: cliente.razon_social || cliente.nombre,
        tax_id: cliente.rfc || "XAXX010101000",
        tax_system: cliente.regimen_fiscal || "616", 
        address: {
          zip: cliente.codigo_postal || "77500" // Facturapi v2 usa 'zip'
        }
      },
      items,
      use: cliente.uso_cfdi || "S01", // S01 es lo correcto para Público en General
      payment_form: "01", // 01: Efectivo
      payment_method: "PUE" // Pago en una sola exhibición
    }

    // 6. Solicitar timbrado a Facturapi
    const facturapiResponse = await fetch(`${facturapiBaseUrl}/invoices`, {
      method: 'POST',
      headers,
      body: JSON.stringify(invoicePayload)
    })

    const facturapiData = await facturapiResponse.json()
    
    if (!facturapiResponse.ok) {
      console.error("Facturapi Error Response:", facturapiData)
      throw new Error(facturapiData.message || 'Error al timbrar factura en el PAC')
    }

    // En Facturapi, la propiedad 'uuid' es el UUID del SAT, 
    // y 'id' (ej. "in_xxxx") es el id interno de facturapi.
    const sat_uuid = facturapiData.uuid || null

    // 7. Actualizar Venta en base de datos
    await supabaseClient
      .from('ventas')
      .update({
        cfdi_uuid: sat_uuid,
        cfdi_facturapi_id: facturapiData.id,
        cfdi_estado: 'TIMBRADA'
      })
      .eq('id', venta_id)

    // Respondemos con el ID de Facturapi para que el frontend pueda solicitar descargas, 
    // o descargar usando una Cloud Function que proxy el PDF.
    return new Response(JSON.stringify({ 
      success: true, 
      cfdi_uuid: sat_uuid,
      facturapi_id: facturapiData.id
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
