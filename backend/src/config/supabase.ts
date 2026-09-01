import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Obtener URLs y Keys de las variables de entorno
const inttecUrl = process.env.SUPABASE_URL_INTTEC || 'https://placeholder.supabase.co';
const inttecKey = process.env.SUPABASE_KEY_INTTEC || 'placeholder-key';

const daravisaUrl = process.env.SUPABASE_URL_DARAVISA || 'https://placeholder.supabase.co';
const daravisaKey = process.env.SUPABASE_KEY_DARAVISA || 'placeholder-key';

// Test DBs (Local Docker)
const inttecTestUrl = process.env.SUPABASE_URL_TEST || 'http://localhost:54321';
const inttecTestKey = process.env.SUPABASE_KEY_TEST || 'placeholder-key';

const daravisaTestUrl = process.env.SUPABASE_URL_DARAVISA_TEST || 'http://localhost:54321';
const daravisaTestKey = process.env.SUPABASE_KEY_DARAVISA_TEST || 'placeholder-key';

// Crear instancias estáticas para cada entorno/compañía
const clients = {
  inttec: {
    cloud: createClient(inttecUrl, inttecKey),
    test: createClient(inttecTestUrl, inttecTestKey)
  },
  daravisa: {
    cloud: createClient(daravisaUrl, daravisaKey),
    test: createClient(daravisaTestUrl, daravisaTestKey)
  }
};

/**
 * Retorna el cliente de Supabase adecuado basado en el company y env
 */
export const getSupabaseClient = (company: 'inttec' | 'daravisa', env: 'cloud' | 'test'): SupabaseClient => {
  return clients[company][env];
};
