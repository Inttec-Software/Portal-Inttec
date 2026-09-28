const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'utils', 'reportGenerator.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. exportMovimientosToCSV -> exportMovimientosToXLSX
content = content.replace(
  /async exportMovimientosToCSV\(movimientos: any\[\], filename: string = 'reporte_movimientos_inventario\.csv'\): Promise<void> {[\s\S]*?const csvContent = '[^']*' \+ \[headers\.join\(\',\',\), \.\.\.rows\.map\(r => r\.join\(\',\'\)\)\]\.join\(\'\\r\\n\'\);[\s\S]*?\}\s*\},/m,
  `async exportMovimientosToXLSX(movimientos: any[], filename: string = 'reporte_movimientos_inventario.xlsx'): Promise<void> {
    if (movimientos.length === 0) {
      throw new Error('No hay movimientos para exportar.');
    }
    const headers = [ 'ID', 'Fecha', 'Tipo', 'Subtipo', 'SKU', 'Producto', 'Cantidad', 'Unidad', 'Responsable / Usuario', 'Proveedor', 'Cliente', 'Tipo de Gasto', 'Folio / Concepto / Detalle' ];
    const rows = movimientos.map(m => [
      m.id,
      m.fecha ? new Date(m.fecha).toISOString().replace('T', ' ').substring(0, 19) : '',
      m.tipo || 'MOVIMIENTO',
      m.subtipo || m.tipo || '',
      m.producto_sku || '-',
      m.producto_nombre || 'Producto',
      m.cantidad || 0,
      m.producto_unidad || 'pza',
      m.usuario_nombre || m.empleado_nombre || 'Almacén',
      m.proveedor_nombre || '',
      m.cliente_nombre || '',
      m.tipo_gasto || '',
      m.detalle_motivo || m.folio_factura || ''
    ]);
    await ReportGenerator._exportArrayToXLSX('Movimientos', headers, rows, filename);
  },`
);

// 2. exportToCSV -> exportToXLSX
content = content.replace(
  /async exportToCSV\(gastos: Gasto\[\], fileName: string = 'reporte_gastos\.csv'\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportToXLSX(gastos: Gasto[], fileName: string = 'reporte_gastos.xlsx'): Promise<void> {
    if (gastos.length === 0) throw new Error('No hay gastos para exportar.');
    const headers = ['ID','Fecha','Empleado Nombre','Monto','Categoria','Subcategoria','Proveedor','Cliente','Servicio/Proyecto','Detalle','Sucursal','Metodo Pago','Tipo Tarjeta','Estado Factura','Motivo Sin Factura','Status','Comentarios'];
    const rows = gastos.map(g => {
      const fecha = g.fecha_comprobante || g.created_at?.split('T')[0] || '';
      let estadoFactura = 'No Facturado';
      if (g.facturado === true) estadoFactura = 'Facturado';
      else if (g.motivo_sin_factura === 'PENDIENTE_ENTREGA' || g.motivo_sin_factura?.toLowerCase().includes('pendiente')) estadoFactura = 'Pendiente de Entregar';
      const commentText = g.justificacion ? g.justificacion.replace(/\\[[\\s\\S]*?\\]/g, '').trim() : '';
      return [ g.id, fecha, g.empleado_nombre, g.monto, GastoHelper.getCategoria(g), GastoHelper.getSubcategoria(g), GastoHelper.getProveedor(g), GastoHelper.getCliente(g), g.tipo_servicio_proyecto, g.detalle_servicio_proyecto, GastoHelper.getSucursal(g), g.metodo_pago, g.tipo_tarjeta, estadoFactura, g.motivo_sin_factura, g.status, commentText ];
    });
    await ReportGenerator._exportArrayToXLSX('Gastos', headers, rows, fileName);
  },`
);

// 3. exportGasolinaToCSV -> exportGasolinaToXLSX
content = content.replace(
  /async exportGasolinaToCSV\([\s\S]*?fileName: string = 'reporte_gasolina\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportGasolinaToXLSX(registros: any[], fileName: string = 'reporte_gasolina.xlsx'): Promise<void> {
    if (registros.length === 0) throw new Error('No hay registros para exportar.');
    const headers = ['Fecha','Empresa Registradora','Conductor','Vehículo Marca','Vehículo Modelo','Placas','Km Anterior','Km Actual','Distancia Recorrida (km)','Litros','Rendimiento (km/L)','Costo Total (MXN)','Observaciones'];
    const rows = registros.map(r => {
      const fecha = r.fecha_carga || r.created_at?.split('T')[0] || '';
      const distancia = Number(r.kilometraje) - Number(r.kilometraje_anterior || r.kilometraje);
      const litros = Number(r.litros_cargados) || 0;
      const rendimiento = litros > 0 && distancia > 0 ? (distancia / litros).toFixed(2) : '0.00';
      return [ fecha, r.empresa_origen || 'N/A', r.empleado_nombre || 'Desconocido', r.vehiculo_marca || 'N/A', r.vehiculo_modelo || 'N/A', r.vehiculo_placas || 'N/A', r.kilometraje_anterior || r.kilometraje, r.kilometraje, distancia, litros, rendimiento, Number(r.monto_total || 0).toFixed(2), r.observaciones || '' ];
    });
    await ReportGenerator._exportArrayToXLSX('Gasolina', headers, rows, fileName);
  },`
);

// 4. exportAsistenciasToCSV -> exportAsistenciasToXLSX
content = content.replace(
  /async exportAsistenciasToCSV\([\s\S]*?fileName: string = 'reporte_asistencias\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportAsistenciasToXLSX(asistencias: any[], fileName: string = 'reporte_asistencias.xlsx'): Promise<void> {
    if (asistencias.length === 0) throw new Error('No hay asistencias para exportar.');
    const headers = ['ID','Fecha','Empleado Nombre','Empresa','Hora Entrada','Dirección Entrada','Hora Salida','Dirección Salida'];
    const rows = asistencias.map(a => [ a.id, a.fecha, a.empleado_nombre || 'Desconocido', a.empresa_origen || 'N/A', a.hora_entrada || 'Sin registro', a.direccion_entrada || '', a.hora_salida || 'Sin registro', a.direccion_salida || '' ]);
    await ReportGenerator._exportArrayToXLSX('Asistencias', headers, rows, fileName);
  },`
);

// 5. exportInventarioToCSV -> exportInventarioToXLSX
content = content.replace(
  /async exportInventarioToCSV\([\s\S]*?filename: string = 'reporte_inventario_actual\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportInventarioToXLSX(productos: any[], filename: string = 'reporte_inventario_actual.xlsx'): Promise<void> {
    if (productos.length === 0) throw new Error('No hay productos para exportar.');
    const headers = ['ID','SKU','Producto','Categoría','Unidad','Stock Actual (Nuevo)','Stock Usado','Stock Por Revisar','Stock Total Sumado','Punto Reorden','Ubicación','Precio Unit.'];
    const rows = productos.map(p => [ p.id, p.sku_interno || '-', p.nombre_oficial || 'Producto', p.categoria_nombre || 'Sin Categoría', p.unidad_medida || 'pza', p.stock_nuevo || 0, p.stock_usado || 0, p.stock_por_revisar || 0, (Number(p.stock_nuevo||0)+Number(p.stock_usado||0)+Number(p.stock_por_revisar||0)), p.punto_reorden || 0, p.ubicacion_almacen || '', p.precio_unitario || 0 ]);
    await ReportGenerator._exportArrayToXLSX('Inventario', headers, rows, filename);
  },`
);

// 6. exportConsumosToCSV -> exportConsumosToXLSX
content = content.replace(
  /async exportConsumosToCSV\([\s\S]*?filename: string = 'reporte_consumos_empleados\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportConsumosToXLSX(consumos: any[], filename: string = 'reporte_consumos_empleados.xlsx'): Promise<void> {
    if (consumos.length === 0) throw new Error('No hay consumos para exportar.');
    const headers = ['ID','Fecha','Empleado Nombre','SKU','Producto','Categoría','Cantidad Consumida','Proyecto/Uso','Costo Estimado'];
    const rows = consumos.map(c => [ c.id, c.fecha ? c.fecha.split('T')[0] : '', c.empleado_nombre || 'Desconocido', c.producto_sku || '-', c.producto_nombre || 'Producto', c.categoria_nombre || '', c.cantidad || 0, c.detalle_motivo || '', c.costo_total || 0 ]);
    await ReportGenerator._exportArrayToXLSX('Consumos', headers, rows, filename);
  },`
);

// 7. exportRetirosToCSV -> exportRetirosToXLSX
content = content.replace(
  /async exportRetirosToCSV\([\s\S]*?filename: string = 'reporte_retiros_herramienta\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportRetirosToXLSX(retiros: any[], filename: string = 'reporte_retiros_herramienta.xlsx'): Promise<void> {
    if (retiros.length === 0) throw new Error('No hay retiros para exportar.');
    const headers = ['ID','Fecha de Retiro','Empleado','SKU','Herramienta','Estado Entrega','Cantidad Prestada','Proyecto / Motivo'];
    const rows = retiros.map(r => [ r.id, r.fecha ? r.fecha.split('T')[0] : '', r.empleado_nombre || 'Desconocido', r.producto_sku || '-', r.producto_nombre || 'Herramienta', r.estado_entrega || 'NUEVA', r.cantidad || 0, r.detalle_motivo || '' ]);
    await ReportGenerator._exportArrayToXLSX('Retiros', headers, rows, filename);
  },`
);

// 8. exportVentasToCSV -> exportVentasToXLSX
content = content.replace(
  /async exportVentasToCSV\([\s\S]*?fileName: string = 'reporte_ventas\.csv'[\s\S]*?\): Promise<void> {[\s\S]*?\}\s*\},/m,
  `async exportVentasToXLSX(ventas: any[], fileName: string = 'reporte_ventas.xlsx'): Promise<void> {
    if (ventas.length === 0) throw new Error('No hay ventas para exportar.');
    const headers = ['ID','Folio','Fecha Creación','Cliente','Vendedor','Estatus','Monto Total'];
    const rows = ventas.map(v => [ v.id, v.folio || 'S/F', v.created_at ? v.created_at.split('T')[0] : '', v.cliente_nombre || 'Desconocido', v.vendedor_nombre || 'Desconocido', v.estatus || '', v.total || 0 ]);
    await ReportGenerator._exportArrayToXLSX('Ventas', headers, rows, fileName);
  },`
);

fs.writeFileSync(filePath, content);
console.log('Replaced all CSV exports with XLSX.');
