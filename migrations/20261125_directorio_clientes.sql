-- Migración: Nuevo módulo Directorio de Clientes (independiente de public.clientes)
-- Inicia completamente vacío. CRUD para administradores y solo lectura para empleados.
-- Ejecutar en las bases de datos de cada tenant (inttec_test, inttec_prod, daravisa_test, daravisa_prod)

CREATE TABLE IF NOT EXISTS public.directorio_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  direccion text NULL,
  telefono text NULL,
  correo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_directorio_clientes_nombre
ON public.directorio_clientes USING btree (nombre);

COMMENT ON TABLE public.directorio_clientes IS 'Directorio general de contacto de clientes (independiente de la tabla clientes usada en gastos/ventas)';
