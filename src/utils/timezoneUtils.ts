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
 * Detecta la zona horaria del usuario en base a su dispositivo, GPS o dirección
 */
export function detectUserTimezone(
  lat?: number | null,
  lng?: number | null,
  address?: string | null
): string {
  // 1. Si el dispositivo ya tiene una zona horaria mexicana o española reconocida, priorizarla
  try {
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && (KNOWN_TIMEZONES as readonly string[]).includes(deviceTz)) {
      return deviceTz;
    }
  } catch {}

  // 2. Si se proporciona dirección, buscar coincidencias por estado / ciudad
  if (address) {
    const norm = address.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes('tijuana') || (norm.includes('baja california') && !norm.includes('sur'))) {
      return 'America/Tijuana';
    }
    if (norm.includes('sonora') || norm.includes('hermosillo') || norm.includes('nogales')) {
      return 'America/Hermosillo';
    }
    if (norm.includes('quintana roo') || norm.includes('cancun') || norm.includes('playa del carmen') || norm.includes('tulum') || norm.includes('chetumal')) {
      return 'America/Cancun';
    }
    if (norm.includes('sinaloa') || norm.includes('baja california sur') || norm.includes('nayarit') || norm.includes('la paz') || norm.includes('los cabos') || norm.includes('culiacan') || norm.includes('mazatlan')) {
      return 'America/Mazatlan';
    }
    if (norm.includes('chihuahua') || norm.includes('ciudad juarez') || norm.includes('cd juarez') || norm.includes('cd. juarez')) {
      return 'America/Chihuahua';
    }
    if (norm.includes('espana') || norm.includes('spain') || norm.includes('madrid') || norm.includes('barcelona')) {
      return 'Europe/Madrid';
    }
  }

  // 3. Si se proporcionan coordenadas GPS, buscar por bounding box geográfico
  if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
    // Baja California
    if (lat >= 28 && lng <= -114.5) return 'America/Tijuana';
    // Sonora
    if (lat >= 26.5 && lat <= 32.5 && lng > -115 && lng <= -108.5) return 'America/Hermosillo';
    // Quintana Roo
    if (lat >= 17.8 && lat <= 21.8 && lng >= -89.3 && lng <= -86.5) return 'America/Cancun';
    // Sinaloa / BCS / Nayarit
    if (lat >= 21.5 && lat <= 28 && lng >= -115 && lng <= -105) return 'America/Mazatlan';
    // España
    if (lat >= 35 && lat <= 44 && lng >= -10 && lng <= 5) return 'Europe/Madrid';
  }

  // Fallback por defecto a la hora del centro de México
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
      const formatted = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const match = formatted.match(/GMT([+-]\d+)(?::(\d+))?/);
      if (!match) return 0;
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
  if (diff === 0 && (recordTz.includes('Mexico_City') || recordTz.includes('Monterrey') || recordTz.includes('Merida'))) {
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

  if (recordTz.includes('Chihuahua') || recordTz.includes('Juarez')) {
    return {
      label: 'Chihuahua',
      diffText,
      fullText: `Chihuahua (${diffText})`,
      color: '#b2bec3',
      bgColor: '#f1f2f6',
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
  return address.replace(/\s*\[tz:[^\]]+\]\s*/g, '').trim();
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
