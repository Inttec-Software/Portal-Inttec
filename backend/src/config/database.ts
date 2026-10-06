import { Pool } from 'pg';

// Cache de conexiones para no abrir un pool nuevo en cada request
const pools: Record<string, Pool> = {};

/**
 * Obtiene o crea un pool de conexiones para el tenant especificado.
 * @param company 'inttec' o 'daravisa'
 * @param env 'prod' o 'staging'
 */
export const getDbPool = (company: string, env: string): Pool => {
  // Map middleware envs to actual database suffix names
  const dbEnv = env === 'cloud' ? 'prod' : (env === 'test' ? 'test' : env);
  const dbName = `${company}_${dbEnv}`;

  if (!pools[dbName]) {
    // Extraemos las credenciales del entorno
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432', 10);
    
    // Determinar el usuario y password basado en la compañía
    let user = '';
    let password = '';

    if (company === 'inttec') {
      user = 'inttec_admin';
      password = process.env.INTTEC_DB_PASSWORD || '';
    } else if (company === 'daravisa') {
      user = 'daravisa_admin';
      password = process.env.DARAVISA_DB_PASSWORD || '';
    } else {
      throw new Error(`Compañía no soportada: ${company}`);
    }

    console.log(`[DB] Inicializando nuevo Pool para la base de datos: ${dbName}`);

    pools[dbName] = new Pool({
      host,
      port,
      database: dbName,
      user,
      password,
      max: 10, // Máximo 10 conexiones simultáneas por pool
      idleTimeoutMillis: 30000,
    });

    // Manejo de errores a nivel del pool
    pools[dbName].on('error', (err) => {
      console.error(`[DB] Error inesperado en el pool de ${dbName}`, err);
    });
  }

  return pools[dbName];
};
