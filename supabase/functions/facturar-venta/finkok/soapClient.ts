export async function signStampFinkok(xmlString: string, finkokUsername: string, finkokPassword: string, isProduction: boolean = false) {
  const finkokUrl = isProduction 
    ? 'https://facturacion.finkok.com/servicios/soap/stamp' 
    : 'https://demo-facturacion.finkok.com/servicios/soap/stamp';

  // El XML debe enviarse en base64
  const xmlB64 = btoa(unescape(encodeURIComponent(xmlString)));

  // Usar sign_stamp en lugar de stamp. Finkok usará el CSD subido a su portal para sellar y luego timbrar.
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
  
  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault: ${faultStringMatch[1]}`);
  }

  // CodEstatus debe decir "Comprobante sellado y timbrado satisfactoriamente" o similar
  const xmlTimbradoMatch = responseText.match(/<xml>([\s\S]*?)<\/xml>/);
  const uuidMatch = responseText.match(/<UUID>(.*?)<\/UUID>/);
  const incarnatesErrorMatch = responseText.match(/<Incidencias>([\s\S]*?)<\/Incidencias>/);

  if (incarnatesErrorMatch && incarnatesErrorMatch[1].includes('<IdIncidencia>')) {
    const msgMatch = incarnatesErrorMatch[1].match(/<MensajeIncidencia>(.*?)<\/MensajeIncidencia>/);
    const errorMsg = msgMatch ? msgMatch[1] : 'Error desconocido al timbrar';
    throw new Error(`Incidencia Finkok: ${errorMsg}`);
  }

  if (!xmlTimbradoMatch || !xmlTimbradoMatch[1]) {
    // Para propósitos de depuración, devolveremos los primeros 500 caracteres de la respuesta
    const debugResponse = responseText.substring(0, 500);
    throw new Error(`No se recibió el XML timbrado de Finkok. Respuesta de Finkok: ${debugResponse}`);
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

  const faultStringMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
  if (faultStringMatch) {
    throw new Error(`Finkok Fault: ${faultStringMatch[1]}`);
  }

  return {
    success: true,
    response: responseText
  };
}
