import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { supabase } from '@/services/supabase';
import { FormCatalogsResponse } from '../types';

export const gastosApi = {
  async fetchFormCatalogs(): Promise<FormCatalogsResponse> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/reportes/form-catalogs`, { headers });
    if (!res.ok) throw new Error('Error al cargar catálogos del formulario');
    return await res.json();
  },

  async fetchGastoById(id: string): Promise<any> {
    let data: any = null;
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${id}`, { headers });
      if (res.ok) {
        const resData = await res.json();
        data = resData.gasto;
      }
    } catch (apiErr) {
      console.warn('API error, falling back to supabase direct:', apiErr);
    }

    if (!data) {
      const { data: dbData, error } = await supabase
        .from('gastos')
        .select(`
          *,
          subcategoria_rel:subcategorias(id, nombre, categoria_id, categorias(id, nombre)),
          proveedor_rel:proveedores(id, nombre),
          cliente_rel:clientes(id, nombre),
          sucursal_rel:sucursales_cliente(id, nombre)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      data = dbData;
    }

    return data;
  },

  async createGasto(body: {
    payloadsToInsert: any[];
    gasolinaPayload: any | null;
    createNotifications?: boolean;
    employeeName?: string;
    totalGasto?: number;
    categoriaNombre?: string;
  }): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/reportes/gastos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al guardar el gasto');
    }

    return await res.json().catch(() => ({}));
  },

  async updateGasto(id: string, updatePayload: any): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/reportes/gastos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ updatePayload }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al actualizar el gasto');
    }

    return await res.json().catch(() => ({}));
  },
};
