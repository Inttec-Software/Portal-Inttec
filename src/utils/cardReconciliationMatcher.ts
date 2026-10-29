import * as XLSX from 'xlsx';
import { Gasto, GastoHelper } from '@/services/supabase';
import { CardMovement } from './excelStatementParser';

export interface MatchedPair {
  id: string;
  cargo: CardMovement;
  gasto: Gasto;
  score: number; // 0 a 100
  matchReason: string;
  needsApproval?: boolean;
  diffAmount?: number;
  diffPercent?: number;
}

export interface ReconciliationStats {
  totalCargosMonto: number;
  totalCargosCount: number;
  totalGastosMonto: number;
  totalGastosCount: number;
  conciliadoMonto: number;
  conciliadoCount: number;
  pendingApprovalCount?: number;
  pendingApprovalMonto?: number;
  unmatchedCargosMonto: number;
  unmatchedCargosCount: number;
  unmatchedGastosMonto: number;
  unmatchedGastosCount: number;
}

export interface ReconciliationResult {
  matched: MatchedPair[];
  unmatchedCargos: CardMovement[];
  unmatchedGastos: Gasto[];
  stats: ReconciliationStats;
}

const DAY_MS = 86_400_000;

/**
 * Parsea fechas en formato YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY o ISO timestamp
 */
export function parseDateMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // 1. YYYY-MM-DD (o inicio de ISO timestamp)
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.getTime();
  }

  // 2. DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) y = '20' + y;
    const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.getTime();
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback.getTime();
}

function getGastoDateMs(gasto: Gasto): number | null {
  return parseDateMs(gasto.fecha_comprobante) ?? parseDateMs(gasto.created_at);
}

/**
 * Normaliza texto eliminando acentos y caracteres especiales
 */
function normalizeText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'al', 'en', 'con', 'por', 'para', 'un', 'una',
  'pago', 'tarjeta', 'compra', 'consumo', 'sa', 'cv', 'sadecv', 'srl', 'mex', 'mx',
  'quiero', 'bbva', 'banorte', 'amex', 'santander', 'hsbc', 'banamex', 'scotiabank',
  'rest', 'restaurante', 'merpago', 'mercadopago', 'clip', 'srpago', 'izettle',
  'suc', 'sucursal', 'av', 'ave', 'blvd', 'calle', 'col', 'local', 'plaza', 'centro',
]);

/**
 * Tokeniza un texto descartando palabras vacías o bancarias genéricas
 */
function cleanTokens(text?: string | null): string[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm
    .split(' ')
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Diccionario de sucursales/ciudades y sus alias o zonas comunes en estados de cuenta bancarios
 */
const BRANCH_ALIASES: Record<string, string[]> = {
  monterrey: [
    'monterrey', 'mty', 'garza sada', 'revolu', 'revolucion', 'san pedro', 'apodaca',
    'guadalupe', 'san nicolas', 'santa catarina', 'escobedo', 'cumbres', 'gonzalitos',
    'morones', 'leones', 'fundidora', 'obispado', 'mitras', 'contry', 'pesqueria',
  ],
  tijuana: [
    'tijuana', 'tij', 'otay', 'zona rio', 'playas de tijuana', 'agua caliente', 'via rapida',
  ],
  mexicali: [
    'mexicali', 'mxl', 'cachanilla',
  ],
  chihuahua: [
    'chihuahua', 'chih', 'juarez', 'cd juarez', 'delicias', 'cuauhtemoc', 'periferico de la juventud',
  ],
  culiacan: [
    'culiacan', 'cul', 'tres rios', 'humaya',
  ],
  'los mochis': [
    'los mochis', 'mochis', 'ahome',
  ],
  guasave: [
    'guasave', 'gsv',
  ],
  obregon: [
    'obregon', 'cd obregon', 'cajeme', 'obr',
  ],
  hermosillo: [
    'hermosillo', 'hmo', 'kino',
  ],
  nogales: [
    'nogales',
  ],
  navojoa: [
    'navojoa', 'nav',
  ],
  veracruz: [
    'veracruz', 'boca del rio', 'xalapa', 'alvarado',
  ],
  coatzacoalcos: [
    'coatzacoalcos', 'coatza', 'minatitlan',
  ],
  tuxpan: [
    'tuxpan', 'poza rica',
  ],
  reynosa: [
    'reynosa', 'reynos', 'rey',
  ],
  tampico: [
    'tampico', 'tam', 'cd madero', 'madero', 'altamira',
  ],
  matamoros: [
    'matamoros',
  ],
  morelia: [
    'morelia', 'mor', 'michoacan', 'uruapan', 'zamora', 'lazaro cardenas',
  ],
  guadalajara: [
    'guadalajara', 'gdl', 'zapopan', 'tlaquepaque', 'tlajomulco', 'tonala',
  ],
  cdmx: [
    'cdmx', 'ciudad de mexico', 'naucalpan', 'tlalnepantla', 'ecatepec', 'toluca', 'polanco', 'insurgentes',
  ],
  queretaro: [
    'queretaro', 'qro', 'juriquilla',
  ],
  puebla: [
    'puebla', 'pue', 'cholula',
  ],
  merida: [
    'merida', 'yucatan',
  ],
  cancun: [
    'cancun', 'playa del carmen', 'riviera maya',
  ],
  mazatlan: [
    'mazatlan', 'mzt',
  ],
  durango: [
    'durango', 'dgo', 'gomez palacio', 'torreon', 'lerdo',
  ],
};

/**
 * Detecta qué ciudades/sucursales se mencionan en un texto
 */
function detectBranchesInText(text?: string | null): Set<string> {
  const found = new Set<string>();
  const norm = ` ${normalizeText(text)} `;
  if (norm.trim().length === 0) return found;

  for (const [canonicalBranch, aliases] of Object.entries(BRANCH_ALIASES)) {
    for (const alias of aliases) {
      const normAlias = normalizeText(alias);
      if (!normAlias) continue;
      // Para abreviaturas de 3 letras (mty, tij, mxl, cul, obr, tam, mor, rey, gdl, qro), exigir palabra completa
      if (normAlias.length <= 4) {
        if (norm.includes(` ${normAlias} `)) {
          found.add(canonicalBranch);
          break;
        }
      } else {
        if (norm.includes(` ${normAlias}`) || norm.includes(`${normAlias} `)) {
          found.add(canonicalBranch);
          break;
        }
      }
    }
  }
  return found;
}

/**
 * Evalúa la compatibilidad de Sucursal / Ubicación entre el cargo bancario y el gasto
 */
function evaluateBranchCompatibility(
  bancoDesc: string,
  gasto: Gasto
): { status: 'match' | 'conflict' | 'neutral'; matchedBranch?: string } {
  const sucursalNombre = GastoHelper.getSucursal(gasto);
  const detalleProyecto = gasto.detalle_servicio_proyecto || '';
  const ubicacionGasto = gasto.ubicacion_registro || '';

  const bankBranches = detectBranchesInText(bancoDesc);
  const gastoBranches = detectBranchesInText(`${sucursalNombre} ${detalleProyecto} ${ubicacionGasto}`);

  // También verificar coincidencia directa con el nombre de la sucursal del gasto
  const normSucursal = normalizeText(sucursalNombre);
  const normBanco = ` ${normalizeText(bancoDesc)} `;
  if (
    normSucursal &&
    normSucursal !== 'inttec' &&
    normSucursal !== 'general' &&
    normSucursal !== 'corporativo' &&
    normSucursal.length >= 4 &&
    normBanco.includes(normSucursal.slice(0, Math.min(normSucursal.length, 6)))
  ) {
    return { status: 'match', matchedBranch: sucursalNombre };
  }

  if (bankBranches.size === 0 || gastoBranches.size === 0) {
    return { status: 'neutral' };
  }

  for (const b of bankBranches) {
    if (gastoBranches.has(b)) {
      return { status: 'match', matchedBranch: sucursalNombre || b.toUpperCase() };
    }
  }

  // Si el banco identifica claramente una ciudad (ej. Monterrey) y el gasto pertenece exclusivamente a otra (ej. Tijuana)
  return { status: 'conflict' };
}

type SemanticGiro = 'ALIMENTOS' | 'COMBUSTIBLE' | 'HOSPEDAJE' | 'TRANSPORTE' | 'MATERIAL' | null;

const GIRO_KEYWORDS: Record<Exclude<SemanticGiro, null>, string[]> = {
  ALIMENTOS: [
    'rest', 'restaurante', 'tacos', 'taqueria', 'sushi', 'burger', 'hamburguesa', 'kfc',
    'carls', 'mcdonalds', 'dominos', 'pizza', 'little caesars', 'buffet', 'bufette',
    'cafe', 'starbucks', 'tim hortons', 'wings', 'alitas', 'mariscos', 'cocina', 'asada',
    'pollo', 'carnes', 'grill', 'asador', 'comedor', 'tortas', 'Gorditas', 'loncheria',
    'vips', 'toks', 'sanborns', 'chilis', 'applebees', 'ihop', 'dennys', 'subway',
    'shing long', 'hua hai', 'oriental', 'china', 'comida', 'cena', 'desayuno', 'alimentos',
  ],
  COMBUSTIBLE: [
    'oxxo gas', 'gasolinera', 'pemex', 'mobil', 'shell', 'petro', 'petro seven', 'petro 7',
    'hidrosina', 'rendichicas', 'g500', 'arco', 'chevron', 'valero', 'gasolina', 'combustible',
    'diesel', 'magna', 'premium', 'estacion de servicio',
  ],
  HOSPEDAJE: [
    'hotel', 'motel', 'marriott', 'hilton', 'holiday inn', 'city express', 'fiesta inn',
    'one hotel', 'hampton', 'ibis', 'wyndham', 'best western', 'airbnb', 'hospedaje',
    'posada', 'suites', 'inn',
  ],
  TRANSPORTE: [
    'uber', 'didi', 'cabify', 'taxi', 'autobus', 'etn', 'ado', 'omnibus', 'primera plus',
    'futura', 'senda', 'aeromexico', 'volaris', 'vivaaerobus', 'caseta', 'peaje', 'capufe',
    'estacionamiento', 'parking',
  ],
  MATERIAL: [
    'steren', 'syscom', 'home depot', 'ferreteria', 'plomeria', 'impulsora', 'myers',
    'autozone', 'ct internacional', 'cyberpuerta', 'amazon', 'mercado libre', 'truper',
    'urrea', 'grainger', 'sodimac', 'comex', 'electrica', 'material', 'herramienta', 'refaccion',
  ],
};

function detectBankGiro(bancoDesc: string): SemanticGiro {
  const norm = ` ${normalizeText(bancoDesc)} `;
  // Evaluar COMBUSTIBLE primero para que "oxxo gas" no se confunda
  const order: Exclude<SemanticGiro, null>[] = [
    'COMBUSTIBLE',
    'HOSPEDAJE',
    'MATERIAL',
    'TRANSPORTE',
    'ALIMENTOS',
  ];
  for (const giro of order) {
    for (const kw of GIRO_KEYWORDS[giro]) {
      const normKw = normalizeText(kw);
      if (normKw && (norm.includes(` ${normKw} `) || norm.includes(` ${normKw}`))) {
        return giro;
      }
    }
  }
  return null;
}

function detectGastoGiro(gasto: Gasto): SemanticGiro {
  const sub = normalizeText(GastoHelper.getSubcategoria(gasto));
  const cat = normalizeText(GastoHelper.getCategoria(gasto));
  const combined = `${sub} ${cat}`;

  if (combined.includes('alimento') || combined.includes('comida') || combined.includes('restaurante')) {
    return 'ALIMENTOS';
  }
  if (combined.includes('combustible') || combined.includes('gasolina')) {
    return 'COMBUSTIBLE';
  }
  if (combined.includes('hospedaje') || combined.includes('hotel')) {
    return 'HOSPEDAJE';
  }
  if (
    combined.includes('caseta') ||
    combined.includes('peaje') ||
    combined.includes('transporte') ||
    combined.includes('vuelo') ||
    combined.includes('autobus') ||
    combined.includes('taxi') ||
    combined.includes('uber') ||
    combined.includes('estacionamiento')
  ) {
    return 'TRANSPORTE';
  }
  if (
    combined.includes('material') ||
    combined.includes('herramienta') ||
    combined.includes('ferreteria') ||
    combined.includes('refaccion') ||
    combined.includes('equipo')
  ) {
    return 'MATERIAL';
  }
  return null;
}

function evaluateGiroCompatibility(
  bancoDesc: string,
  gasto: Gasto
): 'match' | 'conflict' | 'neutral' {
  const bankGiro = detectBankGiro(bancoDesc);
  const gastoGiro = detectGastoGiro(gasto);

  if (!bankGiro || !gastoGiro) return 'neutral';
  if (bankGiro === gastoGiro) return 'match';
  return 'conflict';
}

/**
 * Extrae el proveedor reportado y cualquier "[Proveedor a agregar: ...]" dentro de la justificación
 */
function extractGastoProviderText(gasto: Gasto): string {
  const mainProv = GastoHelper.getProveedor(gasto) || '';
  const just = gasto.justificacion || '';
  const addedMatch = just.match(/\[Proveedor a agregar:\s*([^\]]+)\]/i);
  const addedProv = addedMatch ? addedMatch[1].trim() : '';
  return `${mainProv} ${addedProv}`.trim();
}

const GENERIC_PROVIDERS = new Set([
  '', 'otros', 'otro', 'restaurante', 'gasolinera', 'hotel', 'varios', 'sin proveedor',
  'na', 'n a', 'ninguno', 'general', 'pendiente', 'comedor', 'taqueria', 'caseta',
]);

function isGenericProvider(provText: string): boolean {
  const norm = normalizeText(provText);
  if (!norm || GENERIC_PROVIDERS.has(norm)) return true;
  const tokens = cleanTokens(norm);
  return tokens.length === 0;
}

/**
 * Calcula similitud por bigramas (coeficiente de Dice) entre dos tokens para tolerar variaciones ortográficas
 * (ej. "bufette" vs "buffet", "reynos" vs "reynosa")
 */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return 0.9;
  }
  if (a.length < 3 || b.length < 3) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Calcula similitud específica entre el comercio del banco y el proveedor del gasto (0 a 1)
 */
function calculateProviderSimilarity(bancoDesc: string, gasto: Gasto): {
  similarity: number;
  hasSpecificGastoProvider: boolean;
  hasBankMerchantTokens: boolean;
} {
  const provText = extractGastoProviderText(gasto);
  const hasSpecificGastoProvider = !isGenericProvider(provText);
  const provTokens = cleanTokens(provText);

  // Al comparar proveedor, quitamos tokens que sean meramente nombres de ciudad en el banco
  const bankBranches = detectBranchesInText(bancoDesc);
  const branchAliasTokens = new Set<string>();
  for (const b of bankBranches) {
    for (const alias of BRANCH_ALIASES[b] || []) {
      for (const t of normalizeText(alias).split(' ')) {
        if (t.length > 2) branchAliasTokens.add(t);
      }
    }
  }

  const rawBankTokens = cleanTokens(bancoDesc);
  const bankMerchantTokens = rawBankTokens.filter(t => !branchAliasTokens.has(t));
  const effectiveBankTokens = bankMerchantTokens.length > 0 ? bankMerchantTokens : rawBankTokens;

  if (effectiveBankTokens.length === 0 || provTokens.length === 0) {
    return {
      similarity: 0,
      hasSpecificGastoProvider,
      hasBankMerchantTokens: effectiveBankTokens.length > 0,
    };
  }

  let matchedScore = 0;
  for (const pt of provTokens) {
    let bestForToken = 0;
    for (const bt of effectiveBankTokens) {
      const sim = tokenSimilarity(pt, bt);
      if (sim > bestForToken) bestForToken = sim;
    }
    if (bestForToken >= 0.65) {
      matchedScore += bestForToken;
    }
  }

  const denom = Math.min(provTokens.length, effectiveBankTokens.length);
  const similarity = denom > 0 ? Math.min(1, matchedScore / denom) : 0;

  return {
    similarity,
    hasSpecificGastoProvider,
    hasBankMerchantTokens: effectiveBankTokens.length > 0,
  };
}

/**
 * Calcula similitud contextual (sucursal, proyecto, cliente, justificación limpia, empleado)
 */
function calculateContextSimilarity(bancoDesc: string, gasto: Gasto): number {
  const bancoTokens = cleanTokens(bancoDesc);
  if (bancoTokens.length === 0) return 0;

  const sucursal = GastoHelper.getSucursal(gasto) || '';
  const cliente = GastoHelper.getCliente(gasto) || '';
  const proyecto = gasto.detalle_servicio_proyecto || '';
  // Limpiar etiquetas automáticas de propina de la justificación para no contaminar tokens
  const cleanJust = (gasto.justificacion || '').replace(/\[[^\]]*\]/g, ' ');
  const empleado = gasto.empleado_nombre || '';

  const contextTokens = cleanTokens(`${sucursal} ${cliente} ${proyecto} ${cleanJust} ${empleado}`);
  if (contextTokens.length === 0) return 0;

  let matches = 0;
  for (const bt of bancoTokens) {
    if (contextTokens.some(ct => tokenSimilarity(bt, ct) >= 0.7)) {
      matches++;
    }
  }

  return matches / Math.max(bancoTokens.length, 1);
}

/**
 * Extrae metadatos estructurados de propina desde gasto.justificacion
 */
function parseTipMetadata(gasto: Gasto): {
  propinaIncluidaEnTicket: boolean | null;
  montoPropinaAparte: number | null;
} {
  const just = gasto.justificacion || '';
  let propinaIncluidaEnTicket: boolean | null = null;
  let montoPropinaAparte: number | null = null;

  const incMatch = just.match(/\[Propina incluida en ticket:\s*(S[ií]|No)\]/i);
  if (incMatch) {
    propinaIncluidaEnTicket = /^s[ií]$/i.test(incMatch[1].trim());
  }

  const montoMatch = just.match(/\[Monto de propina dejado aparte:\s*\$?\s*([\d.,]+)/i);
  if (montoMatch) {
    const val = parseFloat(montoMatch[1].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) {
      montoPropinaAparte = val;
    }
  }

  return { propinaIncluidaEnTicket, montoPropinaAparte };
}

/**
 * Algoritmo determinista multi-parámetro de conciliación y emparejamiento inteligente
 * Parámetros evaluados:
 *  1. Monto exacto (±$0.05) o variación por propina (+1% a +25%)
 *  2. Fecha de operación vs fecha de comprobante
 *  3. Nombre del comercio / proveedor (con tolerancia a abreviaturas y errores ortográficos)
 *  4. Sucursal / Ciudad / Ubicación (diccionario de ciudades y zonas de México)
 *  5. Giro / Categoría y Subcategoría del gasto (Alimentos, Combustible, Hospedaje, Material, Transporte)
 *  6. Metadatos de propina registrados en el gasto y contexto de proyecto/justificación
 */
export function reconcileCardAndGastos(
  cargos: CardMovement[],
  gastos: Gasto[],
  options: {
    amountTolerance?: number; // Tolerancia en monto (default: 0.05)
    dayTolerance?: number;    // Tolerancia en días (default: 4)
    maxTipPercent?: number;   // Porcentaje máximo de propina/variación hacia arriba (default: 0.25 = 25%)
  } = {}
): ReconciliationResult {
  const amountTolerance = options.amountTolerance ?? 0.05;
  const dayTolerance = options.dayTolerance ?? 4;
  const maxTipPercent = options.maxTipPercent ?? 0.25;
  const maxDayDiffMs = dayTolerance * DAY_MS;

  interface Candidate {
    cargoIdx: number;
    gastoIdx: number;
    score: number;
    daysDiff: number;
    hasDateComparison: boolean;
    amountDiff: number;
    diffPercent: number;
    providerSim: number;
    contextSim: number;
    branchStatus: 'match' | 'conflict' | 'neutral';
    matchedBranch?: string;
    giroStatus: 'match' | 'conflict' | 'neutral';
    isTipMatch: boolean;
  }

  // ── PRIMERA PASADA: Monto Exacto (±$0.05) ──
  const exactCandidates: Candidate[] = [];

  for (let c = 0; c < cargos.length; c++) {
    const cargo = cargos[c];
    const cargoMonto = Number(cargo.monto) || 0;
    const cargoMs = parseDateMs(cargo.fecha);

    for (let g = 0; g < gastos.length; g++) {
      const gasto = gastos[g];
      const gastoMonto = Number(gasto.monto) || 0;
      const gastoMs = getGastoDateMs(gasto);

      const amountDiff = Math.abs(cargoMonto - gastoMonto);
      if (amountDiff > amountTolerance) {
        continue;
      }

      const hasDateComparison = cargoMs !== null && gastoMs !== null;
      let daysDiff = 0;
      if (hasDateComparison) {
        const diffMs = Math.abs(cargoMs - gastoMs);
        if (diffMs > maxDayDiffMs) {
          continue; // Fuera de la tolerancia de fecha permitida
        }
        daysDiff = Math.round(diffMs / DAY_MS);
      }

      const { similarity: providerSim, hasSpecificGastoProvider, hasBankMerchantTokens } =
        calculateProviderSimilarity(cargo.descripcion, gasto);
      const contextSim = calculateContextSimilarity(cargo.descripcion, gasto);
      const branchEval = evaluateBranchCompatibility(cargo.descripcion, gasto);
      const giroStatus = evaluateGiroCompatibility(cargo.descripcion, gasto);

      // Si no hay fecha en la captura o los días de diferencia son amplios,
      // descartar si hay conflicto de sucursal, conflicto de giro o comercios distintos
      if (!hasDateComparison || daysDiff > 4) {
        if (branchEval.status === 'conflict' || giroStatus === 'conflict') {
          continue;
        }
        if (hasSpecificGastoProvider && hasBankMerchantTokens && providerSim === 0 && contextSim === 0) {
          continue;
        }
      }

      // Score base considerando Fecha como criterio principal junto al monto
      let score = 70;
      if (hasDateComparison) {
        if (daysDiff === 0) score += 18; // Misma fecha exacta
        else if (daysDiff === 1) score += 10; // ±1 día
        else if (daysDiff === 2) score += 2; // ±2 días
        else score -= Math.min(35, daysDiff * 6);
      } else {
        // Sin fecha en captura: depende más de comercio y sucursal
        score -= 8;
      }

      if (amountDiff < 0.01) score += 5;

      // Bonos y penalizaciones multi-parámetro
      score += Math.round(providerSim * 22);
      score += Math.round(contextSim * 10);

      if (branchEval.status === 'match') score += 14;
      else if (branchEval.status === 'conflict') score -= 30;

      if (giroStatus === 'match') score += 8;
      else if (giroStatus === 'conflict') score -= 25;

      if (hasSpecificGastoProvider && hasBankMerchantTokens && providerSim === 0 && contextSim === 0) {
        score -= 15;
      }

      if (score < 25) continue;

      exactCandidates.push({
        cargoIdx: c,
        gastoIdx: g,
        score: Math.max(0, Math.min(100, score)),
        daysDiff,
        hasDateComparison,
        amountDiff: Math.round((cargoMonto - gastoMonto) * 100) / 100,
        diffPercent: 0,
        providerSim,
        contextSim,
        branchStatus: branchEval.status,
        matchedBranch: branchEval.matchedBranch,
        giroStatus,
        isTipMatch: false,
      });
    }
  }

  exactCandidates.sort((a, b) => b.score - a.score);

  const matchedCargosIndices = new Set<number>();
  const matchedGastosIndices = new Set<number>();
  const matchedPairs: MatchedPair[] = [];

  for (const cand of exactCandidates) {
    if (matchedCargosIndices.has(cand.cargoIdx) || matchedGastosIndices.has(cand.gastoIdx)) {
      continue;
    }

    matchedCargosIndices.add(cand.cargoIdx);
    matchedGastosIndices.add(cand.gastoIdx);

    const cargo = cargos[cand.cargoIdx];
    const gasto = gastos[cand.gastoIdx];

    const details: string[] = [];
    if (cand.hasDateComparison) {
      if (cand.daysDiff === 0) details.push('fecha exacta');
      else details.push(`fecha ±${cand.daysDiff}d`);
    } else {
      details.push('sin fecha en captura');
    }

    if (cand.providerSim >= 0.35) details.push('comercio coincidente');
    if (cand.branchStatus === 'match' && cand.matchedBranch) {
      details.push(`sucursal ${cand.matchedBranch}`);
    }

    const reason = `Monto exacto (${details.join(' · ')})`;

    matchedPairs.push({
      id: `pair_${cargo.id}_${gasto.id}`,
      cargo,
      gasto,
      score: cand.score,
      matchReason: reason,
      needsApproval: false,
      diffAmount: 0,
      diffPercent: 0,
    });
  }

  // ── SEGUNDA PASADA: Detección de posible propina / variación (+1% a +25%) ──
  // Con filtros estrictos anti-falsos positivos por Fecha, Proveedor, Sucursal y Giro
  const tipCandidates: Candidate[] = [];
  const maxTipDays = Math.min(dayTolerance, 3); // Para propinas exigir fecha muy cercana (máx ±3 días)

  for (let c = 0; c < cargos.length; c++) {
    if (matchedCargosIndices.has(c)) continue;
    const cargo = cargos[c];
    const cargoMonto = Number(cargo.monto) || 0;
    const cargoMs = parseDateMs(cargo.fecha);
    if (cargoMonto <= 0) continue;

    for (let g = 0; g < gastos.length; g++) {
      if (matchedGastosIndices.has(g)) continue;
      const gasto = gastos[g];
      const gastoMonto = Number(gasto.monto) || 0;
      const gastoMs = getGastoDateMs(gasto);
      if (gastoMonto <= 0) continue;

      // El cobro en tarjeta debe ser mayor que el gasto reportado (propina agregada)
      const rawDiff = cargoMonto - gastoMonto;
      if (rawDiff <= amountTolerance) continue;

      const pctRatio = rawDiff / gastoMonto;
      if (pctRatio < 0.01 || pctRatio > maxTipPercent) {
        continue;
      }

      const hasDateComparison = cargoMs !== null && gastoMs !== null;
      let daysDiff = 0;
      if (hasDateComparison) {
        const diffMs = Math.abs(cargoMs - gastoMs);
        daysDiff = Math.round(diffMs / DAY_MS);
        // Criterio estricto de fecha para propinas: máximo ±3 días (ej. rechaza ±5d como 2026-10-28 vs 2026-10-23)
        if (daysDiff > maxTipDays) {
          continue;
        }
      }

      const { similarity: providerSim, hasSpecificGastoProvider, hasBankMerchantTokens } =
        calculateProviderSimilarity(cargo.descripcion, gasto);
      const contextSim = calculateContextSimilarity(cargo.descripcion, gasto);
      const branchEval = evaluateBranchCompatibility(cargo.descripcion, gasto);
      const giroStatus = evaluateGiroCompatibility(cargo.descripcion, gasto);
      const gastoGiro = detectGastoGiro(gasto);
      const tipMeta = parseTipMetadata(gasto);

      // 1. BLOQUEO POR CONFLICTO DE SUCURSAL O GIRO
      if (branchEval.status === 'conflict' || giroStatus === 'conflict') {
        continue;
      }

      // 2. BLOQUEO DE COMERCIOS CON NOMBRE DISTINTO
      if (hasSpecificGastoProvider && hasBankMerchantTokens && providerSim < 0.3 && contextSim < 0.3) {
        continue;
      }

      // 3. VALIDACIÓN DE CATEGORÍA PROPINA-ELEGIBLE
      const isTipEligibleCategory =
        gastoGiro === 'ALIMENTOS' || gastoGiro === 'HOSPEDAJE' || gastoGiro === null;
      if (!isTipEligibleCategory && providerSim < 0.45) {
        continue;
      }

      // 4. VALIDACIÓN ESTRICTA DE FECHA + PROVEEDOR PARA PROPINAS
      if (!hasDateComparison) {
        // Si la captura no tiene fecha, SOLO permitir emparejar por propina si el nombre del comercio coincide claramente
        if (providerSim < 0.5) {
          continue;
        }
      } else if (providerSim < 0.35) {
        // Si el proveedor es genérico (no coincide por nombre), exigir MISMO DÍA o ±1 día + sucursal/giro compatible
        if (daysDiff > 1) {
          continue;
        }
        if (branchEval.status !== 'match' && giroStatus !== 'match' && tipMeta.propinaIncluidaEnTicket !== false) {
          continue;
        }
      }

      const pctDisplay = Math.round(pctRatio * 1000) / 10; // ej. 15.0
      const isStandardTip = [10, 15, 20].some(std => Math.abs(pctDisplay - std) <= 1.2);
      const matchesExplicitTip =
        tipMeta.montoPropinaAparte !== null &&
        Math.abs(rawDiff - tipMeta.montoPropinaAparte) <= 2.0;

      let score = 48;
      if (hasDateComparison) {
        if (daysDiff === 0) score += 16; // Misma fecha exacta
        else if (daysDiff === 1) score += 8; // ±1 día
        else score -= daysDiff * 6;
      }

      score += Math.round(providerSim * 30);
      score += Math.round(contextSim * 10);
      if (branchEval.status === 'match') score += 15;
      if (giroStatus === 'match') score += 10;
      if (isStandardTip) score += 8;
      if (matchesExplicitTip) score += 18;
      else if (tipMeta.propinaIncluidaEnTicket === false) score += 8;
      else if (tipMeta.propinaIncluidaEnTicket === true && providerSim < 0.5) score -= 15;

      // Exigir un puntaje mínimo sólido para sugerir una propina
      if (score < 62) {
        continue;
      }

      tipCandidates.push({
        cargoIdx: c,
        gastoIdx: g,
        score: Math.max(10, Math.min(95, score)),
        daysDiff,
        hasDateComparison,
        amountDiff: Math.round(rawDiff * 100) / 100,
        diffPercent: pctDisplay,
        providerSim,
        contextSim,
        branchStatus: branchEval.status,
        matchedBranch: branchEval.matchedBranch,
        giroStatus,
        isTipMatch: true,
      });
    }
  }

  tipCandidates.sort((a, b) => b.score - a.score);

  for (const cand of tipCandidates) {
    if (matchedCargosIndices.has(cand.cargoIdx) || matchedGastosIndices.has(cand.gastoIdx)) {
      continue;
    }

    matchedCargosIndices.add(cand.cargoIdx);
    matchedGastosIndices.add(cand.gastoIdx);

    const cargo = cargos[cand.cargoIdx];
    const gasto = gastos[cand.gastoIdx];

    const details: string[] = [];
    if (cand.hasDateComparison) {
      if (cand.daysDiff === 0) details.push('fecha exacta');
      else details.push(`fecha ±${cand.daysDiff}d`);
    } else {
      details.push('sin fecha en captura');
    }

    if (cand.providerSim >= 0.35) details.push('comercio coincidente');
    if (cand.branchStatus === 'match' && cand.matchedBranch) {
      details.push(`sucursal ${cand.matchedBranch}`);
    }

    const reason = `Posible propina (+${cand.diffPercent}% / +$${cand.amountDiff.toFixed(2)}) (${details.join(' · ')})`;

    matchedPairs.push({
      id: `pair_${cargo.id}_${gasto.id}`,
      cargo,
      gasto,
      score: cand.score,
      matchReason: reason,
      needsApproval: true,
      diffAmount: cand.amountDiff,
      diffPercent: cand.diffPercent,
    });
  }

  // Mostrar primero los que requieren aprobación para que el administrador los revise enseguida
  matchedPairs.sort((a, b) => {
    if (Boolean(a.needsApproval) !== Boolean(b.needsApproval)) {
      return a.needsApproval ? -1 : 1;
    }
    return b.score - a.score;
  });

  const unmatchedCargos: CardMovement[] = [];
  for (let c = 0; c < cargos.length; c++) {
    if (!matchedCargosIndices.has(c)) {
      unmatchedCargos.push(cargos[c]);
    }
  }

  const unmatchedGastos: Gasto[] = [];
  for (let g = 0; g < gastos.length; g++) {
    if (!matchedGastosIndices.has(g)) {
      unmatchedGastos.push(gastos[g]);
    }
  }

  const totalCargosMonto = cargos.reduce((s, c) => s + (c.monto || 0), 0);
  const totalGastosMonto = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const conciliadoMonto = matchedPairs.reduce((s, p) => s + (p.cargo.monto || 0), 0);
  const pendingApprovalPairs = matchedPairs.filter(p => p.needsApproval);
  const pendingApprovalMonto = pendingApprovalPairs.reduce((s, p) => s + (p.cargo.monto || 0), 0);
  const unmatchedCargosMonto = unmatchedCargos.reduce((s, c) => s + (c.monto || 0), 0);
  const unmatchedGastosMonto = unmatchedGastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

  return {
    matched: matchedPairs,
    unmatchedCargos,
    unmatchedGastos,
    stats: {
      totalCargosMonto: Math.round(totalCargosMonto * 100) / 100,
      totalCargosCount: cargos.length,
      totalGastosMonto: Math.round(totalGastosMonto * 100) / 100,
      totalGastosCount: gastos.length,
      conciliadoMonto: Math.round(conciliadoMonto * 100) / 100,
      conciliadoCount: matchedPairs.length,
      pendingApprovalCount: pendingApprovalPairs.length,
      pendingApprovalMonto: Math.round(pendingApprovalMonto * 100) / 100,
      unmatchedCargosMonto: Math.round(unmatchedCargosMonto * 100) / 100,
      unmatchedCargosCount: unmatchedCargos.length,
      unmatchedGastosMonto: Math.round(unmatchedGastosMonto * 100) / 100,
      unmatchedGastosCount: unmatchedGastos.length,
    },
  };
}

/**
 * Exporta el resultado de la conciliación a un archivo Excel (.xlsx) estructurado
 */
export function exportReconciliationToExcel(
  result: ReconciliationResult,
  tarjetaNombre: string,
  fileName: string = 'Auditoria_Tarjeta.xlsx'
): { wb: XLSX.WorkBook; base64: string } {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen General
  const resumenRows = [
    ['REPORTE DE AUDITORÍA Y CONCILIACIÓN DE TARJETA'],
    ['Tarjeta auditada:', tarjetaNombre],
    ['Fecha de reporte:', new Date().toLocaleDateString('es-MX')],
    [],
    ['Métrica', 'Cantidad', 'Importe Total (MXN)'],
    ['Cargos en Tarjeta (Banco)', result.stats.totalCargosCount, result.stats.totalCargosMonto],
    ['Gastos Registrados en App', result.stats.totalGastosCount, result.stats.totalGastosMonto],
    ['Conciliados con Par', result.stats.conciliadoCount, result.stats.conciliadoMonto],
    ['Cobros en Tarjeta sin Par (Sin Reportar)', result.stats.unmatchedCargosCount, result.stats.unmatchedCargosMonto],
    ['Gastos en App sin Par (Faltan en Tarjeta)', result.stats.unmatchedGastosCount, result.stats.unmatchedGastosMonto],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // Hoja 2: Conciliados
  const conciliadosHeaders = [
    'Fecha Banco',
    'Concepto Banco',
    'Monto Banco',
    'Fecha App',
    'Empleado',
    'Sucursal',
    'Proveedor',
    'Justificación',
    'Monto App',
    'Diferencia (Propina)',
    'Estatus App',
    'Estado Conciliación',
    'Razón Match',
  ];
  const conciliadosRows = result.matched.map(p => {
    const gastoMonto = Number(p.gasto.monto) || 0;
    const diff = Math.round((p.cargo.monto - gastoMonto) * 100) / 100;
    return [
      p.cargo.fecha,
      p.cargo.descripcion,
      p.cargo.monto,
      p.gasto.fecha_comprobante || '',
      p.gasto.empleado_nombre || '',
      GastoHelper.getSucursal(p.gasto) || '',
      GastoHelper.getProveedor(p.gasto) || '',
      p.gasto.justificacion || '',
      gastoMonto,
      diff,
      p.gasto.status || '',
      p.needsApproval ? 'Pendiente Aprobación' : 'Aprobado / Exacto',
      p.matchReason,
    ];
  });
  const wsConciliados = XLSX.utils.aoa_to_sheet([conciliadosHeaders, ...conciliadosRows]);
  XLSX.utils.book_append_sheet(wb, wsConciliados, 'Conciliados');

  // Hoja 3: Gastos sin Par en Tarjeta (Faltan en Banco)
  const gastosSinParHeaders = [
    'ID Gasto',
    'Fecha Comprobante',
    'Empleado',
    'Sucursal',
    'Proveedor',
    'Justificación',
    'Monto',
    'Método Pago',
    'Tipo Tarjeta',
    'Estatus',
  ];
  const gastosSinParRows = result.unmatchedGastos.map(g => [
    g.id,
    g.fecha_comprobante || '',
    g.empleado_nombre || '',
    GastoHelper.getSucursal(g) || '',
    GastoHelper.getProveedor(g) || '',
    g.justificacion || '',
    Number(g.monto) || 0,
    g.metodo_pago || '',
    g.tipo_tarjeta || '',
    g.status || '',
  ]);
  const wsGastosSinPar = XLSX.utils.aoa_to_sheet([gastosSinParHeaders, ...gastosSinParRows]);
  XLSX.utils.book_append_sheet(wb, wsGastosSinPar, 'Gastos_Sin_Par_En_Tarjeta');

  // Hoja 4: Cobros en Tarjeta sin Par (Sin Reportar en App)
  const cobrosSinParHeaders = [
    'ID Movimiento',
    'Fecha Operación',
    'Concepto Banco',
    'Monto Cargo',
    'Tarjeta / Referencia',
  ];
  const cobrosSinParRows = result.unmatchedCargos.map(c => [
    c.id,
    c.fecha,
    c.descripcion,
    c.monto,
    c.tarjetaRef || '',
  ]);
  const wsCobrosSinPar = XLSX.utils.aoa_to_sheet([cobrosSinParHeaders, ...cobrosSinParRows]);
  XLSX.utils.book_append_sheet(wb, wsCobrosSinPar, 'Cobros_Tarjeta_Sin_Par');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return { wb, base64 };
}
