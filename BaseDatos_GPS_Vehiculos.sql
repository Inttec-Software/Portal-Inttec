-- =============================================================================
-- MIGRACIÓN: RASTREO GPS VEHICULAR (RUPTELA ECO5 LITE + EPCOM GPS)
-- Compatible con bases de datos INTTEC y DARAVISA (Supabase / PostgreSQL)
-- =============================================================================

-- 1. Nuevas columnas de telemetría GPS y asignación diaria en tabla `vehiculos`
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS gps_imei VARCHAR(64),
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_velocidad NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gps_rumbo NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gps_ignicion BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_direccion TEXT,
  ADD COLUMN IF NOT EXISTS gps_bateria_v NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS gps_ultima_actualizacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conductores_hoy_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conductores_hoy_fecha DATE;

-- 2. Nuevas columnas de verificación cruzada de GPS vehicular en tabla `asistencias`
ALTER TABLE public.asistencias
  ADD COLUMN IF NOT EXISTS vehiculo_id UUID,
  ADD COLUMN IF NOT EXISTS vehiculo_placas VARCHAR(64),
  ADD COLUMN IF NOT EXISTS gps_vehiculo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_vehiculo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_vehiculo_velocidad NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS gps_vehiculo_ignicion BOOLEAN,
  ADD COLUMN IF NOT EXISTS gps_vehiculo_direccion TEXT,
  ADD COLUMN IF NOT EXISTS gps_vehiculo_distancia_m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gps_vehiculo_alerta TEXT,
  ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_velocidad NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_distancia_m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_alerta TEXT,
  ADD COLUMN IF NOT EXISTS timestamp_entrada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timestamp_salida TIMESTAMPTZ;

-- Configuración de EPCOM GPS / Wialon en tabla `app_settings`
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS epcom_gps_api_url TEXT,
  ADD COLUMN IF NOT EXISTS epcom_gps_api_key TEXT;

-- Índices para búsqueda rápida por IMEI y por vehículo en asistencias
CREATE INDEX IF NOT EXISTS idx_vehiculos_gps_imei ON public.vehiculos(gps_imei);
CREATE INDEX IF NOT EXISTS idx_asistencias_vehiculo_id ON public.asistencias(vehiculo_id);

-- 3. Vinculación de cada vehículo del catálogo con su IMEI de EPCOM GPS (Ruptela ECO5 Lite)
UPDATE public.vehiculos SET gps_imei = '863003048289789' WHERE placas = 'EF9374B'; -- Chrysler Ram 12200 (2026) -> RAM 1200
UPDATE public.vehiculos SET gps_imei = '863238076455346' WHERE placas = 'DVZ878C'; -- Nissan March (2026) -> Inttec March 78
UPDATE public.vehiculos SET gps_imei = '863238076425067' WHERE placas = 'DVZ879C'; -- Nissan March (2026) -> Inttec March 79
UPDATE public.vehiculos SET gps_imei = '867553056692023' WHERE placas = 'DK3222A'; -- Peugeot Partner Carga (2016) -> Inttec P16
UPDATE public.vehiculos SET gps_imei = '866088078990718' WHERE placas = 'DV4384B'; -- Peugeot Partner Carga (2025) -> Inttec P25
UPDATE public.vehiculos SET gps_imei = NULL WHERE placas = 'EHN776B';              -- Auto propio Luly Chevrolet Sonic (Sin GPS)

