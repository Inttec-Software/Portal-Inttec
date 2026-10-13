export const getComentariosPlaceholder = (categoria: string, subcategoria: string) => {
  if (categoria === 'Gastos de Viaje') {
    switch (subcategoria) {
      case 'Alimentos': return '(En Comentarios poner si es Almuerzo, comida o cena)';
      case 'Hospedaje': return '(En comentarios poner si es Airbnb, hotel, hostal)';
      case 'Traslados': return '(En comentarios poner uber, taxi, gastos de los vehículos propios, etc)';
      case 'Renta Autos': return '(En comentarios poner arrendadora)';
      case 'Vuelos': return '(En comentarios aerolíneas, etc)';
    }
  } else if (categoria === 'Equipo') {
    switch (subcategoria) {
      case 'Equipo CCTV': return '(En comentarios poner qué equipos son ejem. Nvr, camaras, hdd. Etc...)';
      case 'Equipo Paneles': return '(En comentarios poner ejem. Paneles, inversor, estructura)';
    }
  } else if (categoria === 'Material') {
    if (subcategoria === 'Material Electrico') {
      return '(En comentarios la descripción, de qué se compra)';
    }
  } else if (categoria === 'Oficina y Administración') {
    if (subcategoria === 'Herramienta') {
      return '(En esta categoría porque es inversión, no gasto)';
    }
  }
  return 'Escribe tus comentarios o detalles adicionales...';
};

/**
 * Determina si una combinación de categoría y subcategoría corresponde a un gasto de combustible / gasolina / diésel,
 * para activar el registro de odómetro (kilometraje), litros y vehículo.
 */
export const isCombustibleExpense = (
  categoria: string | null | undefined,
  subcategoria: string | null | undefined
): boolean => {
  const normCat = (categoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const normSub = (subcategoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const esCatVehiculo = normCat === 'vehiculos' || normCat === 'vehiculo' || normCat.includes('vehicul');
  const esSubCombustible =
    normSub === 'combustible' ||
    normSub === 'gasolina' ||
    normSub === 'diesel' ||
    normSub.includes('combustible') ||
    normSub.includes('gasolina') ||
    normSub.includes('diesel');

  return (esCatVehiculo && esSubCombustible) || normSub === 'combustible' || normSub === 'gasolina' || normSub === 'diesel';
};

/**
 * Normaliza un texto removiendo acentos / tildes / diacríticos, convirtiendo a minúsculas y eliminando espacios en los extremos.
 * Permite realizar búsquedas insensibles a mayúsculas, minúsculas y acentos (ej. "batería" coincide con "bateria").
 */
export const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Formatea cualquier string de fecha (ISO, YYYY-MM-DD, con hora o zona horaria) a DD/MM/AAAA.
 * Si ya viene en formato DD/MM/AAAA lo conserva.
 */
export const formatFriendlyDate = (dateStr?: string | null): string => {
  if (!dateStr) return 'N/A';
  const cleanStr = String(dateStr).trim();
  if (!cleanStr) return 'N/A';

  // Si ya viene como DD/MM/AAAA
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
    return cleanStr;
  }

  // Tomar solo la parte de la fecha antes de 'T' o espacio si es ISO / Datetime
  const dateOnly = cleanStr.split('T')[0].split(' ')[0].trim();
  const parts = dateOnly.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const yyyy = parts[0];
    const mm = parts[1].padStart(2, '0');
    const dd = parts[2].padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  return cleanStr;
};

