import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { tenantMiddleware } from './middlewares/tenant.middleware';
import storageRoutes from './modules/storage/storage.routes';
import authRoutes from './modules/auth/auth.routes';
import tareasRoutes from './modules/tareas/tareas.routes';
import usuariosRoutes from './modules/usuarios/usuarios.routes';
import settingsRoutes from './modules/settings/settings.routes';
import notificacionesRoutes from './modules/notificaciones/notificaciones.routes';
import vehiculosRoutes from './modules/vehiculos/vehiculos.routes';
import evidenciasRoutes from './modules/evidencias/evidencias.routes';
import inventarioRoutes from './modules/inventario/inventario.routes';
import catalogosRoutes from './modules/catalogos/catalogos.routes';
import reportesRoutes from './modules/reportes/reportes.routes';
import asistenciasRoutes from './modules/asistencias/asistencias.routes';
import ventasRoutes from './modules/ventas/ventas.routes';
import cotizacionesRoutes from './modules/cotizaciones/cotizaciones.routes';
import auditoriaRoutes from './modules/auditoria/auditoria.routes';
import chatIaRoutes from './modules/chat-ia/chat.routes';
import facturasRecibidasRoutes from './modules/facturas-recibidas/facturas-recibidas.routes';
import retiroMaterialRoutes from './modules/retiro-material/retiro-material.routes';
import devolucionesRoutes from './modules/devoluciones/devoluciones.routes';
import documentosRoutes from './modules/documentos/documentos.routes';
import satRoutes from './modules/sat/sat.routes';
import herramientasRoutes from './modules/herramientas/herramientas.routes';
import queryRoutes from './modules/query/query.routes';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

import { initCronJobs } from './cron';

// Cargar variables de entorno
dotenv.config();

// Inicializar Cron Jobs
initCronJobs();

const app = express();
const PORT = process.env.PORT || 10000;

// Disable ETag and configure no-cache for fresh API data
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Logging estructurado y seguro para monitoreo en producción/desarrollo
app.use((req, res, next) => {
  // Ignorar pings de Hikvision y health checks para no saturar los logs
  if (req.originalUrl?.includes('/asistencias/hikvision') || req.url?.includes('/asistencias/hikvision')) {
    return next();
  }

  const start = Date.now();
  const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
  const company = req.headers['x-company'] || 'none';
  const env = req.headers['x-env'] || 'cloud';
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const cleanIp = typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : clientIp;

  // Sanitizar ruta removiendo query params sensibles
  const sanitizedUrl = req.originalUrl?.split('?')[0] || req.url.split('?')[0];

  console.log(`\n[${timeStr}] [REQ] ${req.method} ${sanitizedUrl} | Tenant: ${company}:${env} | IP: ${cleanIp}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const tag = status >= 500 ? '[ERROR]' : status >= 400 ? '[WARN]' : '✓';
    console.log(`[${timeStr}] [RES] ${tag} ${req.method} ${sanitizedUrl} -> ${status} (${duration}ms)`);
  });

  next();
});

// 1. HTTP Security Headers (Helmet)
app.use(helmet());

// 2. Rate Limiting (Protección contra DDoS y Brute Force) - Excluir checador físico Hikvision
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite de 1000 peticiones por ventana por IP
  message: { error: 'Demasiadas peticiones desde esta IP. Inténtelo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.url.includes('/asistencias/hikvision') || req.originalUrl.includes('/asistencias/hikvision')
});
app.use('/api/', apiLimiter);

const corsOptions: cors.CorsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-company',
    'x-env',
    'x-tenant-company',
    'x-tenant-env',
    'x-query-client'
  ]
};

app.use(cors(corsOptions));

// Parsear JSON, URL-Encoded y Texto plano/XML para compatibilidad con checadores
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'application/xml', 'text/xml'], limit: '10mb' }));

// Middleware para inyectar configuración multi-tenant en req
app.use(tenantMiddleware);

// Rutas de la API
app.use('/api/upload', storageRoutes);
// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/usuarios', usuariosRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/evidencias', evidenciasRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/asistencias', asistenciasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/chat-ia', chatIaRoutes);
app.use('/api/facturas-recibidas', facturasRecibidasRoutes);
app.use('/api/retiro-material', retiroMaterialRoutes);
app.use('/api/devoluciones', devolucionesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/sat', satRoutes);
app.use('/api/herramientas', herramientasRoutes);
app.use('/api/query', queryRoutes);

// Ruta de prueba para verificar conexión a la base de datos PostgreSQL pura
import { getDbPool } from './config/database';

app.get('/api/test-db', async (req, res) => {
  try {
    const { company, env } = (req as any).tenant;
    const pool = getDbPool(company, env);
    
    // Ejecutamos una consulta sencilla para ver si PostgreSQL responde
    const result = await pool.query('SELECT current_database(), current_user, now();');
    
    res.json({
      status: 'success',
      message: '¡Conexión a PostgreSQL exitosa!',
      tenantInfo: { company, env },
      dbResult: result.rows[0],
    });
  } catch (error: any) {
    console.error('[Test DB] Error conectando a PostgreSQL:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fallo al conectar con la base de datos',
      error: error.message,
    });
  }
});

// Ruta base
app.get('/', (req, res) => {
  res.json({
    message: 'Backend Node.js activo',
    tenant: (req as any).tenant || 'Not specified'
  });
});

import { SatSyncService } from './services/satSyncService';

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  // Iniciar servicio en segundo plano de sincronización automática con el SAT
  SatSyncService.startScheduler();
});


