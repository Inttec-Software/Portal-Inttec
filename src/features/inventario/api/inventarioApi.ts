import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Producto } from '../types';
import { normalizeRetiroProductos } from '../utils/inventarioUtils';

export const InventarioApi = {
  // --- Catálogos generales ---
  async fetchFormCatalogs(): Promise<{ clientes: any[]; sucursales: any[] }> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/reportes/form-catalogs`, { headers });
    if (!res.ok) {
      return { clientes: [], sucursales: [] };
    }
    const data = await res.json();
    return {
      clientes: data.clientes || [],
      sucursales: data.sucursales || [],
    };
  },

  // --- Empleado: Retiro de Material ---
  async fetchRetiroProductos(): Promise<Producto[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/retiro-material/productos`, { headers });
    if (!res.ok) throw new Error('Error de red al cargar productos');
    const { productos: data } = await res.json();
    return normalizeRetiroProductos(data || []);
  },

  async confirmarRetiroMaterial(payload: any): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/retiro-material/confirmar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Error al procesar el retiro en el servidor');
    }
    return res.json().catch(() => ({}));
  },

  // --- Empleado / Admin: Devoluciones y Gasto de Material ---
  async fetchDevolucionesInventario(userId: string): Promise<any[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/devoluciones/inventario?userId=${userId}`, { headers });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Error al cargar inventario');
    }
    const json = await res.json();
    return json.inventario || [];
  },

  async solicitarDevolucion(body: { payload: any; materiales: any[] }): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/devoluciones/solicitar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Error al enviar la solicitud');
    }
    return res.json().catch(() => ({}));
  },

  async reportarGastoMaterial(payload: any): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/devoluciones/gasto-material`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      try {
        const errJson = JSON.parse(errorText);
        if (errJson.error) throw new Error(errJson.error);
      } catch (e: any) {
        if (e.message && e.message !== errorText && !e.message.includes('JSON')) throw e;
      }
      throw new Error(errorText || 'Error al reportar el gasto de material');
    }
    return res.json().catch(() => ({}));
  },

  async devolverMaterialPersonal(payload: any): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/devolver-personal`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Error al devolver material al almacén');
    }
    return res.json().catch(() => ({}));
  },

  // --- Admin: Dashboard y Catálogos ---
  async fetchDashboard(): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/dashboard`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al cargar datos del dashboard');
    }
    return res.json();
  },

  async verificarFolio(folio: string): Promise<boolean> {
    const headers = await getApiHeaders();
    const res = await fetch(
      `${getApiUrl()}/api/inventario/verificar-folio?folio=${encodeURIComponent(folio.trim())}`,
      { headers }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.existe);
  },

  async fetchEmpleadosStock(): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/inventarios-empleados`, { headers });
    if (!res.ok) throw new Error('Error al cargar inventario de empleados');
    return res.json();
  },

  async fetchMovimientos(): Promise<any[]> {
    const headers = await getApiHeaders();
    const apiUrl = getApiUrl();
    let res = await fetch(`${apiUrl}/api/inventario/movimientos`, { headers });
    if (!res.ok) {
      res = await fetch(`${apiUrl}/api/inventario/retiros`, { headers });
    }
    if (res.ok) {
      const data = await res.json();
      return data.movimientos || data.retiros || [];
    }
    return [];
  },

  async deleteMovimiento(id: string, sourceTable: string, folioFactura: string): Promise<void> {
    const headers = await getApiHeaders();
    const queryParams = new URLSearchParams({
      source_table: sourceTable || '',
      folio_factura: folioFactura || '',
    });
    const res = await fetch(`${getApiUrl()}/api/inventario/movimientos/${id}?${queryParams.toString()}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Error al eliminar movimiento');
    }
  },

  async fetchMovimientoFirma(id: string): Promise<string | null> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/firma/${id}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.firma_base64 || null;
  },

  // --- Admin: Retribuciones y Evidencias ---
  async fetchEmpleadoRetribuciones(empleadoId: string): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/empleado/${empleadoId}/retribuciones`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al cargar datos del empleado');
    }
    return res.json();
  },

  async verificarEvidencia(evidenciaId: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/evidencias/verificar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        evidenciaId,
        action: 'VERIFICAR',
        reason: 'Validación administrativa',
        userActionName: 'ADMIN',
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al verificar evidencia');
    }
  },

  async aprobarDevolucion(dev: any): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/devoluciones/aprobar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dev }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al aprobar devolución');
    }
  },

  // --- Admin: Productos CRUD & Lote ---
  async saveProduct(editingId: string | null, payload: any): Promise<any> {
    const headers = await getApiHeaders();
    const url = editingId
      ? `${getApiUrl()}/api/inventario/productos/${editingId}`
      : `${getApiUrl()}/api/inventario/productos`;
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al guardar el producto en el servidor');
    }
    return res.json().catch(() => ({}));
  },

  async updateProductStatus(id: string, activo: boolean): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/productos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ activo }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error al ${activo ? 'reactivar' : 'desactivar'} el producto`);
    }
  },

  async hardDeleteProduct(id: string): Promise<{ ok: boolean; isForeignKeyConstraint?: boolean; error?: string }> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/productos/${id}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        isForeignKeyConstraint: data.isForeignKeyConstraint,
        error: data.error || 'Error al eliminar el producto de la base de datos',
      };
    }
    return { ok: true };
  },

  async quickAddStock(productId: string, cantidad: number, currentStock: number): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/productos/${productId}/stock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cantidad,
        motivo: 'AJUSTE_RAPIDO',
        currentStock,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al añadir stock');
    }
  },

  async bulkDeleteProducts(ids: string[]): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/productos/bulk-delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al desactivar los productos seleccionados');
    }
  },

  async bulkUpdateProducts(ids: string[], updates: any): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/productos/bulk-update`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, updates }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar los productos en lote');
    }
  },

  // --- Admin: Categorías, Proveedores y Clientes ---
  async createCategory(nombre: string, descripcion: string | null): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/categoria`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nombre, descripcion }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al crear categoría');
    }
  },

  async createProveedor(nombre: string, rfc: string | null): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/proveedor`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nombre, rfc }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al crear proveedor');
    }
  },

  async createCliente(nombre: string): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/catalogos/cliente`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nombre }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al crear cliente');
    }
    return res.json();
  },

  // --- Admin: Consumos, Asignaciones e Importación IA ---
  async registrarConsumo(payload: any): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/consumos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al registrar consumo');
    }
  },

  async asignarMaterialEmpleado(payload: any): Promise<any> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/asignar-empleado`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Error al asignar material al empleado');
    }
    return data;
  },

  async importarFacturaIA(payload: any): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/inventario/importar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al procesar la importación por IA');
    }
  },
};
