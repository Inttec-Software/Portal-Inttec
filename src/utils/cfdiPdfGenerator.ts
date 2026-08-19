/**
 * Generador de Representación Impresa (PDF) de Facturas CFDI 4.0 / 3.3
 * Formato oficial alineado al estándar del SAT.
 */

import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

// =============================================================================
// CATÁLOGOS SAT
// =============================================================================

export const REGIMEN_FISCAL_MAP: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '609': 'Consolidación',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza (RESICO)',
};

export const USO_CFDI_MAP: Record<string, string> = {
  'G01': 'Adquisición de mercancías.',
  'G02': 'Devoluciones, descuentos o bonificaciones.',
  'G03': 'Gastos en general.',
  'I01': 'Construcciones.',
  'I02': 'Mobiliario y equipo de oficina por inversiones.',
  'I03': 'Equipo de transporte.',
  'I04': 'Equipo de computo y accesorios.',
  'I05': 'Dados, troqueles, moldes, matrices y herramental.',
  'I06': 'Comunicaciones telefónicas.',
  'I07': 'Comunicaciones satelitales.',
  'I08': 'Otra maquinaria y equipo.',
  'D01': 'Honorarios médicos, dentales y gastos hospitalarios.',
  'D02': 'Gastos médicos por incapacidad o discapacidad.',
  'D03': 'Gastos funerales.',
  'D04': 'Donativos.',
  'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación).',
  'D06': 'Aportaciones voluntarias al SAR.',
  'D07': 'Primas por seguros de gastos médicos.',
  'D08': 'Gastos de transportación escolar obligatoria.',
  'D09': 'Depósitos en cuentas personales especiales para el ahorro, primas que tengan como base planes de pensiones.',
  'D10': 'Pagos por servicios educativos (colegiaturas).',
  'S01': 'Sin efectos fiscales.',
  'CP01': 'Pagos.',
  'CN01': 'Nómina.',
};

export const FORMA_PAGO_MAP: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '14': 'Pago por consignación',
  '15': 'Condonación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A satisfacción del acreedor',
  '28': 'Tarjeta de débito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};

export const METODO_PAGO_MAP: Record<string, string> = {
  'PUE': 'Pago en una sola exhibición',
  'PPD': 'Pago en parcialidades o diferido',
};

export const TIPO_COMPROBANTE_MAP: Record<string, string> = {
  'I': 'Ingreso',
  'E': 'Egreso',
  'T': 'Traslado',
  'N': 'Nómina',
  'P': 'Pago',
};

export const EXPORTACION_MAP: Record<string, string> = {
  '01': 'No aplica',
  '02': 'Definitiva con clave A1',
  '03': 'Temporal',
  '04': 'Definitiva con clave distinta a A1',
};

export const OBJETO_IMP_MAP: Record<string, string> = {
  '01': 'No objeto de impuesto.',
  '02': 'Sí objeto de impuesto.',
  '03': 'Sí objeto de impuesto y no obligado al desglose.',
  '04': 'Sí objeto de impuesto y no causa impuesto.',
};

export const IMPUESTO_MAP: Record<string, string> = {
  '001': 'ISR',
  '002': 'IVA',
  '003': 'IEPS',
};

// =============================================================================
// INTERFACES
// =============================================================================

export interface CfdiImpuestoConcepto {
  tipo: 'Traslado' | 'Retencion';
  impuesto: string; // 'IVA', 'ISR', 'IEPS'
  base: number;
  tipoFactor: string; // 'Tasa', 'Cuota', 'Exento'
  tasaOCuota: string; // '16.00%'
  importe: number;
}

export interface CfdiConceptoCompleto {
  claveProdServ: string;
  noIdentificacion: string;
  cantidad: number;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento: number;
  objetoImp: string;
  numeroPedimento?: string;
  numeroCuentaPredial?: string;
  impuestos: CfdiImpuestoConcepto[];
}

export interface CfdiDataCompleta {
  // Comprobante
  version: string;
  serie: string;
  folio: string;
  fechaEmision: string;
  lugarExpedicion: string; // C.P.
  noCertificadoCSD: string;
  tipoComprobante: string;
  exportacion: string;
  metodoPago: string;
  formaPago: string;
  moneda: string;
  subtotal: number;
  descuento: number;
  total: number;
  selloCFD: string;

  // Emisor
  rfcEmisor: string;
  nombreEmisor: string;
  regimenFiscalEmisor: string;

  // Receptor
  rfcReceptor: string;
  nombreReceptor: string;
  domicilioFiscalReceptor: string; // C.P.
  regimenFiscalReceptor: string;
  usoCFDI: string;

  // Conceptos
  conceptos: CfdiConceptoCompleto[];

  // Impuestos Globales
  impuestosTrasladados: Array<{ impuesto: string; tasa: string; importe: number }>;
  impuestosRetenidos: Array<{ impuesto: string; importe: number }>;

  // Timbre Fiscal Digital
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  noCertificadoSAT: string;
  selloSAT: string;
  cadenaOriginalSAT: string;
  qrUrl: string;
}

// =============================================================================
// PARSER EXHAUSTIVO DE XML CFDI 3.3 / 4.0
// =============================================================================

export function parseFullCfdiXml(xmlString: string): CfdiDataCompleta {
  const getAttr = (tagRegex: RegExp, attrName: string, fallback: string = ''): string => {
    const match = xmlString.match(tagRegex);
    if (!match || !match[1]) return fallback;
    const attrMatch = match[1].match(new RegExp(`\\b${attrName}="([^"]*)"`, 'i'));
    return attrMatch ? attrMatch[1].trim() : fallback;
  };

  const getNum = (tagRegex: RegExp, attrName: string, fallback: number = 0): number => {
    const val = getAttr(tagRegex, attrName, '');
    return val ? parseFloat(val) || fallback : fallback;
  };

  // 1. Timbre Fiscal Digital
  const tfdMatch = xmlString.match(/<tfd:TimbreFiscalDigital\s+([^>]+)>/i) || xmlString.match(/<[^:]*:TimbreFiscalDigital\s+([^>]+)>/i);
  const tfdTag = tfdMatch ? tfdMatch[0] : '';

  const uuid = (tfdTag.match(/\bUUID="([^"]+)"/i)?.[1] || xmlString.match(/\bUUID="([^"]+)"/i)?.[1] || '').toUpperCase();
  const fechaTimbrado = tfdTag.match(/\bFechaTimbrado="([^"]+)"/i)?.[1] || '';
  const rfcProvCertif = tfdTag.match(/\bRfcProvCertif="([^"]+)"/i)?.[1] || '';
  const noCertificadoSAT = tfdTag.match(/\bNoCertificadoSAT="([^"]+)"/i)?.[1] || '';
  const selloSAT = tfdTag.match(/\bSelloSAT="([^"]+)"/i)?.[1] || '';
  const tfdVersion = tfdTag.match(/\bVersion="([^"]+)"/i)?.[1] || '1.1';

  // 2. Comprobante
  const compTagRegex = /<cfdi:Comprobante\s+([^>]+)>/i;
  const version = getAttr(compTagRegex, 'Version', '4.0');
  const serie = getAttr(compTagRegex, 'Serie', '');
  const folio = getAttr(compTagRegex, 'Folio', '');
  const fechaEmision = getAttr(compTagRegex, 'Fecha', new Date().toISOString());
  const lugarExpedicion = getAttr(compTagRegex, 'LugarExpedicion', '');
  const noCertificadoCSD = getAttr(compTagRegex, 'NoCertificado', '');
  const tipoCompRaw = getAttr(compTagRegex, 'TipoDeComprobante', 'I');
  const tipoComprobante = TIPO_COMPROBANTE_MAP[tipoCompRaw] || tipoCompRaw;
  const exportacionRaw = getAttr(compTagRegex, 'Exportacion', '01');
  const exportacion = EXPORTACION_MAP[exportacionRaw] || exportacionRaw;
  const metodoPagoRaw = getAttr(compTagRegex, 'MetodoPago', 'PUE');
  const metodoPago = METODO_PAGO_MAP[metodoPagoRaw] || metodoPagoRaw;
  const formaPagoRaw = getAttr(compTagRegex, 'FormaPago', '99');
  const formaPago = FORMA_PAGO_MAP[formaPagoRaw] || formaPagoRaw;
  const monedaRaw = getAttr(compTagRegex, 'Moneda', 'MXN');
  const moneda = monedaRaw === 'MXN' ? 'Peso Mexicano' : monedaRaw;
  const subtotal = getNum(compTagRegex, 'SubTotal', 0);
  const descuento = getNum(compTagRegex, 'Descuento', 0);
  const total = getNum(compTagRegex, 'Total', 0);
  const selloCFD = getAttr(compTagRegex, 'Sello', '');

  // 3. Emisor
  const emisorTagRegex = /<cfdi:Emisor\s+([^>]+)>/i;
  const rfcEmisor = getAttr(emisorTagRegex, 'Rfc', '').toUpperCase();
  const nombreEmisor = getAttr(emisorTagRegex, 'Nombre', rfcEmisor);
  const regimenEmisorRaw = getAttr(emisorTagRegex, 'RegimenFiscal', '');
  const regimenFiscalEmisor = REGIMEN_FISCAL_MAP[regimenEmisorRaw] || regimenEmisorRaw;

  // 4. Receptor
  const receptorTagRegex = /<cfdi:Receptor\s+([^>]+)>/i;
  const rfcReceptor = getAttr(receptorTagRegex, 'Rfc', '').toUpperCase();
  const nombreReceptor = getAttr(receptorTagRegex, 'Nombre', rfcReceptor);
  const domicilioFiscalReceptor = getAttr(receptorTagRegex, 'DomicilioFiscalReceptor', '');
  const regimenReceptorRaw = getAttr(receptorTagRegex, 'RegimenFiscalReceptor', '');
  const regimenFiscalReceptor = REGIMEN_FISCAL_MAP[regimenReceptorRaw] || regimenReceptorRaw;
  const usoCfdiRaw = getAttr(receptorTagRegex, 'UsoCFDI', 'G03');
  const usoCFDI = USO_CFDI_MAP[usoCfdiRaw] || usoCfdiRaw;

  // 5. Conceptos con sus impuestos
  const conceptos: CfdiConceptoCompleto[] = [];
  const conceptoBlocks = xmlString.match(/<cfdi:Concepto\s+[\s\S]*?<\/cfdi:Concepto>/gi) ||
    xmlString.match(/<cfdi:Concepto\s+[^>]*\/>/gi) || [];

  for (const block of conceptoBlocks) {
    const headerMatch = block.match(/<cfdi:Concepto\s+([^>]+)>/i);
    const attrs = headerMatch ? headerMatch[1] : block;

    const getConceptAttr = (name: string, fb: string = '') => {
      const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
      return m ? m[1].trim() : fb;
    };

    const claveProdServ = getConceptAttr('ClaveProdServ', '');
    const noIdentificacion = getConceptAttr('NoIdentificacion', '');
    const cantidad = parseFloat(getConceptAttr('Cantidad', '1')) || 1;
    const claveUnidad = getConceptAttr('ClaveUnidad', '');
    const unidad = getConceptAttr('Unidad', '');
    const descripcion = getConceptAttr('Descripcion', '');
    const valorUnitario = parseFloat(getConceptAttr('ValorUnitario', '0')) || 0;
    const importe = parseFloat(getConceptAttr('Importe', '0')) || 0;
    const descVal = parseFloat(getConceptAttr('Descuento', '0')) || 0;
    const objImpRaw = getConceptAttr('ObjetoImp', '02');
    const objetoImp = OBJETO_IMP_MAP[objImpRaw] || objImpRaw;

    const pedimentoMatch = block.match(/<cfdi:InformacionAduanera\s+[^>]*\bNumeroPedimento="([^"]+)"/i);
    const numeroPedimento = pedimentoMatch ? pedimentoMatch[1] : undefined;

    const predialMatch = block.match(/<cfdi:CuentaPredial\s+[^>]*\bNumero="([^"]+)"/i);
    const numeroCuentaPredial = predialMatch ? predialMatch[1] : undefined;

    // Impuestos del concepto
    const impuestosConcepto: CfdiImpuestoConcepto[] = [];

    // Traslados concepto
    const trasladosMatches = block.matchAll(/<cfdi:Traslado\s+([^>]+)>/gi);
    for (const tm of trasladosMatches) {
      const tAttrs = tm[1];
      const impCode = tAttrs.match(/\bImpuesto="([^"]+)"/i)?.[1] || '002';
      const base = parseFloat(tAttrs.match(/\bBase="([^"]+)"/i)?.[1] || '0') || importe;
      const tipoFactor = tAttrs.match(/\bTipoFactor="([^"]+)"/i)?.[1] || 'Tasa';
      const tasaOCuotaNum = parseFloat(tAttrs.match(/\bTasaOCuota="([^"]+)"/i)?.[1] || '0.16');
      const impImporte = parseFloat(tAttrs.match(/\bImporte="([^"]+)"/i)?.[1] || '0') || 0;

      impuestosConcepto.push({
        tipo: 'Traslado',
        impuesto: IMPUESTO_MAP[impCode] || impCode,
        base,
        tipoFactor,
        tasaOCuota: `${(tasaOCuotaNum * 100).toFixed(2)}%`,
        importe: impImporte,
      });
    }

    // Retenciones concepto
    const retencionesMatches = block.matchAll(/<cfdi:Retencion\s+([^>]+)>/gi);
    for (const rm of retencionesMatches) {
      const rAttrs = rm[1];
      const impCode = rAttrs.match(/\bImpuesto="([^"]+)"/i)?.[1] || '001';
      const base = parseFloat(rAttrs.match(/\bBase="([^"]+)"/i)?.[1] || '0') || importe;
      const tipoFactor = rAttrs.match(/\bTipoFactor="([^"]+)"/i)?.[1] || 'Tasa';
      const tasaOCuotaNum = parseFloat(rAttrs.match(/\bTasaOCuota="([^"]+)"/i)?.[1] || '0');
      const impImporte = parseFloat(rAttrs.match(/\bImporte="([^"]+)"/i)?.[1] || '0') || 0;

      impuestosConcepto.push({
        tipo: 'Retencion',
        impuesto: IMPUESTO_MAP[impCode] || impCode,
        base,
        tipoFactor,
        tasaOCuota: `${(tasaOCuotaNum * 100).toFixed(2)}%`,
        importe: impImporte,
      });
    }

    conceptos.push({
      claveProdServ,
      noIdentificacion,
      cantidad,
      claveUnidad,
      unidad,
      descripcion,
      valorUnitario,
      importe,
      descuento: descVal,
      objetoImp,
      numeroPedimento,
      numeroCuentaPredial,
      impuestos: impuestosConcepto,
    });
  }

  // 6. Impuestos Globales
  const impuestosTrasladados: Array<{ impuesto: string; tasa: string; importe: number }> = [];
  const impuestosRetenidos: Array<{ impuesto: string; importe: number }> = [];

  const globalImpuestosBlock = xmlString.match(/<cfdi:Impuestos(?:\s+[^>]+)?>([\s\S]*?)<\/cfdi:Impuestos>/i);
  if (globalImpuestosBlock) {
    const gText = globalImpuestosBlock[1];
    const gTraslados = gText.matchAll(/<cfdi:Traslado\s+([^>]+)>/gi);
    for (const tm of gTraslados) {
      const tAttrs = tm[1];
      const impCode = tAttrs.match(/\bImpuesto="([^"]+)"/i)?.[1] || '002';
      const tasaNum = parseFloat(tAttrs.match(/\bTasaOCuota="([^"]+)"/i)?.[1] || '0.16');
      const impVal = parseFloat(tAttrs.match(/\bImporte="([^"]+)"/i)?.[1] || '0') || 0;
      impuestosTrasladados.push({
        impuesto: IMPUESTO_MAP[impCode] || impCode,
        tasa: `${(tasaNum * 100).toFixed(2)}%`,
        importe: impVal,
      });
    }

    const gRetenciones = gText.matchAll(/<cfdi:Retencion\s+([^>]+)>/gi);
    for (const rm of gRetenciones) {
      const rAttrs = rm[1];
      const impCode = rAttrs.match(/\bImpuesto="([^"]+)"/i)?.[1] || '001';
      const impVal = parseFloat(rAttrs.match(/\bImporte="([^"]+)"/i)?.[1] || '0') || 0;
      impuestosRetenidos.push({
        impuesto: IMPUESTO_MAP[impCode] || impCode,
        importe: impVal,
      });
    }
  }

  // Si no había bloque global de impuestos, consolidar de conceptos
  if (impuestosTrasladados.length === 0) {
    let totalIva = 0;
    for (const c of conceptos) {
      for (const imp of c.impuestos) {
        if (imp.tipo === 'Traslado') {
          totalIva += imp.importe;
        }
      }
    }
    if (totalIva > 0) {
      impuestosTrasladados.push({ impuesto: 'IVA', tasa: '16.00%', importe: totalIva });
    }
  }

  // 7. Cadena Original SAT y QR URL
  const cadenaOriginalSAT = `||${tfdVersion}|${uuid}|${fechaTimbrado}|${rfcProvCertif}|${selloCFD}|${noCertificadoSAT}||`;

  const totalFormatted = total.toFixed(6).padStart(17, '0');
  const sello8 = (selloCFD || '').slice(-8);
  const qrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${rfcEmisor}&rr=${rfcReceptor}&tt=${totalFormatted}&fe=${sello8}`;

  return {
    version,
    serie,
    folio,
    fechaEmision,
    lugarExpedicion,
    noCertificadoCSD,
    tipoComprobante,
    exportacion,
    metodoPago,
    formaPago,
    moneda,
    subtotal,
    descuento,
    total,
    selloCFD,
    rfcEmisor,
    nombreEmisor,
    regimenFiscalEmisor,
    rfcReceptor,
    nombreReceptor,
    domicilioFiscalReceptor,
    regimenFiscalReceptor,
    usoCFDI,
    conceptos,
    impuestosTrasladados,
    impuestosRetenidos,
    uuid,
    fechaTimbrado,
    rfcProvCertif,
    noCertificadoSAT,
    selloSAT,
    cadenaOriginalSAT,
    qrUrl,
  };
}

// =============================================================================
// GENERADOR DE HTML EXACTO AL FORMATO SAT
// =============================================================================

export function generateCfdiPdfHtml(data: CfdiDataCompleta): string {
  const formatMoney = (val: number) => {
    return val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cleanDate = (isoStr: string) => {
    if (!isoStr) return '';
    return isoStr.replace('T', ' ').substring(0, 19);
  };

  // Generar filas de conceptos
  const conceptosHtml = data.conceptos.map((c) => {
    const impuestosRows = c.impuestos.map((imp) => `
      <tr>
        <td>${imp.impuesto}</td>
        <td>${imp.tipo}</td>
        <td>${formatMoney(imp.base)}</td>
        <td>${imp.tipoFactor}</td>
        <td>${imp.tasaOCuota}</td>
        <td>${formatMoney(imp.importe)}</td>
      </tr>
    `).join('');

    return `
      <div style="page-break-inside: avoid; margin-bottom: 6px;">
        <table class="conceptos-table">
          <thead>
            <tr>
              <th style="width: 14%;">Clave del producto<br>y/o servicio</th>
              <th style="width: 13%;">No. identificación</th>
              <th style="width: 9%;">Cantidad</th>
              <th style="width: 10%;">Clave de unidad</th>
              <th style="width: 9%;">Unidad</th>
              <th style="width: 13%;">Valor unitario</th>
              <th style="width: 11%;">Importe</th>
              <th style="width: 9%;">Descuento</th>
              <th style="width: 12%;">Objeto impuesto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${c.claveProdServ || '-'}</td>
              <td>${c.noIdentificacion || '-'}</td>
              <td>${c.cantidad.toFixed(2)}</td>
              <td>${c.claveUnidad || '-'}</td>
              <td>${c.unidad || '-'}</td>
              <td>${formatMoney(c.valorUnitario)}</td>
              <td>${formatMoney(c.importe)}</td>
              <td>${formatMoney(c.descuento || 0)}</td>
              <td>${c.objetoImp || 'Sí objeto de impuesto.'}</td>
            </tr>
          </tbody>
        </table>

        <div class="concepto-subbox">
          <div class="subbox-left">
            <div class="desc-row">
              <div class="desc-label">Descripción</div>
              <div class="desc-val">${c.descripcion}</div>
            </div>
            <table class="pedimento-table">
              <thead>
                <tr>
                  <th style="width: 50%;">Número de pedimento</th>
                  <th style="width: 50%;">Número de cuenta predial</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${c.numeroPedimento || ''}</td>
                  <td>${c.numeroCuentaPredial || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="subbox-right">
            <table class="impuestos-concept-table">
              <thead>
                <tr>
                  <th>Impuesto</th>
                  <th>Tipo</th>
                  <th>Base</th>
                  <th>Tipo<br>Factor</th>
                  <th>Tasa o<br>Cuota</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                ${impuestosRows || '<tr><td colspan="6" style="padding: 4px;">Sin impuestos desglosados</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Filas de impuestos trasladados y retenidos
  const trasladosHtml = data.impuestosTrasladados.map((t) => `
    <tr>
      <td class="t-label">Impuestos trasladados &nbsp; ${t.impuesto} &nbsp; ${t.tasa}</td>
      <td class="t-val">$ ${formatMoney(t.importe)}</td>
    </tr>
  `).join('');

  const retencionesHtml = data.impuestosRetenidos.map((r) => `
    <tr>
      <td class="t-label">Impuestos retenidos &nbsp; ${r.impuesto}</td>
      <td class="t-val">-$ ${formatMoney(r.importe)}</td>
    </tr>
  `).join('');

  // QR Code URL (Usa API estándar para renderizar el QR oficial del SAT)
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(data.qrUrl)}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura - ${data.uuid}</title>
<style>
  @page {
    size: letter portrait;
    margin: 12mm 15mm 12mm 15mm;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
  }
  body {
    font-size: 8pt;
    color: #000;
    line-height: 1.25;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .header-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  .header-table td {
    vertical-align: top;
    padding: 0;
  }
  .header-col-left {
    width: 49%;
  }
  .header-col-right {
    width: 49%;
  }

  .info-grid {
    display: table;
    width: 100%;
  }
  .info-row {
    display: table-row;
  }
  .info-label {
    display: table-cell;
    font-weight: bold;
    padding: 2px 4px 2px 0;
    width: 135px;
    font-size: 7.5pt;
    vertical-align: top;
  }
  .info-val {
    display: table-cell;
    padding: 2px 0;
    word-break: break-word;
    font-size: 7.5pt;
    vertical-align: top;
  }

  .section-heading {
    font-size: 10.5pt;
    font-weight: bold;
    margin: 8px 0 4px 0;
    color: #000;
  }
  
  .conceptos-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .conceptos-table th {
    background-color: #d1d5db;
    border: 1px solid #000;
    font-size: 6.5pt;
    font-weight: bold;
    text-align: center;
    padding: 3px 2px;
    line-height: 1.1;
  }
  
  .conceptos-table td {
    border: 1px solid #000;
    font-size: 7pt;
    padding: 3px 2px;
    text-align: center;
  }
  
  .concepto-subbox {
    border: 1px solid #000;
    border-top: none;
    display: table;
    width: 100%;
    margin-bottom: 6px;
  }
  
  .subbox-left {
    display: table-cell;
    width: 50%;
    vertical-align: top;
    border-right: 1px solid #000;
    padding: 0;
  }
  
  .desc-row {
    display: table;
    width: 100%;
    border-bottom: 1px solid #000;
  }
  .desc-label {
    display: table-cell;
    background-color: #d1d5db;
    font-weight: bold;
    font-size: 6.5pt;
    padding: 3px 6px;
    width: 80px;
    border-right: 1px solid #000;
    text-align: center;
    vertical-align: middle;
  }
  .desc-val {
    display: table-cell;
    font-size: 7pt;
    padding: 3px 6px;
    vertical-align: middle;
  }
  
  .pedimento-table {
    width: 100%;
    border-collapse: collapse;
  }
  .pedimento-table th {
    background-color: #d1d5db;
    font-size: 6pt;
    font-weight: bold;
    text-align: center;
    border: none;
    border-bottom: 1px solid #000;
    border-right: 1px solid #000;
    padding: 2px;
  }
  .pedimento-table th:last-child {
    border-right: none;
  }
  .pedimento-table td {
    height: 12px;
    border: none;
    border-right: 1px solid #000;
    font-size: 6.5pt;
    padding: 2px;
    text-align: center;
  }
  .pedimento-table td:last-child {
    border-right: none;
  }

  .subbox-right {
    display: table-cell;
    width: 50%;
    vertical-align: top;
    padding: 0;
  }
  .impuestos-concept-table {
    width: 100%;
    border-collapse: collapse;
  }
  .impuestos-concept-table th {
    background-color: #fff;
    font-size: 6pt;
    font-weight: bold;
    text-align: center;
    border: none;
    border-bottom: 1px solid #000;
    padding: 2px;
  }
  .impuestos-concept-table td {
    border: none;
    font-size: 6.5pt;
    text-align: center;
    padding: 2px;
  }

  .totals-container {
    width: 100%;
    display: table;
    margin: 8px 0 10px 0;
    page-break-inside: avoid;
  }
  .totals-left {
    display: table-cell;
    width: 48%;
    vertical-align: top;
  }
  .totals-right {
    display: table-cell;
    width: 52%;
    vertical-align: top;
    text-align: right;
  }
  .totals-table {
    width: 100%;
    border-collapse: collapse;
  }
  .totals-table td {
    padding: 2px 0;
    font-size: 8pt;
  }
  .totals-table .t-label {
    font-weight: bold;
    text-align: left;
    width: 65%;
  }
  .totals-table .t-val {
    text-align: right;
    font-weight: normal;
    width: 35%;
  }
  .total-highlight {
    font-weight: bold !important;
    font-size: 8.5pt !important;
  }

  .sello-block {
    page-break-inside: avoid;
    margin-top: 6px;
  }
  .sello-title {
    font-size: 7.5pt;
    font-weight: bold;
    margin-top: 4px;
    margin-bottom: 1px;
  }
  .sello-text {
    font-family: "Courier New", Courier, monospace;
    font-size: 5.5pt;
    line-height: 1.15;
    word-break: break-all;
    color: #000;
    margin-bottom: 4px;
  }

  .footer-stamp-container {
    display: table;
    width: 100%;
    margin-top: 6px;
    page-break-inside: avoid;
  }
  .footer-qr-cell {
    display: table-cell;
    width: 120px;
    vertical-align: middle;
    padding-right: 12px;
  }
  .footer-stamp-cell {
    display: table-cell;
    vertical-align: top;
  }
</style>
</head>
<body>

  <!-- Encabezado de 2 Columnas -->
  <table class="header-table">
    <tr>
      <td class="header-col-left">
        <div class="info-grid">
          <div class="info-row">
            <div class="info-label">RFC emisor:</div>
            <div class="info-val">${data.rfcEmisor}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Nombre emisor:</div>
            <div class="info-val">${data.nombreEmisor}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Folio:</div>
            <div class="info-val">${data.folio || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">RFC receptor:</div>
            <div class="info-val">${data.rfcReceptor}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Nombre receptor:</div>
            <div class="info-val">${data.nombreReceptor}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Código postal del receptor:</div>
            <div class="info-val">${data.domicilioFiscalReceptor || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Régimen fiscal receptor:</div>
            <div class="info-val">${data.regimenFiscalReceptor || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Uso CFDI:</div>
            <div class="info-val">${data.usoCFDI || 'Gastos en general.'}</div>
          </div>
        </div>
      </td>
      <td style="width: 2%;"></td>
      <td class="header-col-right">
        <div class="info-grid">
          <div class="info-row">
            <div class="info-label">Folio fiscal:</div>
            <div class="info-val">${data.uuid}</div>
          </div>
          <div class="info-row">
            <div class="info-label">No. de serie del CSD:</div>
            <div class="info-val">${data.noCertificadoCSD || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Serie:</div>
            <div class="info-val">${data.serie || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Código postal, fecha y hora de emisión:</div>
            <div class="info-val">${data.lugarExpedicion || ''} ${cleanDate(data.fechaEmision)}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Efecto de comprobante:</div>
            <div class="info-val">${data.tipoComprobante}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Régimen fiscal:</div>
            <div class="info-val">${data.regimenFiscalEmisor || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Exportación:</div>
            <div class="info-val">${data.exportacion || 'No aplica'}</div>
          </div>
        </div>
      </td>
    </tr>
  </table>

  <!-- Título Conceptos -->
  <div class="section-heading">Conceptos</div>

  <!-- Tabla de Conceptos y Sub-cajas -->
  ${conceptosHtml}

  <!-- Sección Totales y Forma de Pago -->
  <div class="totals-container">
    <div class="totals-left">
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label" style="width: 110px;">Moneda:</div>
          <div class="info-val">${data.moneda}</div>
        </div>
        <div class="info-row">
          <div class="info-label" style="width: 110px;">Forma de pago:</div>
          <div class="info-val">${data.formaPago}</div>
        </div>
        <div class="info-row">
          <div class="info-label" style="width: 110px;">Método de pago:</div>
          <div class="info-val">${data.metodoPago}</div>
        </div>
      </div>
    </div>
    <div class="totals-right">
      <table class="totals-table">
        <tr>
          <td class="t-label">Subtotal</td>
          <td class="t-val">$ ${formatMoney(data.subtotal)}</td>
        </tr>
        ${data.descuento > 0 ? `
        <tr>
          <td class="t-label">Descuento</td>
          <td class="t-val">$ ${formatMoney(data.descuento)}</td>
        </tr>
        ` : `
        <tr>
          <td class="t-label">Descuento</td>
          <td class="t-val">$ 0.00</td>
        </tr>
        `}
        ${trasladosHtml}
        ${retencionesHtml}
        <tr>
          <td class="t-label total-highlight" style="padding-top: 4px;">Total</td>
          <td class="t-val total-highlight" style="padding-top: 4px;">$ ${formatMoney(data.total)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Bloque de Sellos y Timbre -->
  <div class="sello-block">
    <div class="sello-title">Sello digital del CFDI:</div>
    <div class="sello-text">${data.selloCFD || '-'}</div>

    <div class="sello-title">Sello digital del SAT:</div>
    <div class="sello-text">${data.selloSAT || '-'}</div>

    <div class="footer-stamp-container">
      <div class="footer-qr-cell">
        <img src="${qrImgSrc}" alt="QR SAT" style="width: 115px; height: 115px; display: block;" />
      </div>
      <div class="footer-stamp-cell">
        <div class="sello-title" style="margin-top: 0;">Cadena Original del complemento de certificación digital del SAT:</div>
        <div class="sello-text" style="font-size: 5.5pt; line-height: 1.2;">${data.cadenaOriginalSAT || '-'}</div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding: 0;">
              <div class="info-grid">
                <div class="info-row">
                  <div class="info-label" style="width: 145px; font-size: 7pt;">RFC del proveedor de certificación:</div>
                  <div class="info-val" style="font-size: 7pt;">${data.rfcProvCertif || '-'}</div>
                </div>
                <div class="info-row">
                  <div class="info-label" style="width: 145px; font-size: 7pt;">No. de serie del certificado SAT:</div>
                  <div class="info-val" style="font-size: 7pt;">${data.noCertificadoSAT || '-'}</div>
                </div>
              </div>
            </td>
            <td style="width: 50%; vertical-align: top; padding: 0;">
              <div class="info-grid">
                <div class="info-row">
                  <div class="info-label" style="width: 135px; font-size: 7pt;">Fecha y hora de certificación:</div>
                  <div class="info-val" style="font-size: 7pt;">${cleanDate(data.fechaTimbrado)}</div>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </div>

</body>
</html>
  `.trim();
}

// =============================================================================
// FUNCIÓN PRINCIPAL DE EXPORTACIÓN (CROSS-PLATFORM)
// =============================================================================

export async function exportFacturaCfdiToPdf(options: {
  factura: any;
  rawXml?: string;
}): Promise<void> {
  const { factura, rawXml } = options;

  let xmlToParse = rawXml || '';

  // Si no se proporcionó el XML en memoria, intentar descargarlo desde xml_url
  if (!xmlToParse && factura.xml_url) {
    try {
      const res = await fetch(factura.xml_url);
      if (res.ok) {
        xmlToParse = await res.text();
      }
    } catch (err: any) {
      console.warn('No se pudo descargar el XML desde storage, usando datos de la base de datos:', err.message);
    }
  }

  let cfdiData: CfdiDataCompleta;

  if (xmlToParse && xmlToParse.includes('<cfdi:Comprobante') || xmlToParse.includes('<Comprobante')) {
    cfdiData = parseFullCfdiXml(xmlToParse);
  } else {
    // Fallback con datos guardados en la BD
    const conceptos: CfdiConceptoCompleto[] = (factura.conceptos_json || []).map((c: any) => ({
      claveProdServ: c.claveProdServ || '',
      noIdentificacion: c.noIdentificacion || '',
      cantidad: c.cantidad || 1,
      claveUnidad: c.claveUnidad || '',
      unidad: c.unidad || '',
      descripcion: c.descripcion || '',
      valorUnitario: c.valorUnitario || c.importe || 0,
      importe: c.importe || 0,
      descuento: c.descuento || 0,
      objetoImp: 'Sí objeto de impuesto.',
      impuestos: [
        {
          tipo: 'Traslado',
          impuesto: 'IVA',
          base: c.importe || 0,
          tipoFactor: 'Tasa',
          tasaOCuota: '16.00%',
          importe: (c.importe || 0) * 0.16,
        }
      ],
    }));

    const total = Number(factura.total || 0);
    const subtotal = Number(factura.subtotal || total / 1.16);
    const iva = Number(factura.iva || total - subtotal);

    cfdiData = {
      version: '4.0',
      serie: '',
      folio: '',
      fechaEmision: factura.fecha_emision || new Date().toISOString(),
      lugarExpedicion: '',
      noCertificadoCSD: '',
      tipoComprobante: TIPO_COMPROBANTE_MAP[factura.tipo_comprobante] || 'Ingreso',
      exportacion: 'No aplica',
      metodoPago: 'Pago en una sola exhibición',
      formaPago: 'Por definir',
      moneda: factura.moneda || 'Peso Mexicano',
      subtotal,
      descuento: Number(factura.descuento || 0),
      total,
      selloCFD: '',
      rfcEmisor: factura.rfc_emisor || '',
      nombreEmisor: factura.nombre_emisor || '',
      regimenFiscalEmisor: 'General de Ley Personas Morales',
      rfcReceptor: factura.rfc_receptor || '',
      nombreReceptor: '',
      domicilioFiscalReceptor: '',
      regimenFiscalReceptor: 'Personas Físicas con Actividades Empresariales y Profesionales',
      usoCFDI: 'Gastos en general.',
      conceptos,
      impuestosTrasladados: iva > 0 ? [{ impuesto: 'IVA', tasa: '16.00%', importe: iva }] : [],
      impuestosRetenidos: [],
      uuid: factura.uuid,
      fechaTimbrado: factura.fecha_emision || '',
      rfcProvCertif: 'SAT970701NN3',
      noCertificadoSAT: '',
      selloSAT: '',
      cadenaOriginalSAT: `||1.1|${factura.uuid}|${factura.fecha_emision}||`,
      qrUrl: `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${factura.uuid}&re=${factura.rfc_emisor}&rr=${factura.rfc_receptor}&tt=${total.toFixed(6).padStart(17, '0')}&fe=`,
    };
  }

  const htmlContent = generateCfdiPdfHtml(cfdiData);

  // ---------------------------------------------------------------------------
  // EXPORTACIÓN / IMPRESIÓN SEGÚN PLATAFORMA
  // ---------------------------------------------------------------------------
  if (Platform.OS === 'web') {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 600);
    }
    return;
  }

  // Mobile (Android / iOS)
  const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
  const fileName = `Factura_${cfdiData.rfcEmisor}_${cfdiData.uuid.substring(0, 8)}.pdf`;
  const safeUri = `${cacheDirectory}${fileName}`;

  await writeAsStringAsync(safeUri, base64 || '', {
    encoding: EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(safeUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Factura ${cfdiData.uuid}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    throw new Error('La función de compartir no está disponible en este dispositivo.');
  }
}
