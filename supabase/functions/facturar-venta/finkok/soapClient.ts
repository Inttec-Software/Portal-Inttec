export async function timbrarFinkok(xmlFirmado: string, finkokUsername: string, finkokPassword: string, isProduction: boolean = false) {
  const finkokUrl = isProduction 
    ? 'https://facturacion.finkok.com/servicios/soap/stamp' 
    : 'https://demo-facturacion.finkok.com/servicios/soap/stamp';

  // El XML debe enviarse en base64 según la especificación de Finkok
  const xmlB64 = btoa(unescape(encodeURIComponent(xmlFirmado)));

  const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:stamp>
         <stam:xml>${xmlB64}</stam:xml>
         <stam:username>${finkokUsername}</stam:username>
         <stam:password>${finkokPassword}</stam:password>
      </stam:stamp>
   </soapenv:Body>
</soapenv:Envelope>
`.trim();

  const response = await fetch(finkokUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '"http://facturacion.finkok.com/stamp/stamp"',
    },
    body: soapEnvelope
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Finkok HTTP Error ${response.status}: ${responseText}`);
  }

  // Parsear la respuesta XML para extraer el UUID y el XML timbrado
  // Ya que en Edge Functions (Deno) no tenemos DOMParser de forma nativa sin importar librerías pesadas,
  // usaremos regex seguros para extraer los campos principales.
  
  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault: ${faultStringMatch[1]}`);
  }

  const xmlTimbradoMatch = responseText.match(/<xml>([\s\S]*?)<\/xml>/);
  const uuidMatch = responseText.match(/<UUID>(.*?)<\/UUID>/);
  const incarnatesErrorMatch = responseText.match(/<Incidencias>([\s\S]*?)<\/Incidencias>/);

  if (incarnatesErrorMatch && incarnatesErrorMatch[1].includes('<IdIncidencia>')) {
    // Hubo un error de validación
    const msgMatch = incarnatesErrorMatch[1].match(/<MensajeIncidencia>(.*?)<\/MensajeIncidencia>/);
    const errorMsg = msgMatch ? msgMatch[1] : 'Error desconocido al timbrar';
    throw new Error(`Incidencia Finkok: ${errorMsg}`);
  }

  if (!xmlTimbradoMatch || !xmlTimbradoMatch[1]) {
    throw new Error("No se recibió el XML timbrado de Finkok.");
  }

  return {
    success: true,
    uuid: uuidMatch ? uuidMatch[1] : null,
    xml: xmlTimbradoMatch[1]
  };
}

export async function cancelarFinkok(uuid: string, rfcReceptor: string, total: number, finkokUsername: string, finkokPassword: string, cerB64: string, keyB64: string, isProduction: boolean = false) {
  const finkokUrl = isProduction 
    ? 'https://facturacion.finkok.com/servicios/soap/cancel' 
    : 'https://demo-facturacion.finkok.com/servicios/soap/cancel';

  // Finkok cancel endpoint requires the UUID and the CSD to sign the cancellation request.
  const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:can="http://facturacion.finkok.com/cancel">
   <soapenv:Header/>
   <soapenv:Body>
      <can:cancel>
         <can:UUIDS>
            <can:string>${uuid}</can:string>
         </can:UUIDS>
         <can:username>${finkokUsername}</can:username>
         <can:password>${finkokPassword}</can:password>
         <!-- RFC Emisor lo obtiene finkok internamente o debemos pasarlo según la documentación -->
         <can:taxpayer_id>RFC_EMISOR</can:taxpayer_id> 
         <can:cer>${cerB64}</can:cer>
         <can:key>${keyB64}</can:key>
      </can:cancel>
   </soapenv:Body>
</soapenv:Envelope>
`.trim();

  const response = await fetch(finkokUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '"http://facturacion.finkok.com/cancel/cancel"',
    },
    body: soapEnvelope
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Finkok Cancel HTTP Error ${response.status}: ${responseText}`);
  }

  // Parse response
  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault: ${faultStringMatch[1]}`);
  }

  return {
    success: true,
    response: responseText
  };
}
