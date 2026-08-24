import { AuthService } from './supabase';
import { CompanyService, EnvService } from './supabase';
import Constants from 'expo-constants';

const resolveLocalhost = (url: string) => {
  if (__DEV__ && url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    const debuggerHost = Constants.expoConfig?.hostUri || (Constants.manifest as any)?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return url.replace(/localhost|127\.0\.0\.1/, ip);
    }
  }
  return url;
};

const getHeaders = async () => {
  const token = await AuthService.getToken();
  const company = CompanyService.getActiveCompany();
  const env = EnvService.getActiveEnv();
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-company': company,
    'x-env': env
  };
};

const getApiUrl = () => {
  const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:10000';
  return resolveLocalhost(rawApiUrl);
};

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
