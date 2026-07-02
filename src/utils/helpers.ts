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
