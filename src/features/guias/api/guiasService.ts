import { apiClient } from '@/services/apiClient';
import { Guia, GuiaCategoria, GuiaPayload } from '../types';

export const GuiasService = {
  async getCategorias(includeInactive = false): Promise<GuiaCategoria[]> {
    const query = includeInactive ? '?includeInactive=true' : '';
    return apiClient.get(`/api/guias/categorias${query}`);
  },

  async createCategoria(payload: {
    nombre: string;
    icono?: string;
    color?: string;
    orden?: number;
    activo?: boolean;
  }): Promise<GuiaCategoria> {
    return apiClient.post('/api/guias/categorias', payload);
  },

  async updateCategoria(
    id: string,
    payload: Partial<{
      nombre: string;
      icono: string;
      color: string;
      orden: number;
      activo: boolean;
    }>
  ): Promise<GuiaCategoria> {
    return apiClient.put(`/api/guias/categorias/${id}`, payload);
  },

  async deleteCategoria(id: string): Promise<{ success: boolean }> {
    return apiClient.delete(`/api/guias/categorias/${id}`);
  },

  async getGuias(includeDrafts = false): Promise<Guia[]> {
    const query = includeDrafts ? '?includeDrafts=true' : '';
    return apiClient.get(`/api/guias${query}`);
  },

  async getGuiaById(id: string): Promise<Guia> {
    return apiClient.get(`/api/guias/${id}`);
  },

  async createGuia(payload: GuiaPayload): Promise<Guia> {
    return apiClient.post('/api/guias', payload);
  },

  async updateGuia(id: string, payload: GuiaPayload): Promise<Guia> {
    return apiClient.put(`/api/guias/${id}`, payload);
  },

  async deleteGuia(id: string): Promise<{ success: boolean }> {
    return apiClient.delete(`/api/guias/${id}`);
  },

  async uploadDiagramImage(
    base64: string,
    fileName: string,
    contentType = 'image/jpeg'
  ): Promise<string> {
    return apiClient.uploadBase64(base64, fileName, contentType, 'guias');
  },
};
