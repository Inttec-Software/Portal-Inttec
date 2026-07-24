export interface CFDIConcepto {
  ClaveProdServ: string;
  NoIdentificacion?: string;
  Cantidad: number;
  ClaveUnidad: string;
  Unidad?: string;
  Descripcion: string;
  ValorUnitario: number;
  Importe: number;
  ObjetoImp: string; // "01", "02", "03"
  // Impuestos Trasladados (simplificado para IVA 16)
  BaseIva?: number;
  ImporteIva?: number;
}

export interface CFDIParams {
  Serie?: string;
  Folio?: string;
  Fecha: string;
  SubTotal: number;
  Total: number;
  LugarExpedicion: string;
  Emisor: {
    Rfc: string;
    Nombre: string;
    RegimenFiscal: string; // Ej: "612"
  };
  Receptor: {
    Rfc: string;
    Nombre: string;
    DomicilioFiscalReceptor: string; // CP
    RegimenFiscalReceptor: string;
    UsoCFDI: string; // Ej: "G03"
  };
  Conceptos: CFDIConcepto[];
}

export function buildCFDI40XML(params: CFDIParams, noCertificado: string, certificadoBase64: string): string {
  // Construcción del XML en crudo asegurando el orden exacto del Anexo 20
  
  // 1. Nodo Comprobante
  let xml = \`<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" \`;
  
  if (params.Serie) xml += \`Serie="\${params.Serie}" \`;
  if (params.Folio) xml += \`Folio="\${params.Folio}" \`;
  
  xml += \`Fecha="\${params.Fecha}" Sello="" FormaPago="01" NoCertificado="\${noCertificado}" Certificado="\${certificadoBase64}" SubTotal="\${params.SubTotal.toFixed(2)}" Moneda="MXN" Total="\${params.Total.toFixed(2)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="\${params.LugarExpedicion}">\`;

  // 2. Nodos Emisor y Receptor
  xml += \`
  <cfdi:Emisor Rfc="\${params.Emisor.Rfc}" Nombre="\${params.Emisor.Nombre}" RegimenFiscal="\${params.Emisor.RegimenFiscal}"/>
  <cfdi:Receptor Rfc="\${params.Receptor.Rfc}" Nombre="\${params.Receptor.Nombre}" DomicilioFiscalReceptor="\${params.Receptor.DomicilioFiscalReceptor}" RegimenFiscalReceptor="\${params.Receptor.RegimenFiscalReceptor}" UsoCFDI="\${params.Receptor.UsoCFDI}"/>\`;

  // 3. Nodos Conceptos
  xml += \`
  <cfdi:Conceptos>\`;
  
  let totalImpuestosTrasladados = 0;

  params.Conceptos.forEach(c => {
    xml += \`
    <cfdi:Concepto ClaveProdServ="\${c.ClaveProdServ}" Cantidad="\${c.Cantidad.toFixed(6)}" ClaveUnidad="\${c.ClaveUnidad}" Descripcion="\${c.Descripcion}" ValorUnitario="\${c.ValorUnitario.toFixed(6)}" Importe="\${c.Importe.toFixed(2)}" ObjetoImp="\${c.ObjetoImp}">\`;
    
    // Si es objeto de impuesto ("02"), agregamos el traslado (IVA)
    if (c.ObjetoImp === "02" && c.BaseIva !== undefined && c.ImporteIva !== undefined) {
      xml += \`
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="\${c.BaseIva.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="\${c.ImporteIva.toFixed(2)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>\`;
      totalImpuestosTrasladados += c.ImporteIva;
    }
    
    xml += \`
    </cfdi:Concepto>\`;
  });

  xml += \`
  </cfdi:Conceptos>\`;

  // 4. Nodos Impuestos Globales (si hay)
  if (totalImpuestosTrasladados > 0) {
    xml += \`
  <cfdi:Impuestos TotalImpuestosTrasladados="\${totalImpuestosTrasladados.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="\${params.SubTotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="\${totalImpuestosTrasladados.toFixed(2)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>\`;
  }

  // 5. Cierre
  xml += \`
</cfdi:Comprobante>\`;

  return xml;
}

