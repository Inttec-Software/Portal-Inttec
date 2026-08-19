// @ts-nocheck

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
  
  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/i);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault: ${faultStringMatch[1]}`);
  }

  // Verificar si hay incidencias/errores reportados por Finkok / SAT
  const incidenciasMatch = responseText.match(/<Incidencias>([\s\S]*?)<\/Incidencias>/i);
  if (incidenciasMatch && incidenciasMatch[1].includes('<IdIncidencia>')) {
    const msgMatch = incidenciasMatch[1].match(/<MensajeIncidencia>(.*?)<\/MensajeIncidencia>/i);
    const codigoMatch = incidenciasMatch[1].match(/<CodigoError>(.*?)<\/CodigoError>/i);
    const errorMsg = msgMatch ? msgMatch[1] : 'Error desconocido al timbrar';
    const codigo = codigoMatch ? `[${codigoMatch[1]}] ` : '';
    throw new Error(`Incidencia Finkok / SAT: ${codigo}${errorMsg}`);
  }

  // Extraer XML timbrado
  const xmlTimbradoMatch = responseText.match(/<xml>([\s\S]*?)<\/xml>/i);
  if (!xmlTimbradoMatch || !xmlTimbradoMatch[1]) {
    const debugResponse = responseText.substring(0, 500);
    throw new Error(`No se recibió el XML timbrado de Finkok. Respuesta: ${debugResponse}`);
  }

  let xmlTimbrado = xmlTimbradoMatch[1].trim();
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
  let uuid = null;
  const uuidTagMatch = responseText.match(/<UUID>(.*?)<\/UUID>/i);
  if (uuidTagMatch && uuidTagMatch[1]) {
    uuid = uuidTagMatch[1].trim();
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

  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/i);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault al Cancelar: ${faultStringMatch[1]}`);
  }

  // Verificar incidencias
  const incidenciasMatch = responseText.match(/<Incidencias>([\s\S]*?)<\/Incidencias>/i);
  if (incidenciasMatch && incidenciasMatch[1].includes('<IdIncidencia>')) {
    const msgMatch = incidenciasMatch[1].match(/<MensajeIncidencia>(.*?)<\/MensajeIncidencia>/i);
    const errorMsg = msgMatch ? msgMatch[1] : 'Error desconocido al cancelar';
    throw new Error(`Error SAT/Finkok al cancelar: ${errorMsg}`);
  }

  const estatusMatch = responseText.match(/<EstatusUUID>(.*?)<\/EstatusUUID>/i);
  const estatus = estatusMatch ? estatusMatch[1] : '201'; // 201: Solicitud de cancelación recibida

  return {
    success: true,
    estatus: estatus,
    response: responseText
  };
}
