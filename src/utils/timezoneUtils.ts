/**
 * Utilidades para manejo de múltiples zonas horarias en México y el extranjero
 * Estados con husos horarios distintos:
 * - Zona Noroeste (Baja California / Tijuana): America/Tijuana
 * - Zona Pacífico (Sonora / Hermosillo): America/Hermosillo
 * - Zona Montaña/Pacífico (BCS, Sinaloa, Nayarit, Chihuahua): America/Mazatlan, America/Chihuahua
 * - Zona Sureste (Quintana Roo / Cancún): America/Cancun
 * - Zona Centro (CDMX, Monterrey, Guadalajara, mayoría de México): America/Mexico_City
 * - Internacional (ej. España): Europe/Madrid
 */

export const COMPANY_BASE_TIMEZONE = 'America/Mexico_City';

export const KNOWN_TIMEZONES = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Merida',
  'America/Tijuana',
  'America/Hermosillo',
  'America/Mazatlan',
  'America/Chihuahua',
  'America/Ciudad_Juarez',
  'America/Cancun',
  'Europe/Madrid',
] as const;

export interface TimezoneBadgeInfo {
  label: string;
  diffText: string;
  fullText: string;
  color: string;
  bgColor: string;
}

/**
 * Detecta la zona horaria del usuario priorizando la ubicación física real (coordenadas GPS y dirección)
 * por encima de la configuración manual o desactualizada del sistema operativo del teléfono.
 */
export function detectUserTimezone(
  lat?: number | null,
  lng?: number | null,
  address?: string | null
): string {
  // 1. Si se proporciona dirección física, buscar coincidencias exactas por estado / ciudad
  if (address) {
    const norm = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes('tijuana') || norm.includes('mexicali') || norm.includes('ensenada') || (norm.includes('baja california') && !norm.includes('sur'))) {
      return 'America/Tijuana';
    }
    if (
      norm.includes('sonora') ||
      norm.includes('hermosillo') ||
      norm.includes('obregon') ||
      norm.includes('nogales') ||
      norm.includes('guaymas') ||
      norm.includes('navojoa') ||
      norm.includes('caborca') ||
      norm.includes('agua prieta') ||
      norm.includes('san luis rio colorado') ||
      norm.includes('son.,') ||
      norm.includes('son.')
    ) {
      return 'America/Hermosillo';
    }
    if (norm.includes('quintana roo') || norm.includes('cancun') || norm.includes('playa del carmen') || norm.includes('tulum') || norm.includes('chetumal')) {
      return 'America/Cancun';
    }
    if (
      norm.includes('sinaloa') ||
      norm.includes('baja california sur') ||
      norm.includes('nayarit') ||
      norm.includes('la paz') ||
      norm.includes('los cabos') ||
      norm.includes('culiacan') ||
      norm.includes('mazatlan') ||
      norm.includes('los mochis') ||
      norm.includes('guasave') ||
      norm.includes('tepic')
    ) {
      return 'America/Mazatlan';
    }
    // Franja fronteriza de Chihuahua (Juárez / Ojinaga sí cambian horario en invierno/verano con EE.UU.)
    if (
      norm.includes('ciudad juarez') ||
      norm.includes('cd juarez') ||
      norm.includes('cd. juarez') ||
      norm.includes('ojinaga') ||
      norm.includes('praxedis') ||
      norm.includes('guadalupe, chih') ||
      norm.includes('janos') ||
      norm.includes('ascension')
    ) {
      return 'America/Ciudad_Juarez';
    }
    // Chihuahua capital y resto del estado: UTC-6 fijo todo el año (sin horario de verano/invierno)
    if (
      norm.includes('chihuahua') ||
      norm.includes('delicias') ||
      norm.includes('cuauhtemoc') ||
      norm.includes('parral') ||
      norm.includes('camargo') ||
      norm.includes('nuevo casas grandes') ||
      norm.includes('meoqui') ||
      norm.includes('jimenez') ||
      norm.includes('chih.')
    ) {
      return 'America/Chihuahua';
    }
    if (norm.includes('espana') || norm.includes('spain') || norm.includes('madrid') || norm.includes('barcelona')) {
      return 'Europe/Madrid';
    }
  }

  // 2. Si se proporcionan coordenadas GPS reales, buscar por bounding box geográfico
  if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1) {
    // España / Europa
    if (lat >= 35 && lat <= 44 && lng >= -10 && lng <= 5) return 'Europe/Madrid';
    // Baja California Norte
    if (lat >= 28 && lng <= -114.5) return 'America/Tijuana';
    // Sonora (Hermosillo, Cd. Obregón, Nogales, Guaymas)
    if (lat >= 26.3 && lat <= 32.5 && lng > -115 && lng <= -108.6) return 'America/Hermosillo';
    // Quintana Roo
    if (lat >= 17.8 && lat <= 21.8 && lng >= -89.3 && lng <= -86.5) return 'America/Cancun';
    // Sinaloa / BCS / Nayarit
    if (lat >= 20.6 && lat <= 27.0 && lng >= -115 && lng <= -105.2) return 'America/Mazatlan';
    // Franja fronteriza norte de Chihuahua (Cd. Juárez / Ojinaga)
    if (lat >= 30.8 && lat <= 31.9 && lng >= -108.5 && lng <= -104.2) return 'America/Ciudad_Juarez';
    // Chihuahua Capital y centro/sur del estado (UTC-6 fijo)
    if (lat >= 25.8 && lat < 30.8 && lng >= -108.6 && lng <= -103.8) return 'America/Chihuahua';
  }

  // 3. Fallback: Zona horaria reportada por el dispositivo si no hay GPS ni dirección
  try {
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && (KNOWN_TIMEZONES as readonly string[]).includes(deviceTz)) {
      return deviceTz;
    }
  } catch {}

  // Fallback por defecto a la hora oficial base (UTC-6 fijo)
  return COMPANY_BASE_TIMEZONE;
}

/**
 * Calcula la diferencia en horas entre una zona horaria y la zona base de la empresa
 */
export function getTimezoneOffsetDiffHours(
  targetTz: string,
  baseTz: string = COMPANY_BASE_TIMEZONE
): number {
  if (targetTz === baseTz) return 0;
  try {
    const now = new Date();
    const getOffsetMinutes = (tz: string) => {
      // Chihuahua Capital y Zona Centro de México tienen UTC-6 fijo todo el año desde oct 2022 (sin horario de verano).
      // Forzamos -360 min para evitar que teléfonos con tzdata viejo apliquen UTC-7 en invierno a Chihuahua.
      if (
        tz === 'America/Chihuahua' ||
        tz === 'America/Mexico_City' ||
        tz === 'America/Monterrey' ||
        tz === 'America/Merida'
      ) {
        return -360;
      }
      if (tz === 'America/Hermosillo' || tz === 'America/Mazatlan') {
        return -420;
      }
      if (tz === 'America/Cancun') {
        return -300;
      }
      const formatted = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const match = formatted.match(/GMT([+-]\d+)(?::(\d+))?/);
      if (!match) return -360;
      const h = parseInt(match[1], 10);
      const m = match[2] ? parseInt(match[2], 10) : 0;
      return h * 60 + (h < 0 ? -m : m);
    };

    const diffMinutes = getOffsetMinutes(targetTz) - getOffsetMinutes(baseTz);
    return Math.round((diffMinutes / 60) * 10) / 10;
  } catch {
    return 0;
  }
}

/**
 * Genera la información de Badge visual para mostrar en la interfaz de usuario
 */
export function getTimezoneBadgeInfo(
  recordTz?: string | null,
  baseTz: string = COMPANY_BASE_TIMEZONE
): TimezoneBadgeInfo | null {
  if (!recordTz || recordTz === baseTz) return null;

  const diff = getTimezoneOffsetDiffHours(recordTz, baseTz);
  if (
    diff === 0 &&
    (recordTz.includes('Mexico_City') ||
      recordTz.includes('Monterrey') ||
      recordTz.includes('Merida') ||
      recordTz.includes('Chihuahua'))
  ) {
    return null;
  }

  const sign = diff >= 0 ? '+' : '';
  const diffText = `${sign}${diff}h`;

  if (recordTz.includes('Tijuana')) {
    return {
      label: 'Tijuana',
      diffText,
      fullText: `Tijuana (${diffText})`,
      color: '#0984e3',
      bgColor: '#e8f4fd',
    };
  }

  if (recordTz.includes('Hermosillo') || recordTz.includes('Sonora')) {
    return {
      label: 'Sonora',
      diffText,
      fullText: `Sonora (${diffText})`,
      color: '#d63031',
      bgColor: '#ffeae8',
    };
  }

  if (recordTz.includes('Cancun')) {
    return {
      label: 'Cancún',
      diffText,
      fullText: `Cancún (${diffText})`,
      color: '#00b894',
      bgColor: '#e6faf5',
    };
  }

  if (recordTz.includes('Mazatlan')) {
    return {
      label: 'Pacífico',
      diffText,
      fullText: `Pacífico (${diffText})`,
      color: '#e17055',
      bgColor: '#fdf0ed',
    };
  }

  if (recordTz.includes('Juarez')) {
    return {
      label: 'Cd. Juárez',
      diffText,
      fullText: `Cd. Juárez (${diffText})`,
      color: '#0284c7',
      bgColor: '#e0f2fe',
    };
  }

  if (recordTz.includes('Chihuahua')) {
    return {
      label: 'Chihuahua',
      diffText,
      fullText: `Chihuahua (${diffText})`,
      color: '#64748b',
      bgColor: '#f1f5f9',
    };
  }

  if (recordTz.includes('Madrid') || recordTz.includes('Europe')) {
    return {
      label: 'España',
      diffText,
      fullText: `España (${diffText})`,
      color: '#6c5ce7',
      bgColor: '#f0eeff',
    };
  }

  return {
    label: recordTz.split('/').pop() || recordTz,
    diffText,
    fullText: `${recordTz.split('/').pop()} (${diffText})`,
    color: '#636e72',
    bgColor: '#f5f6fa',
  };
}

/**
 * Incrusta la etiqueta de zona horaria en la dirección antes de guardarla
 */
export function embedTimezoneInAddress(address: string, timezone: string): string {
  const clean = cleanAddressForDisplay(address);
  return `${clean} [tz:${timezone}]`;
}

/**
 * Extrae la zona horaria incrustada en la dirección si existe
 */
export function extractTimezoneFromAddress(address?: string | null): string | null {
  if (!address) return null;
  const match = address.match(/\[tz:([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Limpia la dirección quitando la etiqueta de zona horaria para mostrarla en la UI
 */
export function cleanAddressForDisplay(address?: string | null): string {
  if (!address) return '';
  return address
    .replace(/\s*\[tz:[^\]]+\]\s*/g, ' ')
    .replace(/\s*\[SIN_COMIDA\]\s*/g, ' ')
    .trim();
}

/**
 * Extrae o infiere la zona horaria a partir de un registro de asistencia
 */
export function extractTimezoneFromRecord(record: {
  direccion_entrada?: string | null;
  direccion_salida?: string | null;
  latitud_entrada?: number | null;
  longitud_entrada?: number | null;
}): string {
  // 1. Buscar etiqueta explícita en direccion_entrada
  const tzFromIn = extractTimezoneFromAddress(record.direccion_entrada);
  if (tzFromIn) return tzFromIn;

  // 2. Buscar etiqueta explícita en direccion_salida
  const tzFromOut = extractTimezoneFromAddress(record.direccion_salida);
  if (tzFromOut) return tzFromOut;

  // 3. Deducir por coordenadas y texto de dirección
  return detectUserTimezone(
    record.latitud_entrada,
    record.longitud_entrada,
    record.direccion_entrada || record.direccion_salida
  );
}
