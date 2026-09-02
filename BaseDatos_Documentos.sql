-- ==============================================================================
-- SCRIPT DE MIGRACIÓN: MÓDULO DE DOCUMENTOS Y FIRMAS (DARAVISA / INTTEC)
-- Ejecutar en el SQL Editor de tu proyecto de Supabase
-- ==============================================================================

-- 1. Crear Bucket de Almacenamiento para Documentos y Firmas (Público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-firmados', 'documentos-firmados', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage para permitir lectura y subida
DROP POLICY IF EXISTS "Permitir lectura publica documentos-firmados" ON storage.objects;
CREATE POLICY "Permitir lectura publica documentos-firmados" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documentos-firmados');

DROP POLICY IF EXISTS "Permitir subida publica documentos-firmados" ON storage.objects;
CREATE POLICY "Permitir subida publica documentos-firmados" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'documentos-firmados');

DROP POLICY IF EXISTS "Permitir actualizacion documentos-firmados" ON storage.objects;
CREATE POLICY "Permitir actualizacion documentos-firmados" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'documentos-firmados');

-- 2. Tabla de Documentos Maestros
CREATE TABLE IF NOT EXISTS public.documentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo_documento TEXT DEFAULT 'PDF', -- 'PDF' o 'HTML'
  contenido_html TEXT,
  archivo_pdf_url TEXT,
  posicion_firma TEXT, -- JSON con {x, y, page}
  creador_id TEXT,
  creador_nombre TEXT DEFAULT 'Administración',
  requiere_todos BOOLEAN DEFAULT false,
  estado TEXT DEFAULT 'PUBLICADO', -- 'PUBLICADO', 'BORRADOR', 'ARCHIVADO'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Asegurar columna posicion_firma si ya existía la tabla
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS posicion_firma TEXT;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'PDF';
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS archivo_pdf_url TEXT;

-- 3. Tabla de Asignaciones y Firmas de Empleados
CREATE TABLE IF NOT EXISTS public.documentos_firmados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  documento_id UUID REFERENCES public.documentos(id) ON DELETE CASCADE,
  empleado_id TEXT NOT NULL,
  empleado_nombre TEXT,
  empleado_email TEXT,
  estado TEXT DEFAULT 'PENDIENTE', -- 'PENDIENTE' o 'FIRMADO'
  firma_imagen_url TEXT,
  fecha_firma TIMESTAMP WITH TIME ZONE,
  ip_firma TEXT,
  pdf_final_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Habilitar RLS y Políticas de Acceso
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_firmados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total documentos" ON public.documentos;
CREATE POLICY "Acceso total documentos" ON public.documentos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total documentos_firmados" ON public.documentos_firmados;
CREATE POLICY "Acceso total documentos_firmados" ON public.documentos_firmados FOR ALL USING (true) WITH CHECK (true);
