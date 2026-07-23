-- ==========================================
-- ESTRUCTURA PARA LA TABLA DE CONFIGURACIÓN DE LA APP (FORCE UPDATE)
-- Ejecutar este script en el editor SQL de Supabase
-- tanto en Inttec como en Daravisa.
-- ==========================================

-- 1. Crear tabla de configuraciones
CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  min_version_code integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Asegurarse de que solo haya una fila de configuración
-- Insertará el registro con id = 1 si no existe. 
-- Asegúrate de cambiar el "1" final por el número de versión mínima que quieras forzar.
INSERT INTO public.app_settings (id, min_version_code)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 4. Crear política de acceso público (o autenticado)
-- Permitimos que cualquiera pueda leer la configuración mínima para que 
-- funcione incluso antes de iniciar sesión.
CREATE POLICY "Permitir lectura publica" ON public.app_settings
  FOR SELECT USING (true);

-- Política para administradores (asumiendo que puedan actualizar desde la web/app)
CREATE POLICY "Permitir actualizacion para usuarios autenticados" ON public.app_settings
  FOR UPDATE TO authenticated USING (true);
