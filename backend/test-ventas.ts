import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
  const { data, error } = await client.from('ventas').select('*, usuarios!ventas_registrado_por_fkey(nombre)').limit(2);
  console.log("Ventas data:", JSON.stringify(data, null, 2));
  if (error) console.error(error);
}
run();
