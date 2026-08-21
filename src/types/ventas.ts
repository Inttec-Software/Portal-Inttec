export interface CotizacionLinea {
  id: string;
  productoId?: string;
  productoNombre: string; // Nombre principal
  productoDescripcion: string; // Detalles o lo que incluye
  claveFacturacion?: string; // Clave especial para facturas (ej. Clave SAT)
  tiempoEntrega: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  impuestoPorcentaje: number; // Ej: 16 para el IVA del 16%
  importe: number;
}

export interface Cotizacion {
  id?: string;
  numeroCotizacion: string; // Folio único autogenerado o secuencial. Ej: '26070701'
  cotizacionRelacionada?: string; // Folio de la cotización relacionada (para órdenes de venta)
  clienteNombre: string;
  clienteRFC?: string;
  clienteCorreo?: string;
  clienteCP?: string;
  direccionFactura?: string;
  sucursal?: string;
  fechaCreacion: string;
  vendedor: string; // Ej: 'Rafael Fernandez'
  moneda: string; // Ej: 'MXN'
  lineas: CotizacionLinea[];
  terminosCondiciones?: string;
  estado?: string;
  subtotal: number;
  iva: number;
  total: number;
}
