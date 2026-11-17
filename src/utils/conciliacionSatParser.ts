import * as XLSX from 'xlsx';

export interface FacturaSatParsedItem {
  uuid: string;
  fechaEmision: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  conceptos: string;
  total: number;
  estadoSat: string;
  moneda: string;
  serie?: string;
  folio?: string;
}

export interface ConciliacionSatParseResult {
  items: FacturaSatParsedItem[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  periodo: {
    inicio: string;
    fin: string;
    mes: number;
    anio: number;
    nombre: string;
  };
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Busca el valor en un objeto de fila utilizando una lista de posibles nombres de columna.
 */
function getFieldValue(row: any, candidates: string[]): any {
  const rowKeys = Object.keys(row);
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase().trim();
    for (const key of rowKeys) {
      if (key.toLowerCase().trim() === candidateLower) {
        return row[key];
      }
    }
  }
  return undefined;
}

/**
 * Parsea el contenido binario o de texto de un archivo Excel o CSV del SAT
 */
export function parseConciliacionSatFile(data: string | ArrayBuffer | Uint8Array, isBinary: boolean = true): ConciliacionSatParseResult {
  const readOpts: XLSX.ParsingOptions = isBinary
    ? { type: typeof data === 'string' ? 'base64' : 'array' }
    : { type: 'string' };

  const wb = XLSX.read(data, readOpts);
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('El archivo no contiene ninguna hoja válida.');
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('El archivo está vacío o no contiene registros.');
  }

  const items: FacturaSatParsedItem[] = [];
  let invalidRows = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rawRows) {
    const rawUuid = getFieldValue(row, ['UUID', 'Folio Fiscal', 'uuid', 'folio_fiscal']);
    const cleanUuid = String(rawUuid || '').trim().toUpperCase();

    // Validar formato mínimo de UUID (32 o 36 caracteres)
    if (!cleanUuid || cleanUuid.replace(/-/g, '').length < 30) {
      invalidRows++;
      continue;
    }

    const fechaRaw = getFieldValue(row, [
      'Fecha emision', 'Fecha emisión', 'Fecha emision comprobante', 'Fecha', 'fecha_emision'
    ]);
    const fechaEmision = String(fechaRaw || '').trim();

    if (fechaEmision) {
      const dateIso = fechaEmision.substring(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        if (!minDate || dateIso < minDate) minDate = dateIso;
        if (!maxDate || dateIso > maxDate) maxDate = dateIso;
      }
    }

    const rfcEmisor = String(getFieldValue(row, ['RFC emisor', 'Rfc emisor', 'RFC Proveedor', 'rfc_emisor']) || '').trim().toUpperCase();
    const nombreEmisor = String(getFieldValue(row, ['Razon emisor', 'Razón emisor', 'Nombre emisor', 'Proveedor', 'nombre_emisor']) || '').trim();
    const rfcReceptor = String(getFieldValue(row, ['RFC receptor', 'Rfc receptor', 'rfc_receptor']) || '').trim().toUpperCase();
    const conceptos = String(getFieldValue(row, ['Conceptos', 'Concepto', 'Descripcion', 'conceptos']) || '').trim();
    
    const totalRaw = getFieldValue(row, ['Total', 'Importe', 'TotalCombustibles', 'total']);
    const total = Number(parseFloat(String(totalRaw || 0).replace(/[$,\s]/g, '')).toFixed(2)) || 0;

    const estadoRaw = getFieldValue(row, ['Estado', 'Estatus', 'Estado SAT', 'estado']);
    const estadoSat = String(estadoRaw || 'VIGENTE').trim().toUpperCase();

    const moneda = String(getFieldValue(row, ['Moneda', 'moneda']) || 'MXN').trim().toUpperCase();
    const serie = String(getFieldValue(row, ['Serie', 'serie']) || '').trim();
    const folio = String(getFieldValue(row, ['Folio', 'folio']) || '').trim();

    items.push({
      uuid: cleanUuid,
      fechaEmision,
      rfcEmisor,
      nombreEmisor: nombreEmisor || rfcEmisor || 'Proveedor SAT',
      rfcReceptor,
      conceptos,
      total,
      estadoSat,
      moneda,
      serie,
      folio,
    });
  }

  if (items.length === 0) {
    throw new Error('No se encontraron facturas válidas con columna UUID en el archivo.');
  }

  // Determinar periodo
  let mes = new Date().getMonth() + 1;
  let anio = new Date().getFullYear();

  if (minDate) {
    const parts = minDate.split('-');
    anio = parseInt(parts[0], 10) || anio;
    mes = parseInt(parts[1], 10) || mes;
  }

  // Primer día y último día del mes
  const firstDay = new Date(anio, mes - 1, 1).toISOString().substring(0, 10);
  const lastDay = new Date(anio, mes, 0).toISOString().substring(0, 10);

  const periodoInicio = minDate || firstDay;
  const periodoFin = maxDate || lastDay;
  const periodoNombre = `${MESES_ES[mes - 1] || 'Mes'} ${anio}`;

  return {
    items,
    totalRows: rawRows.length,
    validRows: items.length,
    invalidRows,
    periodo: {
      inicio: periodoInicio,
      fin: periodoFin,
      mes,
      anio,
      nombre: periodoNombre,
    },
  };
}
