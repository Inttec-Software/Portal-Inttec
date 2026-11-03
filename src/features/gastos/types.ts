import { CatalogoItem, SubcategoriaItem, ProveedorItem, Usuario, Vehiculo, SucursalCliente, Gasto } from '@/services/supabase';

export type GastoFormRole = 'admin' | 'empleado';
export type GastoFormMode = 'create' | 'edit';

export interface TicketFileItem {
  uri: string;
  base64?: string;
  ext: string;
  isRemote?: boolean;
}

export interface FacturaPdfItem {
  uri: string;
  name: string;
  base64: string;
  isRemote?: boolean;
}

export interface SplitGastoItem {
  id: string;
  clienteId: string;
  sucursalNombre: string;
  comentarioSucursal?: string;
  monto: string;
}

export type MetodoPagoGasto =
  | 'efectivo'
  | 'tarjeta'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'transferencia'
  | 'monedero_electronico';

export type TipoTarjetaGasto =
  | 'BBVA'
  | 'AMEX'
  | 'MARRIOT'
  | 'BANORTE'
  | 'INVEX'
  | 'MERCADO PAGO'
  | 'HILTON'
  | null;

export type TipoServicioProyectoGasto = 'Servicio' | 'Proyecto' | 'Venta' | 'Operativo' | null;

export type FacturaStatusGasto = 'SI' | 'PENDIENTE' | 'NO' | null;

export interface FormCatalogsResponse {
  categorias?: CatalogoItem[];
  subcategorias?: SubcategoriaItem[];
  clientes?: CatalogoItem[];
  usuarios?: Usuario[];
  sucursales?: SucursalCliente[];
  proveedores?: ProveedorItem[];
  vehiculos?: Vehiculo[];
}

export type GastoDisplay = Gasto & { isOffline?: boolean };

export interface PartidaEditable {
  id: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_unitario_venta: string;
  costo_unitario_proveedor: string;
}
