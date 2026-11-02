import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { EvidenciaItem, EvidenciaPayload, EvidenciasCatalogos } from '../types';

export const evidenciasApi = {
  /**
   * Carga los catálogos para el formulario de evidencias (clientes, sucursales, empleados e inventario)
   */
  async getCatalogos(): Promise<EvidenciasCatalogos> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias/catalogos`, { headers });
    if (!res.ok) {
      throw new Error('Error al cargar catálogos de evidencias');
    }
    const data = await res.json();

    let emps = data.empleados || data.todosLosEmpleados || [];
    if (!emps || emps.length === 0) {
      try {
        const userRes = await fetch(`${getApiUrl()}/api/usuarios`, { headers });
        if (userRes.ok) {
          const uData = await userRes.json();
          if (Array.isArray(uData) && uData.length > 0) {
            emps = uData;
          }
        }
      } catch (uErr) {
        console.warn('Fallback loading usuarios failed:', uErr);
      }
    }

    return {
      clientes: data.clientes || [],
      sucursales: data.sucursales || [],
      empleados: emps,
      inventario: data.inventario || [],
    };
  },

  /**
   * Carga inventario de colaboradores seleccionados
   */
  async getInventarioColaboradores(colabIds: string[]): Promise<any[]> {
    if (!colabIds || colabIds.length === 0) return [];
    try {
      const headers = await getApiHeaders();
      const res = await fetch(
        `${getApiUrl()}/api/evidencias/inventario-colaboradores?ids=${colabIds.join(',')}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.inventario) ? data.inventario : [];
      }
    } catch (err) {
      console.warn('Error fetching inventario colaboradores:', err);
    }
    return [];
  },

  /**
   * Historial de evidencias del empleado autenticado
   */
  async getMisEvidencias(): Promise<EvidenciaItem[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias/mis-evidencias`, { headers });
    if (!res.ok) {
      throw new Error('Error al cargar mis evidencias');
    }
    const data = await res.json();
    return data.evidencias || [];
  },

  /**
   * Listado completo de evidencias para rol Administrador
   */
  async getAdminEvidencias(): Promise<{ evidencias: EvidenciaItem[]; employees: any[] }> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias/admin/all`, { headers });
    if (!res.ok) {
      throw new Error('Error al cargar evidencias');
    }
    const data = await res.json();
    return {
      evidencias: data.evidencias || [],
      employees: data.employees || [],
    };
  },

  /**
   * Detalle de evidencia por ID (para edición o visualización de admin)
   */
  async getAdminEvidenciaById(id: string): Promise<EvidenciaItem> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias/admin/${id}`, { headers });
    if (!res.ok) {
      throw new Error('Error al cargar la evidencia');
    }
    const data = await res.json();
    if (!data.evidencia) {
      throw new Error('Evidencia no encontrada');
    }
    return data.evidencia;
  },

  /**
   * Crear nueva evidencia
   */
  async createEvidencia(payload: EvidenciaPayload): Promise<EvidenciaItem> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al guardar evidencia en el servidor');
    }
    const data = await res.json().catch(() => ({}));
    return data.evidencia || data;
  },

  /**
   * Actualizar evidencia existente (Admin)
   */
  async updateEvidencia(id: string, payload: EvidenciaPayload): Promise<EvidenciaItem> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/evidencias/admin/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Error al actualizar evidencia');
    }
    const data = await res.json().catch(() => ({}));
    return data.evidencia || data;
  },

  /**
   * Asistente de IA para mejorar redacción técnica
   */
  async mejorarRedaccionIA(texto: string, tipo: 'situacion' | 'solucion'): Promise<string> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/chat-ia/mejorar-redaccion`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, tipo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al conectar con la IA');
    }
    const data = await res.json();
    return data.textoMejorado || texto;
  },
};
