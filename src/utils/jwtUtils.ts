export const JWT_REFRESH_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 días

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(padded);
    if (typeof TextDecoder !== 'undefined') {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
    // Fallback para entornos sin TextDecoder
    const percentEncoded = Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
    return decodeURIComponent(percentEncoded);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8');
  }

  throw new Error('No hay decodificador Base64 disponible');
}

/**
 * Decodifica el payload JSON de un JWT sin verificar firma (solo para lectura de `exp` en cliente).
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const json = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve el timestamp de expiración del JWT en milisegundos, o null si no es válido.
 */
export function getTokenExpirationMs(token: string | null | undefined): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null;
  }
  return payload.exp * 1000;
}

/**
 * Indica si el token falta, está malformado o ya expiró.
 */
export function isTokenExpired(token: string | null | undefined, leewayMs = 0, nowMs = Date.now()): boolean {
  const expMs = getTokenExpirationMs(token);
  if (expMs === null) return true;
  return nowMs + leewayMs >= expMs;
}

/**
 * Indica si el token aún es válido pero le queda menos de `thresholdMs` para vencer.
 */
export function shouldRefreshToken(
  token: string | null | undefined,
  thresholdMs = JWT_REFRESH_THRESHOLD_MS,
  nowMs = Date.now()
): boolean {
  const expMs = getTokenExpirationMs(token);
  if (expMs === null) return false;
  const remainingMs = expMs - nowMs;
  return remainingMs > 0 && remainingMs <= thresholdMs;
}
