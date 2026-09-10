// @ts-nocheck

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

export async function signStampFinkok(
  xmlString: string,
  finkokUsername: string,
  finkokPassword: string,
  isProduction: boolean = false
) {
  const finkokUrl = isProduction 
    ? 'https://facturacion.finkok.com/servicios/soap/stamp' 
    : 'https://demo-facturacion.finkok.com/servicios/soap/stamp';

  // Codificar XML a Base64 en UTF-8 seguro
  const xmlB64 = btoa(unescape(encodeURIComponent(xmlString)));

  // Método sign_stamp: Finkok sella usando el CSD precargado en su portal y timbra ante el SAT
  const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:sign_stamp>
         <stam:xml>${xmlB64}</stam:xml>
         <stam:username>${finkokUsername}</stam:username>
         <stam:password>${finkokPassword}</stam:password>
      </stam:sign_stamp>
   </soapenv:Body>
</soapenv:Envelope>
`.trim();

  const response = await fetch(finkokUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '"http://facturacion.finkok.com/stamp/sign_stamp"',
    },
    body: soapEnvelope
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Finkok HTTP Error ${response.status}: ${responseText}`);
  }
  
  const faultString = extractTag(responseText, 'faultstring');
  if (faultString) {
    throw new Error(`Finkok Fault: ${faultString.trim()}`);
  }

  // Verificar si hay incidencias/errores reportados por Finkok / SAT
  const incidenciasContent = extractTag(responseText, 'Incidencias');
  if (incidenciasContent) {
    const codigoError = extractTag(incidenciasContent, 'CodigoError');
    const mensajeIncidencia = extractTag(incidenciasContent, 'MensajeIncidencia');

    if (codigoError || mensajeIncidencia) {
      const codigo = codigoError ? `[${codigoError.trim()}] ` : '';
      const msg = mensajeIncidencia ? mensajeIncidencia.trim() : 'Error desconocido al timbrar';
      throw new Error(`Incidencia Finkok / SAT: ${codigo}${msg}`);
    }
  }

  // Extraer XML timbrado
  let xmlTimbrado = extractTag(responseText, 'xml');
  if (!xmlTimbrado || !xmlTimbrado.trim()) {
    const debugResponse = responseText.substring(0, 300);
    throw new Error(`No se recibió el XML timbrado de Finkok. Respuesta: ${debugResponse}`);
  }

  xmlTimbrado = xmlTimbrado.trim();
  // Si viene con entidades escapadas como &lt;cfdi:Comprobante... des-escapar
  if (xmlTimbrado.startsWith('&lt;')) {
    xmlTimbrado = xmlTimbrado
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  // Extraer UUID
  let uuid = extractTag(responseText, 'UUID');
  if (uuid) {
    uuid = uuid.trim();
  } else {
    const uuidAttrMatch = xmlTimbrado.match(/UUID="([0-9a-fA-F-]{36})"/i);
    if (uuidAttrMatch) {
      uuid = uuidAttrMatch[1];
    }
  }

  return {
    success: true,
    uuid: uuid,
    xml: xmlTimbrado
  };
}

export async function signCancelFinkok(
  uuid: string,
  rfcEmisor: string,
  finkokUsername: string,
  finkokPassword: string,
  motivo: string = '02',
  folioSustitucion: string = '',
  isProduction: boolean = false
) {
  const finkokUrl = isProduction 
    ? 'https://facturacion.finkok.com/servicios/soap/cancel' 
    : 'https://demo-facturacion.finkok.com/servicios/soap/cancel';

  const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:can="http://facturacion.finkok.com/cancel">
   <soapenv:Header/>
   <soapenv:Body>
      <can:sign_cancel>
         <can:UUIDS>
            <can:UUIDItem>
               <can:UUID>${uuid}</can:UUID>
               <can:Motivo>${motivo}</can:Motivo>
               ${folioSustitucion ? `<can:FolioSustitucion>${folioSustitucion}</can:FolioSustitucion>` : ''}
            </can:UUIDItem>
         </can:UUIDS>
         <can:username>${finkokUsername}</can:username>
         <can:password>${finkokPassword}</can:password>
         <can:taxpayer_id>${rfcEmisor}</can:taxpayer_id>
      </can:sign_cancel>
   </soapenv:Body>
</soapenv:Envelope>
`.trim();

  const response = await fetch(finkokUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '"http://facturacion.finkok.com/cancel/sign_cancel"',
    },
    body: soapEnvelope
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Finkok Cancel HTTP Error ${response.status}: ${responseText}`);
  }

  const faultString = extractTag(responseText, 'faultstring');
  if (faultString) {
    throw new Error(`Finkok Fault al Cancelar: ${faultString.trim()}`);
  }

  // Verificar incidencias
  const incidenciasContent = extractTag(responseText, 'Incidencias');
  if (incidenciasContent) {
    const mensajeIncidencia = extractTag(incidenciasContent, 'MensajeIncidencia');
    const codigoError = extractTag(incidenciasContent, 'CodigoError');
    if (mensajeIncidencia || codigoError) {
      const codigo = codigoError ? `[${codigoError.trim()}] ` : '';
      const msg = mensajeIncidencia ? mensajeIncidencia.trim() : 'Error desconocido al cancelar';
      throw new Error(`Error SAT/Finkok al cancelar: ${codigo}${msg}`);
    }
  }

  const estatusMatch = extractTag(responseText, 'EstatusUUID');
  const estatus = estatusMatch ? estatusMatch.trim() : '201'; // 201: Solicitud de cancelación recibida

  return {
    success: true,
    estatus: estatus,
    response: responseText
  };
}
