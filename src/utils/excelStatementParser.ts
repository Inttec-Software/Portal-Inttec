import * as XLSX from 'xlsx';

export interface CardMovement {
  id: string;
  fecha: string; // Formato YYYY-MM-DD
  descripcion: string;
  monto: number; // Siempre positivo para cargos
  tipo: 'cargo' | 'abono';
  tarjetaRef?: string;
  referencia?: string;
}

export interface ParseExcelResult {
  movimientos: CardMovement[];
  cargos: CardMovement[];
  abonos: CardMovement[];
  totalCargosMonto: number;
  totalAbonosMonto: number;
  minFecha: string | null;
  maxFecha: string | null;
  detectedHeaders: {
    fechaCol?: string;
    descCol?: string;
    montoCol?: string;
    cargoCol?: string;
    abonoCol?: string;
  };
  totalRows: number;
  availableSheets: string[];
  selectedSheet: string;
}

const MONTH_NAMES: Record<string, string> = {
  // Español
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  // Inglés
  jan: '01', apr: '04', aug: '08', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * Normaliza una celda de fecha de Excel o texto a formato YYYY-MM-DD
 */
export function normalizeExcelDate(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;

  // Si es un número serial de Excel (ej: 45499, 46309)
  if (typeof val === 'number') {
    const parsedDate = XLSX.SSF.parse_date_code(val);
    if (parsedDate) {
      const y = String(parsedDate.y).padStart(4, '0');
      const m = String(parsedDate.m).padStart(2, '0');
      const d = String(parsedDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // Si es objeto Date
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Si es string
  const str = String(val).trim();
  if (!str) return null;

  // Formato DD/MM/YYYY o DD-MM-YYYY (o con hora)
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // Formato YYYY/MM/DD o YYYY-MM-DD (o con hora)
  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Formatos con mes textual (ej: "18 Aug 2026", "28 de julio 2024", "29-jul-2026", "29/JUL/26")
  const textMonthMatch = str.match(
    /\b(\d{1,2})\s*(?:de|\-|[/.\s])?\s*([a-zA-Záéíóúñ]+)(?:\s*(?:de|\-|[/.\s])?\s*(\d{2,4}))?\b/i
  );
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const rawMes = textMonthMatch[2]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const mes = MONTH_NAMES[rawMes] || MONTH_NAMES[rawMes.substring(0, 3)];
    if (mes) {
      const currYear = new Date().getFullYear();
      let year = textMonthMatch[3] || String(currYear);
      if (year.length === 2) year = '20' + year;
      return `${year}-${mes}-${day}`;
    }
  }

  return null;
}

/**
 * Normaliza una celda numérica a número flotante positivo
 */
export function normalizeExcelAmount(val: any): { amount: number; isNegative: boolean } {
  if (val === null || val === undefined || val === '') return { amount: 0, isNegative: false };

  if (typeof val === 'number') {
    return {
      amount: Math.abs(val),
      isNegative: val < 0,
    };
  }

  let str = String(val).trim();
  let isNegative = str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'));

  // Limpiar $, espacios, comas
  str = str.replace(/[$€¥\s(),]/g, '');

  if (str.startsWith('-')) {
    isNegative = true;
    str = str.replace('-', '');
  }

  const num = parseFloat(str);
  return {
    amount: isNaN(num) ? 0 : Math.abs(num),
    isNegative,
  };
}

/**
 * Normaliza nombres de encabezados para facilitar la coincidencia
 */
function normalizeHeaderName(h: any): string {
  if (!h) return '';
  return String(h)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Selecciona inteligentemente la hoja del libro de Excel adecuada según la tarjeta o contenido de movimientos
 */
function resolveTargetSheet(
  wb: XLSX.WorkBook,
  targetSheetOrCard?: string
): string {
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 1) return sheetNames[0];

  const cleanTarget = (targetSheetOrCard || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  // 1. Coincidencia directa por nombre de tarjeta solicitada (ej. 'BBVA', 'MARRIOTT', 'AMEX')
  if (cleanTarget && cleanTarget !== 'todas') {
    for (const name of sheetNames) {
      const cleanName = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
      if (cleanName === cleanTarget || cleanName.includes(cleanTarget) || cleanTarget.includes(cleanName)) {
        return name;
      }
    }
  }

  // 2. Si no coincide o se solicitó 'TODAS', buscar la hoja que realmente contiene filas de movimientos
  // descartando tablas dinámicas o resúmenes ('Hoja1', 'Hoja3', 'Resumen', 'Pivot')
  let bestSheet = sheetNames[0];
  let bestScore = -999999;

  for (const name of sheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const sampleText = rows
      .slice(0, 10)
      .map(r => r.map(c => normalizeHeaderName(c)).join(' '))
      .join(' ');

    let score = rows.length;

    if (sampleText.includes('fecha')) score += 2000;
    if (sampleText.includes('monto') || sampleText.includes('cargo') || sampleText.includes('importe')) score += 2000;
    if (sampleText.includes('descripcion') || sampleText.includes('concepto') || sampleText.includes('detalle')) score += 1500;

    // Penalizar hojas de tablas dinámicas o carátulas
    if (sampleText.includes('etiquetasdefila') || sampleText.includes('sumade') || sampleText.includes('varioselementos')) {
      score -= 10000;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSheet = name;
    }
  }

  return bestSheet;
}

/**
 * Procesa un archivo Excel o CSV y extrae los movimientos de la tarjeta
 */
export function parseExcelStatement(
  data: string | ArrayBuffer,
  inputType: 'base64' | 'binary' | 'array' = 'base64',
  targetSheetOrCard?: string
): ParseExcelResult {
  const wb = XLSX.read(data, {
    type: inputType,
    cellDates: true,
    raw: false,
  });

  const availableSheets = wb.SheetNames;
  if (!availableSheets || availableSheets.length === 0) {
    throw new Error('El archivo no contiene hojas de cálculo legibles.');
  }

  const selectedSheet = resolveTargetSheet(wb, targetSheetOrCard);
  const sheet = wb.Sheets[selectedSheet];
  if (!sheet) {
    throw new Error(`No se pudo leer la hoja "${selectedSheet}".`);
  }

  // Convertir a matriz bidimensional cruda
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawRows.length === 0) {
    throw new Error(`La hoja "${selectedSheet}" está vacía.`);
  }

  // 1. Buscar la fila que corresponde a los encabezados
  let headerRowIndex = -1;
  let colIndexFecha = -1;
  let colIndexDesc = -1;
  let colIndexMonto = -1;
  let colIndexCargo = -1;
  let colIndexAbono = -1;
  let colIndexTipo = -1;
  let colIndexTarjeta = -1;

  for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    let fIdx = -1;
    let dIdx = -1;
    let mIdx = -1;
    let cIdx = -1;
    let aIdx = -1;
    let tIdx = -1;
    let cardIdx = -1;

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeHeaderName(row[c]);
      if (!cellText) continue;

      // Fecha
      if (
        fIdx === -1 &&
        (cellText.includes('fecha') ||
          cellText === 'date' ||
          cellText.includes('foperacion') ||
          cellText.includes('faplicacion') ||
          cellText.includes('fechavalor'))
      ) {
        fIdx = c;
      }

      // Concepto / Descripción
      if (
        dIdx === -1 &&
        (cellText.includes('concepto') ||
          cellText.includes('descripcion') ||
          cellText.includes('detalle') ||
          cellText.includes('comercio') ||
          cellText.includes('establecimiento') ||
          cellText.includes('movimiento') ||
          cellText === 'description')
      ) {
        dIdx = c;
      }

      // Monto genérico
      if (
        mIdx === -1 &&
        (cellText === 'monto' ||
          cellText === 'importe' ||
          cellText === 'amount' ||
          cellText === 'total' ||
          cellText === 'cantidad')
      ) {
        mIdx = c;
      }

      // Columna específica de Cargo / Retiro
      if (
        cIdx === -1 &&
        (cellText.includes('cargo') ||
          cellText.includes('retiro') ||
          cellText.includes('debito'))
      ) {
        cIdx = c;
      }

      // Columna específica de Abono / Depósito
      if (
        aIdx === -1 &&
        (cellText.includes('abono') ||
          cellText.includes('deposito') ||
          cellText.includes('credito'))
      ) {
        aIdx = c;
      }

      // Columna de Tipo
      if (tIdx === -1 && (cellText === 'tipo' || cellText === 'tipomovimiento')) {
        tIdx = c;
      }

      // Columna de Tarjeta / Cuenta / Usuario
      if (
        cardIdx === -1 &&
        (cellText.includes('tarjeta') ||
          cellText.includes('cuenta') ||
          cellText.includes('ultimos4') ||
          cellText.includes('usuario'))
      ) {
        cardIdx = c;
      }
    }

    // Si encontramos fecha y al menos concepto o monto
    if (fIdx !== -1 && (dIdx !== -1 || mIdx !== -1 || cIdx !== -1)) {
      headerRowIndex = r;
      colIndexFecha = fIdx;
      colIndexDesc = dIdx;
      colIndexMonto = mIdx;
      colIndexCargo = cIdx;
      colIndexAbono = aIdx;
      colIndexTipo = tIdx;
      colIndexTarjeta = cardIdx;
      break;
    }
  }

  // Fallback si no encontramos encabezados explícitos: asumir fila 0
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    colIndexFecha = 0;
    colIndexDesc = 1;
    colIndexMonto = 2;
  }

  if (colIndexDesc === -1) {
    colIndexDesc = colIndexFecha === 0 ? 1 : 0;
  }

  if (colIndexMonto === -1 && colIndexCargo !== -1) {
    colIndexMonto = colIndexCargo;
  }

  const movimientos: CardMovement[] = [];
  const fechasEncontradas: number[] = [];
  let lastKnownDate: string | null = null;

  // 2. Extraer filas de datos
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const fechaRaw = colIndexFecha >= 0 ? row[colIndexFecha] : null;
    let fechaNorm = normalizeExcelDate(fechaRaw);

    // Si la celda de fecha está vacía (común en estados con celdas combinadas de un mismo día),
    // usar la última fecha conocida si la fila tiene concepto y monto
    if (!fechaNorm && lastKnownDate) {
      fechaNorm = lastKnownDate;
    } else if (fechaNorm) {
      lastKnownDate = fechaNorm;
    }

    if (!fechaNorm) continue;

    const descRaw = colIndexDesc >= 0 ? row[colIndexDesc] : '';
    const descNorm = String(descRaw || '').trim();

    // Determinar si es cargo o abono y el importe
    let montoFinal = 0;
    let tipoFinal: 'cargo' | 'abono' = 'cargo';

    if (colIndexCargo >= 0 && colIndexAbono >= 0 && colIndexCargo !== colIndexAbono) {
      const valCargo = normalizeExcelAmount(row[colIndexCargo]).amount;
      const valAbono = normalizeExcelAmount(row[colIndexAbono]).amount;

      if (valCargo > 0) {
        montoFinal = valCargo;
        tipoFinal = 'cargo';
      } else if (valAbono > 0) {
        montoFinal = valAbono;
        tipoFinal = 'abono';
      }
    } else if (colIndexMonto >= 0) {
      const parsed = normalizeExcelAmount(row[colIndexMonto]);
      montoFinal = parsed.amount;

      if (colIndexTipo >= 0) {
        const tipoText = String(row[colIndexTipo] || '').toLowerCase();
        if (tipoText.includes('abono') || tipoText.includes('deposito') || tipoText.includes('pago')) {
          tipoFinal = 'abono';
        } else {
          tipoFinal = 'cargo';
        }
      } else {
        const descLower = descNorm.toLowerCase();
        if (
          descLower.includes('pago recibido') ||
          descLower.includes('su pago en') ||
          descLower.includes('traspaso a favor') ||
          descLower.includes('abono a tarjeta')
        ) {
          tipoFinal = 'abono';
        } else {
          tipoFinal = 'cargo';
        }
      }
    }

    if (montoFinal <= 0 && !descNorm) continue;

    const tarjetaRef = colIndexTarjeta >= 0 ? String(row[colIndexTarjeta] || '').trim() : undefined;

    const mov: CardMovement = {
      id: `mov_${r}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fecha: fechaNorm,
      descripcion: descNorm || 'Sin descripción',
      monto: Math.round(montoFinal * 100) / 100,
      tipo: tipoFinal,
      tarjetaRef: tarjetaRef || selectedSheet,
    };

    movimientos.push(mov);

    const dTime = new Date(fechaNorm + 'T00:00:00Z').getTime();
    if (!isNaN(dTime)) {
      fechasEncontradas.push(dTime);
    }
  }

  const cargos = movimientos.filter(m => m.tipo === 'cargo');
  const abonos = movimientos.filter(m => m.tipo === 'abono');

  const totalCargosMonto = cargos.reduce((sum, c) => sum + c.monto, 0);
  const totalAbonosMonto = abonos.reduce((sum, a) => sum + a.monto, 0);

  let minFecha: string | null = null;
  let maxFecha: string | null = null;

  if (fechasEncontradas.length > 0) {
    minFecha = new Date(Math.min(...fechasEncontradas)).toISOString().split('T')[0];
    maxFecha = new Date(Math.max(...fechasEncontradas)).toISOString().split('T')[0];
  }

  return {
    movimientos,
    cargos,
    abonos,
    totalCargosMonto: Math.round(totalCargosMonto * 100) / 100,
    totalAbonosMonto: Math.round(totalAbonosMonto * 100) / 100,
    minFecha,
    maxFecha,
    detectedHeaders: {
      fechaCol: rawRows[headerRowIndex]?.[colIndexFecha] || 'Fecha',
      descCol: rawRows[headerRowIndex]?.[colIndexDesc] || 'Concepto',
      montoCol: rawRows[headerRowIndex]?.[colIndexMonto] || 'Monto',
      cargoCol: colIndexCargo >= 0 ? rawRows[headerRowIndex]?.[colIndexCargo] : undefined,
      abonoCol: colIndexAbono >= 0 ? rawRows[headerRowIndex]?.[colIndexAbono] : undefined,
    },
    totalRows: movimientos.length,
    availableSheets,
    selectedSheet,
  };
}
