export interface CFDIConcepto {
  ClaveProdServ: string;
  NoIdentificacion?: string;
  Cantidad: number;
  ClaveUnidad: string;
  Unidad?: string;
  Descripcion: string;
  ValorUnitario: number;
  Importe: number;
  ObjetoImp: string; // "01" No objeto, "02" Sí objeto de impuesto, "03" Sí objeto y no obligado al desglose
  // Impuestos Trasladados (IVA 16%)
  BaseIva?: number;
  ImporteIva?: number;
}

export interface CFDIParams {
  Serie?: string;
  Folio?: string;
  Fecha: string; // Formato YYYY-MM-DDTHH:mm:ss
  FormaPago?: string; // Ej: "01", "03", "04", "99"
  MetodoPago?: string; // Ej: "PUE", "PPD"
  SubTotal: number;
  Total: number;
  LugarExpedicion: string; // Código postal del emisor
  Moneda?: string; // Default MXN
  Emisor: {
    Rfc: string;
    Nombre: string;
    RegimenFiscal: string; // Ej: "601", "612", "626"
  };
  Receptor: {
    Rfc: string;
    Nombre: string;
    DomicilioFiscalReceptor: string; // Código postal
    RegimenFiscalReceptor: string; // Ej: "601", "612", "616"
    UsoCFDI: string; // Ej: "G03", "G01", "S01", "CP01"
  };
  Conceptos: CFDIConcepto[];
}

function escapeXML(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildCFDI40XML(params: CFDIParams, noCertificado: string = "", certificadoBase64: string = ""): string {
  const formaPago = params.FormaPago || '01';
  const metodoPago = params.MetodoPago || 'PUE';
  const moneda = params.Moneda || 'MXN';

  // 1. Nodo Comprobante
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0"`;

  if (params.Serie) xml += ` Serie="${escapeXML(params.Serie)}"`;
  if (params.Folio) xml += ` Folio="${escapeXML(params.Folio)}"`;

  xml += ` Fecha="${params.Fecha}" Sello="" FormaPago="${formaPago}" NoCertificado="${noCertificado}" Certificado="${certificadoBase64}" SubTotal="${params.SubTotal.toFixed(2)}" Moneda="${moneda}" Total="${params.Total.toFixed(2)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${metodoPago}" LugarExpedicion="${escapeXML(params.LugarExpedicion)}">`;

  // 2. Nodos Emisor y Receptor
  xml += `\n  <cfdi:Emisor Rfc="${escapeXML(params.Emisor.Rfc)}" Nombre="${escapeXML(params.Emisor.Nombre)}" RegimenFiscal="${escapeXML(params.Emisor.RegimenFiscal)}"/>`;
  xml += `\n  <cfdi:Receptor Rfc="${escapeXML(params.Receptor.Rfc)}" Nombre="${escapeXML(params.Receptor.Nombre)}" DomicilioFiscalReceptor="${escapeXML(params.Receptor.DomicilioFiscalReceptor)}" RegimenFiscalReceptor="${escapeXML(params.Receptor.RegimenFiscalReceptor)}" UsoCFDI="${escapeXML(params.Receptor.UsoCFDI)}"/>`;

  // 3. Nodos Conceptos
  xml += `\n  <cfdi:Conceptos>`;

  let totalImpuestosTrasladados = 0;

  params.Conceptos.forEach(c => {
    xml += `\n    <cfdi:Concepto ClaveProdServ="${escapeXML(c.ClaveProdServ)}" Cantidad="${c.Cantidad.toFixed(6)}" ClaveUnidad="${escapeXML(c.ClaveUnidad)}" Descripcion="${escapeXML(c.Descripcion)}" ValorUnitario="${c.ValorUnitario.toFixed(6)}" Importe="${c.Importe.toFixed(2)}" ObjetoImp="${escapeXML(c.ObjetoImp)}"`;
    if (c.Unidad) xml += ` Unidad="${escapeXML(c.Unidad)}"`;
    if (c.NoIdentificacion) xml += ` NoIdentificacion="${escapeXML(c.NoIdentificacion)}"`;
    xml += `>`;

    // Si es objeto de impuesto ("02"), agregamos el traslado (IVA)
    if (c.ObjetoImp === "02" && c.BaseIva !== undefined && c.ImporteIva !== undefined) {
      xml += `\n      <cfdi:Impuestos>`;
      xml += `\n        <cfdi:Traslados>`;
      xml += `\n          <cfdi:Traslado Base="${c.BaseIva.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${c.ImporteIva.toFixed(2)}"/>`;
      xml += `\n        </cfdi:Traslados>`;
      xml += `\n      </cfdi:Impuestos>`;
      totalImpuestosTrasladados += c.ImporteIva;
    }

    xml += `\n    </cfdi:Concepto>`;
  });

  xml += `\n  </cfdi:Conceptos>`;

  // 4. Nodos Impuestos Globales (si hay)
  if (totalImpuestosTrasladados > 0) {
    xml += `\n  <cfdi:Impuestos TotalImpuestosTrasladados="${totalImpuestosTrasladados.toFixed(2)}">`;
    xml += `\n    <cfdi:Traslados>`;
    xml += `\n      <cfdi:Traslado Base="${params.SubTotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${totalImpuestosTrasladados.toFixed(2)}"/>`;
    xml += `\n    </cfdi:Traslados>`;
    xml += `\n  </cfdi:Impuestos>`;
  }

  // 5. Cierre
  xml += `\n</cfdi:Comprobante>`;

  return xml;
}
