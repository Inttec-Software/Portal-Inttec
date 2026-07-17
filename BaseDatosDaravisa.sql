-- ===========================================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS: DARAVISA
-- Ejecuta este script en el editor SQL de tu nuevo proyecto de Supabase
-- ===========================================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Crear tabla de Usuarios (Esquema de autenticación personalizada)
CREATE TABLE public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  rol text NOT NULL CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);

-- 3. Crear tabla de Perfiles (opcional, para compatibilidad)
CREATE TABLE public.perfiles (
  id uuid NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  rol text CHECK (rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])),
  telefono text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT perfiles_pkey PRIMARY KEY (id)
);

-- 4. Crear tabla de Clientes
CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  rfc text,
  correo_electronico text,
  direccion text,
  codigo_postal text,
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);

-- 5. Crear tabla de Categorías
CREATE TABLE public.categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);

-- 6. Crear tabla de Subcategorías
CREATE TABLE public.subcategorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL,
  nombre text NOT NULL,
  CONSTRAINT subcategorias_pkey PRIMARY KEY (id),
  CONSTRAINT subcat_cat_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE
);

-- 7. Crear tabla de Ventas
CREATE TABLE public.ventas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  total numeric,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT ventas_pkey PRIMARY KEY (id),
  CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL
);

-- 8. Crear tabla de Gastos
CREATE TABLE public.gastos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  monto numeric NOT NULL,
  categoria text,
  subcategoria text,
  metodo_pago text CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text])),
  justificacion text,
  foto_url text,
  status text DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'ACTION_REQUIRED'::text])),
  rejection_feedback text,
  created_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  fecha_comprobante date,
  proveedor text,
  cliente text,
  sucursal text,
  tipo_tarjeta character varying,
  ubicacion_registro character varying,
  estado text,
  facturado boolean DEFAULT false,
  factura_url text,
  motivo_sin_factura text,
  venta_id uuid,
  CONSTRAINT gastos_pkey PRIMARY KEY (id),
  CONSTRAINT gastos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT gastos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL
);

-- 9. Crear tabla de Evidencias de Trabajo
CREATE TABLE public.evidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  empleado_nombre text,
  cliente text NOT NULL,
  descripcion_trabajo text NOT NULL,
  materiales_usados text,
  observaciones text,
  foto_antes_url text,
  foto_despues_url text,
  fotos_adicionales_urls text[],
  resumen_ia text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidencias_pkey PRIMARY KEY (id),
  CONSTRAINT evidencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- 10. Crear tabla de Asistencias (Check-in/out)
CREATE TABLE public.asistencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada time with time zone,
  foto_entrada_url text,
  latitud_entrada numeric,
  longitud_entrada numeric,
  direccion_entrada text,
  hora_salida time with time zone,
  foto_salida_url text,
  latitud_salida numeric,
  longitud_salida numeric,
  direccion_salida text,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT asistencias_pkey PRIMARY KEY (id),
  CONSTRAINT asistencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- Crear índice para mejorar consultas de asistencia
CREATE INDEX IF NOT EXISTS idx_asistencias_empleado_fecha ON public.asistencias(empleado_id, fecha);

-- 11. Crear tabla de Cotizaciones
CREATE TABLE public.cotizaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  cliente_nombre text,
  vendedor text,
  moneda text,
  fecha_creacion text,
  subtotal numeric,
  iva numeric,
  total numeric,
  lineas jsonb,
  terminos_condiciones text,
  estado text DEFAULT 'Borrador',
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT cotizaciones_pkey PRIMARY KEY (id)
);

-- 12. Crear tabla de Logs de Auditoría
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone DEFAULT now(),
  action text CHECK (action = ANY (ARRAY['CREATE'::text, 'APPROVE'::text, 'REJECT'::text, 'UPDATE'::text])),
  actor_id uuid,
  target_id text NOT NULL,
  details text,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- ===========================================================================
-- FUNCIONES PERSONALIZADAS (RPC)
-- ===========================================================================

-- Función de Login de Usuario
CREATE OR REPLACE FUNCTION public.login_usuario(email_param text, password_param text)
RETURNS SETOF public.usuarios AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.usuarios
  WHERE LOWER(email) = LOWER(email_param)
    AND password = password_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================================================
-- DATOS SEMILLA (SEED DATA)
-- Modifica estas credenciales iniciales en tu primer inicio de sesión
-- ===========================================================================

-- Crear Administrador Inicial
INSERT INTO public.usuarios (nombre, email, password, rol, telefono)
VALUES (
  'Administrador Daravisa', 
  'admin@daravisa.com', 
  'admin123', 
  'ADMIN', 
  '6141234567'
) ON CONFLICT (email) DO NOTHING;

-- Crear Empleado Inicial
INSERT INTO public.usuarios (nombre, email, password, rol, telefono)
VALUES (
  'Técnico Daravisa', 
  'empleado@daravisa.com', 
  'empleado123', 
  'EMPLEADO', 
  '6147654321'
) ON CONFLICT (email) DO NOTHING;
