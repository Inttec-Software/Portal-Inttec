/**
 * Constructor de XML CFDI 4.0 con Complemento de Recepción de Pagos 2.0 (REP)
 * Cumple con el estándar del SAT Anexo 20 CFDI 4.0 y Guía de Llenado Pagos 2.0.
 */

export interface DoctoRelacionadoParam {
  uuid: string;
  serie?: string;
  folio?: string;
  moneda?: string; // MXN
  numParcialidad: number;
  saldoAnterior: number;
  importePagado: number;
  saldoInsoluto: number;
  tasaIva?: number; // Default 0.16
}

export interface PagoParam {
  fechaPago: string; // YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
  formaDePagoP: string; // '03', '01', etc.
  monedaP?: string; // 'MXN'
  monto: number;
  numOperacion?: string;
  doctosRelacionados: DoctoRelacionadoParam[];
}

export interface CFDIPagoParams {
  serie?: string;
  folio?: string;
  emisor: {
    rfc: string;
    nombre: string;
    regimenFiscal: string;
    cp: string;
  };
  receptor: {
    rfc: string;
    nombre: string;
    domicilioFiscalReceptor: string; // CP
    regimenFiscalReceptor: string;
  };
  pago: PagoParam;
}

function escapeXML(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Limpia el nombre del receptor para CFDI 4.0 eliminando sufijos societarios.
 */
function cleanClientLegalName(name: string): string {
  if (!name) return 'PUBLICO EN GENERAL';
  let cleaned = name.toUpperCase().trim();
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
 * Construye el XML sin sellar para un CFDI 4.0 de tipo "P" (Pagos 2.0).
 * Finkok se encargará de sellarlo con el CSD y timbrarlo ante el SAT.
 */
export function buildUnsignedCFDIPagos(params: CFDIPagoParams): string {
  const serie = (params.serie || 'P').trim();
  const folio = (params.folio || '0001').trim();

  // Fecha del Comprobante (hora actual emisor UTC-6 menos 10 minutos para evitar desfasamiento con reloj SAT)
  const tzOffset = (6 * 60 * 60 * 1000) + (10 * 60 * 1000);
  const fechaComprobante = new Date(Date.now() - tzOffset).toISOString().substring(0, 19);

  // Formatear FechaPago (debe ser YYYY-MM-DDTHH:mm:ss)
  let fechaPagoISO = params.pago.fechaPago;
  if (!fechaPagoISO.includes('T')) {
    fechaPagoISO = `${fechaPagoISO}T12:00:00`;
  } else if (fechaPagoISO.length > 19) {
    fechaPagoISO = fechaPagoISO.substring(0, 19);
  }

  const formaPagoP = params.pago.formaDePagoP || '03';
  const monedaP = params.pago.monedaP || 'MXN';

  // Cálculos de Totales y Bases de ImpuestosDR
  let totalBasesIVA16 = 0;
  let totalImpuestosIVA16 = 0;
  let totalPagosCalculado = 0;

  const doctosProcesados = params.pago.doctosRelacionados.map((doc) => {
    const impPagado = Number(doc.importePagado.toFixed(2));
    totalPagosCalculado += impPagado;

    // Base gravable e IVA 16% del importe pagado
    const baseDR = Number((impPagado / 1.16).toFixed(2));
    const ivaDR = Number((impPagado - baseDR).toFixed(2));

    totalBasesIVA16 += baseDR;
    totalImpuestosIVA16 += ivaDR;

    return {
      ...doc,
      importePagado: impPagado,
      saldoAnterior: Number(doc.saldoAnterior.toFixed(2)),
      saldoInsoluto: Number(doc.saldoInsoluto.toFixed(2)),
      baseDR,
      ivaDR,
    };
  });

  const montoTotalPagos = Number((params.pago.monto || totalPagosCalculado).toFixed(2));

  // 1. Nodo Comprobante
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd" Version="4.0"`;
  if (serie) xml += ` Serie="${escapeXML(serie)}"`;
  if (folio) xml += ` Folio="${escapeXML(folio)}"`;
  xml += ` Fecha="${fechaComprobante}" Sello="" NoCertificado="" Certificado="" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="${escapeXML(params.emisor.cp)}">`;

  // 2. Emisor
  xml += `\n  <cfdi:Emisor Rfc="${escapeXML(params.emisor.rfc)}" Nombre="${escapeXML(params.emisor.nombre)}" RegimenFiscal="${escapeXML(params.emisor.regimenFiscal)}"/>`;

  // 3. Receptor (UsoCFDI fijo "CP01" en Pagos 2.0)
  const receptorNombre = cleanClientLegalName(params.receptor.nombre);
  xml += `\n  <cfdi:Receptor Rfc="${escapeXML(params.receptor.rfc)}" Nombre="${escapeXML(receptorNombre)}" DomicilioFiscalReceptor="${escapeXML(params.receptor.domicilioFiscalReceptor)}" RegimenFiscalReceptor="${escapeXML(params.receptor.regimenFiscalReceptor)}" UsoCFDI="CP01"/>`;

  // 4. Concepto Obligatorio Único para Pagos
  xml += `\n  <cfdi:Conceptos>`;
  xml += `\n    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>`;
  xml += `\n  </cfdi:Conceptos>`;

  // 5. Complemento Pagos 2.0
  xml += `\n  <cfdi:Complemento>`;
  xml += `\n    <pago20:Pagos Version="2.0">`;

  // Totales
  xml += `\n      <pago20:Totales TotalTrasladosBaseIVA16="${totalBasesIVA16.toFixed(2)}" TotalTrasladosImpuestoIVA16="${totalImpuestosIVA16.toFixed(2)}" MontoTotalPagos="${montoTotalPagos.toFixed(2)}"/>`;

  // Nodo Pago
  xml += `\n      <pago20:Pago FechaPago="${fechaPagoISO}" FormaDePagoP="${formaPagoP}" MonedaP="${monedaP}" TipoCambioP="1" Monto="${montoTotalPagos.toFixed(2)}"`;
  if (params.pago.numOperacion) {
    xml += ` NumOperacion="${escapeXML(params.pago.numOperacion)}"`;
  }
  xml += `>`;

  // Documentos Relacionados (1 a N)
  doctosProcesados.forEach((doc) => {
    xml += `\n        <pago20:DoctoRelacionado IdDocumento="${escapeXML(doc.uuid)}"`;
    if (doc.serie) xml += ` Serie="${escapeXML(doc.serie)}"`;
    if (doc.folio) xml += ` Folio="${escapeXML(doc.folio)}"`;
    xml += ` MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="${doc.numParcialidad}" ImpSaldoAnt="${doc.saldoAnterior.toFixed(2)}" ImpPagado="${doc.importePagado.toFixed(2)}" ImpSaldoInsoluto="${doc.saldoInsoluto.toFixed(2)}" ObjetoImpDR="02">`;
    xml += `\n          <pago20:ImpuestosDR>`;
    xml += `\n            <pago20:TrasladosDR>`;
    xml += `\n              <pago20:TrasladoDR BaseDR="${doc.baseDR.toFixed(2)}" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="${doc.ivaDR.toFixed(2)}"/>`;
    xml += `\n            </pago20:TrasladosDR>`;
    xml += `\n          </pago20:ImpuestosDR>`;
    xml += `\n        </pago20:DoctoRelacionado>`;
  });

  // Impuestos Trasladados del Pago
  xml += `\n        <pago20:ImpuestosP>`;
  xml += `\n          <pago20:TrasladosP>`;
  xml += `\n            <pago20:TrasladoP BaseP="${totalBasesIVA16.toFixed(2)}" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="${totalImpuestosIVA16.toFixed(2)}"/>`;
  xml += `\n          </pago20:TrasladosP>`;
  xml += `\n        </pago20:ImpuestosP>`;

  xml += `\n      </pago20:Pago>`;
  xml += `\n    </pago20:Pagos>`;
  xml += `\n  </cfdi:Complemento>`;

  // 6. Cierre
  xml += `\n</cfdi:Comprobante>`;

  return xml;
}
