import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const getS3Client = () => {
  return new S3Client({
    region: (process.env.AWS_REGION || 'us-east-2').trim(),
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
    }
  });
};

// Configuración de multer (memoria)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB límite
  }
});

/**
 * Sube un buffer a Lightsail S3
 * @param fileBuffer El buffer del archivo
 * @param originalName El nombre original del archivo
 * @param folder Carpeta destino (ej: 'tickets', 'facturas')
 * @param mimeType Tipo MIME
 * @returns La URL pública del archivo
 */
export const uploadFileToStorage = async (
  fileBuffer: Buffer,
  originalName: string,
  folder: string,
  mimeType: string,
  customPath?: string
): Promise<string> => {
  const bucketName = process.env.AWS_BUCKET_NAME || 'portal-inttec-storage';
  let key: string;
  if (customPath) {
    key = `${folder}/${customPath}`;
  } else {
    const extension = path.extname(originalName);
    const fileName = `${uuidv4()}${extension}`;
    key = `${folder}/${fileName}`;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  const client = getS3Client();
  await client.send(command);

  // Construir la URL pública de Lightsail Object Storage
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${key}`;
};
