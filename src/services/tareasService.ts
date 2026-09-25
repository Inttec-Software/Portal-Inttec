import { getApiHeaders as getHeaders, getApiUrl } from './apiHelper';

const handleResponse = async (res: Response, fallbackMsg: string) => {
  if (!res.ok) {
    let msg = fallbackMsg;
    try {
      const err = await res.json();
      if (err && err.message) msg = err.message;
    } catch (_) {
      msg = `${fallbackMsg} (Código ${res.status})`;
    }
    throw new Error(msg);
  }
  return res.json();
};

let cachedTareas: any[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 segundos de caché en memoria

export const TareasService = {
  invalidateCache: () => {
    cachedTareas = null;
    lastFetchTime = 0;
  },

  getTareas: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedTareas && (now - lastFetchTime < CACHE_TTL_MS)) {
      return cachedTareas;
    }
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas`, { headers });
    const data = await handleResponse(res, 'Error al obtener tareas');
    cachedTareas = data;
    lastFetchTime = Date.now();
    return data;
  },
  
  getTareaById: async (id: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}`, { headers });
    return handleResponse(res, 'Error al obtener tarea');
  },
  
  getFormLookups: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/form/lookups`, { headers });
    return handleResponse(res, 'Error al obtener datos de formulario');
  },
  
  createTarea: async (tareaData: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas`, { 
      method: 'POST',
      headers,
      body: JSON.stringify(tareaData)
    });
    const result = await handleResponse(res, 'Error al crear tarea');
    TareasService.invalidateCache();
    return result;
  },
  
  updateTarea: async (id: string, updates: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}`, { 
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    const result = await handleResponse(res, 'Error al actualizar tarea');
    TareasService.invalidateCache();
    return result;
  },
  
  addNota: async (id: string, comentario: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}/notas`, { 
      method: 'POST',
      headers,
      body: JSON.stringify({ comentario })
    });
    const result = await handleResponse(res, 'Error al agregar nota');
    TareasService.invalidateCache();
    return result;
  }
};
