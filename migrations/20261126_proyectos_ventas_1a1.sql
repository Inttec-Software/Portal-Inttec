-- Migración: Relación 1 a 1 entre Proyectos y Ventas (proyectos.venta_id)
-- Mantiene intacto gastos.venta_id para Gastos Operativos y gastos históricos sin proyecto_id
-- Ejecutar en las bases de datos de cada tenant (inttec_test, inttec_prod, daravisa_test, daravisa_prod)

-- 1. Asegurar columna venta_id en proyectos
ALTER TABLE public.proyectos
ADD COLUMN IF NOT EXISTS venta_id uuid NULL REFERENCES public.ventas(id) ON DELETE SET NULL;

-- 2. Índice único parcial para garantizar relación 1 a 1 (una venta solo puede estar vinculada a 1 proyecto)
CREATE UNIQUE INDEX IF NOT EXISTS uq_proyectos_venta_id
ON public.proyectos USING btree (venta_id)
WHERE venta_id IS NOT NULL;

COMMENT ON COLUMN public.proyectos.venta_id IS 'Venta vinculada en relación 1 a 1 con el proyecto';
