const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project();
const sourceFile = project.addSourceFileAtPath(path.join(__dirname, 'src', 'utils', 'reportGenerator.ts'));

const reportGenerator = sourceFile.getVariableDeclaration('ReportGenerator').getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

const replaceFunction = (oldName, newName, bodyText) => {
  const method = reportGenerator.getProperty(oldName);
  if (method) {
    const isAsync = method.hasModifier(SyntaxKind.AsyncKeyword) || bodyText.includes('async ');
    const params = method.getParameters().map(p => p.getText());
    // update default filename .csv to .xlsx
    const newParams = params.map(p => p.replace(/\.csv/g, '.xlsx'));
    
    reportGenerator.addMethod({
      name: newName,
      isAsync: true,
      parameters: method.getParameters().map((p, i) => ({
        name: p.getName(),
        type: p.getTypeNode() ? p.getTypeNode().getText() : undefined,
        initializer: p.getInitializer() ? p.getInitializer().getText().replace(/\.csv/g, '.xlsx') : undefined
      })),
      returnType: 'Promise<void>',
      statements: bodyText
    });
    method.remove();
  }
};

const movBody = `
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
`;

const gasBody = `
    if (registros.length === 0) {
      throw new Error('No hay registros para exportar.');
    }
    const headers = ['Fecha','Empresa Registradora','Conductor','Vehículo Marca','Vehículo Modelo','Placas','Km Anterior','Km Actual','Distancia Recorrida (km)','Litros','Rendimiento (km/L)','Costo Total (MXN)','Observaciones'];
    const rows = registros.map(r => {
      const fecha = r.fecha_carga || r.created_at?.split('T')[0] || '';
      const distancia = Number(r.kilometraje) - Number(r.kilometraje_anterior || r.kilometraje);
      const litros = Number(r.litros_cargados) || 0;
      const rendimiento = litros > 0 && distancia > 0 ? (distancia / litros).toFixed(2) : '0.00';
      return [ fecha, r.empresa_origen || 'N/A', r.empleado_nombre || 'Desconocido', r.vehiculo_marca || 'N/A', r.vehiculo_modelo || 'N/A', r.vehiculo_placas || 'N/A', r.kilometraje_anterior || r.kilometraje, r.kilometraje, distancia, litros, rendimiento, Number(r.monto_total || 0).toFixed(2), r.observaciones || '' ];
    });
    await ReportGenerator._exportArrayToXLSX('Gasolina', headers, rows, fileName);
`;

const gastosBody = `
    if (gastos.length === 0) {
      throw new Error('No hay gastos para exportar.');
    }
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
`;

const asisBody = `
    if (asistencias.length === 0) {
      throw new Error('No hay asistencias para exportar.');
    }
    const headers = ['ID','Fecha','Empleado Nombre','Empresa','Hora Entrada','Dirección Entrada','Hora Salida','Dirección Salida'];
    const rows = asistencias.map(a => {
      const empleadoNombre = a.empleados ? \`\${a.empleados.nombre || ''} \${a.empleados.apellidos || ''}\`.trim() : (a.empleado_nombre || 'Desconocido');
      return [ a.id, a.fecha, empleadoNombre, a.empresa_origen || 'N/A', a.hora_entrada || 'Sin registro', a.direccion_entrada || '', a.hora_salida || 'Sin registro', a.direccion_salida || '' ];
    });
    await ReportGenerator._exportArrayToXLSX('Asistencias', headers, rows, fileName);
`;

const invBody = `
    if (productos.length === 0) {
      throw new Error('No hay productos para exportar.');
    }
    const headers = ['ID','SKU','Producto','Categoría','Unidad','Stock Actual (Nuevo)','Stock Usado','Stock Por Revisar','Stock Total Sumado','Punto Reorden','Ubicación','Precio Unit.'];
    const rows = productos.map(p => {
      const categoriaNombre = categorias.find((c: any) => c.id === p.categoria_id)?.nombre || 'Sin Categoría';
      const sNuevo = Number(p.stock_nuevo || 0);
      const sUsado = Number(p.stock_usado || 0);
      const sRevision = Number(p.stock_por_revisar || 0);
      return [ p.id, p.sku_interno || '-', p.nombre_oficial || 'Producto', categoriaNombre, p.unidad_medida || 'pza', sNuevo, sUsado, sRevision, (sNuevo+sUsado+sRevision), p.punto_reorden || 0, p.ubicacion_almacen || '', p.precio_unitario || 0 ];
    });
    await ReportGenerator._exportArrayToXLSX('Inventario', headers, rows, filename);
`;

const consBody = `
    if (consumos.length === 0) {
      throw new Error('No hay consumos para exportar.');
    }
    const headers = ['ID','Fecha','Empleado Nombre','SKU','Producto','Categoría','Cantidad Consumida','Proyecto/Uso','Costo Estimado'];
    const rows = consumos.map(c => [ c.id, c.fecha ? c.fecha.split('T')[0] : '', c.empleado_nombre || 'Desconocido', c.producto_sku || '-', c.producto_nombre || 'Producto', c.categoria_nombre || '', c.cantidad || 0, c.detalle_motivo || '', c.costo_total || 0 ]);
    await ReportGenerator._exportArrayToXLSX('Consumos', headers, rows, filename);
`;

const retBody = `
    if (retiros.length === 0) {
      throw new Error('No hay retiros para exportar.');
    }
    const headers = ['ID','Fecha de Retiro','Empleado','SKU','Herramienta','Estado Entrega','Cantidad Prestada','Proyecto / Motivo'];
    const rows = retiros.map(r => [ r.id, r.fecha ? r.fecha.split('T')[0] : '', r.empleado_nombre || 'Desconocido', r.producto_sku || '-', r.producto_nombre || 'Herramienta', r.estado_entrega || 'NUEVA', r.cantidad || 0, r.detalle_motivo || '' ]);
    await ReportGenerator._exportArrayToXLSX('Retiros', headers, rows, filename);
`;

const ventBody = `
    if (ventas.length === 0) {
      throw new Error('No hay ventas para exportar.');
    }
    const headers = ['ID','Folio','Fecha Creación','Cliente','Vendedor','Estatus','Monto Total'];
    const rows = ventas.map(v => [ v.id, v.folio || 'S/F', v.created_at ? v.created_at.split('T')[0] : '', v.cliente_nombre || 'Desconocido', v.vendedor_nombre || 'Desconocido', v.estatus || '', v.total || 0 ]);
    await ReportGenerator._exportArrayToXLSX('Ventas', headers, rows, fileName);
`;

replaceFunction('exportMovimientosToCSV', 'exportMovimientosToXLSX', movBody);
replaceFunction('exportToCSV', 'exportToXLSX', gastosBody);
replaceFunction('exportGasolinaToCSV', 'exportGasolinaToXLSX', gasBody);
replaceFunction('exportAsistenciasToCSV', 'exportAsistenciasToXLSX', asisBody);
replaceFunction('exportInventarioToCSV', 'exportInventarioToXLSX', invBody);
replaceFunction('exportConsumosToCSV', 'exportConsumosToXLSX', consBody);
replaceFunction('exportRetirosToCSV', 'exportRetirosToXLSX', retBody);
replaceFunction('exportVentasToCSV', 'exportVentasToXLSX', ventBody);

sourceFile.saveSync();
console.log('Saved AST changes.');
