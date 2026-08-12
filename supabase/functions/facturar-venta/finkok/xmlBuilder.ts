import { buildCFDI40XML, CFDIParams, CFDIConcepto } from './xmlGenerator.ts';

export async function buildUnsignedCFDI(ventaData: any, clienteData: any, partidas: any[]) {
  const conceptos: CFDIConcepto[] = partidas.map((p: any) => {
    const cantidad = parseFloat(p.cantidad || 1);
    const precio = parseFloat(p.precio_unitario || p.precio || 0);
    const importe = cantidad * precio;
    const iva = importe * 0.16;

    return {
      ClaveProdServ: '01010101', // TODO: Reemplazar con clave real de producto
      Cantidad: cantidad,
      ClaveUnidad: 'H87', // Pieza por defecto
      Descripcion: p.nombre_producto || p.descripcion || 'Producto',
      ValorUnitario: precio,
      Importe: importe,
      ObjetoImp: "02", // Sí objeto de impuesto
      BaseIva: importe,
      ImporteIva: iva,
    };
  });

  const subTotal = conceptos.reduce((sum, c) => sum + c.Importe, 0);
  const total = conceptos.reduce((sum, c) => sum + c.Importe + (c.ImporteIva || 0), 0);

  const params: CFDIParams = {
    Serie: 'A',
    Folio: ventaData.id.toString(),
    Fecha: new Date().toISOString().substring(0, 19), // YYYY-MM-DDTHH:mm:ss
    SubTotal: subTotal,
    Total: total,
    LugarExpedicion: '77500', // Reemplazar con el CP del emisor real
    Emisor: {
      Rfc: 'EKU9003173C9', // RFC Emisor (Ejemplo de prueba)
      Nombre: 'ESCUELA KEMPER URATE', // Nombre Emisor
      RegimenFiscal: '601', // General de Ley Personas Morales
    },
    Receptor: {
      Rfc: clienteData.rfc || 'XAXX010101000',
      Nombre: clienteData.razon_social || clienteData.nombre,
      DomicilioFiscalReceptor: clienteData.codigo_postal || '77500', // Debe ser igual al del emisor si es público general
      RegimenFiscalReceptor: clienteData.regimen_fiscal || '616',
      UsoCFDI: clienteData.uso_cfdi || 'S01',
    },
    Conceptos: conceptos
  };

  // Finkok sign_stamp llenará el Sello, NoCertificado y Certificado con los CSD subidos a su plataforma.
  // Por requerimiento del esquema, pueden enviarse vacíos.
  return buildCFDI40XML(params, "", "");
}
