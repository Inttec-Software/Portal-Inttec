import { getDbPool } from '../config/database';

export interface EpcomGpsDevice {
  imei: string;
  name: string;
  plate_number?: string;
  lat: number;
  lng: number;
  speed: number;
  angle: number;
  ignition: boolean;
  battery_voltage?: number | null;
  address?: string | null;
  last_update: string;
  online: boolean;
  raw_model?: string;
}

export interface GpsConfig {
  apiUrl: string;
  apiKey: string;
  configured: boolean;
}

const schemaInitialized = new Set<string>();
let cachedDevices: { timestamp: number; devices: EpcomGpsDevice[]; source: 'EPCOM_LIVE' | 'WEBHOOK' | 'SIMULACION_DEMO' } | null = null;
const webhookDevicesMap = new Map<string, EpcomGpsDevice>();

/**
 * Calcula la distancia en metros entre dos coordenadas GPS (Fórmula de Haversine)
 */
export function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  const R = 6371000; // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Garantiza que las columnas de GPS existan en `vehiculos`, `asistencias` y `app_settings`
 */
export async function ensureGpsSchema(env: string = 'cloud'): Promise<void> {
  if (schemaInitialized.has(env)) return;

  const pools = [getDbPool('inttec', env as any), getDbPool('daravisa', env as any)];

  const queries = [
    `ALTER TABLE public.vehiculos
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
      ADD COLUMN IF NOT EXISTS conductores_hoy_fecha DATE;`,
    `ALTER TABLE public.asistencias
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
      ADD COLUMN IF NOT EXISTS gps_salida_vehiculo_alerta TEXT;`,
    `ALTER TABLE public.app_settings
      ADD COLUMN IF NOT EXISTS epcom_gps_api_url TEXT,
      ADD COLUMN IF NOT EXISTS epcom_gps_api_key TEXT;`
  ];

  for (const pool of pools) {
    for (const q of queries) {
      try {
        await pool.query(q);
      } catch (err: any) {
        // Ignorar si alguna tabla secundaria no existe en un entorno local
      }
    }
  }

  schemaInitialized.add(env);
}

/**
 * Obtiene la configuración de EPCOM GPS desde variables de entorno o `app_settings`
 */
export async function getGpsConfig(env: string = 'cloud'): Promise<GpsConfig> {
  await ensureGpsSchema(env);

  let apiUrl = (process.env.EPCOM_GPS_API_URL || '').trim();
  let apiKey = (process.env.EPCOM_GPS_API_KEY || '').trim();

  if (!apiKey) {
    try {
      const pool = getDbPool('inttec', env as any);
      const { rows } = await pool.query(
        'SELECT epcom_gps_api_url, epcom_gps_api_key FROM app_settings LIMIT 1'
      );
      if (rows.length > 0) {
        if (rows[0].epcom_gps_api_url) apiUrl = String(rows[0].epcom_gps_api_url).trim();
        if (rows[0].epcom_gps_api_key) apiKey = String(rows[0].epcom_gps_api_key).trim();
      }
    } catch {}
  }

  if (!apiUrl) {
    apiUrl = 'https://gps.epcom.net';
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey,
    configured: Boolean(apiKey && apiKey.length > 4),
  };
}

/**
 * Extrae únicamente el token limpio en caso de que el usuario pegue toda la URL o fragmentos como `&user_name=Inttec`
 */
export function sanitizeEpcomToken(rawInput: string): string {
  let str = (rawInput || '').trim();
  if (str.includes('access_token=')) {
    str = str.split('access_token=')[1] || str;
  }
  if (str.includes('&')) {
    str = str.split('&')[0] || str;
  }
  return str.trim();
}

/**
 * Guarda la configuración de EPCOM GPS en `app_settings` (Inttec y Daravisa)
 */
export async function saveGpsConfig(apiUrl: string, apiKey: string, env: string = 'cloud'): Promise<GpsConfig> {
  await ensureGpsSchema(env);
  const cleanUrl = (apiUrl || 'https://gps.epcom.net').trim().replace(/\/+$/, '');
  const cleanKey = sanitizeEpcomToken(apiKey);

  const pools = [getDbPool('inttec', env as any), getDbPool('daravisa', env as any)];
  for (const pool of pools) {
    try {
      const check = await pool.query('SELECT * FROM app_settings LIMIT 1');
      if (check.rows.length > 0) {
        await pool.query(
          'UPDATE app_settings SET epcom_gps_api_url = $1, epcom_gps_api_key = $2',
          [cleanUrl, cleanKey]
        );
      } else {
        await pool.query(
          'INSERT INTO app_settings (min_version_code, epcom_gps_api_url, epcom_gps_api_key) VALUES (1, $1, $2)',
          [cleanUrl, cleanKey]
        );
      }
    } catch (e: any) {
      console.warn('Error saving GPS config in pool:', e.message);
    }
  }

  cachedDevices = null;
  return {
    apiUrl: cleanUrl,
    apiKey: cleanKey,
    configured: Boolean(cleanKey.length > 4),
  };
}

/**
 * Parsea la respuesta estándar de EPCOM GPS / GPS-Server (`USER_GET_OBJECTS` / `OBJECT_GET_LOCATIONS`)
 * Compatible con parámetros telemáticos de Ruptela ECO5 Lite (`acc`, `io1`, `pwr_ext`, `batp`, etc.)
 */
function parseEpcomObjectsResponse(raw: any): EpcomGpsDevice[] {
  const result: EpcomGpsDevice[] = [];
  if (!raw) return result;

  // En GPS-Server / Epcom GPS / Wialon, soportar tanto array directo como respuesta { items: [...] } de Wialon
  const rawList = Array.isArray(raw?.items) ? raw.items : raw;
  const items: any[] = Array.isArray(rawList)
    ? rawList
    : typeof rawList === 'object' && rawList !== null
      ? Object.entries(rawList).map(([key, val]: [string, any]) => ({
          imei: val?.imei || val?.uid || key,
          ...(typeof val === 'object' ? val : {}),
        }))
      : [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const imei = String(item.uid || item.imei || item.id || item.device_id || '').trim();
    if (!imei) continue;

    const pos = item.pos || item.lmsg?.pos || {};
    const lat = Number(item.lat ?? item.latitude ?? pos.y ?? 0);
    const lng = Number(item.lng ?? item.lon ?? item.longitude ?? pos.x ?? 0);
    const speed = Number(item.speed ?? pos.s ?? 0);
    const angle = Number(item.angle ?? item.course ?? pos.c ?? 0);

    // Parámetros IO de Ruptela ECO5 Lite en Wialon (lmsg.p) o GPS-Server (params)
    const params = item.params || item.lmsg?.p || item.sensors || item.io || {};
    let ignition = false;
    if (typeof item.ignition === 'boolean') {
      ignition = item.ignition;
    } else if (params.engine_on !== undefined) {
      ignition = Number(params.engine_on) > 0;
    } else if (params.acc !== undefined) {
      ignition = String(params.acc) === '1' || params.acc === true;
    } else if (params.ignition !== undefined) {
      ignition = String(params.ignition) === '1' || params.ignition === true;
    } else if (params.io_1 !== undefined) {
      ignition = Number(params.io_1) > 0;
    } else if (params.io1 !== undefined) {
      ignition = Number(params.io1) > 0;
    } else if (params.in1 !== undefined) {
      ignition = Number(params.in1) > 0;
    } else if (params.di1 !== undefined) {
      ignition = Number(params.di1) > 0;
    } else if (speed > 3) {
      ignition = true;
    }

    // Voltaje batería externa (Ruptela reporta pwr_ext o io_29 en mV o V)
    let batteryV: number | null = null;
    const rawVolt =
      params.pwr_ext ?? params.power ?? params.ext_volt ?? params.io_29 ?? params.io29 ?? item.battery_voltage;
    if (rawVolt !== undefined && rawVolt !== null) {
      const numV = Number(rawVolt);
      if (!isNaN(numV) && numV > 0) {
        batteryV = numV > 100 ? Number((numV / 1000).toFixed(2)) : Number(numV.toFixed(2));
      }
    }

    const rawTime = item.dt_tracker || item.dt_server || pos.t || item.lmsg?.t || item.timestamp || item.last_update;
    const lastDate =
      typeof rawTime === 'number'
        ? new Date(rawTime < 10000000000 ? rawTime * 1000 : rawTime)
        : rawTime
          ? new Date(rawTime)
          : new Date();
    const isValidDate = !isNaN(lastDate.getTime());
    const diffMinutes = isValidDate ? (Date.now() - lastDate.getTime()) / 60000 : 0;

    result.push({
      imei,
      name: String(item.nm || item.name || item.plate_number || imei).trim(),
      plate_number: item.plate_number ? String(item.plate_number).trim() : undefined,
      lat,
      lng,
      speed: Math.max(0, Math.round(speed)),
      angle: Math.round(angle),
      ignition,
      battery_voltage: batteryV,
      address: item.address || item.location || null,
      last_update: isValidDate ? lastDate.toISOString() : new Date().toISOString(),
      online: item.netconn !== undefined ? Boolean(item.netconn) : diffMinutes < 30,
      raw_model: item.device || item.model || 'Ruptela ECO5 Lite',
    });
  }

  return result;
}

/**
 * Consulta la API de EPCOM GPS en vivo
 */
export async function fetchEpcomGpsDevices(env: string = 'cloud', forceRefresh = false): Promise<{
  devices: EpcomGpsDevice[];
  source: 'EPCOM_LIVE' | 'WEBHOOK' | 'SIMULACION_DEMO';
  configured: boolean;
  apiUrl: string;
  error?: string;
}> {
  if (!forceRefresh && cachedDevices && Date.now() - cachedDevices.timestamp < 12000) {
    const cfg = await getGpsConfig(env);
    return {
      devices: cachedDevices.devices,
      source: cachedDevices.source,
      configured: cfg.configured,
      apiUrl: cfg.apiUrl,
    };
  }

  const config = await getGpsConfig(env);

  // 1. Si hay API Key / Token configurado, consultar el servidor EPCOM GPS (Wialon Hosting o GPS-Server)
  if (config.configured) {
    try {
      let parsed: EpcomGpsDevice[] = [];
      const cleanToken = sanitizeEpcomToken(config.apiKey);

      // A) Intentar primero protocolo Wialon Remote API (EPCOM GPS plataforma Wialon - Token de 72 caracteres)
      const wialonHosts = [
        'https://hst-api.wialon.com',
        config.apiUrl.includes('http') ? config.apiUrl : `https://${config.apiUrl}`,
      ];

      for (const host of wialonHosts) {
        try {
          const ajaxUrl = host.endsWith('/wialon/ajax.html')
            ? host
            : `${host.replace(/\/+$/, '')}/wialon/ajax.html`;

          const loginRes = await fetch(
            `${ajaxUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token: cleanToken }))}`,
            { method: 'POST' }
          );
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            if (loginData && loginData.eid) {
              const sid = loginData.eid;
              // Buscar todas las unidades (avl_unit) con flags completos (nombre, uid/IMEI, última posición y parámetros IO Ruptela)
              const searchParams = {
                spec: {
                  itemsType: 'avl_unit',
                  propName: 'sys_name',
                  propValueMask: '*',
                  sortType: 'sys_name',
                },
                force: 1,
                flags: 4194304 + 1024 + 256 + 1, // lmsg + pos + uid + base
                from: 0,
                to: 0,
              };
              const unitsRes = await fetch(
                `${ajaxUrl}?svc=core/search_items&sid=${sid}&params=${encodeURIComponent(JSON.stringify(searchParams))}`,
                { method: 'POST' }
              );
              if (unitsRes.ok) {
                const unitsData = await unitsRes.json();
                parsed = parseEpcomObjectsResponse(unitsData);
                if (parsed.length > 0) break;
              }
            }
          }
        } catch {}
      }

      // B) Si no fue token Wialon, intentar endpoint GPS-Server / REST directo
      if (parsed.length === 0) {
        let targetUrl = config.apiUrl;
        if (!targetUrl.includes('api.php') && !targetUrl.includes('wialon')) {
          targetUrl = `${targetUrl}/api/api.php?api=user&ver=1.0&key=${encodeURIComponent(cleanToken)}&cmd=USER_GET_OBJECTS`;
        } else if (targetUrl.includes('api.php') && !targetUrl.includes('key=')) {
          const sep = targetUrl.includes('?') ? '&' : '?';
          targetUrl = `${targetUrl}${sep}api=user&ver=1.0&key=${encodeURIComponent(cleanToken)}&cmd=USER_GET_OBJECTS`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          parsed = parseEpcomObjectsResponse(data);
        }
      }

      if (parsed.length > 0) {
        webhookDevicesMap.forEach((wDev, imei) => {
          const idx = parsed.findIndex((d) => d.imei === imei);
          if (idx >= 0) parsed[idx] = wDev;
          else parsed.push(wDev);
        });

        cachedDevices = { timestamp: Date.now(), devices: parsed, source: 'EPCOM_LIVE' };
        return {
          devices: parsed,
          source: 'EPCOM_LIVE',
          configured: true,
          apiUrl: config.apiUrl,
        };
      }
    } catch (err: any) {
      console.warn('[EPCOM GPS] Error consultando API en vivo:', err.message);
      if (webhookDevicesMap.size > 0) {
        const list = Array.from(webhookDevicesMap.values());
        return {
          devices: list,
          source: 'WEBHOOK',
          configured: true,
          apiUrl: config.apiUrl,
          error: `Aviso API EPCOM: ${err.message}`,
        };
      }
    }
  }

  // 2. Si se han recibido datos vía Webhook directo
  if (webhookDevicesMap.size > 0) {
    const list = Array.from(webhookDevicesMap.values());
    cachedDevices = { timestamp: Date.now(), devices: list, source: 'WEBHOOK' };
    return {
      devices: list,
      source: 'WEBHOOK',
      configured: config.configured,
      apiUrl: config.apiUrl,
    };
  }

  // 3. Fallback: Modo Simulación / Demo para probar con las camionetas actuales de la base de datos
  return {
    devices: [],
    source: 'SIMULACION_DEMO',
    configured: config.configured,
    apiUrl: config.apiUrl,
  };
}

/**
 * Empareja inteligentemente un vehículo de la app (ej. "Chrysler Ram", placas "JM-1220")
 * con el objeto reportado en EPCOM GPS (ej. "Ram 1220")
 */
export function matchVehicleToGpsDevice(
  veh: any,
  devices: EpcomGpsDevice[],
  usedImeis?: Set<string>
): EpcomGpsDevice | undefined {
  if (!devices || devices.length === 0) return undefined;

  // Si es auto propio sin GPS (ej. "Auto propio Luly Chevrolet Sonic"), no emparejar
  const fullVehTitle = `${veh.marca || ''} ${veh.modelo || ''}`.toLowerCase();
  if (!veh.gps_imei && fullVehTitle.includes('auto propio')) {
    return undefined;
  }

  const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const avail = usedImeis ? devices.filter((d) => !usedImeis.has(d.imei)) : devices;

  // 1. Coincidencia exacta por IMEI o por nombre guardado en gps_imei
  if (veh.gps_imei) {
    const targetImei = norm(veh.gps_imei);
    const byImei = devices.find(
      (d) => norm(d.imei) === targetImei || norm(d.name) === targetImei
    );
    if (byImei) return byImei;
  }

  // 2. Regla Partner ("P16", "16 P", "P25" -> Peugeot Partner + últimos 2 dígitos del año)
  const anio2Digits = veh.anio ? String(veh.anio).slice(-2) : '';
  if (fullVehTitle.includes('partner') && anio2Digits) {
    const byPartnerYear = avail.find((d) => {
      const n = norm(d.name);
      return (n.includes(`p${anio2Digits}`) || n.includes(`${anio2Digits}p`)) && n.includes(anio2Digits);
    });
    if (byPartnerYear) return byPartnerYear;
  }

  // 3. Coincidencia por dígitos de las placas en el nombre del GPS (ej. "Inttec March 78" -> "DVZ878C", "Inttec March 79" -> "DVZ879C")
  const digitsInPlate = (veh.placas || '').replace(/[^0-9]/g, '');
  if (digitsInPlate && digitsInPlate.length >= 2) {
    const byPlateDigits = avail.find((d) => {
      const gpsDigits = (d.name || '').replace(/[^0-9]/g, '');
      if (!gpsDigits || gpsDigits.length < 2) return false;
      const matchesDigits = digitsInPlate.includes(gpsDigits) || gpsDigits.includes(digitsInPlate);
      if (!matchesDigits) return false;
      // Verificar también si coincide la palabra del modelo (ej. "march", "ram")
      const modelWord = (veh.modelo || '').toLowerCase().split(/\s+/)[0];
      if (modelWord && modelWord.length >= 3 && norm(d.name).includes(norm(modelWord))) {
        return true;
      }
      return gpsDigits.length >= 3;
    });
    if (byPlateDigits) return byPlateDigits;
  }

  // 4. Coincidencia por placas completas o número económico completo
  const cleanPlacas = norm(veh.placas);
  const cleanEco = norm(veh.numero_economico);
  if (cleanPlacas && cleanPlacas.length >= 3) {
    const byPlate = avail.find(
      (d) => norm(d.name).includes(cleanPlacas) || norm(d.plate_number).includes(cleanPlacas)
    );
    if (byPlate) return byPlate;
  }
  if (cleanEco && cleanEco.length >= 3 && !cleanEco.includes('cil')) {
    const byEco = avail.find((d) => norm(d.name).includes(cleanEco));
    if (byEco) return byEco;
  }

  // 5. Coincidencia por palabras clave de Modelo o Marca (ej. "Ram" en "Chrysler Ram 12200" vs "RAM 1200")
  const tokensVeh = `${veh.marca || ''} ${veh.modelo || ''}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !['auto', 'propio', 'camioneta', 'pickup', 'van', 'carga'].includes(t));

  if (tokensVeh.length > 0) {
    const byModelOrBrand = avail.find((d) => {
      const gpsWords = (d.name || '').toLowerCase().split(/[^a-z0-9]+/);
      return tokensVeh.some((tok) => gpsWords.includes(tok) || norm(d.name).includes(tok));
    });
    if (byModelOrBrand) return byModelOrBrand;
  }

  return undefined;
}

/**
 * Registra o actualiza la posición de un dispositivo recibido por Webhook (EPCOM GPS / Flespi / Traccar)
 */
export function registerWebhookGpsPayload(payload: any): EpcomGpsDevice[] {
  const items = Array.isArray(payload) ? payload : payload?.data ? (Array.isArray(payload.data) ? payload.data : [payload.data]) : [payload];
  const parsed = parseEpcomObjectsResponse(items);
  for (const dev of parsed) {
    webhookDevicesMap.set(dev.imei, dev);
  }
  cachedDevices = null;
  return parsed;
}

/**
 * Genera telemetría simulada realista ÚNICAMENTE para pruebas en modo demo
 * cuando NO hay ninguna cuenta de EPCOM GPS configurada.
 * NUNCA simula vehículos particulares sin GPS (como Auto propio Luly).
 */
export function buildSimulatedTelemetryForVehicles(vehiculos: any[]): Map<string, EpcomGpsDevice> {
  const simMap = new Map<string, EpcomGpsDevice>();

  // Filtrar estrictamente solo vehículos que tienen asignado un IMEI de GPS
  const vehiculosConGps = (vehiculos || []).filter(
    (v) => v.gps_imei && String(v.gps_imei).trim().length > 0
  );
  if (vehiculosConGps.length === 0) return simMap;

  // Coordenadas base en Chihuahua (zona operativa de Inttec)
  const basePoints = [
    { lat: 28.657972, lng: -106.118187, dir: 'Calle Camello, Col. Colonia Granjas, Chihuahua', speed: 0, ign: false },
    { lat: 28.635300, lng: -106.088900, dir: 'Av. Tecnológico, Chihuahua, Chih.', speed: 38, ign: true },
    { lat: 28.662100, lng: -106.105400, dir: 'Av. de las Industrias, Chihuahua, Chih.', speed: 45, ign: true },
    { lat: 28.648900, lng: -106.074300, dir: 'Av. Universidad, Chihuahua, Chih.', speed: 0, ign: true },
    { lat: 28.671200, lng: -106.124500, dir: 'Periférico de la Juventud, Chihuahua, Chih.', speed: 52, ign: true },
  ];

  const minuteTick = Math.floor(Date.now() / 15000);

  vehiculosConGps.forEach((v, idx) => {
    const preset = basePoints[idx % basePoints.length];
    const isMoving = preset.ign && preset.speed > 0;
    const deltaLat = isMoving ? ((minuteTick % 10) - 5) * 0.00035 : 0;
    const deltaLng = isMoving ? ((minuteTick % 10) - 5) * 0.00035 : 0;
    const imei = String(v.gps_imei).trim();

    simMap.set(v.id, {
      imei,
      name: `${v.marca} ${v.modelo} (${v.placas})`,
      plate_number: v.placas,
      lat: Number(((v.gps_lat || preset.lat) + deltaLat).toFixed(6)),
      lng: Number(((v.gps_lng || preset.lng) + deltaLng).toFixed(6)),
      speed: v.gps_velocidad ? Number(v.gps_velocidad) : preset.speed,
      angle: (idx * 65 + (minuteTick * 10)) % 360,
      ignition: v.gps_ignicion !== null && v.gps_ignicion !== undefined ? Boolean(v.gps_ignicion) : preset.ign,
      battery_voltage: preset.ign ? 14.1 : 12.6,
      address: v.gps_direccion || preset.dir,
      last_update: new Date().toISOString(),
      online: true,
      raw_model: 'Ruptela ECO5 Lite',
    });
  });

  return simMap;
}

export interface GpsRoutePoint {
  lat: number;
  lng: number;
  speed: number;
  angle: number;
  ignition: boolean;
  timestamp: number;
  hora: string;
}

export interface GpsRouteStop {
  id: string;
  letra: string;
  tipo: 'INICIO' | 'PARADA' | 'ACTUAL';
  lat: number;
  lng: number;
  direccion: string;
  hora_llegada: string;
  hora_salida: string;
  duracion_minutos: number;
  start_ts?: number;
  end_ts?: number;
}

export interface GpsRouteTrip {
  id: string;
  numero: number;
  tramo_label: string;
  desde_letra: string;
  hasta_letra: string;
  color: string;
  origen_direccion: string;
  destino_direccion: string;
  hora_inicio: string;
  hora_fin: string;
  duracion_minutos: number;
  distancia_km: number;
  velocidad_max_kmh: number;
  points: GpsRoutePoint[];
}

export interface GpsRouteHistoryResponse {
  imei: string;
  unit_name: string;
  fecha: string;
  distancia_total_km: number;
  velocidad_max_kmh: number;
  total_puntos: number;
  points: GpsRoutePoint[];
  stops: GpsRouteStop[];
  trips: GpsRouteTrip[];
}

const geocodeCache = new Map<string, string>();

/**
 * Obtiene el nombre de la calle y colonia a partir de coordenadas GPS con caché en memoria
 */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  if (!lat || !lng) return 'Ubicación desconocida';
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'PortalInttecFleetManager/1.0 (soporte@inttec.net)',
          'Accept-Language': 'es',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address || {};
      const road = addr.road || addr.pedestrian || addr.industrial || addr.suburb || '';
      const number = addr.house_number ? ` #${addr.house_number}` : '';
      const suburb = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';
      const city = addr.city || addr.town || addr.municipality || addr.state || '';

      const parts: string[] = [];
      if (road) parts.push(`${road}${number}`);
      if (suburb && suburb !== road) parts.push(`Col. ${suburb}`);
      if (city) parts.push(city);

      const formatted = parts.length > 0 ? parts.join(', ') : (data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      geocodeCache.set(cacheKey, formatted);
      return formatted;
    }
  } catch {}

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatHoraLocalChihuahua(unixSec: number): string {
  try {
    return new Date(unixSec * 1000).toLocaleTimeString('es-MX', {
      timeZone: 'America/Chihuahua',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(unixSec * 1000).toTimeString().slice(0, 5);
  }
}

/**
 * Consulta el historial de ruta (calles recorridas) y lugares/paradas donde estuvo una unidad en una fecha dada
 */
export async function fetchVehicleRouteHistory(
  imei: string,
  dateStr?: string,
  env: string = 'cloud'
): Promise<GpsRouteHistoryResponse> {
  const targetDateStr = dateStr || new Date().toISOString().split('T')[0];

  // Rango del día en horario de Chihuahua (UTC-6)
  const startUnix = Math.floor(new Date(`${targetDateStr}T00:00:00-06:00`).getTime() / 1000);
  const endUnix = Math.floor(new Date(`${targetDateStr}T23:59:59-06:00`).getTime() / 1000);

  const config = await getGpsConfig(env);
  const cleanToken = sanitizeEpcomToken(config.apiKey);

  let rawPoints: GpsRoutePoint[] = [];
  let unitName = imei;

  if (config.configured && cleanToken) {
    try {
      const ajaxUrl = 'https://hst-api.wialon.com/wialon/ajax.html';
      const loginRes = await fetch(
        `${ajaxUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token: cleanToken }))}`,
        { method: 'POST' }
      );
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        const sid = loginData?.eid;
        if (sid) {
          const searchParams = {
            spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
            force: 1,
            flags: 1025 + 256,
            from: 0,
            to: 0,
          };
          const unitsRes = await fetch(
            `${ajaxUrl}?svc=core/search_items&sid=${sid}&params=${encodeURIComponent(JSON.stringify(searchParams))}`,
            { method: 'POST' }
          );
          const unitsData = await unitsRes.json();
          const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const unit = (unitsData?.items || []).find(
            (u: any) => norm(String(u.uid)) === norm(imei) || norm(u.nm) === norm(imei)
          );

          if (unit) {
            unitName = unit.nm || imei;
            const msgParams = {
              itemId: unit.id,
              timeFrom: startUnix,
              timeTo: endUnix,
              flags: 0,
              flagsMask: 65280,
              loadCount: 3000,
            };
            const msgRes = await fetch(
              `${ajaxUrl}?svc=messages/load_interval&sid=${sid}&params=${encodeURIComponent(JSON.stringify(msgParams))}`,
              { method: 'POST' }
            );
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              const messages: any[] = msgData?.messages || [];
              for (const m of messages) {
                const lat = Number(m?.pos?.y || 0);
                const lng = Number(m?.pos?.x || 0);
                if (!lat || !lng) continue;
                const speed = Math.max(0, Math.round(Number(m?.pos?.s || 0)));
                const angle = Math.round(Number(m?.pos?.c || 0));
                const p = m?.p || {};
                const ignition =
                  p.engine_on !== undefined
                    ? Number(p.engine_on) > 0
                    : p.io_1 !== undefined
                      ? Number(p.io_1) > 0
                      : speed > 2;
                const ts = Number(m.t || 0);

                rawPoints.push({
                  lat,
                  lng,
                  speed,
                  angle,
                  ignition,
                  timestamp: ts,
                  hora: formatHoraLocalChihuahua(ts),
                });
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[EPCOM GPS Track] Error cargando historial:', err.message);
    }
  }

  // Ordenar cronológicamente
  rawPoints.sort((a, b) => a.timestamp - b.timestamp);

  // Calcular distancia total recorrida y velocidad máxima
  let totalDistMeters = 0;
  let maxSpeed = 0;
  for (let i = 0; i < rawPoints.length; i++) {
    if (rawPoints[i].speed > maxSpeed) maxSpeed = rawPoints[i].speed;
    if (i > 0) {
      const d = calculateDistanceMeters(
        rawPoints[i - 1].lat,
        rawPoints[i - 1].lng,
        rawPoints[i].lat,
        rawPoints[i].lng
      );
      // Ignorar saltos espurios menores a 15m cuando está estacionado
      if (d > 15 && d < 25000) {
        totalDistMeters += d;
      }
    }
  }

  // Detectar lugares / paradas donde estuvo la unidad (detenida >= 3 minutos en un radio de 75m)
  const rawStops: {
    tipo: 'INICIO' | 'PARADA' | 'ACTUAL';
    lat: number;
    lng: number;
    startTs: number;
    endTs: number;
  }[] = [];

  if (rawPoints.length > 0) {
    // 1. Punto de inicio del día
    const first = rawPoints[0];
    let clusterLat = first.lat;
    let clusterLng = first.lng;
    let clusterStart = first.timestamp;
    let clusterEnd = first.timestamp;

    for (let i = 1; i < rawPoints.length; i++) {
      const pt = rawPoints[i];
      const dist = calculateDistanceMeters(clusterLat, clusterLng, pt.lat, pt.lng);

      if (pt.speed <= 3 && dist <= 80) {
        clusterEnd = pt.timestamp;
      } else {
        const durationMin = Math.round((clusterEnd - clusterStart) / 60);
        if (durationMin >= 3 || rawStops.length === 0) {
          rawStops.push({
            tipo: rawStops.length === 0 ? 'INICIO' : 'PARADA',
            lat: clusterLat,
            lng: clusterLng,
            startTs: clusterStart,
            endTs: clusterEnd,
          });
        }
        clusterLat = pt.lat;
        clusterLng = pt.lng;
        clusterStart = pt.timestamp;
        clusterEnd = pt.timestamp;
      }
    }

    // Último punto / Posición actual
    const lastDurationMin = Math.round((clusterEnd - clusterStart) / 60);
    const lastPt = rawPoints[rawPoints.length - 1];
    const prevStop = rawStops[rawStops.length - 1];
    if (
      !prevStop ||
      calculateDistanceMeters(prevStop.lat, prevStop.lng, lastPt.lat, lastPt.lng) > 80
    ) {
      rawStops.push({
        tipo: 'ACTUAL',
        lat: lastPt.lat,
        lng: lastPt.lng,
        startTs: clusterStart,
        endTs: Math.max(clusterEnd, lastPt.timestamp),
      });
    } else if (prevStop) {
      prevStop.endTs = Math.max(prevStop.endTs, lastPt.timestamp);
      if (rawStops.length > 1) prevStop.tipo = 'ACTUAL';
    }
  }

  // Geocodificar las paradas detectadas (máximo 12 paradas principales para responder rápido)
  const limitedStops =
    rawStops.length <= 12
      ? rawStops
      : [
          rawStops[0],
          ...rawStops
            .slice(1, -1)
            .sort((a, b) => b.endTs - b.startTs - (a.endTs - a.startTs))
            .slice(0, 10)
            .sort((a, b) => a.startTs - b.startTs),
          rawStops[rawStops.length - 1],
        ];

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const tripColors = [
    '#2563eb', // Viaje 1 (A -> B): Azul intenso
    '#9333ea', // Viaje 2 (B -> C): Morado / Violeta
    '#ea580c', // Viaje 3 (C -> D): Naranja brillante
    '#059669', // Viaje 4 (D -> E): Verde esmeralda
    '#db2777', // Viaje 5 (E -> F): Rosa / Magenta
    '#0891b2', // Viaje 6 (F -> G): Turquesa / Cian
    '#d97706', // Viaje 7 (G -> H): Ámbar
    '#4f46e5', // Viaje 8 (H -> I): Índigo
    '#dc2626', // Viaje 9 (I -> J): Rojo
    '#0d9488', // Viaje 10 (J -> K): Teal
  ];

  const getStopLetter = (index: number): string => {
    if (index < alphabet.length) return alphabet[index];
    return `${alphabet[Math.floor(index / alphabet.length) - 1]}${alphabet[index % alphabet.length]}`;
  };

  const stops: GpsRouteStop[] = await Promise.all(
    limitedStops.map(async (s, idx) => {
      const direccion = await reverseGeocodeCoords(s.lat, s.lng);
      const durMin = Math.max(1, Math.round((s.endTs - s.startTs) / 60));
      return {
        id: `stop-${idx + 1}`,
        letra: getStopLetter(idx),
        tipo: s.tipo,
        lat: s.lat,
        lng: s.lng,
        direccion,
        hora_llegada: formatHoraLocalChihuahua(s.startTs),
        hora_salida: formatHoraLocalChihuahua(s.endTs),
        duracion_minutos: durMin,
        start_ts: s.startTs,
        end_ts: s.endTs,
      };
    })
  );

  // Construir los viajes (tramos A -> B, B -> C, etc.) cada uno con su propio color distinto
  const trips: GpsRouteTrip[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const stopFrom = stops[i];
    const stopTo = stops[i + 1];
    const fromEndTs = stopFrom.end_ts || 0;
    const toStartTs = stopTo.start_ts || Number.MAX_SAFE_INTEGER;

    // Puntos de movimiento ocurridos entre la salida de stopFrom y la llegada a stopTo
    const middlePts = rawPoints.filter((p) => p.timestamp >= fromEndTs && p.timestamp <= toStartTs);

    const startAnchor: GpsRoutePoint = {
      lat: stopFrom.lat,
      lng: stopFrom.lng,
      speed: 0,
      angle: 0,
      ignition: true,
      timestamp: fromEndTs,
      hora: stopFrom.hora_salida,
    };
    const endAnchor: GpsRoutePoint = {
      lat: stopTo.lat,
      lng: stopTo.lng,
      speed: 0,
      angle: 0,
      ignition: true,
      timestamp: toStartTs,
      hora: stopTo.hora_llegada,
    };

    const fullSegmentPoints = [startAnchor, ...middlePts, endAnchor];

    let segDistM = 0;
    let segMaxSpeed = 0;
    for (let k = 0; k < fullSegmentPoints.length; k++) {
      if (fullSegmentPoints[k].speed > segMaxSpeed) segMaxSpeed = fullSegmentPoints[k].speed;
      if (k > 0) {
        const d = calculateDistanceMeters(
          fullSegmentPoints[k - 1].lat,
          fullSegmentPoints[k - 1].lng,
          fullSegmentPoints[k].lat,
          fullSegmentPoints[k].lng
        );
        if (d > 10 && d < 25000) segDistM += d;
      }
    }

    // Muestrear puntos del tramo si son demasiados
    let sampledSegPts = fullSegmentPoints;
    if (fullSegmentPoints.length > 180) {
      const step = Math.ceil(fullSegmentPoints.length / 180);
      sampledSegPts = fullSegmentPoints.filter(
        (_, idx) => idx === 0 || idx === fullSegmentPoints.length - 1 || idx % step === 0
      );
    }

    const durTripMin = Math.max(1, Math.round((toStartTs - fromEndTs) / 60));

    trips.push({
      id: `trip-${i + 1}`,
      numero: i + 1,
      tramo_label: `${stopFrom.letra} → ${stopTo.letra}`,
      desde_letra: stopFrom.letra,
      hasta_letra: stopTo.letra,
      color: tripColors[i % tripColors.length],
      origen_direccion: stopFrom.direccion,
      destino_direccion: stopTo.direccion,
      hora_inicio: stopFrom.hora_salida,
      hora_fin: stopTo.hora_llegada,
      duracion_minutos: durTripMin,
      distancia_km: Number((segDistM / 1000).toFixed(2)),
      velocidad_max_kmh: segMaxSpeed,
      points: sampledSegPts,
    });
  }

  // Reducir puntos globales si son demasiados para que el mapa sea ligero (máx 450 puntos manteniendo forma exacta de calles)
  let sampledPoints = rawPoints;
  if (rawPoints.length > 450) {
    const step = Math.ceil(rawPoints.length / 450);
    sampledPoints = rawPoints.filter((_, idx) => idx === 0 || idx === rawPoints.length - 1 || idx % step === 0);
  }

  return {
    imei,
    unit_name: unitName,
    fecha: targetDateStr,
    distancia_total_km: Number((totalDistMeters / 1000).toFixed(2)),
    velocidad_max_kmh: maxSpeed,
    total_puntos: rawPoints.length,
    points: sampledPoints,
    stops,
    trips,
  };
}

export interface FleetSnapshotUnit {
  vehiculo_id: string;
  marca: string;
  modelo: string;
  placas: string;
  gps_imei?: string | null;
  gps_nombre?: string | null;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  ignicion: boolean;
  bateria_v?: number | null;
  direccion?: string | null;
  hora_reporte?: string | null;
  timestamp?: number | null;
  diferencia_minutos?: number | null;
  distancia_empleado_m?: number | null;
  es_vehiculo_asignado: boolean;
  estado_verificacion: 'EN_MOVIMIENTO' | 'CERCA_EMPLEADO' | 'LEJOS_EMPLEADO' | 'ESTACIONADA' | 'SIN_SENAL';
  badge_color: 'verde' | 'azul' | 'rojo' | 'gris';
  motivo_estado: string;
}

export interface FleetSnapshotResponse {
  fecha: string;
  hora_objetivo: string;
  target_timestamp: number;
  empleado_nombre?: string | null;
  tipo_checada?: 'Entrada' | 'Salida';
  empleado_lat?: number | null;
  empleado_lng?: number | null;
  empleado_direccion?: string | null;
  empleado_gps_activo: boolean;
  empleado_en_oficina?: boolean;
  vehiculo_asignado_id?: string | null;
  vehiculo_asignado_placas?: string | null;
  unidades: FleetSnapshotUnit[];
  resumen: {
    total_unidades: number;
    en_movimiento: number;
    estacionadas: number;
    cerca_empleado: number;
    sin_senal: number;
    alerta_principal?: string | null;
  };
}

/**
 * Consulta la ubicación y telemetría histórica de las 5 unidades GPS en el minuto exacto
 * en que un empleado checó Entrada o Salida (hoy o días pasados).
 */
export async function fetchFleetSnapshotAtTime(params: {
  fecha: string;
  hora: string;
  empleadoLat?: number | null;
  empleadoLng?: number | null;
  empleadoNombre?: string | null;
  empleadoDireccion?: string | null;
  tipoChecada?: 'Entrada' | 'Salida';
  vehiculoAsignadoId?: string | null;
  env?: string;
}): Promise<FleetSnapshotResponse> {
  const {
    fecha,
    hora,
    empleadoLat,
    empleadoLng,
    empleadoNombre,
    empleadoDireccion,
    tipoChecada = 'Entrada',
    vehiculoAsignadoId,
    env = 'cloud',
  } = params;

  // 1. Limpiar y calcular timestamp exacto en hora local Chihuahua (UTC-6)
  const cleanFecha = (fecha || '').split('T')[0].trim() || new Date().toISOString().split('T')[0];
  let cleanH = (hora || '08:00:00').trim();
  cleanH = cleanH.replace(/([+-]\d{2}(:\d{2})?)|Z$/g, '').trim();
  if (cleanH.includes('T')) {
    cleanH = cleanH.split('T')[1].replace(/([+-]\d{2}(:\d{2})?)|Z$/g, '').trim();
  }
  const parts = cleanH.split(':').map((p) => parseInt(p, 10));
  const hh = isNaN(parts[0]) ? 8 : parts[0];
  const mm = isNaN(parts[1]) ? 0 : parts[1];
  const ss = isNaN(parts[2]) ? 0 : parts[2];
  const formattedHora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const d = new Date(`${cleanFecha}T${formattedHora}-06:00`);
  const targetTs = isNaN(d.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);

  const poolInttec = getDbPool('inttec', env as any);

  let resolvedDireccion = empleadoDireccion || null;

  // Si no se proporcionó dirección explícita, consultar en la BD la checada real de ese empleado en esa fecha
  if (!resolvedDireccion && empleadoNombre) {
    try {
      const aCheck = await poolInttec.query(
        `SELECT a.direccion_entrada, a.direccion_salida, a.latitud_entrada, a.longitud_entrada
         FROM asistencias a
         JOIN usuarios u ON u.id = a.empleado_id
         WHERE u.nombre ILIKE $1 AND a.fecha = $2
         ORDER BY a.id DESC LIMIT 1`,
        [`%${empleadoNombre}%`, cleanFecha]
      );
      if (aCheck.rows.length > 0) {
        resolvedDireccion = tipoChecada === 'Salida'
          ? (aCheck.rows[0].direccion_salida || aCheck.rows[0].direccion_entrada)
          : (aCheck.rows[0].direccion_entrada || aCheck.rows[0].direccion_salida);
      }
    } catch {}
  }

  const rawDir = (resolvedDireccion || '').trim().toLowerCase();
  const esChecadaOficina =
    rawDir.includes('minmoe') ||
    rawDir.includes('checador f') ||
    rawDir.includes('checador de oficina') ||
    rawDir.includes('checador oficina') ||
    rawDir.includes('terminal') ||
    rawDir.includes('oficina') ||
    rawDir.includes('hikvision') ||
    rawDir.includes('facial');

  // Coordenadas base de Oficinas Matriz Inttec Chihuahua (Av. José María Mata / Col. Granjas)
  const OFICINA_INTTEC_LAT = 28.6508;
  const OFICINA_INTTEC_LNG = -106.0955;

  const empHasGps = !!(
    typeof empleadoLat === 'number' &&
    typeof empleadoLng === 'number' &&
    Math.abs(empleadoLat) > 0.1 &&
    Math.abs(empleadoLng) > 0.1
  );

  // Coordenadas de referencia para medir distancias de la flota:
  // Si el empleado transmitió GPS se usa su GPS; si checó en checador de oficina se usan las coordenadas de la oficina
  const refLat = empHasGps ? Number(empleadoLat) : (esChecadaOficina ? OFICINA_INTTEC_LAT : null);
  const refLng = empHasGps ? Number(empleadoLng) : (esChecadaOficina ? OFICINA_INTTEC_LNG : null);
  const hasRefCoords = refLat !== null && refLng !== null;

  // 2. Obtener lista de vehículos activos que CUENTAN con localizador GPS instalado
  let vehiculos: any[] = [];
  let vehAsignado: any = null;

  try {
    const vRes = await poolInttec.query(
      `SELECT id, marca, modelo, placas, gps_imei, conductores_hoy_ids 
       FROM vehiculos 
       WHERE activo = true 
         AND gps_imei IS NOT NULL 
         AND TRIM(gps_imei) != '' 
       ORDER BY placas ASC`
    );
    vehiculos = vRes.rows || [];

    if (vehiculoAsignadoId) {
      const aRes = await poolInttec.query(
        'SELECT id, marca, modelo, placas, gps_imei FROM vehiculos WHERE id = $1 LIMIT 1',
        [vehiculoAsignadoId]
      );
      vehAsignado = aRes.rows[0] || null;
    }
  } catch (err: any) {
    console.warn('[FleetSnapshot] Error leyendo vehiculos:', err.message);
  }

  // 3. Conexión con Wialon Remote API
  const config = await getGpsConfig(env);
  const cleanToken = sanitizeEpcomToken(config.apiKey);

  const unitsSnapshot: FleetSnapshotUnit[] = [];
  const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let wialonSid: string | null = null;
  let wialonItems: any[] = [];

  if (config.configured && cleanToken) {
    try {
      const ajaxUrl = 'https://hst-api.wialon.com/wialon/ajax.html';
      const loginRes = await fetch(
        `${ajaxUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token: cleanToken }))}`,
        { method: 'POST' }
      );
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        if (loginData?.eid) {
          wialonSid = loginData.eid;
          const searchParams = {
            spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
            force: 1,
            flags: 1025 + 256,
            from: 0,
            to: 0,
          };
          const uRes = await fetch(
            `${ajaxUrl}?svc=core/search_items&sid=${wialonSid}&params=${encodeURIComponent(JSON.stringify(searchParams))}`,
            { method: 'POST' }
          );
          if (uRes.ok) {
            const uData = await uRes.json();
            wialonItems = uData?.items || [];
          }
        }
      }
    } catch (wialonErr: any) {
      console.warn('[FleetSnapshot] Error conectando con Wialon:', wialonErr.message);
    }
  }

  // Solo en modo demo sin conexión configurada se genera simulación local; con Wialon activo NUNCA se inventan datos
  const simMap = config.configured
    ? new Map<string, EpcomGpsDevice>()
    : buildSimulatedTelemetryForVehicles(vehiculos);

  // 4. Procesar cada vehículo
  for (const v of vehiculos) {
    const isAsignado = v.id === vehiculoAsignadoId;
    let lat: number | null = null;
    let lng: number | null = null;
    let speed = 0;
    let ignition = false;
    let batteryV: number | null = null;
    let horaReporte: string | null = null;
    let msgTs: number | null = null;
    let gpsNombre: string | null = null;

    if (wialonSid && wialonItems.length > 0 && v.gps_imei) {
      const imeiNorm = norm(v.gps_imei);
      const placasNorm = norm(v.placas);
      const wUnit = wialonItems.find(
        (u: any) =>
          norm(String(u.uid)) === imeiNorm ||
          norm(u.nm) === imeiNorm ||
          (placasNorm.length >= 4 && norm(u.nm).includes(placasNorm))
      );

      if (wUnit) {
        gpsNombre = wUnit.nm;
        try {
          const ajaxUrl = 'https://hst-api.wialon.com/wialon/ajax.html';
          // Ventana de 30 min (±15 min)
          let msgParams = {
            itemId: wUnit.id,
            timeFrom: targetTs - 1800,
            timeTo: targetTs + 1800,
            flags: 0,
            flagsMask: 65280,
            loadCount: 40,
          };
          let mRes = await fetch(
            `${ajaxUrl}?svc=messages/load_interval&sid=${wialonSid}&params=${encodeURIComponent(JSON.stringify(msgParams))}`,
            { method: 'POST' }
          );
          let mData = mRes.ok ? await mRes.json() : null;

          // Si no hay mensajes en ±15 min (ej. camioneta estacionada toda la noche), ampliar a 6 horas antes
          if (!mData?.messages || mData.messages.length === 0) {
            msgParams = {
              itemId: wUnit.id,
              timeFrom: Math.max(0, targetTs - 21600),
              timeTo: targetTs + 1800,
              flags: 0,
              flagsMask: 65280,
              loadCount: 40,
            };
            mRes = await fetch(
              `${ajaxUrl}?svc=messages/load_interval&sid=${wialonSid}&params=${encodeURIComponent(JSON.stringify(msgParams))}`,
              { method: 'POST' }
            );
            mData = mRes.ok ? await mRes.json() : null;
          }

          if (mData?.messages && mData.messages.length > 0) {
            // Encontrar el mensaje más cercano al instante objetivo
            let bestMsg = mData.messages[0];
            let minDiff = Math.abs(bestMsg.t - targetTs);
            for (const m of mData.messages) {
              const diff = Math.abs(m.t - targetTs);
              if (diff < minDiff) {
                minDiff = diff;
                bestMsg = m;
              }
            }

            lat = Number(bestMsg?.pos?.y || 0);
            lng = Number(bestMsg?.pos?.x || 0);
            speed = Math.max(0, Math.round(Number(bestMsg?.pos?.s || 0)));
            const p = bestMsg?.p || {};
            ignition =
              p.engine_on !== undefined
                ? Number(p.engine_on) > 0
                : p.io_1 !== undefined
                  ? Number(p.io_1) > 0
                  : speed > 2;

            const rawVolt = p.power ?? p.pwr_ext ?? p.battery ?? p.io_29;
            if (rawVolt !== undefined) {
              const numV = Number(rawVolt);
              if (!isNaN(numV) && numV > 0) {
                batteryV = numV > 100 ? Number((numV / 1000).toFixed(2)) : Number(numV.toFixed(2));
              }
            }

            msgTs = Number(bestMsg.t || 0);
            horaReporte = formatHoraLocalChihuahua(msgTs);
          } else if (wUnit.pos && wUnit.pos.y && wUnit.pos.x) {
            // Posición de referencia de la unidad si no hubo mensajes en el rango
            lat = Number(wUnit.pos.y);
            lng = Number(wUnit.pos.x);
            speed = Math.max(0, Math.round(Number(wUnit.pos.s || 0)));
            msgTs = Number(wUnit.pos.t || targetTs);
            horaReporte = formatHoraLocalChihuahua(msgTs);
          }
        } catch (fetchErr: any) {
          console.warn(`[FleetSnapshot] Error cargando mensajes unidad ${v.placas}:`, fetchErr.message);
        }
      }
    }

    // Si aún no tiene posición y no hay GPS real configurado, usar simulación demo
    if (!config.configured && (!lat || !lng) && simMap.has(v.id)) {
      const sim = simMap.get(v.id)!;
      lat = sim.lat;
      lng = sim.lng;
      speed = sim.speed;
      ignition = sim.ignition;
      batteryV = sim.battery_voltage || null;
      horaReporte = formattedHora;
      msgTs = targetTs;
      gpsNombre = sim.name;
    }

    // Geocodificación inversa para dirección legible
    let direccion: string | null = null;
    if (lat && lng) {
      try {
        direccion = await reverseGeocodeCoords(lat, lng);
      } catch {
        direccion = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    }

    // Calcular distancia al empleado o a la oficina
    let distM: number | null = null;
    if (hasRefCoords && lat && lng) {
      distM = calculateDistanceMeters(refLat, refLng, lat, lng);
    }

    // Diferencia en minutos
    const diffMin = msgTs ? Math.round(Math.abs(msgTs - targetTs) / 60) : null;

    // Clasificar estado y motivo
    let estado: 'EN_MOVIMIENTO' | 'CERCA_EMPLEADO' | 'LEJOS_EMPLEADO' | 'ESTACIONADA' | 'SIN_SENAL' = 'SIN_SENAL';
    let badgeColor: 'verde' | 'azul' | 'rojo' | 'gris' = 'gris';
    let motivo = 'Sin señal en ese rango';

    const refLabel = esChecadaOficina ? 'la oficina' : 'el empleado';

    if (lat && lng) {
      if (speed > 10) {
        estado = 'EN_MOVIMIENTO';
        badgeColor = 'verde';
        motivo = `En movimiento (${speed} km/h)`;
      } else if (hasRefCoords && distM !== null && distM <= 250) {
        estado = 'CERCA_EMPLEADO';
        badgeColor = 'azul';
        motivo = esChecadaOficina
          ? `En la oficina (${distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`})`
          : `Junto al empleado (${distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`})`;
      } else if (hasRefCoords && distM !== null && distM > 350) {
        estado = 'LEJOS_EMPLEADO';
        badgeColor = isAsignado ? 'rojo' : 'gris';
        motivo = `A ${(distM / 1000).toFixed(1)} km de ${refLabel}`;
      } else if (ignition) {
        estado = 'ESTACIONADA';
        badgeColor = 'azul';
        motivo = 'Motor encendido (detenida)';
      } else {
        estado = 'ESTACIONADA';
        badgeColor = 'gris';
        motivo = 'Estacionada / Motor apagado';
      }
    }

    unitsSnapshot.push({
      vehiculo_id: v.id,
      marca: v.marca,
      modelo: v.modelo,
      placas: v.placas,
      gps_imei: v.gps_imei,
      gps_nombre: gpsNombre || `${v.marca} ${v.modelo}`,
      lat,
      lng,
      velocidad: speed,
      ignicion: ignition,
      bateria_v: batteryV,
      direccion,
      hora_reporte: horaReporte,
      timestamp: msgTs,
      diferencia_minutos: diffMin,
      distancia_empleado_m: distM,
      es_vehiculo_asignado: isAsignado,
      estado_verificacion: estado,
      badge_color: badgeColor,
      motivo_estado: motivo,
    });
  }

  // 5. Ordenar unidades: Vehículo asignado primero, luego las más cercanas al empleado/oficina o en movimiento
  unitsSnapshot.sort((a, b) => {
    if (a.es_vehiculo_asignado && !b.es_vehiculo_asignado) return -1;
    if (!a.es_vehiculo_asignado && b.es_vehiculo_asignado) return 1;
    if (typeof a.distancia_empleado_m === 'number' && typeof b.distancia_empleado_m === 'number') {
      return a.distancia_empleado_m - b.distancia_empleado_m;
    }
    if (a.velocidad > 0 && b.velocidad === 0) return -1;
    if (a.velocidad === 0 && b.velocidad > 0) return 1;
    return 0;
  });

  // 6. Generar resumen y alertas ejecutivas
  const movingCount = unitsSnapshot.filter((u) => u.velocidad > 10).length;
  const cercaCount = unitsSnapshot.filter((u) => typeof u.distancia_empleado_m === 'number' && u.distancia_empleado_m <= 300).length;
  const estacionadasCount = unitsSnapshot.filter((u) => u.lat && u.velocidad <= 10).length;
  const sinSenalCount = unitsSnapshot.filter((u) => !u.lat).length;

  let alertaPrincipal: string | null = null;
  if (esChecadaOficina) {
    // Es checada en el checador físico de la oficina: NO alertar celular apagado porque la checada es presencial
    if (vehAsignado && vehAsignado.gps_imei && String(vehAsignado.gps_imei).trim()) {
      const assignedSnapshot = unitsSnapshot.find((u) => u.es_vehiculo_asignado);
      if (assignedSnapshot) {
        if (assignedSnapshot.velocidad > 10) {
          alertaPrincipal = `🚨 La camioneta asignada (${assignedSnapshot.placas}) iba en movimiento a ${assignedSnapshot.velocidad} km/h al checar en oficina.`;
        } else if (typeof assignedSnapshot.distancia_empleado_m === 'number' && assignedSnapshot.distancia_empleado_m > 500) {
          alertaPrincipal = `📍 El empleado checó en la oficina pero la camioneta asignada (${assignedSnapshot.placas}) estaba a ${(assignedSnapshot.distancia_empleado_m / 1000).toFixed(2)} km de la oficina.`;
        }
      }
    }
  } else if (!empHasGps) {
    alertaPrincipal = '⚠️ El empleado checó con la ubicación de su celular apagada.';
    if (movingCount > 0) {
      alertaPrincipal += ` Hay ${movingCount} camioneta(s) en movimiento a esa hora.`;
    }
  } else if (vehAsignado) {
    if (!vehAsignado.gps_imei || !String(vehAsignado.gps_imei).trim()) {
      alertaPrincipal = `ℹ️ El empleado indicó que utilizó vehículo particular/propio (${vehAsignado.marca} ${vehAsignado.modelo} ${vehAsignado.placas}), el cual no cuenta con localizador GPS instalado.`;
    } else {
      const assignedSnapshot = unitsSnapshot.find((u) => u.es_vehiculo_asignado);
      if (assignedSnapshot) {
        if (assignedSnapshot.velocidad > 10) {
          alertaPrincipal = `🚨 La camioneta asignada (${assignedSnapshot.placas}) iba en movimiento a ${assignedSnapshot.velocidad} km/h al momento de la checada.`;
        } else if (typeof assignedSnapshot.distancia_empleado_m === 'number' && assignedSnapshot.distancia_empleado_m > 350) {
          alertaPrincipal = `📍 El empleado estaba a ${(assignedSnapshot.distancia_empleado_m / 1000).toFixed(2)} km de la camioneta asignada (${assignedSnapshot.placas}).`;
        }
      }
    }
  }

  return {
    fecha: cleanFecha,
    hora_objetivo: formattedHora,
    target_timestamp: targetTs,
    empleado_nombre: empleadoNombre || null,
    tipo_checada: tipoChecada,
    empleado_lat: refLat,
    empleado_lng: refLng,
    empleado_direccion: esChecadaOficina
      ? (resolvedDireccion || 'Checador Físico de Oficina (MinMoe)')
      : (resolvedDireccion || (empHasGps ? null : 'Ubicación apagada en el celular')),
    empleado_gps_activo: empHasGps,
    empleado_en_oficina: esChecadaOficina,
    vehiculo_asignado_id: vehAsignado?.id || null,
    vehiculo_asignado_placas: vehAsignado ? `${vehAsignado.marca} ${vehAsignado.modelo} (${vehAsignado.placas})` : null,
    unidades: unitsSnapshot,
    resumen: {
      total_unidades: unitsSnapshot.length,
      en_movimiento: movingCount,
      estacionadas: estacionadasCount,
      cerca_empleado: cercaCount,
      sin_senal: sinSenalCount,
      alerta_principal: alertaPrincipal,
    },
  };
}
