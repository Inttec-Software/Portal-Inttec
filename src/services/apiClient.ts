import { getApiUrl, getApiHeaders } from './apiHelper';
import { Platform } from 'react-native';

export const apiClient = {
  async get(endpoint: string) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}${endpoint}`, { headers });
    if (!res.ok) throw new Error(`GET ${endpoint} falló con ${res.status}`);
    return res.json();
  },

  async post(endpoint: string, body: any) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `POST ${endpoint} falló con ${res.status}`);
    }
    return res.json();
  },

  async put(endpoint: string, body: any) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `PUT ${endpoint} falló con ${res.status}`);
    }
    return res.json();
  },

  async delete(endpoint: string) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}${endpoint}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `DELETE ${endpoint} falló con ${res.status}`);
    }
    return res.json();
  },

  async uploadBase64(base64: string, fileName: string, contentType: string, folder: string): Promise<string> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileBase64: base64, fileName, contentType, folder })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Upload falló con ${res.status}`);
    }
    const data = await res.json();
    return data.url;
  }
};
