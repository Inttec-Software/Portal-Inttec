import { AuthService } from './supabase';
import { CompanyService, EnvService } from './supabase';
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

export const TareasService = {
  getTareas: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas`, { headers });
    return handleResponse(res, 'Error al obtener tareas');
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
    return handleResponse(res, 'Error al crear tarea');
  },
  
  updateTarea: async (id: string, updates: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}`, { 
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    return handleResponse(res, 'Error al actualizar tarea');
  },
  
  addNota: async (id: string, comentario: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}/notas`, { 
      method: 'POST',
      headers,
      body: JSON.stringify({ comentario })
    });
    return handleResponse(res, 'Error al agregar nota');
  }
};
