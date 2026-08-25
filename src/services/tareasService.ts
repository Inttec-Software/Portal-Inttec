import { AuthService } from './supabase';
import { CompanyService, EnvService } from './supabase';
import { getApiHeaders as getHeaders, getApiUrl } from './apiHelper';

export const TareasService = {
  getTareas: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas`, { headers });
    if (!res.ok) throw new Error('Error al obtener tareas');
    return res.json();
  },
  
  getTareaById: async (id: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}`, { headers });
    if (!res.ok) throw new Error('Error al obtener tarea');
    return res.json();
  },
  
  getFormLookups: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/form/lookups`, { headers });
    if (!res.ok) throw new Error('Error al obtener datos de formulario');
    return res.json();
  },
  
  createTarea: async (tareaData: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas`, { 
      method: 'POST',
      headers,
      body: JSON.stringify(tareaData)
    });
    if (!res.ok) throw new Error('Error al crear tarea');
    return res.json();
  },
  
  updateTarea: async (id: string, updates: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}`, { 
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Error al actualizar tarea');
    return res.json();
  },
  
  addNota: async (id: string, comentario: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${getApiUrl()}/api/tareas/${id}/notas`, { 
      method: 'POST',
      headers,
      body: JSON.stringify({ comentario })
    });
    if (!res.ok) throw new Error('Error al agregar nota');
    return res.json();
  }
};
