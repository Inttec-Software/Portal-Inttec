import { Producto } from '../types';

export const getProductoUnidad = (prod: Partial<Producto> | null | undefined): string => {
  if (!prod) return 'pza';
  if (prod.unidad && prod.unidad.trim() !== '') {
    const u = prod.unidad.toLowerCase().trim();
    if (u === 'mts' || u === 'm' || u === 'metro' || u === 'metros' || u === 'mtr' || u === 'lm') return 'mts';
    if (u === 'pza' || u === 'pzas' || u === 'pz' || u === 'pieza' || u === 'piezas' || u === 'h87') return 'pza';
    if (u === 'rollo' || u === 'rollos' || u === 'xro') return 'rollo';
    if (u === 'kit' || u === 'kt') return 'kit';
    return prod.unidad;
  }
  const name = (prod.nombre_oficial || '').toLowerCase();
  if (name.includes('metro') || name.includes('cable') || name.includes('bobina')) {
    return 'mts';
  }
  return 'pza';
};

export const hasMultipleStockStates = (prod: Partial<Producto> | null | undefined): boolean => {
  if (!prod) return false;
  return (prod.stock_usado || 0) > 0 || (prod.stock_por_revisar || 0) > 0;
};

export const getTotalStock = (prod: Partial<Producto> | null | undefined): number => {
  if (!prod) return 0;
  const sNuevo = Number(prod.stock_nuevo) || 0;
  const sUsado = Number(prod.stock_usado) || 0;
  const sPorRev = Number(prod.stock_por_revisar) || 0;
  const sum = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
  if (sum > 0) return sum;
  return Number(prod.stock_actual) || 0;
};

export const getStockNuevo = (prod: Partial<Producto> | null | undefined): number => {
  if (!prod) return 0;
  if (prod.stock_nuevo !== undefined && prod.stock_nuevo !== null) return Number(prod.stock_nuevo) || 0;
  const sUsado = Number(prod.stock_usado) || 0;
  const sPorRev = Number(prod.stock_por_revisar) || 0;
  if (sUsado > 0 || sPorRev > 0) {
    return Math.max(0, (Number(prod.stock_actual) || 0) - (sUsado + sPorRev));
  }
  return Number(prod.stock_actual) || 0;
};

export const normalizeRetiroProductos = (data: any[]): Producto[] => {
  return (data || []).map((p: any) => {
    const sNuevo = Number(p.stock_nuevo) || 0;
    const sUsado = Number(p.stock_usado) || 0;
    const sPorRev = Number(p.stock_por_revisar) || 0;
    const sum = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
    const total = sum > 0 ? sum : (Number(p.stock_actual) || 0);
    return {
      ...p,
      stock_actual: total,
      stock_nuevo: sNuevo > 0 ? sNuevo : (sUsado === 0 && sPorRev === 0 ? total : 0),
      stock_usado: sUsado,
      stock_por_revisar: sPorRev,
    };
  });
};
