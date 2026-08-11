import { logger } from '@/utils/logger';
import {
  CatalogoItem,
  ClienteItem,
  CompanyService,
  daravisaClient,
  inttecClient,
  ProveedorItem,
  SubcategoriaItem,
  SucursalCliente,
  Usuario,
  Vehiculo
} from './supabase';

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
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

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
      inttecClient.from('clientes').update(updates).eq('id', id),
      daravisaClient.from('clientes').update(updates).eq('id', id),
    ]);
  },

  async eliminarCliente(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('clientes').delete().eq('id', id),
      daravisaClient.from('clientes').delete().eq('id', id),
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
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

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
      inttecClient.from('sucursales_cliente').update(updates).eq('id', id),
      daravisaClient.from('sucursales_cliente').update(updates).eq('id', id),
    ]);
  },

  async eliminarSucursal(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('sucursales_cliente').delete().eq('id', id),
      daravisaClient.from('sucursales_cliente').delete().eq('id', id),
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
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

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
      inttecClient.from('proveedores').update(updates).eq('id', id),
      daravisaClient.from('proveedores').update(updates).eq('id', id),
    ]);
  },

  async eliminarProveedor(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('proveedores').delete().eq('id', id),
      daravisaClient.from('proveedores').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // CATEGORIAS
  // ==========================================
  async crearCategoria(categoriaData: { nombre: string }): Promise<CatalogoItem> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

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
      inttecClient.from('categorias').update(updates).eq('id', id),
      daravisaClient.from('categorias').update(updates).eq('id', id),
    ]);
  },

  async eliminarCategoria(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('categorias').delete().eq('id', id),
      daravisaClient.from('categorias').delete().eq('id', id),
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
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

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
      inttecClient.from('subcategorias').update(updates).eq('id', id),
      daravisaClient.from('subcategorias').update(updates).eq('id', id),
    ]);
  },

  async eliminarSubcategoria(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('subcategorias').delete().eq('id', id),
      daravisaClient.from('subcategorias').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // USUARIOS
  // ==========================================
  async crearUsuario(usuarioData: {
    nombre: string;
    email: string;
    password: string;
    rol: 'ADMIN' | 'EMPLEADO' | 'DEV';
    telefono?: string | null;
  }): Promise<Usuario> {
    // Insertar en AMBAS bases con el mismo payload para que el ID sea consistente
    const { data, error } = await inttecClient
      .from('usuarios')
      .insert([usuarioData])
      .select()
      .single();

    if (error) throw error;

    try {
      await daravisaClient.from('usuarios').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando usuario en Daravisa:', syncErr);
    }

    return data as Usuario;
  },

  async actualizarUsuario(id: string, updates: {
    nombre?: string;
    email?: string;
    password?: string;
    rol?: 'ADMIN' | 'EMPLEADO';
    telefono?: string | null;
  }): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('usuarios').update(updates).eq('id', id),
      daravisaClient.from('usuarios').update(updates).eq('id', id),
    ]);
  },

  async eliminarUsuario(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('usuarios').delete().eq('id', id),
      daravisaClient.from('usuarios').delete().eq('id', id),
    ]);
  },

  // ==========================================
  // VEHICULOS
  // ==========================================
  async crearVehiculo(vehiculoData: Omit<Vehiculo, 'id' | 'created_at'>): Promise<Vehiculo> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

    const { data, error } = await primaryClient
      .from('vehiculos')
      .insert([vehiculoData])
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('vehiculos').upsert([data]);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error sincronizando vehiculo:', syncErr);
    }

    return data as Vehiculo;
  },

  async actualizarVehiculo(id: string, updates: Partial<Vehiculo>): Promise<Vehiculo> {
    const activeComp = CompanyService.getActiveCompany();
    const primaryClient = activeComp === 'daravisa' ? daravisaClient : inttecClient;
    const secondaryClient = activeComp === 'daravisa' ? inttecClient : daravisaClient;

    const { data, error } = await primaryClient
      .from('vehiculos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    try {
      await secondaryClient.from('vehiculos').update(updates).eq('id', id);
    } catch (syncErr: any) {
      logger.error('[CatalogService] Error actualizando vehiculo en base secundaria:', syncErr);
    }

    return data as Vehiculo;
  },

  async eliminarVehiculo(id: string): Promise<void> {
    await Promise.allSettled([
      inttecClient.from('vehiculos').delete().eq('id', id),
      daravisaClient.from('vehiculos').delete().eq('id', id),
    ]);
  }
};
