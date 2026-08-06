-- =========================================================================
-- SCRIPT PARA ELIMINAR LAS COLUMNAS ANTIGUAS DE TEXTO EN LA TABLA GASTOS
-- =========================================================================
-- Ejecutar en el SQL Editor de Supabase.
-- Este script elimina definitivamente las columnas de texto redundantes
-- (categoria, subcategoria, proveedor, cliente, sucursal, estado)
-- dejando únicamente las columnas relacionales (categoria_id, subcategoria_id, 
-- proveedor_id, cliente_id, sucursal_id).
-- =========================================================================

ALTER TABLE public.gastos 
  DROP COLUMN IF EXISTS categoria,
  DROP COLUMN IF EXISTS subcategoria,
  DROP COLUMN IF EXISTS proveedor,
  DROP COLUMN IF EXISTS cliente,
  DROP COLUMN IF EXISTS sucursal,
  DROP COLUMN IF EXISTS estado;
