-- =========================================================================
-- MIGRACIÓN RELACIONAL PARA LA TABLA GASTOS (SUPABASE / POSTGRESQL)
-- =========================================================================
-- Este script agrega las llaves foráneas a la tabla `gastos`, realiza el
-- backfill automático de datos existentes y crea los índices correspondientes.
-- Puede ejecutarse de manera segura (idempotente) en el SQL Editor de Supabase.
-- =========================================================================

-- 1. Agregar las nuevas columnas relacionales a gastos si no existen
ALTER TABLE public.gastos 
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL;

-- 2. Backfill (poblar IDs automáticamente cruzando con los nombres existentes)

-- Categorías
UPDATE public.gastos g
SET categoria_id = c.id
FROM public.categorias c
WHERE g.categoria_id IS NULL 
  AND g.categoria IS NOT NULL 
  AND LOWER(TRIM(g.categoria)) = LOWER(TRIM(c.nombre));

-- Subcategorías
UPDATE public.gastos g
SET subcategoria_id = s.id
FROM public.subcategorias s
WHERE g.subcategoria_id IS NULL 
  AND g.subcategoria IS NOT NULL 
  AND LOWER(TRIM(g.subcategoria)) = LOWER(TRIM(s.nombre));

-- Proveedores
UPDATE public.gastos g
SET proveedor_id = p.id
FROM public.proveedores p
WHERE g.proveedor_id IS NULL 
  AND g.proveedor IS NOT NULL 
  AND LOWER(TRIM(g.proveedor)) = LOWER(TRIM(p.nombre));

-- Clientes
UPDATE public.gastos g
SET cliente_id = cl.id
FROM public.clientes cl
WHERE g.cliente_id IS NULL 
  AND g.cliente IS NOT NULL 
  AND LOWER(TRIM(g.cliente)) = LOWER(TRIM(cl.nombre));

-- Sucursales
UPDATE public.gastos g
SET sucursal_id = suc.id
FROM public.sucursales_cliente suc
WHERE g.sucursal_id IS NULL 
  AND g.sucursal IS NOT NULL 
  AND LOWER(TRIM(g.sucursal)) = LOWER(TRIM(suc.nombre));

-- 3. Crear índices para optimizar las consultas y joins
CREATE INDEX IF NOT EXISTS idx_gastos_categoria_id ON public.gastos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_subcategoria_id ON public.gastos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor_id ON public.gastos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_cliente_id ON public.gastos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_sucursal_id ON public.gastos(sucursal_id);

-- 4. (Opcional / Paso Final) Eliminar las columnas de texto redundantes
-- Ejecutar una vez que hayas verificado que los IDs se poblaron correctamente:
ALTER TABLE public.gastos 
  DROP COLUMN IF EXISTS categoria,
  DROP COLUMN IF EXISTS subcategoria,
  DROP COLUMN IF EXISTS proveedor,
  DROP COLUMN IF EXISTS cliente,
  DROP COLUMN IF EXISTS sucursal,
  DROP COLUMN IF EXISTS estado;

