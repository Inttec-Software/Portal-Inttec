-- Migración: Soporte para múltiples facturas recibidas por gasto (Relación N:M)
-- Mantiene soporte para facturas compartidas (1 factura -> N gastos) y agrega múltiples CFDIs por gasto (1 gasto -> N facturas)
-- Ejecutar en las bases de datos de cada tenant (ej: inttec_test, inttec_prod, daravisa_test, daravisa_prod)

-- 1. Crear tabla puente gasto_facturas
CREATE TABLE IF NOT EXISTS public.gasto_facturas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gasto_id uuid NOT NULL REFERENCES public.gastos(id) ON DELETE CASCADE,
  factura_recibida_id uuid NOT NULL REFERENCES public.facturas_recibidas(id) ON DELETE CASCADE,
  monto_aplicado numeric(12, 2) NOT NULL DEFAULT 0,
  motivo_diferencia text NULL,
  detalle_diferencia text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT uq_gasto_factura UNIQUE (gasto_id, factura_recibida_id)
);

-- 2. Índices para consultas rápidas desde gastos y desde facturas_recibidas
CREATE INDEX IF NOT EXISTS idx_gasto_facturas_gasto_id
ON public.gasto_facturas USING btree (gasto_id);

CREATE INDEX IF NOT EXISTS idx_gasto_facturas_factura_id
ON public.gasto_facturas USING btree (factura_recibida_id);

-- 3. Migrar todos los vínculos existentes de gastos.factura_recibida_id hacia gasto_facturas
INSERT INTO public.gasto_facturas (gasto_id, factura_recibida_id, monto_aplicado)
SELECT
  g.id,
  g.factura_recibida_id,
  GREATEST(0, COALESCE(g.monto, 0) - COALESCE(g.monto_propina, 0))
FROM public.gastos g
WHERE g.factura_recibida_id IS NOT NULL
ON CONFLICT (gasto_id, factura_recibida_id) DO NOTHING;

COMMENT ON TABLE public.gasto_facturas IS 'Tabla puente N:M entre gastos y facturas_recibidas (CFDIs SAT) con monto aplicado por cada factura';
COMMENT ON COLUMN public.gasto_facturas.monto_aplicado IS 'Monto del gasto que queda cubierto por esta factura recibida';
