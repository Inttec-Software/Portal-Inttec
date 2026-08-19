// @ts-nocheck
import { buildCFDI40XML, CFDIParams, CFDIConcepto } from './xmlGenerator.ts';

/**
 * Limpia el nombre del receptor para CFDI 4.0 (SAT):
 * Elimina sufijos societarios comunes (S.A. de C.V., S. de R.L., etc.) y lo pasa a MAYÚSCULAS.
 */
function cleanClientLegalName(name: string): string {
  if (!name) return 'PUBLICO EN GENERAL';
  let cleaned = name.toUpperCase().trim();

  // Remover régimen societario común según Anexo 20 CFDI 4.0
  const regimes = [
    /,\s*S\.?\s*A\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /\s+S\.?\s*A\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /,\s*S\.?\s*D\.?\s*E\s*R\.?\s*L\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /\s+S\.?\s*D\.?\s*E\s*R\.?\s*L\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /,\s*S\.?\s*A\.?\s*P\.?\s*I\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /\s+S\.?\s*A\.?\s*P\.?\s*I\.?\s*D\.?\s*E\s*C\.?\s*V\.?/gi,
    /,\s*S\.?\s*C\.?/gi,
    /\s+S\.?\s*C\.?/gi,
    /,\s*A\.?\s*C\.?/gi,
    /\s+A\.?\s*C\.?/gi,
    /,\s*S\.?\s*A\.?/gi,
    /\s+S\.?\s*A\.?/gi,
    /,\s*S\.?\s*A\.?\s*S\.?/gi,
    /\s+S\.?\s*A\.?\s*S\.?/gi,
  ];

  regimes.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });

  return cleaned.trim();
}

/**
 * Mapea formas de pago comunes a claves del SAT
 */
function mapFormaPagoSAT(forma?: string): string {
  if (!forma) return '01'; // Default Efectivo
  const f = forma.toLowerCase().trim();
  if (f.includes('transferencia') || f === '03') return '03';
  if (f.includes('credito') || f === '04') return '04';
  if (f.includes('debito') || f === '28') return '28';
  if (f.includes('cheque') || f === '02') return '02';
  if (f.includes('por definir') || f.includes('definir') || f === '99') return '99';
  if (/^\d{2}$/.test(f)) return f;
  return '03'; // Transferencia electrónica por defecto para ventas empresariales
}

export async function buildUnsignedCFDI(ventaData: any, clienteData: any, partidas: any[], isProduction: boolean = false) {
  // Configuración del Emisor (Variables de Entorno o defaults)
  const emisorRfc = Deno.env.get('EMISOR_RFC') || (isProduction ? 'FETR83041461A' : 'EKU9003173C9');
  const emisorNombre = Deno.env.get('EMISOR_NOMBRE') || (isProduction ? 'RAFAEL ALONSO FERNANDEZ TINAJERO' : 'ESCUELA KEMPER URATE');
  const emisorRegimen = Deno.env.get('EMISOR_REGIMEN') || (isProduction ? '612' : '601');
  const emisorCP = Deno.env.get('EMISOR_CP') || (isProduction ? '31110' : '77500');

  // Mapeo de conceptos/partidas
  const conceptos: CFDIConcepto[] = partidas.map((p: any) => {
    const cantidad = parseFloat(p.cantidad || 1);
    const precio = parseFloat(p.precio_unitario_venta || p.precio_unitario || p.precio || 0);
    const importe = cantidad * precio;
    const iva = importe * 0.16;

    return {
      ClaveProdServ: p.clave_sat || p.clave_prod_serv || '01010101',
      ClaveUnidad: p.clave_unidad || p.unidad_sat || 'H87',
      Unidad: p.unidad || 'Pieza',
      Descripcion: p.descripcion || p.nombre_producto || 'Producto / Servicio',
      NoIdentificacion: p.sku || p.id ? String(p.sku || p.id) : undefined,
      Cantidad: cantidad,
      ValorUnitario: precio,
      Importe: importe,
      ObjetoImp: "02", // Sí objeto de impuesto (IVA 16%)
      BaseIva: importe,
      ImporteIva: iva,
    };
  });

  const subTotal = conceptos.reduce((sum, c) => sum + c.Importe, 0);
  const totalImpuestos = conceptos.reduce((sum, c) => sum + (c.ImporteIva || 0), 0);
  const total = subTotal + totalImpuestos;

  // Validación y normalización del Receptor
  const isPublicoGeneral = !clienteData?.rfc || clienteData.rfc.trim().toUpperCase() === 'XAXX010101000';
  const receptorRfc = isPublicoGeneral ? 'XAXX010101000' : clienteData.rfc.trim().toUpperCase();
  const receptorNombre = isPublicoGeneral ? 'PUBLICO EN GENERAL' : cleanClientLegalName(clienteData.razon_social || clienteData.nombre);
  const receptorCP = isPublicoGeneral ? emisorCP : (clienteData.codigo_postal || emisorCP);
  const receptorRegimen = isPublicoGeneral ? '616' : (clienteData.regimen_fiscal || '601');
  const receptorUsoCFDI = isPublicoGeneral ? 'S01' : (clienteData.uso_cfdi || 'G03');

  // Forma y Método de Pago
  const formaPago = mapFormaPagoSAT(ventaData.metodo_pago || ventaData.forma_pago);
  const metodoPago = formaPago === '99' ? 'PPD' : (ventaData.metodo_pago_cfdi || 'PUE');

  // Fecha actual en hora local/ISO sin milisegundos (YYYY-MM-DDTHH:mm:ss)
  const fecha = new Date().toISOString().substring(0, 19);

  const params: CFDIParams = {
    Serie: 'A',
    Folio: String(ventaData.id || Date.now()),
    Fecha: fecha,
    FormaPago: formaPago,
    MetodoPago: metodoPago,
    Moneda: 'MXN',
    SubTotal: subTotal,
    Total: total,
    LugarExpedicion: emisorCP,
    Emisor: {
      Rfc: emisorRfc,
      Nombre: emisorNombre,
      RegimenFiscal: emisorRegimen,
    },
    Receptor: {
      Rfc: receptorRfc,
      Nombre: receptorNombre,
      DomicilioFiscalReceptor: receptorCP,
      RegimenFiscalReceptor: receptorRegimen,
      UsoCFDI: receptorUsoCFDI,
    },
    Conceptos: conceptos,
  };

  // Finkok sign_stamp colocará automáticamente el Sello, NoCertificado y Certificado con los CSD del Emisor
  return buildCFDI40XML(params, "", "");
}
