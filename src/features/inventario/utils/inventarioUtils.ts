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
  const sActual = Number(prod.stock_actual) || 0;
  const sum = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
  return Math.max(sActual, sum);
};

export const getStockNuevo = (prod: Partial<Producto> | null | undefined): number => {
  if (!prod) return 0;
  const sNuevo = Number(prod.stock_nuevo) || 0;
  const sUsado = Number(prod.stock_usado) || 0;
  const sPorRev = Number(prod.stock_por_revisar) || 0;
  const sActual = Number(prod.stock_actual) || 0;
  const sum = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
  if (sActual > sum) {
    return Math.round((sNuevo + (sActual - sum)) * 100) / 100;
  }
  return sNuevo;
};

export const normalizeRetiroProductos = (data: any[]): Producto[] => {
  return (data || []).map((p: any) => {
    const sNuevo = Number(p.stock_nuevo) || 0;
    const sUsado = Number(p.stock_usado) || 0;
    const sPorRev = Number(p.stock_por_revisar) || 0;
    const sActual = Number(p.stock_actual) || 0;
    const sum = Math.round((sNuevo + sUsado + sPorRev) * 100) / 100;
    const total = Math.max(sActual, sum);
    const effectiveNuevo = total > sum
      ? Math.round((sNuevo + (total - sum)) * 100) / 100
      : sNuevo;
    return {
      ...p,
      stock_actual: total,
      stock_nuevo: effectiveNuevo,
      stock_usado: sUsado,
      stock_por_revisar: sPorRev,
    };
  });
};
