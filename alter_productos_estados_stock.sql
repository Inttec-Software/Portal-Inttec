-- =========================================================================
-- MIGRACIÓN: DESGLOSE DE ESTADOS DE STOCK EN PRODUCTOS (NUEVAS, USADAS, POR REVISAR)
-- =========================================================================

ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS stock_nuevo NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_usado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_por_revisar NUMERIC DEFAULT 0;

-- Sincronizar productos existentes para que su stock_actual se asigne a stock_nuevo por defecto
UPDATE public.productos
SET stock_nuevo = COALESCE(stock_actual, 0)
WHERE (stock_nuevo IS NULL OR stock_nuevo = 0)
  AND (stock_usado IS NULL OR stock_usado = 0)
  AND (stock_por_revisar IS NULL OR stock_por_revisar = 0)
  AND COALESCE(stock_actual, 0) > 0;
