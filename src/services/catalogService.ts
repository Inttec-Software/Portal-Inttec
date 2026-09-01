import { logger } from '@/utils/logger';
import {
  CatalogoItem,
  ClienteItem,
  CompanyService,
  
  
  ProveedorItem,
  SubcategoriaItem,
  SucursalCliente,
  Usuario,
  Vehiculo
} from './supabase';

import { AuthService, EnvService } from './supabase';
import { getApiHeaders, getApiUrl } from './apiHelper';

/**
 * Servicio Centralizado de Catálogos con Sincronización Dual (INTTEC & DARAVISA)
 * Garantiza que cuando se crea, edita o elimina un catálogo (cliente, sucursal,
 * proveedor, categoría, subcategoría, usuario o vehículo), los cambios se repliquen
 * automáticamente en ambas bases de datos.
 */
export const CatalogService = {
  // Helper interno
  async _postCatalogo(table: string, data: any) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/catalogos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ table, data })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error creando elemento en ${table}`);
    }
    return res.json();
  },

  async _putCatalogo(table: string, id: string, updates: any) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/catalogos`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ table, id, updates })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error actualizando elemento en ${table}`);
    }
  },

  async _deleteCatalogo(table: string, id: string) {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/catalogos/${table}/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error eliminando elemento en ${table}`);
    }
  },

  // ==========================================
  // CLIENTES
  // ==========================================
  async crearCliente(clienteData: {
    nombre: string;
    rfc?: string | null;
    correo_electronico?: string | null;
    direccion?: string | null;
    codigo_postal?: string | null;
    razon_social?: string | null;
    regimen_fiscal?: string | null;
    uso_cfdi?: string | null;
  }): Promise<ClienteItem> {
    return this._postCatalogo('clientes', clienteData) as Promise<ClienteItem>;
  },

  async actualizarCliente(id: string, updates: Partial<ClienteItem>): Promise<void> {
    return this._putCatalogo('clientes', id, updates);
  },

  async eliminarCliente(id: string): Promise<void> {
    return this._deleteCatalogo('clientes', id);
  },

  // ==========================================
  // SUCURSALES DE CLIENTE
  // ==========================================
  async crearSucursal(sucursalData: {
    cliente_id: string;
    nombre: string;
  }): Promise<SucursalCliente> {
    return this._postCatalogo('sucursales_cliente', sucursalData) as Promise<SucursalCliente>;
  },

  async actualizarSucursal(id: string, updates: Partial<SucursalCliente>): Promise<void> {
    return this._putCatalogo('sucursales_cliente', id, updates);
  },

  async eliminarSucursal(id: string): Promise<void> {
    return this._deleteCatalogo('sucursales_cliente', id);
  },

  // ==========================================
  // PROVEEDORES
  // ==========================================
  async crearProveedor(proveedorData: {
    nombre: string;
    rfc?: string | null;
  }): Promise<ProveedorItem> {
    return this._postCatalogo('proveedores', proveedorData) as Promise<ProveedorItem>;
  },

  async actualizarProveedor(id: string, updates: Partial<ProveedorItem>): Promise<void> {
    return this._putCatalogo('proveedores', id, updates);
  },

  async eliminarProveedor(id: string): Promise<void> {
    return this._deleteCatalogo('proveedores', id);
  },

  // ==========================================
  // CATEGORIAS
  // ==========================================
  async crearCategoria(categoriaData: { nombre: string }): Promise<CatalogoItem> {
    return this._postCatalogo('categorias', categoriaData) as Promise<CatalogoItem>;
  },

  async actualizarCategoria(id: string, updates: { nombre: string }): Promise<void> {
    return this._putCatalogo('categorias', id, updates);
  },

  async eliminarCategoria(id: string): Promise<void> {
    return this._deleteCatalogo('categorias', id);
  },

  // ==========================================
  // SUBCATEGORIAS
  // ==========================================
  async crearSubcategoria(subcategoriaData: {
    nombre: string;
    categoria_id: string;
  }): Promise<SubcategoriaItem> {
    return this._postCatalogo('subcategorias', subcategoriaData) as Promise<SubcategoriaItem>;
  },

  async actualizarSubcategoria(id: string, updates: { nombre?: string; categoria_id?: string }): Promise<void> {
    return this._putCatalogo('subcategorias', id, updates);
  },

  async eliminarSubcategoria(id: string): Promise<void> {
    return this._deleteCatalogo('subcategorias', id);
  },

  // ==========================================
  // USUARIOS
  // ==========================================
  async getUsuarios(): Promise<Usuario[]> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/usuarios`, { headers });
    if (!res.ok) throw new Error('Error obteniendo usuarios');
    return res.json();
  },

  async crearUsuario(usuarioData: {
    nombre: string;
    email: string;
    password: string;
    rol: 'ADMIN' | 'EMPLEADO' | 'DEV';
    telefono?: string | null;
  }): Promise<Usuario> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/usuarios`, {
      method: 'POST',
      headers,
      body: JSON.stringify(usuarioData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error creando usuario');
    return data as Usuario;
  },

  async actualizarUsuario(id: string, updates: {
    nombre?: string;
    email?: string;
    password?: string;
    rol?: 'ADMIN' | 'EMPLEADO' | 'DEV';
    telefono?: string | null;
  }): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/usuarios/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error actualizando usuario');
    }
  },

  async eliminarUsuario(id: string, email?: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/usuarios/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error eliminando usuario');
    }
  },

  // ==========================================
  // VEHICULOS
  // ==========================================
  async crearVehiculo(vehiculoData: Omit<Vehiculo, 'id' | 'created_at'>): Promise<Vehiculo> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(vehiculoData)
    });
    if (!res.ok) throw new Error('Error al crear vehículo en el servidor');
    return res.json();
  },

  async actualizarVehiculo(id: string, updates: Partial<Vehiculo>): Promise<Vehiculo> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Error al actualizar vehículo en el servidor');
    return res.json();
  },

  async eliminarVehiculo(id: string): Promise<void> {
    const headers = await getApiHeaders();
    const res = await fetch(`${getApiUrl()}/api/vehiculos/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Error al eliminar vehículo en el servidor');
  }
};
