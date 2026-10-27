import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export interface FacturaRecibidaExportItem {
  id?: string;
  uuid: string;
  rfc_emisor: string;
  nombre_emisor: string;
  rfc_receptor: string;
  nombre_receptor?: string;
  rfc_pac?: string;
  fecha_emision: string;
  fecha_certificacion_sat?: string;
  total: number;
  moneda?: string;
  tipo_cambio?: number;
  tipo_comprobante?: string;
  estado_sat?: string;
  fecha_cancelacion?: string;
  tipo_proveedor?: string;
}

/**
 * Formatea una fecha ISO o string a "AAAA-MM-DD HH:mm:ss"
 */
export function formatCfdiDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = dateStr.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  } catch {
    return dateStr;
  }
}

/**
 * Obtiene el número del mes (1 al 12) a partir de la fecha de emisión
 */
export function getMesFromDate(dateStr?: string | null): number {
  if (!dateStr) return 1;
  try {
    const match = dateStr.match(/^\d{4}-(\d{2})/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.getMonth() + 1;
    }
  } catch {
    // fallback
  }
  return 1;
}

/**
 * Clasifica automáticamente el tipo de proveedor según nombre o RFC
 */
export function classifyTipoProveedor(nombreEmisor: string = '', rfcEmisor: string = ''): string {
  const nom = (nombreEmisor || '').toUpperCase();
  const rfc = (rfcEmisor || '').toUpperCase();

  // Bancos e instituciones financieras
  if (
    nom.includes('BBVA') ||
    nom.includes('BANCO') ||
    nom.includes('BANAMEX') ||
    nom.includes('CITIBANAMEX') ||
    nom.includes('SANTANDER') ||
    nom.includes('BANORTE') ||
    nom.includes('HSBC') ||
    nom.includes('SCOTIABANK') ||
    nom.includes('INBURSA') ||
    nom.includes('BANREGIO') ||
    nom.includes('AFIRME') ||
    nom.includes('MERCADO PAGO') ||
    nom.includes('STP') ||
    nom.includes('SISTEMA DE TRANSFERENCIAS') ||
    nom.includes('ALBO') ||
    nom.includes('FINANCIER') ||
    rfc.startsWith('BBA') ||
    rfc.startsWith('BNM') ||
    rfc.startsWith('BSN') ||
    rfc.startsWith('SIN')
  ) {
    return 'BANCOS';
  }

  // Seguros
  if (
    nom.includes('SEGURO') ||
    nom.includes('AXA') ||
    nom.includes('GNP') ||
    nom.includes('QUALITAS') ||
    nom.includes('CHUBB') ||
    nom.includes('MAPFRE') ||
    nom.includes('METLIFE') ||
    nom.includes('MONTERREY') ||
    nom.includes('ZURICH') ||
    nom.includes('HDI') ||
    rfc.startsWith('ASE')
  ) {
    return 'SEGUROS';
  }

  // Combustible
  if (
    nom.includes('GASOLIN') ||
    nom.includes('COMBUSTIBLE') ||
    nom.includes('HIDROCARBURO') ||
    nom.includes('PETRO') ||
    nom.includes('OXXO GAS') ||
    nom.includes('REPSOL') ||
    nom.includes('BP ') ||
    nom.includes('MOBIL') ||
    nom.includes('SHELL') ||
    nom.includes('GASOMEX') ||
    nom.includes('ENEREX')
  ) {
    return 'COMBUSTIBLE';
  }

  // Telecomunicaciones
  if (
    nom.includes('TELMEX') ||
    nom.includes('TELEFONOS DE MEXICO') ||
    nom.includes('TELCEL') ||
    nom.includes('RADIOMOVIL DIPSA') ||
    nom.includes('AT&T') ||
    nom.includes('TOTAL PLAY') ||
    nom.includes('TOTALPLAY') ||
    nom.includes('MEGACABLE') ||
    nom.includes('AXTEL') ||
    nom.includes('IZZI')
  ) {
    return 'TELECOMUNICACIONES';
  }

  // Servicios públicos y peajes
  if (
    nom.includes('CFE') ||
    nom.includes('COMISION FEDERAL DE ELECTRICIDAD') ||
    nom.includes('AGUA') ||
    nom.includes('CESPT') ||
    nom.includes('TELEPEAJE') ||
    nom.includes('TAG') ||
    nom.includes('PASE URBANO') ||
    nom.includes('AUTOPISTA')
  ) {
    return 'SERVICIOS PUBLICOS';
  }

  // Papelería / Oficina
  if (
    nom.includes('OFFICE DEPOT') ||
    nom.includes('OFFICEMAX') ||
    nom.includes('LIBRERIA') ||
    nom.includes('PAPELERIA')
  ) {
    return 'PAPELERIA / OFICINA';
  }

  // Tecnología / Computo
  if (
    nom.includes('DELL') ||
    nom.includes('HP ') ||
    nom.includes('CYBERPUERTA') ||
    nom.includes('SYSCOM') ||
    nom.includes('PCEL') ||
    nom.includes('AMAZON')
  ) {
    return 'TECNOLOGIA';
  }

  // Hoteles / Viáticos
  if (
    nom.includes('HOTEL') ||
    nom.includes('POSADAS') ||
    nom.includes('FIESTA INN') ||
    nom.includes('CITY EXPRESS') ||
    nom.includes('MARRIOTT') ||
    nom.includes('AEROMEXICO') ||
    nom.includes('VOLARIS') ||
    nom.includes('VIVA AEROBUS') ||
    nom.includes('UBER')
  ) {
    return 'VIATICOS';
  }

  return 'GENERAL';
}

/**
 * Encabezados exactos solicitados
 */
export const FACTURAS_RECIBIDAS_EXCEL_HEADERS = [
  'Uuid',
  'RfcEmisor',
  'NombreEmisor',
  'RfcReceptor',
  'NombreReceptor',
  'RfcPac',
  'FechaEmision',
  'FechaCertificacionSat',
  'Monto',
  'MXN',
  'EfectoComprobante',
  'Estatus',
  'FechaCancelacion',
  'MES',
  'TIPO PROVEEDOR',
  'Tipo de Cambio'
];

/**
 * Convierte un arreglo de facturas recibidas a matriz de datos para Excel
 */
export function buildFacturasRecibidasMatrix(facturas: FacturaRecibidaExportItem[]): any[][] {
  return facturas.map((f) => {
    const uuid = (f.uuid || '').toUpperCase();
    const rfcEmisor = (f.rfc_emisor || '').toUpperCase();
    const nombreEmisor = f.nombre_emisor || '';
    const rfcReceptor = (f.rfc_receptor || '').toUpperCase();

    // Nombre Receptor
    let nombreReceptor = f.nombre_receptor || '';
    if (!nombreReceptor) {
      if (rfcReceptor === 'FETR83041461A') {
        nombreReceptor = 'RAFAEL ALONSO FERNANDEZ TINAJERO';
      } else {
        nombreReceptor = 'INTTEC';
      }
    }

    // RfcPac
    const rfcPac = f.rfc_pac || '';

    // Fechas
    const fechaEmision = formatCfdiDateTime(f.fecha_emision);
    const fechaCertificacionSat = formatCfdiDateTime(f.fecha_certificacion_sat) || fechaEmision;
    const fechaCancelacion = f.estado_sat === 'CANCELADO' ? formatCfdiDateTime(f.fecha_cancelacion) : '';

    // Monto y MXN
    const monto = Number(parseFloat(String(f.total || 0)).toFixed(2));
    const tipoCambio = Number(parseFloat(String(f.tipo_cambio || 1)).toFixed(4)) || 1.0;
    const isUsd = (f.moneda || 'MXN').toUpperCase() === 'USD';
    const montoMxn = isUsd ? Number((monto * tipoCambio).toFixed(2)) : monto;

    // EfectoComprobante (I, E, P, N, T)
    const efectoComprobante = (f.tipo_comprobante || 'I').toUpperCase();

    // Estatus: 1 para Vigente, 0 para Cancelado
    const estatus = f.estado_sat === 'VIGENTE' ? 1 : 0;

    // MES: número del 1 al 12
    const mes = getMesFromDate(f.fecha_emision);

    // TIPO PROVEEDOR
    const tipoProveedor = f.tipo_proveedor || classifyTipoProveedor(nombreEmisor, rfcEmisor);

    return [
      uuid,
      rfcEmisor,
      nombreEmisor,
      rfcReceptor,
      nombreReceptor,
      rfcPac,
      fechaEmision,
      fechaCertificacionSat,
      monto,
      montoMxn,
      efectoComprobante,
      estatus,
      fechaCancelacion,
      mes,
      tipoProveedor,
      tipoCambio
    ];
  });
}

/**
 * Exporta las facturas recibidas a archivo Excel (.xlsx) o CSV
 */
export async function exportFacturasRecibidasToExcel(
  facturas: FacturaRecibidaExportItem[],
  options: {
    filename?: string;
    format?: 'xlsx' | 'csv';
    sheetName?: string;
  } = {}
): Promise<void> {
  if (!facturas || facturas.length === 0) {
    throw new Error('No hay facturas para exportar.');
  }

  const format = options.format || 'xlsx';
  const defaultBaseName = `facturas_recibidas_${new Date().toISOString().substring(0, 10)}`;
  const filename = options.filename
    ? (options.filename.endsWith(`.${format}`) ? options.filename : `${options.filename}.${format}`)
    : `${defaultBaseName}.${format}`;

  const sheetName = options.sheetName || 'Facturas Recibidas';
  const headers = FACTURAS_RECIBIDAS_EXCEL_HEADERS;
  const rows = buildFacturasRecibidasMatrix(facturas);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Ancho óptimo de columnas
  ws['!cols'] = [
    { wch: 38 }, // Uuid
    { wch: 15 }, // RfcEmisor
    { wch: 45 }, // NombreEmisor
    { wch: 15 }, // RfcReceptor
    { wch: 35 }, // NombreReceptor
    { wch: 15 }, // RfcPac
    { wch: 21 }, // FechaEmision
    { wch: 21 }, // FechaCertificacionSat
    { wch: 13 }, // Monto
    { wch: 13 }, // MXN
    { wch: 18 }, // EfectoComprobante
    { wch: 10 }, // Estatus
    { wch: 21 }, // FechaCancelacion
    { wch: 8 },  // MES
    { wch: 22 }, // TIPO PROVEEDOR
    { wch: 15 }, // Tipo de Cambio
  ];

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename, { bookType: format });
  } else {
    const bookType = format === 'csv' ? 'csv' : 'xlsx';
    const base64 = XLSX.write(wb, { type: 'base64', bookType });
    const fileUri = `${cacheDirectory}${filename}`;
    await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
    const mimeType =
      format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Exportar ${sheetName}`,
      });
    } else {
      throw new Error('La función de compartir no está disponible en este dispositivo.');
    }
  }
}
