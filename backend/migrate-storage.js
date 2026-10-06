const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL_INTTEC;
const SUPABASE_KEY = process.env.SUPABASE_KEY_INTTEC;
const AWS_REGION = (process.env.AWS_REGION || 'us-east-2').trim();
const BUCKET_NAME = (process.env.AWS_BUCKET_NAME || 'portal-inttec-storage').trim();
const TENANT = 'inttec';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
  }
});

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToS3(buffer, targetKey, mimeType) {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: targetKey,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
    // ACL: 'public-read' // Eliminar o dejar comentado según permisos del bucket
  });
  await s3Client.send(cmd);
}

// Para obtener el MimeType podemos basarnos en la extensión
function getMimeType(fileName) {
  if (fileName.endsWith('.pdf')) return 'application/pdf';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.xml')) return 'application/xml';
  return 'application/octet-stream';
}

async function run() {
  console.log('Iniciando migración de Storage...');
  
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('Error listando buckets de Supabase:', error.message);
    return;
  }

  let totalMigrados = 0;

  for (const bucket of buckets) {
    console.log(`\nProcesando bucket: ${bucket.name}`);
    
    let hasMore = true;
    let offset = 0;
    const limit = 100;

    while (hasMore) {
      const { data: files, error: fileErr } = await supabase.storage.from(bucket.name).list('', {
        limit, offset, sortBy: { column: 'name', order: 'asc' }
      });

      if (fileErr) {
        console.error(`Error listando archivos en ${bucket.name}:`, fileErr.message);
        break;
      }

      if (!files || files.length === 0) {
        hasMore = false;
        break;
      }

      for (const file of files) {
        // Ignorar placeholders
        if (file.name === '.emptyFolderPlaceholder') continue;
        
        // Cuidado: .list('') solo lista el root. Si hay carpetas, file.id es null y hay que explorarlas.
        // Vamos a asumir que en Supabase usabas carpetas y subcarpetas.
        // Para simplificar, descargaremos usando la URL pública si sabemos que están expuestas.
        // Espera, si el listado devuelve subcarpetas, hay que iterar recursivamente.
        await processNode(bucket.name, file, '');
      }
      
      offset += limit;
      if (files.length < limit) hasMore = false;
    }
  }

  console.log(`\n¡Migración completada! Archivos transferidos: ${totalMigrados}`);

  async function processNode(bucketName, node, currentPath) {
    // Si es un archivo (tiene metadata)
    if (node.metadata) {
      const filePath = currentPath ? `${currentPath}/${node.name}` : node.name;
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;
      
      const targetKey = `${TENANT}/${bucketName}/${filePath}`;
      const mime = node.metadata.mimetype || getMimeType(node.name);

      console.log(`- Copiando: ${filePath} -> s3://${targetKey}`);
      try {
        const buffer = await downloadFile(publicUrl);
        await uploadToS3(buffer, targetKey, mime);
        totalMigrados++;
      } catch (err) {
        console.error(`  X Error copiando ${filePath}:`, err.message);
      }
    } else {
      // Es una carpeta
      const folderPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      const { data: subFiles } = await supabase.storage.from(bucketName).list(folderPath, { limit: 1000 });
      if (subFiles) {
        for (const sub of subFiles) {
          if (sub.name === '.emptyFolderPlaceholder') continue;
          await processNode(bucketName, sub, folderPath);
        }
      }
    }
  }
}

run();
