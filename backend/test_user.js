const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const daravisaUrl = process.env.SUPABASE_URL_DARAVISA;
const daravisaKey = process.env.SUPABASE_KEY_DARAVISA;

const daravisaClient = createClient(daravisaUrl, daravisaKey);

async function test() {
  const email = 'lexisfri23@gmail.com';
  console.log('Buscando usuario en DARAVISA...');
  const { data, error } = await daravisaClient
    .from('usuarios')
    .select('*')
    .eq('email', email);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Resultados DARAVISA:', data);
  }
}

test();
