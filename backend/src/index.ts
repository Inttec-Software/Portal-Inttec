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

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de CORS temporalmente abierta (Fase 1)
app.use(cors());

// Parsear JSON
app.use(express.json());

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
