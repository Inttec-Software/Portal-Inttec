#!/bin/bash
set -e

echo "[INIT] Inicializando roles y bases de datos para Inttec y Daravisa..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Crear o actualizar usuarios administradores
    DO \$\$
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
    \$\$;

    -- Roles auxiliares tipo Supabase (por compatibilidad si existen grants previos)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOLOGIN;
        END IF;
    END
    \$\$;
EOSQL

# Crear bases de datos si no existen
for db in inttec_test daravisa_test inttec_prod daravisa_prod; do
    owner="inttec_admin"
    if [[ "$db" == *"daravisa"* ]]; then
        owner="daravisa_admin"
    fi

    db_exists=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")
    if [ "$db_exists" != "1" ]; then
        echo "[INIT] Creando base de datos $db con propietario $owner..."
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE $db OWNER $owner;"
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $owner;"
    else
        echo "[INIT] Base de datos $db ya existe."
    fi
done

echo "[INIT] Roles y bases de datos inicializadas correctamente."
