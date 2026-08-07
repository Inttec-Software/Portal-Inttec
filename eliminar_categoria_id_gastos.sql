-- =========================================================================
-- SCRIPT: ELIMINAR 'categoria_id' Y NORMALIZAR SUB-CATEGORÍAS EN 'gastos'
-- =========================================================================
-- Base de datos: Daravisa / Portal-Inttec
-- Propósito: 
-- 1. Asegurar que cada gasto tenga su 'subcategoria_id' asignado correctamente.
-- 2. Eliminar la columna 'categoria_id' de la tabla 'gastos' para evitar redundancia
--    y desincronizaciones de categorías.
-- 3. La categoría se relaciona y consulta automáticamente a través de:
--    gastos.subcategoria_id -> subcategorias.categoria_id -> categorias.id
-- =========================================================================

-- 1. ASEGURAR QUE 'subcategoria_id' EXISTA Y TENGA SU FOREIGN KEY
ALTER TABLE public.gastos 
  ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.subcategorias(id) ON DELETE SET NULL;

-- 2. BACKFILL DE HISTÓRICO: Si había gastos con nombre de subcategoría en texto pero sin ID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'subcategoria'
  ) THEN
    UPDATE public.gastos g
    SET subcategoria_id = s.id
    FROM public.subcategorias s
    WHERE g.subcategoria_id IS NULL 
      AND g.subcategoria IS NOT NULL 
      AND LOWER(TRIM(g.subcategoria)) = LOWER(TRIM(s.nombre));
  END IF;
END $$;

-- 3. ELIMINAR RESTRICCIONES E ÍNDICES DE 'categoria_id' EN LA TABLA 'gastos'
DO $$
BEGIN
  -- Eliminar Foreign Key de categoria_id si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'gastos' 
      AND constraint_name = 'gastos_categoria_id_fkey'
  ) THEN
    ALTER TABLE public.gastos DROP CONSTRAINT gastos_categoria_id_fkey;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_gastos_categoria_id;

-- 4. ELIMINAR DEFINITIVAMENTE 'categoria_id' Y 'categoria' DE 'gastos'
ALTER TABLE public.gastos 
  DROP COLUMN IF EXISTS categoria_id,
  DROP COLUMN IF EXISTS categoria;

-- 5. CREAR ÍNDICE ÓPTIMO PARA 'subcategoria_id'
CREATE INDEX IF NOT EXISTS idx_gastos_subcategoria_id ON public.gastos(subcategoria_id);

-- 6. VERIFICACIÓN FINAL: COMPROBAR ESTRUCTURA DE 'gastos'
COMMENT ON COLUMN public.gastos.subcategoria_id IS 'ID de la subcategoría del gasto. La categoría principal se resuelve automáticamente a través de la relación de la subcategoría.';
