-- =========================================================================
-- AUTOMATIZACIÓN DIARIA DE SINCRONIZACIÓN CON EL SAT (6:00 AM)
-- =========================================================================
-- Este script programa un Cron Job en la base de datos de Supabase
-- para invocar la Edge Function 'sync-facturas-recibidas' todos los días
-- a las 6:00 AM (Hora Centro de México / 12:00 UTC).
--
-- Requisitos en Supabase: Extensiones 'pg_cron' y 'pg_net'.
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
  PERFORM cron.unschedule('sync-facturas-sat-diario-6am');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar si no existía el job previo
END $$;

-- 3. Crear el Cron Job para ejecutarse a las 12:00 UTC (06:00 AM Hora CDMX UTC-6)
-- Cron syntax: minuto hora dia_mes mes dia_semana
-- '0 12 * * *' = Todos los días a las 12:00:00 UTC (06:00 AM México)

SELECT cron.schedule(
  'sync-facturas-sat-diario-6am',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://etpdebclhaxbpbuwxdmy.supabase.co/functions/v1/sync-facturas-recibidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cGRlYmNsaGF4YnBidXd4ZG15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5Nzg0MywiZXhwIjoyMDk2MDczODQzfQ.g1vYd_BiKcoEdNrTnN-jyQpXp-zqIoIPNu73l389u9s',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cGRlYmNsaGF4YnBidXd4ZG15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5Nzg0MywiZXhwIjoyMDk2MDczODQzfQ.g1vYd_BiKcoEdNrTnN-jyQpXp-zqIoIPNu73l389u9s'
    ),
    body := jsonb_build_object('action', 'sync')
  ) AS request_id;
  $$
);

-- =========================================================================
-- CONSULTA PARA VERIFICAR LOS CRON JOBS ACTIVOS
-- =========================================================================
SELECT jobid, jobname, schedule, active FROM cron.job;
