-- =========================================================================
-- SCRIPT DE MIGRACIÓN Y ACTUALIZACIÓN COMPLETA: SUPABASE DARAVISA
-- =========================================================================
-- Ejecutar este script en el SQL Editor del proyecto Supabase de DARAVISA.
-- =========================================================================

-- =========================================================================
-- 1. VERIFICACIÓN Y CREACIÓN DE COLUMNAS COMPLEMENTARIAS
-- =========================================================================

-- Push tokens en usuarios
ALTER TABLE public.usuarios 
  ADD COLUMN IF NOT EXISTS expo_push_token text;

-- Kilometraje sincronizado en vehiculos
ALTER TABLE public.vehiculos 
  ADD COLUMN IF NOT EXISTS kilometraje_actual integer DEFAULT 0;

-- Sucursal en ventas y cotizaciones
ALTER TABLE public.ventas 
  ADD COLUMN IF NOT EXISTS sucursal text;

ALTER TABLE public.cotizaciones 
  ADD COLUMN IF NOT EXISTS sucursal text;

-- Timestamps en sucursales_cliente
ALTER TABLE public.sucursales_cliente 
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- =========================================================================
-- 2. AGREGAR COLUMNAS RELACIONALES Y FOREIGN KEYS EN 'GASTOS'
-- =========================================================================
-- Nota: 'gastos' se normaliza para almacenar únicamente 'subcategoria_id'.
-- La categoría principal se resuelve automáticamente a través de la relación de la subcategoría.

ALTER TABLE public.gastos 
  ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL;

-- =========================================================================
-- 3. INSERTAR AUTOMÁTICAMENTE PROVEEDORES, CLIENTES Y SUCURSALES FALTANTES
-- =========================================================================

DO $$
BEGIN
  -- Proveedores
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'proveedor') THEN
    INSERT INTO public.proveedores (nombre)
    SELECT DISTINCT TRIM(g.proveedor)
    FROM public.gastos g
    WHERE g.proveedor IS NOT NULL 
      AND TRIM(g.proveedor) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.proveedores p 
        WHERE LOWER(TRIM(p.nombre)) = LOWER(TRIM(g.proveedor))
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Clientes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'cliente') THEN
    INSERT INTO public.clientes (nombre)
    SELECT DISTINCT TRIM(g.cliente)
    FROM public.gastos g
    WHERE g.cliente IS NOT NULL 
      AND TRIM(g.cliente) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.clientes c 
        WHERE LOWER(TRIM(c.nombre)) = LOWER(TRIM(g.cliente))
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Sucursales
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'sucursal') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'cliente') THEN
    INSERT INTO public.sucursales_cliente (cliente_id, nombre)
    SELECT DISTINCT c.id, TRIM(g.sucursal)
    FROM public.gastos g
    JOIN public.clientes c ON LOWER(TRIM(c.nombre)) = LOWER(TRIM(g.cliente))
    WHERE g.sucursal IS NOT NULL 
      AND TRIM(g.sucursal) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.sucursales_cliente sc 
        WHERE sc.cliente_id = c.id AND LOWER(TRIM(sc.nombre)) = LOWER(TRIM(g.sucursal))
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- =========================================================================
-- 4. BACKFILL: VINCULAR DATOS HISTÓRICOS A SUS RESPECTIVOS IDs
-- =========================================================================

DO $$
BEGIN
  -- Subcategorías
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'subcategoria') THEN
    UPDATE public.gastos g
    SET subcategoria_id = s.id
    FROM public.subcategorias s
    WHERE g.subcategoria_id IS NULL 
      AND g.subcategoria IS NOT NULL 
      AND LOWER(TRIM(g.subcategoria)) = LOWER(TRIM(s.nombre));
  END IF;

  -- Proveedores
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'proveedor') THEN
    UPDATE public.gastos g
    SET proveedor_id = p.id
    FROM public.proveedores p
    WHERE g.proveedor_id IS NULL 
      AND g.proveedor IS NOT NULL 
      AND LOWER(TRIM(g.proveedor)) = LOWER(TRIM(p.nombre));
  END IF;

  -- Clientes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'cliente') THEN
    UPDATE public.gastos g
    SET cliente_id = cl.id
    FROM public.clientes cl
    WHERE g.cliente_id IS NULL 
      AND g.cliente IS NOT NULL 
      AND LOWER(TRIM(g.cliente)) = LOWER(TRIM(cl.nombre));
  END IF;

  -- Sucursales
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'sucursal') THEN
    UPDATE public.gastos g
    SET sucursal_id = suc.id
    FROM public.sucursales_cliente suc
    WHERE g.sucursal_id IS NULL 
      AND g.sucursal IS NOT NULL 
      AND (g.cliente_id IS NULL OR suc.cliente_id = g.cliente_id)
      AND LOWER(TRIM(g.sucursal)) = LOWER(TRIM(suc.nombre));
  END IF;
END $$;

-- =========================================================================
-- 5. CREACIÓN DE ÍNDICES PARA CONSULTAS Y JOINS DE ALTO RENDIMIENTO
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_gastos_subcategoria_id ON public.gastos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor_id ON public.gastos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_cliente_id ON public.gastos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_sucursal_id ON public.gastos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_gastos_empleado_id ON public.gastos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_gastos_venta_id ON public.gastos(venta_id);

-- =========================================================================
-- 6. ELIMINAR COLUMNAS DE TEXTO OBSOLETAS EN LA TABLA GASTOS
-- =========================================================================

ALTER TABLE public.gastos 
  DROP COLUMN IF EXISTS categoria,
  DROP COLUMN IF EXISTS subcategoria,
  DROP COLUMN IF EXISTS proveedor,
  DROP COLUMN IF EXISTS cliente,
  DROP COLUMN IF EXISTS sucursal,
  DROP COLUMN IF EXISTS estado;

-- =========================================================================
-- 7. FUNCIÓN RPC: login_usuario (Eliminando versión previa para evitar conflicto de tipo de retorno)
-- =========================================================================

DROP FUNCTION IF EXISTS public.login_usuario(text, text);
DROP FUNCTION IF EXISTS public.login_usuario();

CREATE OR REPLACE FUNCTION public.login_usuario(email_param text, password_param text)
RETURNS TABLE (
  id uuid,
  nombre text,
  email text,
  rol text,
  telefono text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.nombre, u.email, u.rol, u.telefono, u.created_at
  FROM public.usuarios u
  WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(email_param))
    AND u.password = password_param;
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_usuario(text, text) TO anon, authenticated, service_role;

-- =========================================================================
-- 8. DESHABILITAR ROW LEVEL SECURITY (RLS) PARA TODAS LAS TABLAS
-- =========================================================================

ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales_cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_partidas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_gasolina DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alias_proveedor_producto DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias_tarjeta DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 9. CONFIGURACIÓN DEL BUCKET DE STORAGE 'tickets'
-- =========================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Public Access Tickets'
  ) THEN
    CREATE POLICY "Public Access Tickets" ON storage.objects FOR SELECT USING (bucket_id = 'tickets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Uploads Tickets'
  ) THEN
    CREATE POLICY "Allow Uploads Tickets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'tickets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Updates Tickets'
  ) THEN
    CREATE POLICY "Allow Updates Tickets" ON storage.objects FOR UPDATE USING (bucket_id = 'tickets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Deletes Tickets'
  ) THEN
    CREATE POLICY "Allow Deletes Tickets" ON storage.objects FOR DELETE USING (bucket_id = 'tickets');
  END IF;
END $$;
