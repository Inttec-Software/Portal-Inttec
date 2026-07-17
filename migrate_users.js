const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno del archivo .env
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: No se encontró el archivo .env en la raíz del proyecto.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    if (key && !key.startsWith('#')) {
      env[key] = value;
    }
  }
});

const sanitizeUrl = (url) => {
  return url ? url.trim().replace(/\/rest\/v1\/?$/, '') : url;
};

const inttecUrl = sanitizeUrl(env.EXPO_PUBLIC_SUPABASE_URL_INTTEC || env.EXPO_PUBLIC_SUPABASE_URL);
const inttecAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY_INTTEC || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const daravisaUrl = sanitizeUrl(env.EXPO_PUBLIC_SUPABASE_URL_DARAVISA);
const daravisaAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY_DARAVISA;

if (!daravisaUrl || !daravisaAnonKey || daravisaUrl.includes('tu-proyecto-daravisa')) {
  console.error('ERROR: No se han configurado las credenciales de Daravisa en el archivo .env');
  console.error('Por favor, edita tu archivo .env y agrega:');
  console.error('EXPO_PUBLIC_SUPABASE_URL_DARAVISA=https://tu-proyecto.supabase.co');
  console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY_DARAVISA=tu-anon-key');
  process.exit(1);
}

const inttec = createClient(inttecUrl, inttecAnonKey, {
  auth: { persistSession: false }
});
const daravisa = createClient(daravisaUrl, daravisaAnonKey, {
  auth: { persistSession: false }
});

async function run() {
  try {
    console.log('Conectando a Inttec:', inttecUrl);
    console.log('Conectando a Daravisa:', daravisaUrl);
    
    console.log('Obteniendo usuarios de la base de datos de Inttec...');
    const { data: users, error: selectError } = await inttec.from('usuarios').select('*');
    if (selectError) throw selectError;

    console.log(`Se encontraron ${users.length} usuarios en Inttec. Migrando...`);
    
    let count = 0;
    for (const user of users) {
      const { error: insertError } = await daravisa.from('usuarios').upsert(user, { onConflict: 'email' });
      if (insertError) {
        console.error(`[-] Error al migrar a ${user.email}:`, insertError.message);
      } else {
        console.log(`[+] Migrado: ${user.email} (${user.rol})`);
        count++;
      }
    }
    
    console.log(`\nMIGRACIÓN COMPLETADA: ${count}/${users.length} usuarios sincronizados en Daravisa.`);
  } catch (err) {
    console.error('ERROR DURANTE LA MIGRACIÓN:', err.message || err);
  }
}

run();
