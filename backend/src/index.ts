import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { tenantMiddleware } from './middlewares/tenant.middleware';
import authRoutes from './modules/auth/auth.routes';
import tareasRoutes from './modules/tareas/tareas.routes';
import usuariosRoutes from './modules/usuarios/usuarios.routes';
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

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// 1. HTTP Security Headers (Helmet)
app.use(helmet());

// 2. Rate Limiting (Protección contra DDoS y Brute Force)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite de 1000 peticiones por ventana por IP
  message: { error: 'Demasiadas peticiones desde esta IP. Inténtelo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 3. Configuración estricta de CORS (Fase 4)
const allowedOrigins = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
  'https://portal-inttec.netlify.app'
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Permitir peticiones de apps móviles nativas o server-to-server (sin origin)
    if (!origin) {
      return callback(null, true);
    }
    // Permitir peticiones de la lista blanca o dominios *.netlify.app dinámicos (deploy previews)
    if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    return callback(new Error('Bloqueado por política CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-company',
    'x-env',
    'x-tenant-company',
    'x-tenant-env'
  ]
};

app.use(cors(corsOptions));

// Parsear JSON
app.use(express.json({ limit: '10mb' }));

// Middleware para inyectar configuración multi-tenant en req
app.use(tenantMiddleware);

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/usuarios', usuariosRoutes);
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

// Ruta base
app.get('/', (req, res) => {
  res.json({
    message: 'Backend Node.js activo',
    tenant: (req as any).tenant || 'Not specified'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
