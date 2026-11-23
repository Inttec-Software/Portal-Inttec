export interface OrdenCompraLinea {
  id: string;
  productoId?: string;
  productoNombre: string;
  productoDescripcion: string;
  tiempoEntrega: string;
  unidad: string; // Ej. 'Pieza', 'Unidad', 'Servicio'
  cantidad: number;
  precioLista: number;
  descuentoPorcentaje: number; // Ajuste porcentual %+- (positivo para arriba/incremento, negativo para abajo/descuento)
  precioUnitario: number; // precioLista * (1 + descuentoPorcentaje / 100)
  impuestoPorcentaje: number; // Ej. 16 para IVA 16%
  importe: number; // cantidad * precioUnitario
  cantidadStr?: string;
  precioListaStr?: string;
  descuentoPorcentajeStr?: string;
  precioUnitarioStr?: string;
  impuestoPorcentajeStr?: string;
}

export interface OrdenCompra {
  id?: string;
  folio: string;
  proveedorId?: string;
  proveedorNombre: string;
  proveedorRFC?: string;
  proveedorCorreo?: string;
  proveedorCalleNumero?: string;
  proveedorColonia?: string;
  proveedorCiudad?: string;
  proveedorEstado?: string;
  proveedorCP?: string;
  referencia?: string;
  facturar: boolean;
  estatusProceso: string; // 'En Proceso' | 'Enviada' | 'Recibida' | 'Borrador' | 'Cancelada'
  moneda: string; // 'MXN' | 'USD' | 'EUR'
  tipoCambio: number;
  fechaCreacion: string;
  realizoCompra: string;
  recibidoPor?: string;
  lineas: OrdenCompraLinea[];
  observaciones?: string;
  condicionesTrabajo?: string;
  clienteFinal?: string; // Datos del cliente final (razón social, contacto, entrega, etc.)
  subtotal: number;
  iva: number;
  total: number;
}
