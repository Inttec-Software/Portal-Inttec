-- ==========================================
-- ESTRUCTURA PARA EL MÓDULO DE VEHÍCULOS Y GASOLINA
-- Ejecutar este script en el editor SQL de Supabase
-- tanto en Inttec como en Daravisa.
-- ==========================================

-- 1. Crear tabla de Vehículos
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  marca text NOT NULL,
  modelo text NOT NULL,
  anio integer NOT NULL,
  placas text NOT NULL,
  numero_economico text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vehiculos_pkey PRIMARY KEY (id),
  CONSTRAINT vehiculos_placas_key UNIQUE (placas)
);

-- 2. Habilitar RLS en Vehículos (opcional, por defecto habilitada)
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de acceso libre para usuarios autenticados
CREATE POLICY "Permitir lectura para usuarios autenticados" ON public.vehiculos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserción para administradores" ON public.vehiculos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permitir actualización para administradores" ON public.vehiculos
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Permitir eliminación para administradores" ON public.vehiculos
  FOR DELETE TO authenticated USING (true);

-- 4. Crear tabla de Registro de Gasolina
CREATE TABLE IF NOT EXISTS public.registro_gasolina (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gasto_id uuid,
  vehiculo_id uuid NOT NULL,
  empleado_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  kilometraje_actual integer NOT NULL,
  litros numeric NOT NULL,
  costo_total numeric NOT NULL,
  ticket_foto_url text,
  observaciones text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registro_gasolina_pkey PRIMARY KEY (id),
  CONSTRAINT registro_gasolina_gasto_id_fkey FOREIGN KEY (gasto_id) REFERENCES public.gastos(id) ON DELETE CASCADE,
  CONSTRAINT registro_gasolina_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  CONSTRAINT registro_gasolina_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- 5. Habilitar RLS en Registro de Gasolina
ALTER TABLE public.registro_gasolina ENABLE ROW LEVEL SECURITY;

-- 6. Crear políticas de acceso para Registro de Gasolina
CREATE POLICY "Permitir lectura para usuarios autenticados" ON public.registro_gasolina
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir inserción para usuarios autenticados" ON public.registro_gasolina
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permitir actualización para usuarios autenticados" ON public.registro_gasolina
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Permitir eliminación para usuarios autenticados" ON public.registro_gasolina
  FOR DELETE TO authenticated USING (true);
