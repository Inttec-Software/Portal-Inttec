export interface Categoria {
  id: string;
  nombre: string;
  descripcion?: string | null;
}

export interface Proveedor {
  id: string;
  nombre: string;
  rfc: string;
}

export interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  categoria_id?: string;
  proveedor_id?: string | null;
  stock_actual: number;
  stock_nuevo?: number;
  stock_usado?: number;
  stock_por_revisar?: number;
  unidad?: string;
  precio_unitario?: number;
  activo?: boolean;
}

export interface FacturaItemStaging {
  id: string; // ID temporal en UI
  nombreFactura: string; // Nombre del producto según el proveedor
  cantidad: number;
  precioUnitario: number;
  productoIdSugerido?: string; // ID del producto asociado en catálogo
  esNuevoProducto: boolean;
  categoriaSeleccionadaId?: string; // Si es nuevo, categoría asignada
  skuSugerido?: string; // SKU que se asignará si es un producto nuevo
}

export interface ConsumoItem {
  id: string;
  productoId: string;
  cantidad: number;
}

export interface AsignarItem {
  id: string;
  productoId: string;
  cantidad: number;
}

export interface MovimientoItemProps {
  m: any;
  themeColors: any;
  exportingSingleMovimientoId: string | null;
  onExportSingleVale: (mov: any) => void;
  onDeleteMovimiento: (mov: any) => void;
}

export interface CartItem {
  producto: Producto;
  cantidad: number | '';
  cantidad_nuevo?: number | '';
  cantidad_usado?: number | '';
  cantidad_por_revisar?: number | '';
}

export interface InventarioItem {
  id: string;
  producto_id: string;
  cantidad_disponible: number;
  cantidad_nuevo?: number;
  cantidad_usado?: number;
  cantidad_por_revisar?: number;
  producto: {
    id?: string;
    nombre_oficial: string;
    sku_interno: string;
    unidad?: string;
    categoria?: string;
    stock_actual?: number;
    stock_nuevo?: number;
    stock_usado?: number;
    stock_por_revisar?: number;
  };
}

export interface MaterialItem {
  productoId: string;
  nombre: string;
  sku: string;
  unidad: string;
  maximo: number;
  pos_nuevo: number;
  pos_usado: number;
  pos_por_revisar: number;
  stock_nuevo: number;
  stock_usado: number;
  stock_por_revisar: number;
  hasUsedOrDamaged: boolean;
  cantidad_nuevo: number | '';
  cantidad_usado: number | '';
  cantidad_por_revisar: number | '';
  cantidad: number;
}

export interface EmpleadosStockResumen {
  total_empleados: number;
  total_productos_distintos: number;
  total_articulos: number;
  total_valor_estimado: number;
}

export interface EmpleadosStockData {
  resumen: EmpleadosStockResumen;
  inventario: any[];
  por_empleado: any[];
  por_producto: any[];
}

export type AdminTabType =
  | 'importacion'
  | 'categorias'
  | 'retribuciones'
  | 'movimientos'
  | 'empleados_stock'
  | 'inventario_personal';

export type EmpleadoInventarioTabType = 'stock' | 'devolucion' | 'gasto';
export type DevolucionTabType = EmpleadoInventarioTabType;
export type TipoGastoMaterial = 'Servicio' | 'Proyecto' | 'Venta' | 'Operativo';
