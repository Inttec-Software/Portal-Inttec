import { getApiUrl, getApiHeaders } from './apiHelper';

export interface DirectorioCliente {
  id: string;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DirectorioClientePayload {
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  correo?: string | null;
}

export const DirectorioClientesService = {
  async list(q?: string): Promise<DirectorioCliente[]> {
    const headers = await getApiHeaders();
    const query = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    const res = await fetch(`${getApiUrl()}/api/directorio-clientes${query}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo cargar el directorio de clientes');
    }
    const data = await res.json();
    return data.clientes || [];
  },

  async create(payload: DirectorioClientePayload): Promise<DirectorioCliente> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/directorio-clientes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo crear el cliente');
    }
    const data = await res.json();
    return data.cliente;
  },

  async update(id: string, payload: DirectorioClientePayload): Promise<DirectorioCliente> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/directorio-clientes/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo actualizar el cliente');
    }
    const data = await res.json();
    return data.cliente;
  },

  async remove(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/directorio-clientes/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo eliminar el cliente');
    }
  },
};
