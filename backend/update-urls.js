const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  host: process.env.DB_HOST, 
  user: 'inttec_admin', 
  password: process.env.INTTEC_DB_PASSWORD, 
  database: 'inttec_prod' 
});

async function updateDbUrls() {
  console.log('Buscando y actualizando URLs de Supabase a AWS...');
  
  const query = `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns 
    WHERE (column_name LIKE '%url%' OR column_name LIKE '%comprobante%' OR column_name LIKE '%archivo%' OR column_name LIKE '%ticket%' OR column_name LIKE '%factura%' OR column_name LIKE '%foto%')
      AND data_type IN ('character varying', 'text', 'ARRAY')
  `;
  
  const res = await pool.query(query);
  const SUPA = 'https://etpdebclhaxbpbuwxdmy.supabase.co/storage/v1/object/public/';
  const AWS = 'https://portal-inttec-storage.s3.us-east-2.amazonaws.com/inttec/';
  
  let totalUpdated = 0;

  for (const row of res.rows) {
    const table = row.table_name;
    const col = row.column_name;
    const isArray = row.data_type === 'ARRAY';
    
    let updateSql;
    if (isArray) {
      updateSql = `UPDATE ${table} SET ${col} = (REPLACE(${col}::text, '${SUPA}', '${AWS}'))::text[] WHERE ${col}::text LIKE '%${SUPA}%';`;
    } else {
      updateSql = `UPDATE ${table} SET ${col} = REPLACE(${col}, '${SUPA}', '${AWS}') WHERE ${col} LIKE '%${SUPA}%';`;
    }
    
    try {
      const uRes = await pool.query(updateSql);
      if (uRes.rowCount > 0) {
        console.log(` -> Actualizadas ${uRes.rowCount} filas en [${table}.${col}] ${isArray ? '(Array)' : ''}`);
        totalUpdated += uRes.rowCount;
      }
    } catch(e) {
      // Ignorar vistas o tablas de sistema
    }
  }
  
  console.log(`\n¡Actualización completada! Total de registros modificados: ${totalUpdated}`);
  pool.end();
}

updateDbUrls();
