import { getApiUrl } from './apiHelper';

type SessionExpiredListener = () => void;

interface InterceptorState {
  patched: boolean;
  originalFetch: typeof globalThis.fetch;
  listener: SessionExpiredListener | null;
}

const STATE_KEY = Symbol.for('portal_inttec.session_interceptor_state');

function getInterceptorState(): InterceptorState {
  const g = globalThis as any;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      patched: false,
      originalFetch: globalThis.fetch.bind(globalThis),
      listener: null,
    } as InterceptorState;
  }
  return g[STATE_KEY] as InterceptorState;
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (input && typeof (input as Request).url === 'string') return (input as Request).url;
  return '';
}

export function registerSessionExpiredHandler(handler: SessionExpiredListener | null): void {
  getInterceptorState().listener = handler;
}

export function emitSessionExpired(): void {
  const { listener } = getInterceptorState();
  if (listener) {
    listener();
  }
}

/**
 * Envuelve globalThis.fetch una sola vez (seguro ante Fast Refresh / HMR)
 * para detectar respuestas 401 del backend propio y cerrar la sesión automáticamente.
 */
export function installFetchInterceptor(): void {
  const state = getInterceptorState();
  if (state.patched || typeof globalThis.fetch !== 'function') return;

  const baseFetch = state.originalFetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await baseFetch(input, init);

    if (response.status === 401) {
      const url = resolveRequestUrl(input);
      const apiBase = getApiUrl();
      const isOwnApi = Boolean(apiBase) && url.startsWith(apiBase);
      const isLoginEndpoint = url.includes('/api/auth/login');

      if (isOwnApi && !isLoginEndpoint) {
        emitSessionExpired();
      }
    }

    return response;
  };

  state.patched = true;
}
