-- =========================================================================
-- AUTOMATIZACIÓN DIARIA DE SINCRONIZACIÓN CON EL SAT - DARAVISA (6:00 AM)
-- =========================================================================
-- Este script programa un Cron Job en la base de datos de Daravisa en Supabase
-- para invocar la Edge Function 'sync-facturas-recibidas' todos los días
-- a las 6:00 AM (Hora Centro de México / 12:00 UTC).
-- =========================================================================

-- 1. Habilitar extensiones de Cron y llamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Otorgar permisos de ejecución a postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 2. Eliminar programación anterior si ya existía para evitar duplicados
DO $$
BEGIN
  PERFORM cron.unschedule('sync-facturas-sat-diario-6am-daravisa');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar si no existía el job previo
END $$;

-- 3. Crear el Cron Job para ejecutarse a las 12:00 UTC (06:00 AM Hora CDMX UTC-6)
SELECT cron.schedule(
  'sync-facturas-sat-diario-6am-daravisa',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lfekydsduqzpqafcglww.supabase.co/functions/v1/sync-facturas-recibidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmZWt5ZHNkdXF6cHFhZmNnbHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTI2NDIsImV4cCI6MjA5OTg2ODY0Mn0.6NaACpQ5-nKCP1oxdOTDT1suwEmbKLsXtsZulkR7xHI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmZWt5ZHNkdXF6cHFhZmNnbHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTI2NDIsImV4cCI6MjA5OTg2ODY0Mn0.6NaACpQ5-nKCP1oxdOTDT1suwEmbKLsXtsZulkR7xHI'
    ),
    body := jsonb_build_object('action', 'sync')
  ) AS request_id;
  $$
);

-- =========================================================================
-- CONSULTA PARA VERIFICAR LOS CRON JOBS ACTIVOS
-- =========================================================================
SELECT jobid, jobname, schedule, active FROM cron.job;
