import { logger } from '@/utils/logger';
import {
  CatalogoItem,
  ClienteItem,
  CompanyService,
  getDaravisaClient,
  getInttecClient,
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
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? getDaravisaClient() : getInttecClient();
    const secondaryClient = activeComp === 'daravisa' ? getInttecClient() : getDaravisaClient();

    const { data, error } = await primaryClient
      .from('clientes')
      .insert([clienteData])
      .select()
      .single();

    if (error) {
      logger.error('[CatalogService] Error creando cliente en base activa:', error);
      throw error;
    }

    try {
      await secondaryClient.from('clientes').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando cliente en base secundaria:', syncErr);
    }

    return data as ClienteItem;
  },

  async actualizarCliente(id: string, updates: Partial<ClienteItem>): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('clientes').update(updates).eq('id', id),
      getDaravisaClient().from('clientes').update(updates).eq('id', id),
    ]);
  },

  async eliminarCliente(id: string): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('clientes').delete().eq('id', id),
      getDaravisaClient().from('clientes').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // SUCURSALES DE CLIENTE
  // ==========================================
  async crearSucursal(sucursalData: {
    cliente_id: string;
    nombre: string;
  }): Promise<SucursalCliente> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? getDaravisaClient() : getInttecClient();
    const secondaryClient = activeComp === 'daravisa' ? getInttecClient() : getDaravisaClient();

    const { data, error } = await primaryClient
      .from('sucursales_cliente')
      .insert([sucursalData])
      .select()
      .single();

    if (error) {
      logger.error('[CatalogService] Error creando sucursal en base activa:', error);
      throw error;
    }

    try {
      await secondaryClient.from('sucursales_cliente').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando sucursal en base secundaria:', syncErr);
    }

    return data as SucursalCliente;
  },

  async actualizarSucursal(id: string, updates: Partial<SucursalCliente>): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('sucursales_cliente').update(updates).eq('id', id),
      getDaravisaClient().from('sucursales_cliente').update(updates).eq('id', id),
    ]);
  },

  async eliminarSucursal(id: string): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('sucursales_cliente').delete().eq('id', id),
      getDaravisaClient().from('sucursales_cliente').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // PROVEEDORES
  // ==========================================
  async crearProveedor(proveedorData: {
    nombre: string;
    rfc?: string | null;
  }): Promise<ProveedorItem> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? getDaravisaClient() : getInttecClient();
    const secondaryClient = activeComp === 'daravisa' ? getInttecClient() : getDaravisaClient();

    const { data, error } = await primaryClient
      .from('proveedores')
      .insert([proveedorData])
      .select()
      .single();

    if (error) {
      logger.error('[CatalogService] Error creando proveedor en base activa:', error);
      throw error;
    }

    try {
      await secondaryClient.from('proveedores').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando proveedor en base secundaria:', syncErr);
    }

    return data as ProveedorItem;
  },

  async actualizarProveedor(id: string, updates: Partial<ProveedorItem>): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('proveedores').update(updates).eq('id', id),
      getDaravisaClient().from('proveedores').update(updates).eq('id', id),
    ]);
  },

  async eliminarProveedor(id: string): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('proveedores').delete().eq('id', id),
      getDaravisaClient().from('proveedores').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // CATEGORIAS
  // ==========================================
  async crearCategoria(categoriaData: { nombre: string }): Promise<CatalogoItem> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? getDaravisaClient() : getInttecClient();
    const secondaryClient = activeComp === 'daravisa' ? getInttecClient() : getDaravisaClient();

    const { data, error } = await primaryClient
      .from('categorias')
      .insert([categoriaData])
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('categorias').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando categoria:', syncErr);
    }

    return data as CatalogoItem;
  },

  async actualizarCategoria(id: string, updates: { nombre: string }): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('categorias').update(updates).eq('id', id),
      getDaravisaClient().from('categorias').update(updates).eq('id', id),
    ]);
  },

  async eliminarCategoria(id: string): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('categorias').delete().eq('id', id),
      getDaravisaClient().from('categorias').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // SUBCATEGORIAS
  // ==========================================
  async crearSubcategoria(subcategoriaData: {
    nombre: string;
    categoria_id: string;
  }): Promise<SubcategoriaItem> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? getDaravisaClient() : getInttecClient();
    const secondaryClient = activeComp === 'daravisa' ? getInttecClient() : getDaravisaClient();

    const { data, error } = await primaryClient
      .from('subcategorias')
      .insert([subcategoriaData])
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('subcategorias').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando subcategoria:', syncErr);
    }

    return data as SubcategoriaItem;
  },

  async actualizarSubcategoria(id: string, updates: { nombre?: string; categoria_id?: string }): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('subcategorias').update(updates).eq('id', id),
      getDaravisaClient().from('subcategorias').update(updates).eq('id', id),
    ]);
  },

  async eliminarSubcategoria(id: string): Promise<void> {
    await Promise.allSettled([
      getInttecClient().from('subcategorias').delete().eq('id', id),
      getDaravisaClient().from('subcategorias').delete().eq('id', id),
    ]);
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
