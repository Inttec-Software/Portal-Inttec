<#
.SYNOPSIS
    Clona la base de datos de AWS Lightsail hacia el contenedor Docker PostgreSQL local vía SSH.
.DESCRIPTION
    Extrae la estructura y datos de 'inttec_test' y/o 'daravisa_test' (o prod) desde Lightsail
    utilizando el puerto SSH (22) sin requerir que el puerto 5432 esté expuesto públicamente.
.PARAMETER TargetEnv
    Ambiente remoto a clonar: 'test' (por defecto) o 'prod'.
.PARAMETER Company
    Compañía a clonar: 'all' (por defecto), 'inttec' o 'daravisa'.
.PARAMETER KeyPath
    Ruta a la llave SSH (.pem). Si no se proporciona, buscará en rutas comunes o solicitará la ruta.
.EXAMPLE
    .\scripts\pull-cloud-db.ps1
    .\scripts\pull-cloud-db.ps1 -TargetEnv prod
    .\scripts\pull-cloud-db.ps1 -KeyPath "C:\Users\Inttec\Downloads\Keys.pem"
#>

[CmdletBinding()]
param (
    [ValidateSet('test', 'prod')]
    [string]$TargetEnv = 'test',

    [ValidateSet('all', 'inttec', 'daravisa')]
    [string]$Company = 'all',

    [string]$KeyPath = '',

    [string]$HostIp = '18.219.193.155',
    [string]$SshUser = 'ubuntu'
)

$ErrorActionPreference = 'Continue'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Sincronizador de Base de Datos Nube -> Docker Local" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Ambiente objetivo : $TargetEnv" -ForegroundColor Yellow
Write-Host "Compañía          : $Company" -ForegroundColor Yellow
Write-Host "Servidor Remoto   : $SshUser@$HostIp" -ForegroundColor Yellow
Write-Host ""

# 1. Verificar si Docker está corriendo y el contenedor inttec_db_local está activo
Write-Host "[1/4] Verificando contenedor Docker local..." -ForegroundColor Gray
$containerStatus = docker inspect -f '{{.State.Running}}' inttec_db_local 2>$null

if ($containerStatus -ne "true") {
    Write-Host "  El contenedor 'inttec_db_local' no está en ejecución." -ForegroundColor Yellow
    Write-Host "  Levantando servicio db..." -ForegroundColor Gray
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        docker-compose up -d db
    } else {
        docker compose up -d db
    }
    Start-Sleep -Seconds 3
    
    $containerStatus = docker inspect -f '{{.State.Running}}' inttec_db_local 2>$null
    if ($containerStatus -ne "true") {
        Write-Error "No se pudo iniciar el contenedor PostgreSQL 'inttec_db_local'. Revisa Docker Desktop."
        exit 1
    }
}
Write-Host "  -> Contenedor 'inttec_db_local' listo y activo." -ForegroundColor Green

# 2. Localizar la llave SSH (.pem)
if (-not $KeyPath) {
    if ($env:LIGHTSAIL_SSH_KEY -and (Test-Path $env:LIGHTSAIL_SSH_KEY)) {
        $KeyPath = $env:LIGHTSAIL_SSH_KEY
    } else {
        # Buscar en ubicaciones conocidas: .ssh, Downloads, directorio actual
        $candidatePaths = @(
            (Join-Path $HOME "Downloads\LightsailDefaultKey-us-east-2.pem"),
            (Join-Path $HOME ".ssh\LightsailDefaultKey-us-east-2.pem"),
            (Join-Path $HOME "Downloads\lightsail.pem"),
            (Join-Path $HOME ".ssh\lightsail.pem")
        )
        
        foreach ($cand in $candidatePaths) {
            if (Test-Path $cand) {
                $KeyPath = $cand
                break
            }
        }

        if (-not $KeyPath) {
            $foundKeys = Get-ChildItem -Path (Join-Path $HOME "Downloads") -Filter "*.pem" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
            if (-not $foundKeys) {
                $foundKeys = Get-ChildItem -Path (Join-Path $HOME ".ssh") -Filter "*.pem" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
            }
            if ($foundKeys -and $foundKeys.Count -ge 1) {
                $KeyPath = $foundKeys[0]
            }
        }

        if ($KeyPath) {
            Write-Host "  -> Llave SSH detectada automáticamente: $KeyPath" -ForegroundColor Green
        } else {
            Write-Host ""
            $inputKey = Read-Host "Por favor introduce la ruta completa a tu archivo .pem de AWS"
            $KeyPath = $inputKey.Trim('"').Trim("'")
        }
    }
}

if (-not (Test-Path $KeyPath)) {
    Write-Error "No se encontró el archivo de llave SSH en: $KeyPath"
    exit 1
}

# Corregir permisos de Windows en el archivo .pem (Windows OpenSSH requiere permisos estrictos)
try {
    icacls $KeyPath /inheritance:r 2>$null | Out-Null
    icacls $KeyPath /grant:r "$($env:USERNAME):(R)" 2>$null | Out-Null
} catch {}

# 3. Determinar bases de datos a sincronizar
$companiesToSync = @()
if ($Company -eq 'all') {
    $companiesToSync = @('inttec', 'daravisa')
} else {
    $companiesToSync = @($Company)
}

# 4. Ejecutar sincronización vía SSH -> Docker
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($comp in $companiesToSync) {
    $dbName = "${comp}_${TargetEnv}"
    $dbUser = "${comp}_admin"

    Write-Host ""
    Write-Host "----------------------------------------------------------" -ForegroundColor Gray
    Write-Host "[2/4] Preparando base de datos local '$dbName'..." -ForegroundColor Cyan

    # Asegurar que el usuario administrador exista en PostgreSQL local
    docker exec -i inttec_db_local psql -U postgres -d postgres -c "CREATE ROLE $dbUser WITH LOGIN SUPERUSER PASSWORD '01_inTTec_db';" 2>$null

    # Asegurar que la base de datos exista en PostgreSQL local
    docker exec -i inttec_db_local psql -U postgres -d postgres -c "CREATE DATABASE $dbName OWNER $dbUser;" 2>$null
    docker exec -i inttec_db_local psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $dbName TO $dbUser;" 2>$null

    Write-Host "[3/4] Extrayendo '$dbName' desde Lightsail vía SSH..." -ForegroundColor Cyan
    Write-Host "      Esto puede tomar unos segundos dependiendo del tamaño de los datos..." -ForegroundColor Gray

    # Comando de volcado remoto (ejecutado como superusuario postgres para bypass de peer auth)
    $remoteDumpCmd = "sudo -u postgres pg_dump -d $dbName --clean --if-exists --no-owner --no-privileges"

    # Streaming SSH directo hacia docker psql local
    $sshCmd = "ssh -i `"$KeyPath`" -o IdentitiesOnly=yes -o PubkeyAcceptedKeyTypes=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa -o StrictHostKeyChecking=no -o ConnectTimeout=10 $SshUser@$HostIp `"$remoteDumpCmd`" | docker exec -i inttec_db_local psql -U postgres -d $dbName"

    cmd.exe /c $sshCmd

    Write-Host "  -> Base de datos '$dbName' procesada." -ForegroundColor Green

    # Contar tablas restauradas para verificación
    $tableCount = docker exec -i inttec_db_local psql -U postgres -d $dbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>$null
    if ($tableCount) {
        Write-Host "  -> Total de tablas restauradas en '$dbName': $($tableCount.Trim())" -ForegroundColor Cyan
    }
}

$stopwatch.Stop()
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Sincronización completada en $($stopwatch.Elapsed.TotalSeconds.ToString("F1")) segundos." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Visualizador Web CloudBeaver : http://localhost:8978" -ForegroundColor White
Write-Host "Host PostgreSQL Local        : localhost:5432" -ForegroundColor White
Write-Host "Bases disponibles            : $($companiesToSync.ForEach({"${_}_${TargetEnv}"}) -join ', ')" -ForegroundColor White
Write-Host ""
