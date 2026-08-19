/**
 * Parser de archivos XML CFDI 3.3 y 4.0 del SAT
 */

export interface ConceptoParsed {
  claveProdServ?: string;
  noIdentificacion?: string;
  cantidad?: number;
  claveUnidad?: string;
  unidad?: string;
  descripcion: string;
  valorUnitario?: number;
  importe?: number;
  descuento?: number;
}

export interface FacturaParsed {
  uuid: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  fechaEmision: string;
  subtotal: number;
  descuento: number;
  iva: number;
  retencionIsr: number;
  retencionIva: number;
  total: number;
  moneda: string;
  tipoComprobante: string; // 'I', 'E', 'P', 'N', 'T'
  estadoSat: string;
  conceptos: ConceptoParsed[];
  xmlOriginal: string;
}

export function parseCfdiXml(xmlString: string): FacturaParsed {
  // UUID (TimbreFiscalDigital)
  const uuidMatch = xmlString.match(/UUID="([^"]+)"/i);
  if (!uuidMatch || !uuidMatch[1]) {
    throw new Error("El XML no contiene un Timbre Fiscal Digital con UUID válido.");
  }
  const uuid = uuidMatch[1].toUpperCase();

  // Emisor
  const emisorTagMatch = xmlString.match(/<cfdi:Emisor\s+([^>]+)>/i);
  let rfcEmisor = 'DESCONOCIDO';
  let nombreEmisor = 'DESCONOCIDO';

  if (emisorTagMatch && emisorTagMatch[1]) {
    const rfcM = emisorTagMatch[1].match(/\bRfc="([^"]+)"/i);
    const nomM = emisorTagMatch[1].match(/\bNombre="([^"]+)"/i);
    if (rfcM) rfcEmisor = rfcM[1].trim().toUpperCase();
    if (nomM) nombreEmisor = nomM[1].trim();
  } else {
    const rfcFallback = xmlString.match(/\bRfc="([^"]+)"/i);
    if (rfcFallback) rfcEmisor = rfcFallback[1].trim().toUpperCase();
  }
  if (nombreEmisor === 'DESCONOCIDO') {
    nombreEmisor = rfcEmisor;
  }

  // Receptor
  let rfcReceptor = '';
  const receptorTagMatch = xmlString.match(/<cfdi:Receptor\s+([^>]+)>/i);
  if (receptorTagMatch && receptorTagMatch[1]) {
    const rfcRecM = receptorTagMatch[1].match(/\bRfc="([^"]+)"/i);
    if (rfcRecM) rfcReceptor = rfcRecM[1].trim().toUpperCase();
  }

  // Comprobante atributos (usar límites de palabra \b para no confundir Total con SubTotal)
  const fechaMatch = xmlString.match(/\bFecha="([^"]+)"/i);
  const subtotalMatch = xmlString.match(/\bSubTotal="([^"]+)"/i);
  const descuentoMatch = xmlString.match(/\bDescuento="([^"]+)"/i);
  const totalMatch = xmlString.match(/\bTotal="([^"]+)"/i);
  const monedaMatch = xmlString.match(/\bMoneda="([^"]+)"/i);
  const tipoMatch = xmlString.match(/\bTipoDeComprobante="([^"]+)"/i);

  const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : 0;
  const descuento = descuentoMatch ? parseFloat(descuentoMatch[1]) : 0;
  const total = totalMatch ? parseFloat(totalMatch[1]) : 0;
  const moneda = monedaMatch ? monedaMatch[1].trim().toUpperCase() : 'MXN';
  const tipoComprobante = tipoMatch ? tipoMatch[1].trim().toUpperCase() : 'I';
  const fechaEmision = fechaMatch ? fechaMatch[1] : new Date().toISOString();

  // Impuestos Trasladados (IVA 16%, 8%, etc. solo bajo cfdi:Impuestos generales)
  let iva = 0;
  const trasladosMatches = [...xmlString.matchAll(/<cfdi:Traslado[^>]*\bImporte="([^"]+)"[^>]*>/gi)];
  for (const match of trasladosMatches) {
    iva += parseFloat(match[1]) || 0;
  }

  // Retenciones (ISR, IVA)
  let retencionIsr = 0;
  let retencionIva = 0;
  const retencionesMatches = [...xmlString.matchAll(/<cfdi:Retencion[^>]*\bImpuesto="([^"]+)"[^>]*\bImporte="([^"]+)"[^>]*>/gi)];
  for (const match of retencionesMatches) {
    const imp = match[1];
    const val = parseFloat(match[2]) || 0;
    if (imp === '001') retencionIsr += val; // 001 = ISR
    if (imp === '002') retencionIva += val; // 002 = IVA
  }

  // Conceptos / Partidas
  const conceptos: ConceptoParsed[] = [];
  const conceptoRegex = /<cfdi:Concepto\s+([^>]+)>/gi;
  const conceptoMatches = [...xmlString.matchAll(conceptoRegex)];

  for (const match of conceptoMatches) {
    const attrString = match[1];
    const descMatch = attrString.match(/\bDescripcion="([^"]+)"/i);
    const cantMatch = attrString.match(/\bCantidad="([^"]+)"/i);
    const valUnitMatch = attrString.match(/\bValorUnitario="([^"]+)"/i);
    const impMatch = attrString.match(/\bImporte="([^"]+)"/i);
    const claveProdServMatch = attrString.match(/\bClaveProdServ="([^"]+)"/i);

    if (descMatch) {
      conceptos.push({
        claveProdServ: claveProdServMatch ? claveProdServMatch[1] : undefined,
        cantidad: cantMatch ? parseFloat(cantMatch[1]) : 1,
        descripcion: descMatch[1],
        valorUnitario: valUnitMatch ? parseFloat(valUnitMatch[1]) : 0,
        importe: impMatch ? parseFloat(impMatch[1]) : 0
      });
    }
  }

  return {
    uuid,
    rfcEmisor,
    nombreEmisor,
    rfcReceptor,
    fechaEmision,
    subtotal,
    descuento,
    iva,
    retencionIsr,
    retencionIva,
    total,
    moneda,
    tipoComprobante,
    estadoSat: 'VIGENTE',
    conceptos,
    xmlOriginal: xmlString
  };
}
