import { buildCFDI40XML, CFDIParams, CFDIConcepto } from './xmlGenerator';

/**
 * Limpia el nombre del receptor para CFDI 4.0 (SAT):
 * Elimina sufijos societarios comunes (S.A. de C.V., S. de R.L., etc.) y lo pasa a MAYÚSCULAS.
 */
function cleanClientLegalName(name: string): string {
  if (!name) return 'PUBLICO EN GENERAL';
  let cleaned = name.toUpperCase().trim();

  // Remover régimen societario común según Anexo 20 CFDI 4.0
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
 * Mapea formas de pago comunes a claves del SAT
 */
function mapFormaPagoSAT(forma?: string): string {
  if (!forma) return '01'; // Default Efectivo
  const f = forma.toLowerCase().trim();
  if (f.includes('transferencia') || f === '03') return '03';
  if (f.includes('monedero') || f === '05') return '05';
  if (f.includes('credito') || f === '04') return '04';
  if (f.includes('debito') || f === '28') return '28';
  if (f.includes('cheque') || f === '02') return '02';
  if (f.includes('por definir') || f.includes('definir') || f === '99') return '99';
  if (/^\d{2}$/.test(f)) return f;
  return '03'; // Transferencia electrónica por defecto para ventas empresariales
}

function cleanFolio(rawFolio?: any): string {
  if (!rawFolio && rawFolio !== 0) return '';
  let str = String(rawFolio).trim();
  if (str.includes(' - ')) {
    str = str.split(' - ')[0].trim();
  } else if (/\s*-\s*[a-zA-Z]/.test(str)) {
    str = str.split(/\s*-\s*/)[0].trim();
  } else if (/\s+[a-zA-Z(]/.test(str)) {
    str = str.split(/\s+/)[0].trim();
  }
  return str;
}

export function getEmisorConfig(company: string = 'inttec', isProduction: boolean = true) {
  if (!isProduction) {
    return {
      rfc: process.env.EMISOR_RFC_DEMO || 'EKU9003173C9',
      nombre: process.env.EMISOR_NOMBRE_DEMO || 'ESCUELA KEMPER URATE',
      regimen: process.env.EMISOR_REGIMEN_DEMO || '601',
      cp: process.env.EMISOR_CP_DEMO || '77500',
    };
  }
  if (String(company).toLowerCase().trim() === 'daravisa') {
    return {
      rfc: process.env.DARAVISA_EMISOR_RFC || 'DST2102127T9',
      nombre: process.env.DARAVISA_EMISOR_NOMBRE || 'DARAVISA SOLUCIONES Y TECNOLOGIA',
      regimen: process.env.DARAVISA_EMISOR_REGIMEN || '601',
      cp: process.env.DARAVISA_EMISOR_CP || '31110',
    };
  }
  return {
    rfc: process.env.EMISOR_RFC || 'FETR83041461A',
    nombre: process.env.EMISOR_NOMBRE || 'RAFAEL ALONSO FERNANDEZ TINAJERO',
    regimen: process.env.EMISOR_REGIMEN || '612',
    cp: process.env.EMISOR_CP || '31110',
  };
}

export async function buildUnsignedCFDI(
  ventaData: any,
  clienteData: any,
  partidas: any[],
  isProduction: boolean = false,
  company: string = 'inttec'
) {
  // Configuración del Emisor según la empresa activa (Inttec vs Daravisa)
  const { rfc: emisorRfc, nombre: emisorNombre, regimen: emisorRegimen, cp: emisorCP } = getEmisorConfig(company, isProduction);

  // Mapeo de conceptos/partidas
  const conceptos: CFDIConcepto[] = partidas.map((p: any) => {
    const cantidad = parseFloat(p.cantidad || 1);
    const precio = parseFloat(p.precio_unitario_venta || p.precio_unitario || p.precio || 0);
    const importe = cantidad * precio;
    const iva = importe * 0.16;

    return {
      ClaveProdServ: p.clave_sat || p.clave_prod_serv || '01010101',
      ClaveUnidad: p.clave_unidad || p.unidad_sat || 'H87',
      Unidad: p.unidad || 'Pieza',
      Descripcion: p.descripcion_detallada && String(p.descripcion_detallada).trim()
        ? `${String(p.descripcion || p.nombre_producto || 'Producto / Servicio').trim()} - ${String(p.descripcion_detallada).trim()}`
        : (p.descripcion || p.nombre_producto || 'Producto / Servicio'),
      NoIdentificacion: p.sku || p.id ? String(p.sku || p.id) : undefined,
      Cantidad: cantidad,
      ValorUnitario: precio,
      Importe: importe,
      ObjetoImp: "02", // Sí objeto de impuesto (IVA 16%)
      BaseIva: importe,
      ImporteIva: iva,
    };
  });

  const subTotal = conceptos.reduce((sum, c) => sum + c.Importe, 0);
  const totalImpuestos = conceptos.reduce((sum, c) => sum + (c.ImporteIva || 0), 0);
  const total = subTotal + totalImpuestos;

  // Validación y normalización del Receptor
  const isPublicoGeneral = !clienteData?.rfc || clienteData.rfc.trim().toUpperCase() === 'XAXX010101000';
  const receptorRfc = isPublicoGeneral ? 'XAXX010101000' : clienteData.rfc.trim().toUpperCase();
  const receptorNombre = isPublicoGeneral ? 'PUBLICO EN GENERAL' : cleanClientLegalName(clienteData.razon_social || clienteData.nombre);
  const receptorCP = isPublicoGeneral ? emisorCP : (clienteData.codigo_postal || emisorCP);
  const receptorRegimen = isPublicoGeneral ? '616' : (clienteData.regimen_fiscal || '601');
  const receptorUsoCFDI = isPublicoGeneral ? 'S01' : (clienteData.uso_cfdi || 'G03');

  // Forma y Método de Pago
  const formaPago = mapFormaPagoSAT(ventaData.metodo_pago || ventaData.forma_pago);
  const metodoPago = formaPago === '99' ? 'PPD' : (ventaData.metodo_pago_cfdi || 'PUE');

  // Fecha actual en hora local del emisor (UTC-6 México) sin milisegundos (YYYY-MM-DDTHH:mm:ss)
  // Restamos 6 horas para UTC-6, y adicionalmente 10 minutos para evitar error 401 (Fecha fuera de rango por reloj adelantado vs SAT)
  const tzOffset = (6 * 60 * 60 * 1000) + (10 * 60 * 1000); // 6 horas + 10 minutos
  const fecha = new Date(Date.now() - tzOffset).toISOString().substring(0, 19);

  const serie = (ventaData.cfdi_serie || ventaData.serie || 'A').toUpperCase().trim();
  let folio = cleanFolio(ventaData.cfdi_folio || ventaData.folio || '0001');
  if (folio.toUpperCase().startsWith(serie)) {
    folio = folio.slice(serie.length).trim();
  }
  if (/^\d+$/.test(folio)) {
    folio = String(parseInt(folio, 10)).padStart(4, '0');
  } else if (!folio) {
    folio = '0001';
  }

  const params: CFDIParams = {
    Serie: serie,
    Folio: folio,
    Fecha: fecha,
    FormaPago: formaPago,
    MetodoPago: metodoPago,
    Moneda: 'MXN',
    OrdenCompra: ventaData.orden_compra || undefined,
    SubTotal: subTotal,
    Total: total,
    LugarExpedicion: emisorCP,
    Emisor: {
      Rfc: emisorRfc,
      Nombre: emisorNombre,
      RegimenFiscal: emisorRegimen,
    },
    Receptor: {
      Rfc: receptorRfc,
      Nombre: receptorNombre,
      DomicilioFiscalReceptor: receptorCP,
      RegimenFiscalReceptor: receptorRegimen,
      UsoCFDI: receptorUsoCFDI,
    },
    Conceptos: conceptos,
  };

  // Finkok sign_stamp colocará automáticamente el Sello, NoCertificado y Certificado con los CSD del Emisor
  return buildCFDI40XML(params, "", "");
}
