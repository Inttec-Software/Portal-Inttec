/**
 * Cliente SOAP para el Web Service Oficial de Descarga Masiva del SAT
 * Implementa autenticación WS-Security X.509 y firmado digital con e.firma (node-forge)
 */

import forge from "https://esm.sh/node-forge@1.3.1";

export interface SatCredentials {
  rfc: string;
  cerB64?: string;
  keyB64?: string;
  password?: string;
  finkokUsername?: string;
  finkokPassword?: string;
  isProduction?: boolean;
}

export interface SolicitudDescargaResult {
  success: boolean;
  idSolicitud?: string;
  codEstatus?: string;
  mensaje?: string;
}

export interface VerificaSolicitudResult {
  success: boolean;
  estadoSolicitud?: string; // 1: Aceptada, 2: En Proceso, 3: Terminada, 4: Error, 5: Rechazada
  codEstatus?: string;
  codigoEstadoSolicitud?: string;
  paquetesIds?: string[];
  mensaje?: string;
}

export class SatSoapClient {
  private rfc: string;
  private cerB64: string;
  private keyB64: string;
  private password: string;
  private token: string | null = null;
  private tokenExpires: number = 0;

  constructor(creds: SatCredentials) {
    this.rfc = (creds.rfc || '').trim().toUpperCase();
    this.cerB64 = (creds.cerB64 || '').replace(/[\r\n\s]/g, "");
    this.keyB64 = (creds.keyB64 || '').replace(/[\r\n\s]/g, "");
    this.password = (creds.password || '').trim();
  }

  /**
   * Obtiene la clave privada descifrada usando la contraseña de la e.firma
   */
  private getPrivateKey(): forge.pki.rsa.PrivateKey {
    if (!this.keyB64 || !this.password) {
      throw new Error("Se requiere la llave privada (SAT_KEY_B64) y la contraseña (SAT_PASSWORD) de la e.firma.");
    }

    try {
      const keyDerBytes = forge.util.decode64(this.keyB64);
      const asn1 = forge.asn1.fromDer(keyDerBytes);
      const decryptedAsn1 = forge.pki.decryptPrivateKeyInfo(asn1, this.password);
      if (!decryptedAsn1) {
        throw new Error("No se pudo descifrar la llave privada (.key). Verifica que la contraseña (SAT_PASSWORD) sea la correcta.");
      }
      return forge.pki.privateKeyFromAsn1(decryptedAsn1);
    } catch (err: any) {
      throw new Error(`Error al procesar llave privada: ${err.message}`);
    }
  }

  /**
   * Obtiene el certificado X.509
   */
  private getCertificate(): forge.pki.Certificate {
    if (!this.cerB64) {
      throw new Error("Se requiere el certificado (SAT_CER_B64) de la e.firma.");
    }
    const cerDerBytes = forge.util.decode64(this.cerB64);
    const asn1 = forge.asn1.fromDer(cerDerBytes);
    return forge.pki.certificateFromAsn1(asn1);
  }

  /**
   * Formatea fecha ISO UTC sin milisegundos (YYYY-MM-DDTHH:mm:ssZ)
   */
  private formatDateIso(d: Date): string {
    return d.toISOString().replace(/\.\d{3}/, '');
  }

  /**
   * Obtiene Token Bearer de Autenticación con el SAT firmando el Timestamp con WS-Security
   */
  async autenticar(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpires) {
      return this.token;
    }

    const privateKey = this.getPrivateKey();
    const cleanCer = this.cerB64;

    const now = new Date();
    // Fechas en formato estándar WCF sin milisegundos con ajuste de reloj (-2 min pasado, +8 min futuro)
    const created = this.formatDateIso(new Date(now.getTime() - 2 * 60 * 1000));
    const expires = this.formatDateIso(new Date(now.getTime() + 8 * 60 * 1000));

    const timestampId = "_0";
    const bstId = `uuid-${crypto.randomUUID()}-1`;

    // 1. Timestamp canónico exacto (Exc-C14N)
    const canonicalTimestamp = `<u:Timestamp xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="${timestampId}"><u:Created>${created}</u:Created><u:Expires>${expires}</u:Expires></u:Timestamp>`;

    // 2. Digest SHA-1
    const md = forge.md.sha1.create();
    md.update(canonicalTimestamp, "utf8");
    const digestValue = forge.util.encode64(md.digest().getBytes());

    // 3. SignedInfo canónico exacto para WCF WS-Security
    const canonicalSignedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#${timestampId}"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

    // 4. Firma RSA-SHA1
    const signMd = forge.md.sha1.create();
    signMd.update(canonicalSignedInfo, "utf8");
    const signatureBytes = privateKey.sign(signMd);
    const signatureValue = forge.util.encode64(signatureBytes);

    const soapEnvelope = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><s:Header><o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><u:Timestamp u:Id="${timestampId}"><u:Created>${created}</u:Created><u:Expires>${expires}</u:Expires></u:Timestamp><o:BinarySecurityToken u:Id="${bstId}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${cleanCer}</o:BinarySecurityToken><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#${timestampId}"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo><SignatureValue>${signatureValue}</SignatureValue><KeyInfo><o:SecurityTokenReference><o:Reference ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" URI="#${bstId}"/></o:SecurityTokenReference></KeyInfo></Signature></o:Security></s:Header><s:Body><Autentica xmlns="http://DescargaMasivaTerceros.gob.mx"/></s:Body></s:Envelope>`.trim();

    const response = await fetch("https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica"
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const tokenMatch = responseText.match(/<AutenticaResult>([\s\S]*?)<\/AutenticaResult>/);
    if (!tokenMatch || !tokenMatch[1]) {
      throw new Error(`Error de autenticación SAT: ${responseText}`);
    }

    this.token = tokenMatch[1].trim();
    this.tokenExpires = Date.now() + 4 * 60 * 1000;
    return this.token;
  }

  /**
   * Genera la firma digital de la solicitud de descarga de facturas recibidas y la envía al SAT
   */
  async solicitarDescargaRecibidos(fechaInicio: string, fechaFin: string): Promise<SolicitudDescargaResult> {
    const token = await this.autenticar();
    const privateKey = this.getPrivateKey();
    const cert = this.getCertificate();
    const cleanCer = this.cerB64;

    const issuerAttrs = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).reverse().join(',');
    const serialNumber = BigInt('0x' + cert.serialNumber).toString(10);

    // En SAT XSD, los atributos de solicitud ordenados alfabéticamente para Exc-C14N:
    // EstadoComprobante, FechaFinal, FechaInicial, RfcReceptor, RfcSolicitante, TipoSolicitud
    const canonicalSolicitud = `<des:solicitud xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" EstadoComprobante="Vigente" FechaFinal="${fechaFin}" FechaInicial="${fechaInicio}" RfcReceptor="${this.rfc}" RfcSolicitante="${this.rfc}" TipoSolicitud="CFDI"></des:solicitud>`;

    const md = forge.md.sha1.create();
    md.update(canonicalSolicitud, "utf8");
    const digestValue = forge.util.encode64(md.digest().getBytes());

    const canonicalSignedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

    const signMd = forge.md.sha1.create();
    signMd.update(canonicalSignedInfo, "utf8");
    const signatureBytes = privateKey.sign(signMd);
    const signatureValue = forge.util.encode64(signatureBytes);

    const soapEnvelope = `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
  <s:Header/>
  <s:Body>
    <des:SolicitaDescargaRecibidos>
      <des:solicitud EstadoComprobante="Vigente" FechaFinal="${fechaFin}" FechaInicial="${fechaInicio}" RfcReceptor="${this.rfc}" RfcSolicitante="${this.rfc}" TipoSolicitud="CFDI">
        <xd:Signature>
          <xd:SignedInfo>
            <xd:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
            <xd:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
            <xd:Reference URI="">
              <xd:Transforms>
                <xd:Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"/>
              </xd:Transforms>
              <xd:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
              <xd:DigestValue>${digestValue}</xd:DigestValue>
            </xd:Reference>
          </xd:SignedInfo>
          <xd:SignatureValue>${signatureValue}</xd:SignatureValue>
          <xd:KeyInfo>
            <xd:X509Data>
              <xd:X509IssuerSerial>
                <xd:X509IssuerName>${issuerAttrs}</xd:X509IssuerName>
                <xd:X509SerialNumber>${serialNumber}</xd:X509SerialNumber>
              </xd:X509IssuerSerial>
              <xd:X509Certificate>${cleanCer}</xd:X509Certificate>
            </xd:X509Data>
          </xd:KeyInfo>
        </xd:Signature>
      </des:solicitud>
    </des:SolicitaDescargaRecibidos>
  </s:Body>
</s:Envelope>`.trim();

    const response = await fetch("https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaRecibidos",
        "Authorization": `WRAP access_token="${token}"`
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const idSolicitudMatch = responseText.match(/IdSolicitud="([^"]+)"/);
    const codEstatusMatch = responseText.match(/CodEstatus="([^"]+)"/);
    const mensajeMatch = responseText.match(/Mensaje="([^"]+)"/);

    if (idSolicitudMatch && idSolicitudMatch[1]) {
      return {
        success: true,
        idSolicitud: idSolicitudMatch[1],
        codEstatus: codEstatusMatch ? codEstatusMatch[1] : '5000',
        mensaje: mensajeMatch ? mensajeMatch[1] : 'Solicitud aceptada'
      };
    }

    return {
      success: false,
      codEstatus: codEstatusMatch ? codEstatusMatch[1] : '5004',
      mensaje: mensajeMatch ? mensajeMatch[1] : `Respuesta del SAT: ${responseText.substring(0, 300)}`
    };
  }

  /**
   * Verifica el estado de una solicitud previa ante el SAT
   */
  async verificarSolicitud(idSolicitud: string): Promise<VerificaSolicitudResult> {
    const token = await this.autenticar();
    const privateKey = this.getPrivateKey();
    const cert = this.getCertificate();
    const cleanCer = this.cerB64;

    const issuerAttrs = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).reverse().join(',');
    const serialNumber = BigInt('0x' + cert.serialNumber).toString(10);

    const canonicalSolicitud = `<des:solicitud xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" IdSolicitud="${idSolicitud}" RfcSolicitante="${this.rfc}"></des:solicitud>`;

    const md = forge.md.sha1.create();
    md.update(canonicalSolicitud, "utf8");
    const digestValue = forge.util.encode64(md.digest().getBytes());

    const canonicalSignedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

    const signMd = forge.md.sha1.create();
    signMd.update(canonicalSignedInfo, "utf8");
    const signatureBytes = privateKey.sign(signMd);
    const signatureValue = forge.util.encode64(signatureBytes);

    const soapEnvelope = `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
  <s:Header/>
  <s:Body>
    <des:VerificaSolicitudDescarga>
      <des:solicitud IdSolicitud="${idSolicitud}" RfcSolicitante="${this.rfc}">
        <xd:Signature>
          <xd:SignedInfo>
            <xd:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
            <xd:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
            <xd:Reference URI="">
              <xd:Transforms>
                <xd:Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"/>
              </xd:Transforms>
              <xd:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
              <xd:DigestValue>${digestValue}</xd:DigestValue>
            </xd:Reference>
          </xd:SignedInfo>
          <xd:SignatureValue>${signatureValue}</xd:SignatureValue>
          <xd:KeyInfo>
            <xd:X509Data>
              <xd:X509IssuerSerial>
                <xd:X509IssuerName>${issuerAttrs}</xd:X509IssuerName>
                <xd:X509SerialNumber>${serialNumber}</xd:X509SerialNumber>
              </xd:X509IssuerSerial>
              <xd:X509Certificate>${cleanCer}</xd:X509Certificate>
            </xd:X509Data>
          </xd:KeyInfo>
        </xd:Signature>
      </des:solicitud>
    </des:VerificaSolicitudDescarga>
  </s:Body>
</s:Envelope>`.trim();

    const response = await fetch("https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga",
        "Authorization": `WRAP access_token="${token}"`
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const estadoMatch = responseText.match(/EstadoSolicitud="([^"]+)"/);
    const codEstatusMatch = responseText.match(/CodEstatus="([^"]+)"/);
    const codigoEstadoSolMatch = responseText.match(/CodigoEstadosolicitud="([^"]+)"/i);
    const mensajeMatch = responseText.match(/Mensaje="([^"]+)"/);
    const idsPaquetesMatches = [...responseText.matchAll(/<IdsPaquetes>([^<]+)<\/IdsPaquetes>/g)].map(m => m[1]);

    return {
      success: true,
      estadoSolicitud: estadoMatch ? estadoMatch[1] : '0',
      codEstatus: codEstatusMatch ? codEstatusMatch[1] : '5000',
      codigoEstadoSolicitud: codigoEstadoSolMatch ? codigoEstadoSolMatch[1] : undefined,
      paquetesIds: idsPaquetesMatches,
      mensaje: mensajeMatch ? mensajeMatch[1] : ''
    };
  }

  /**
   * Descarga el paquete .zip de comprobantes del SAT
   */
  async descargarPaquete(idPaquete: string): Promise<Uint8Array> {
    const token = await this.autenticar();
    const privateKey = this.getPrivateKey();
    const cert = this.getCertificate();
    const cleanCer = this.cerB64;

    const issuerAttrs = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).reverse().join(',');
    const serialNumber = BigInt('0x' + cert.serialNumber).toString(10);

    const canonicalPeticion = `<des:peticionDescarga xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" IdPaquete="${idPaquete}" RfcSolicitante="${this.rfc}"></des:peticionDescarga>`;

    const md = forge.md.sha1.create();
    md.update(canonicalPeticion, "utf8");
    const digestValue = forge.util.encode64(md.digest().getBytes());

    const canonicalSignedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

    const signMd = forge.md.sha1.create();
    signMd.update(canonicalSignedInfo, "utf8");
    const signatureBytes = privateKey.sign(signMd);
    const signatureValue = forge.util.encode64(signatureBytes);

    const soapEnvelope = `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">
  <s:Header/>
  <s:Body>
    <des:PeticionDescargaMasivaTercerosEntrada>
      <des:peticionDescarga IdPaquete="${idPaquete}" RfcSolicitante="${this.rfc}">
        <xd:Signature>
          <xd:SignedInfo>
            <xd:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
            <xd:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
            <xd:Reference URI="">
              <xd:Transforms>
                <xd:Transform Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#"/>
              </xd:Transforms>
              <xd:DigestMethod Algorithm="http://www.w3.org/2000/09/xml-exc-c14n#sha1"/>
              <xd:DigestValue>${digestValue}</xd:DigestValue>
            </xd:Reference>
          </xd:SignedInfo>
          <xd:SignatureValue>${signatureValue}</xd:SignatureValue>
          <xd:KeyInfo>
            <xd:X509Data>
              <xd:X509IssuerSerial>
                <xd:X509IssuerName>${issuerAttrs}</xd:X509IssuerName>
                <xd:X509SerialNumber>${serialNumber}</xd:X509SerialNumber>
              </xd:X509IssuerSerial>
              <xd:X509Certificate>${cleanCer}</xd:X509Certificate>
            </xd:X509Data>
          </xd:KeyInfo>
        </xd:Signature>
      </des:peticionDescarga>
    </des:PeticionDescargaMasivaTercerosEntrada>
  </s:Body>
</s:Envelope>`.trim();

    const response = await fetch("https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar",
        "Authorization": `WRAP access_token="${token}"`
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const paqueteB64Match = responseText.match(/<Paquete>([\s\S]*?)<\/Paquete>/);
    if (!paqueteB64Match || !paqueteB64Match[1]) {
      throw new Error(`No se pudo descargar el paquete ${idPaquete} del SAT. Respuesta: ${responseText.substring(0, 300)}`);
    }

    const binaryString = atob(paqueteB64Match[1].trim());
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}
