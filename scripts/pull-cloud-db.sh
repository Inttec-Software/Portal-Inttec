#!/usr/bin/env bash
set -eo pipefail

TARGET_ENV="${1:-test}"
COMPANY="${2:-all}"
KEY_PATH="${3:-$LIGHTSAIL_SSH_KEY}"
HOST_IP="${HOST_IP:-18.219.193.155}"
SSH_USER="${SSH_USER:-ubuntu}"

echo "=========================================================="
echo " Sincronizador de Base de Datos Nube -> Docker Local"
echo "=========================================================="
echo "Ambiente objetivo : $TARGET_ENV"
echo "Compañía          : $COMPANY"
echo "Servidor Remoto   : $SSH_USER@$HOST_IP"
echo ""

# 1. Verificar contenedor Docker
if ! docker ps --format '{{.Names}}' | grep -q "^inttec_db_local$"; then
    echo "[1/4] Contenedor 'inttec_db_local' no está corriendo. Iniciando..."
    if command -v docker-compose &>/dev/null; then
        docker-compose up -d db
    else
        docker compose up -d db
    fi
    sleep 3
fi
echo "[1/4] Contenedor 'inttec_db_local' activo."

# 2. Localizar llave SSH
if [ -z "$KEY_PATH" ]; then
    CANDIDATES=(
        "$HOME/Downloads/LightsailDefaultKey-us-east-2.pem"
        "$HOME/.ssh/LightsailDefaultKey-us-east-2.pem"
        "$HOME/Downloads/lightsail.pem"
        "$HOME/.ssh/lightsail.pem"
        "$HOME/Downloads/Keys.pem"
    )

    for cand in "${CANDIDATES[@]}"; do
        if [ -f "$cand" ]; then
            KEY_PATH="$cand"
            break
        fi
    done

    if [ -z "$KEY_PATH" ]; then
        FOUND_KEY=$(find "$HOME/Downloads" "$HOME/.ssh" . -maxdepth 2 -name "*.pem" 2>/dev/null | head -n 1 || true)
        if [ -n "$FOUND_KEY" ]; then
            KEY_PATH="$FOUND_KEY"
        fi
    fi

    if [ -n "$KEY_PATH" ]; then
        echo "[2/4] Llave SSH detectada automáticamente: $KEY_PATH"
    else
        read -rp "Introduce la ruta a tu archivo .pem de AWS: " KEY_PATH
    fi
fi

if [ ! -f "$KEY_PATH" ]; then
    echo "Error: Llave SSH no encontrada en: $KEY_PATH" >&2
    exit 1
fi

# En Linux/Fedora SSH exige permisos 600 en la llave
chmod 600 "$KEY_PATH" 2>/dev/null || true

# 3. Determinar compañías
COMPANIES=()
if [ "$COMPANY" == "all" ]; then
    COMPANIES=("inttec" "daravisa")
else
    COMPANIES=("$COMPANY")
fi

# 4. Sincronización
for COMP in "${COMPANIES[@]}"; do
    DB_NAME="${COMP}_${TARGET_ENV}"
    DB_USER="${COMP}_admin"

    echo ""
    echo "----------------------------------------------------------"
    echo "[3/4] Preparando base local '$DB_NAME'..."

    docker exec -i inttec_db_local psql -U postgres -d postgres -c "CREATE ROLE $DB_USER WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';" >/dev/null 2>&1 || true
    docker exec -i inttec_db_local psql -U postgres -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null 2>&1 || true
    docker exec -i inttec_db_local psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" >/dev/null 2>&1 || true

    echo "[4/4] Extrayendo '$DB_NAME' desde Lightsail vía SSH..."
    ssh -i "$KEY_PATH" -o IdentitiesOnly=yes -o PubkeyAcceptedKeyTypes=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SSH_USER@$HOST_IP" \
        "sudo -u postgres pg_dump -d $DB_NAME --clean --if-exists --no-owner --no-privileges" \
        | docker exec -i inttec_db_local psql -U postgres -d "$DB_NAME" || true

    TABLE_COUNT=$(docker exec -i inttec_db_local psql -U postgres -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")
    echo "  -> Base de datos '$DB_NAME' lista. Tablas restauradas: $TABLE_COUNT"
done

echo ""
echo "=========================================================="
echo " Sincronización completada con éxito."
echo "=========================================================="
echo "Visualizador Web CloudBeaver : http://localhost:8978"
echo "Host PostgreSQL Local        : localhost:5432"
echo "Bases disponibles            : $(IFS=', '; echo "${COMPANIES[*]/%/_$TARGET_ENV}")"
echo ""
