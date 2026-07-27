// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; 
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { targetUserId, title, body, data } = await req.json();

    if (!targetUserId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Obtener el push token del usuario destino
    const { data: user, error: userError } = await supabaseClient
      .from("usuarios")
      .select("expo_push_token")
      .eq("id", targetUserId)
      .single();

    if (userError || !user?.expo_push_token) {
      return new Response(JSON.stringify({ error: "User not found or no push token registered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Enviar a la API de Expo
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: user.expo_push_token,
        sound: "default",
        title: title,
        body: body,
        data: data || {},
      }),
    });

    const expoResult = await expoResponse.json();

    return new Response(JSON.stringify({ success: true, result: expoResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error sending push:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
