-- =========================================================================
-- INICIALIZACIÓN DE ROLES Y BASES DE DATOS LOCALES
-- =========================================================================

-- 1. Crear roles administradores con permisos
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'inttec_admin') THEN
        CREATE ROLE inttec_admin WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';
    ELSE
        ALTER ROLE inttec_admin WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';
    END IF;

    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'daravisa_admin') THEN
        CREATE ROLE daravisa_admin WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';
    ELSE
        ALTER ROLE daravisa_admin WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';
    END IF;
END
$$;

-- 2. Crear las bases de datos para Inttec y Daravisa
SELECT 'CREATE DATABASE inttec_test OWNER inttec_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inttec_test')\gexec

SELECT 'CREATE DATABASE daravisa_test OWNER daravisa_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'daravisa_test')\gexec

SELECT 'CREATE DATABASE inttec_prod OWNER inttec_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inttec_prod')\gexec

SELECT 'CREATE DATABASE daravisa_prod OWNER daravisa_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'daravisa_prod')\gexec

GRANT ALL PRIVILEGES ON DATABASE inttec_test TO inttec_admin;
GRANT ALL PRIVILEGES ON DATABASE daravisa_test TO daravisa_admin;
GRANT ALL PRIVILEGES ON DATABASE inttec_prod TO inttec_admin;
GRANT ALL PRIVILEGES ON DATABASE daravisa_prod TO daravisa_admin;
