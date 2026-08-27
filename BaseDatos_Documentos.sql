-- =========================================================================
-- ESTRUCTURA DE BASE DE DATOS: MÓDULO DE DOCUMENTOS Y FIRMAS DIGITALES
-- =========================================================================

-- 1. Tabla de Documentos y Plantillas de la Empresa (Emitidos por Admin)
CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  contenido_html text,
  archivo_pdf_url text, -- URL del archivo PDF original subido por el admin (si aplica)
  tipo_documento text NOT NULL DEFAULT 'TEXTO' CHECK (tipo_documento IN ('TEXTO', 'PDF')),
  creador_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creador_nombre text NOT NULL,
  requiere_todos boolean DEFAULT true,
  estado text NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('BORRADOR', 'PUBLICADO', 'ARCHIVADO')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documentos_pkey PRIMARY KEY (id)
);

-- Si la tabla ya existía, agregar columnas para soporte de PDF original:
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS archivo_pdf_url text;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'TEXTO';
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS posicion_firma text DEFAULT 'AL_FINAL';

-- 2. Tabla de Asignaciones y Firmas por Empleado (Audit Log & Evidencia)
CREATE TABLE IF NOT EXISTS public.documentos_firmados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empleado_nombre text NOT NULL,
  empleado_email text,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'FIRMADO', 'RECHAZADO')),
  firma_base64 text,
  firma_url text,
  pdf_firmado_url text,
  ip_registro text,
  ubicacion_gps text,
  dispositivo_info text,
  hash_sha256 text,
  motivo_rechazo text,
  firmado_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documentos_firmados_pkey PRIMARY KEY (id),
  CONSTRAINT uq_documento_empleado UNIQUE (documento_id, empleado_id)
);

-- Permisos y Grantes para los roles de Supabase
GRANT ALL ON TABLE public.documentos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.documentos_firmados TO anon, authenticated, service_role;
