/**
 * Parser de XML CFDI 4.0 y Timbre Fiscal Digital (SAT)
 * Compatible con React Native (iOS, Android y Web) sin dependencias nativas complejas.
 */

export interface ParsedCFDIItem {
  quantity: number;
  product: {
    product_key: string;
    unit_key: string;
    unit?: string;
    description: string;
    price: number;
    sku?: string;
  };
  discount?: number;
  taxes?: Array<{
    amount: number;
    base: number;
    rate: number;
    type: string;
  }>;
}

export interface ParsedCFDI {
  uuid: string;
  folio_number: string;
  series?: string;
  created_at: string;
  payment_form: string;
  payment_method: string;
  currency: string;
  subtotal: number;
  total: number;
  status: 'valid' | 'canceled';
  verification_url: string;
  use: string;
  issuer: {
    tax_id: string;
    legal_name: string;
    tax_system: string;
    zip: string;
  };
  customer: {
    tax_id: string;
    legal_name: string;
    tax_system: string;
    address: {
      zip: string;
    };
  };
  items: ParsedCFDIItem[];
  taxes: Array<{
    amount: number;
    type: string;
    rate: number;
  }>;
  stamp: {
    uuid: string;
    date: string;
    sat_cert_number: string;
    signature: string;
    sat_signature: string;
    pac_rfc: string;
    original_chain: string;
  };
}

/**
 * Extrae el valor de un atributo en un fragmento XML
 */
function getAttribute(xmlSnippet: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = xmlSnippet.match(regex);
  return match ? match[1] : '';
}

/**
 * Convierte un XML timbrado CFDI 4.0 al formato estructurado para PDF y vistas
 */
export function parseCFDIXML(xmlText: string, status: 'valid' | 'canceled' = 'valid'): ParsedCFDI {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('El contenido del XML es inválido o está vacío');
  }

  // 1. Datos del Comprobante
  const comprobanteMatch = xmlText.match(/<cfdi:Comprobante\b([^>]*)>/i) || xmlText.match(/<Comprobante\b([^>]*)>/i);
  const comprobanteAttrs = comprobanteMatch ? comprobanteMatch[1] : '';

  const folio = getAttribute(comprobanteAttrs, 'Folio');
  const serie = getAttribute(comprobanteAttrs, 'Serie');
  const fecha = getAttribute(comprobanteAttrs, 'Fecha');
  const formaPago = getAttribute(comprobanteAttrs, 'FormaPago') || '01';
  const metodoPago = getAttribute(comprobanteAttrs, 'MetodoPago') || 'PUE';
  const moneda = getAttribute(comprobanteAttrs, 'Moneda') || 'MXN';
  const subtotal = parseFloat(getAttribute(comprobanteAttrs, 'SubTotal') || '0');
  const total = parseFloat(getAttribute(comprobanteAttrs, 'Total') || '0');
  const lugarExpedicion = getAttribute(comprobanteAttrs, 'LugarExpedicion');

  // 2. Emisor
  const emisorMatch = xmlText.match(/<cfdi:Emisor\b([^>]*)\/?>/i) || xmlText.match(/<Emisor\b([^>]*)\/?>/i);
  const emisorAttrs = emisorMatch ? emisorMatch[1] : '';
  const emisorRfc = getAttribute(emisorAttrs, 'Rfc');
  const emisorNombre = getAttribute(emisorAttrs, 'Nombre');
  const emisorRegimen = getAttribute(emisorAttrs, 'RegimenFiscal');

  // 3. Receptor
  const receptorMatch = xmlText.match(/<cfdi:Receptor\b([^>]*)\/?>/i) || xmlText.match(/<Receptor\b([^>]*)\/?>/i);
  const receptorAttrs = receptorMatch ? receptorMatch[1] : '';
  const receptorRfc = getAttribute(receptorAttrs, 'Rfc');
  const receptorNombre = getAttribute(receptorAttrs, 'Nombre');
  const receptorRegimen = getAttribute(receptorAttrs, 'RegimenFiscalReceptor');
  const receptorCP = getAttribute(receptorAttrs, 'DomicilioFiscalReceptor');
  const usoCFDI = getAttribute(receptorAttrs, 'UsoCFDI') || 'G03';

  // 4. Timbre Fiscal Digital
  const tfdMatch = xmlText.match(/<tfd:TimbreFiscalDigital\b([^>]*)\/?>/i) || xmlText.match(/<TimbreFiscalDigital\b([^>]*)\/?>/i);
  const tfdAttrs = tfdMatch ? tfdMatch[1] : '';
  const uuid = getAttribute(tfdAttrs, 'UUID');
  const fechaTimbrado = getAttribute(tfdAttrs, 'FechaTimbrado');
  const noCertificadoSAT = getAttribute(tfdAttrs, 'NoCertificadoSAT');
  const selloCFD = getAttribute(tfdAttrs, 'SelloCFD');
  const selloSAT = getAttribute(tfdAttrs, 'SelloSAT');
  const rfcProvCertif = getAttribute(tfdAttrs, 'RfcProvCertif');

  // 5. Conceptos
  const items: ParsedCFDIItem[] = [];
  const conceptoRegex = /<cfdi:Concepto\b([^>]*)(?:\/?>|>([\s\S]*?)<\/cfdi:Concepto>)/gi;
  let matchConcepto;

  while ((matchConcepto = conceptoRegex.exec(xmlText)) !== null) {
    const cAttrs = matchConcepto[1];
    const cBody = matchConcepto[2] || '';

    const cantidad = parseFloat(getAttribute(cAttrs, 'Cantidad') || '1');
    const valorUnitario = parseFloat(getAttribute(cAttrs, 'ValorUnitario') || '0');
    const importe = parseFloat(getAttribute(cAttrs, 'Importe') || '0');
    const claveProdServ = getAttribute(cAttrs, 'ClaveProdServ');
    const claveUnidad = getAttribute(cAttrs, 'ClaveUnidad');
    const unidad = getAttribute(cAttrs, 'Unidad');
    const descripcion = getAttribute(cAttrs, 'Descripcion');
    const noIdentificacion = getAttribute(cAttrs, 'NoIdentificacion');

    // Impuesto del concepto
    let itemIva = 0;
    const trasladoMatch = cBody.match(/<cfdi:Traslado\b([^>]*)\/?>/i);
    if (trasladoMatch) {
      itemIva = parseFloat(getAttribute(trasladoMatch[1], 'Importe') || '0');
    }

    items.push({
      quantity: cantidad,
      product: {
        product_key: claveProdServ,
        unit_key: claveUnidad,
        unit: unidad,
        description: descripcion,
        price: valorUnitario,
        sku: noIdentificacion
      },
      taxes: itemIva > 0 ? [{
        amount: itemIva,
        base: importe,
        rate: 0.16,
        type: 'IVA'
      }] : []
    });
  }

  // 6. Impuestos Globales
  const totalImpuestosTrasladados = items.reduce((sum, item) => sum + (item.taxes?.[0]?.amount || 0), 0);

  // 7. URL de Verificación QR del SAT
  const last8Sello = (selloCFD || '').slice(-8);
  const totalFormatted = total.toFixed(6);
  const verificationUrl = uuid
    ? `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${emisorRfc}&rr=${receptorRfc}&tt=${totalFormatted}&fe=${encodeURIComponent(last8Sello)}`
    : '';

  // 8. Cadena Original del Complemento
  const originalChain = uuid
    ? `||1.1|${uuid}|${fechaTimbrado}|${rfcProvCertif}|${selloCFD}|${noCertificadoSAT}||`
    : '';

  const folioNumber = [serie, folio].filter(Boolean).join('-') || (uuid ? uuid.substring(0, 8) : 'CFDI');

  return {
    uuid: uuid || '',
    folio_number: folioNumber,
    series: serie,
    created_at: fechaTimbrado || fecha || new Date().toISOString(),
    payment_form: formaPago,
    payment_method: metodoPago,
    currency: moneda,
    subtotal: subtotal,
    total: total,
    status: status,
    verification_url: verificationUrl,
    use: usoCFDI,
    issuer: {
      tax_id: emisorRfc,
      legal_name: emisorNombre,
      tax_system: emisorRegimen,
      zip: lugarExpedicion,
    },
    customer: {
      tax_id: receptorRfc,
      legal_name: receptorNombre,
      tax_system: receptorRegimen,
      address: {
        zip: receptorCP,
      }
    },
    items: items,
    taxes: totalImpuestosTrasladados > 0 ? [{
      amount: totalImpuestosTrasladados,
      type: 'IVA',
      rate: 0.16
    }] : [],
    stamp: {
      uuid: uuid || '',
      date: fechaTimbrado || '',
      sat_cert_number: noCertificadoSAT || '',
      signature: selloCFD || '',
      sat_signature: selloSAT || '',
      pac_rfc: rfcProvCertif || '',
      original_chain: originalChain
    }
  };
}
