import { Gasto, GastoHelper } from '@/services/supabase';

export type ProyectoStatus = 'ACTIVO' | 'CERRADO';
export type TipoGasto = 'PROYECTO' | 'OPERATIVO';
export type SubtipoTraslado =
  | 'CASETAS'
  | 'ESTACIONAMIENTOS'
  | 'MULTAS'
  | 'UBER'
  | 'VUELOS'
  | 'OTRO';

export type ProyectoCategoriaKey =
  | 'alimentos'
  | 'hospedaje'
  | 'material'
  | 'equipo'
  | 'transporte';

export interface GastoHospedajeDia {
  id: string;
  gasto_id: string;
  fecha: string;
  monto_diario: number;
  created_at?: string;
}

export interface ProyectoVentaRel {
  id: string;
  folio?: string | null;
  cliente?: string | null;
  fecha?: string | null;
  sucursal?: string | null;
  tipo_proyecto?: string | null;
  factura_referencia?: string | null;
  precio_total_facturado?: number | null;
}

export interface VentaDisponibleItem extends ProyectoVentaRel {
  proyecto_vinculado_id?: string | null;
  proyecto_vinculado_nombre?: string | null;
}

export interface ProyectoRel {
  id: string;
  nombre: string;
  cliente_nombre?: string | null;
  sucursal_nombre?: string | null;
  venta_id?: string | null;
  venta_rel?: ProyectoVentaRel | null;
  status?: ProyectoStatus;
}

export interface ProyectoTotalesPorCategoria {
  alimentos: number;
  hospedaje: number;
  material: number;
  equipo: number;
  transporte: number;
  combustible: number;
  traslados: number;
}

export interface Proyecto {
  id: string;
  nombre: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  sucursal_id?: string | null;
  sucursal_nombre?: string | null;
  venta_id?: string | null;
  venta_rel?: ProyectoVentaRel | null;
  status: ProyectoStatus;
  notas?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProyectoResumen extends Proyecto {
  total_general: number;
  totales_por_categoria: ProyectoTotalesPorCategoria;
  pendientes_count: number;
  gastos_count?: number;
}

export interface ProyectoDetailResponse {
  proyecto: Proyecto;
  resumen: {
    total_general: number;
    totales_por_categoria: ProyectoTotalesPorCategoria;
    pendientes_count: number;
  };
  gastos: Gasto[];
}

// Augment Gasto interface in '@/services/supabase' so all components recognize the Shared Contract fields
declare module '@/services/supabase' {
  interface Gasto {
    proyecto_id?: string | null;
    tipo_gasto?: TipoGasto | null;
    subtipo_traslado?: SubtipoTraslado | null;
    fecha_hospedaje_inicio?: string | null;
    fecha_hospedaje_fin?: string | null;
    proyecto_rel?: ProyectoRel | null;
    hospedaje_dias?: GastoHospedajeDia[] | null;
  }
}

export const SUBTIPOS_TRASLADO_LABELS: Record<SubtipoTraslado, string> = {
  CASETAS: 'Casetas',
  ESTACIONAMIENTOS: 'Estacionamientos',
  MULTAS: 'Multas',
  UBER: 'Uber / Taxis',
  VUELOS: 'Vuelos',
  OTRO: 'Otros',
};

const normalizeStr = (val?: string | null): string => {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

export function isGastoHospedaje(gasto: Gasto): boolean {
  const cat = normalizeStr(GastoHelper.getCategoria(gasto));
  const subcat = normalizeStr(GastoHelper.getSubcategoria(gasto));
  if (subcat.includes('hospedaje') || cat.includes('hospedaje') || subcat.includes('hotel')) {
    return true;
  }
  if (gasto.fecha_hospedaje_inicio && gasto.fecha_hospedaje_fin) {
    return true;
  }
  if (Array.isArray(gasto.hospedaje_dias) && gasto.hospedaje_dias.length > 0) {
    return true;
  }
  return false;
}

export function classifyProjectGastoBlock(gasto: Gasto): {
  block: ProyectoCategoriaKey;
  subblock?: 'combustible' | 'traslados';
} {
  const cat = normalizeStr(GastoHelper.getCategoria(gasto));
  const subcat = normalizeStr(GastoHelper.getSubcategoria(gasto));

  if (isGastoHospedaje(gasto)) {
    return { block: 'hospedaje' };
  }

  if (
    subcat.includes('aliment') ||
    cat.includes('aliment') ||
    subcat.includes('comida') ||
    subcat.includes('restaurante')
  ) {
    return { block: 'alimentos' };
  }

  if (
    subcat.includes('combustible') ||
    subcat.includes('gasolina') ||
    subcat.includes('diesel')
  ) {
    return { block: 'transporte', subblock: 'combustible' };
  }

  if (
    Boolean(gasto.subtipo_traslado) ||
    subcat.includes('traslado') ||
    subcat.includes('vuelo') ||
    subcat.includes('caseta') ||
    subcat.includes('peaje') ||
    subcat.includes('estacionamiento') ||
    subcat.includes('uber') ||
    subcat.includes('taxi') ||
    subcat.includes('multa') ||
    subcat.includes('autobus') ||
    cat.includes('transporte')
  ) {
    return { block: 'transporte', subblock: 'traslados' };
  }

  if (
    cat.includes('equipo') ||
    subcat.includes('equipo') ||
    subcat.includes('panel') ||
    subcat.includes('seguridad') ||
    subcat.includes('refrigeracion') ||
    subcat.includes('venta directa') ||
    subcat.includes('herramienta')
  ) {
    return { block: 'equipo' };
  }

  if (
    cat.includes('material') ||
    subcat.includes('material') ||
    subcat.includes('ferreteria') ||
    subcat.includes('electrico') ||
    subcat.includes('consumible')
  ) {
    return { block: 'material' };
  }

  if (cat.includes('vehiculo')) {
    return { block: 'transporte', subblock: 'traslados' };
  }

  return { block: 'material' };
}

export function getOrComputeHospedajeDias(gasto: Gasto): GastoHospedajeDia[] {
  if (Array.isArray(gasto.hospedaje_dias) && gasto.hospedaje_dias.length > 0) {
    return [...gasto.hospedaje_dias].sort((a, b) =>
      String(a.fecha).localeCompare(String(b.fecha))
    );
  }

  const startStr = gasto.fecha_hospedaje_inicio?.split('T')[0]?.trim();
  const endStr = gasto.fecha_hospedaje_fin?.split('T')[0]?.trim();
  if (!startStr || !endStr) return [];

  const startParts = startStr.split('-').map(Number);
  const endParts = endStr.split('-').map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return [];

  const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  const totalMonto = Number(gasto.monto) || 0;
  const montoDiario = Math.round((totalMonto / diffDays) * 100) / 100;

  const result: GastoHospedajeDia[] = [];
  for (let i = 0; i < diffDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    result.push({
      id: `${gasto.id}_dia_${i}`,
      gasto_id: gasto.id,
      fecha: `${yyyy}-${mm}-${dd}`,
      monto_diario: montoDiario,
    });
  }
  return result;
}

export type HospedajeTimelineEntry<T extends { fecha: string }> =
  | { kind: 'night'; fecha: string; data: T }
  | {
      kind: 'gap';
      fechaInicio: string;
      fechaFin: string;
      diasFaltantes: number;
    };

const parseIsoDayUtcNumber = (iso: string): number | null => {
  const clean = (iso || '').split('T')[0]?.trim();
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

const utcDayNumberToIso = (dayNum: number): string => {
  return new Date(dayNum * 86400000).toISOString().slice(0, 10);
};

/**
 * Construye una línea de tiempo cronológica de noches de hospedaje intercalando
 * los huecos (días sin registro entre la primera y última noche).
 * Si faltan 2 o más días consecutivos, se agrupan en un solo elemento de rango.
 */
export function buildHospedajeTimelineWithGaps<T extends { fecha: string }>(
  entries: T[]
): HospedajeTimelineEntry<T>[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha))
  );

  const timeline: HospedajeTimelineEntry<T>[] = [];
  let prevDayNum: number | null = null;

  for (const item of sorted) {
    const cleanFecha = (item.fecha || '').split('T')[0]?.trim() || item.fecha;
    const curDayNum = parseIsoDayUtcNumber(cleanFecha);

    if (prevDayNum !== null && curDayNum !== null) {
      const diff = curDayNum - prevDayNum;
      if (diff > 1) {
        timeline.push({
          kind: 'gap',
          fechaInicio: utcDayNumberToIso(prevDayNum + 1),
          fechaFin: utcDayNumberToIso(curDayNum - 1),
          diasFaltantes: diff - 1,
        });
      }
    }

    timeline.push({ kind: 'night', fecha: cleanFecha, data: item });
    if (curDayNum !== null && (prevDayNum === null || curDayNum > prevDayNum)) {
      prevDayNum = curDayNum;
    }
  }

  return timeline;
}

export function computeProyectoResumenFromGastos(
  proyecto: Proyecto,
  gastos: Gasto[]
): ProyectoResumen {
  const totales: ProyectoTotalesPorCategoria = {
    alimentos: 0,
    hospedaje: 0,
    material: 0,
    equipo: 0,
    transporte: 0,
    combustible: 0,
    traslados: 0,
  };

  let totalGeneral = 0;
  let pendientesCount = 0;

  for (const g of gastos) {
    if (g.status === 'PENDING' || g.status === 'ACTION_REQUIRED') {
      pendientesCount += 1;
    }
    // Regla del Contrato Compartido: Suman todos los gastos con estatus APPROVED, PENDING y ACTION_REQUIRED.
    // Únicamente los REJECTED no suman.
    if (g.status === 'REJECTED') {
      continue;
    }

    const monto = Number(g.monto) || 0;
    totalGeneral += monto;

    const { block, subblock } = classifyProjectGastoBlock(g);
    totales[block] += monto;
    if (block === 'transporte') {
      if (subblock === 'combustible') {
        totales.combustible += monto;
      } else {
        totales.traslados += monto;
      }
    }
  }

  return {
    ...proyecto,
    total_general: Math.round(totalGeneral * 100) / 100,
    totales_por_categoria: {
      alimentos: Math.round(totales.alimentos * 100) / 100,
      hospedaje: Math.round(totales.hospedaje * 100) / 100,
      material: Math.round(totales.material * 100) / 100,
      equipo: Math.round(totales.equipo * 100) / 100,
      transporte: Math.round(totales.transporte * 100) / 100,
      combustible: Math.round(totales.combustible * 100) / 100,
      traslados: Math.round(totales.traslados * 100) / 100,
    },
    pendientes_count: pendientesCount,
    gastos_count: gastos.length,
  };
}

export function getProyectoNombreFromGasto(
  gasto: Gasto,
  proyectosList?: Proyecto[]
): string | null {
  if (gasto.proyecto_rel?.nombre) {
    return gasto.proyecto_rel.nombre;
  }
  if (gasto.proyecto_id && Array.isArray(proyectosList)) {
    const found = proyectosList.find((p) => p.id === gasto.proyecto_id);
    if (found) return found.nombre;
  }
  return null;
}
