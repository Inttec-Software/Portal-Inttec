export type GuiaTipo = 'CHECKLIST_SALIDA' | 'CHECKLIST_SITIO' | 'GUIA_TECNICA';

export interface GuiaCategoria {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
  activo: boolean;
  created_at?: string;
}

export interface ChecklistItem {
  id: string;
  texto: string;
  cantidad?: string;
  critico?: boolean;
  nota?: string;
}

export interface MaterialItem {
  id: string;
  nombre: string;
  cantidad?: string;
  nota?: string;
}

export interface MaterialGrupo {
  id: string;
  nombre: string;
  items: MaterialItem[];
}

export interface PasoItem {
  id: string;
  titulo: string;
  detalle: string;
  imagen_url?: string;
}

export interface VarianteCorte {
  pieza: string;
  instruccion: string;
}

export interface VarianteMaterial {
  nombre: string;
  cantidad: string;
}

export interface VarianteConfig {
  id: string;
  valor_1: string;
  valor_2: string;
  valor_3?: string;
  cortes: VarianteCorte[];
  materiales: VarianteMaterial[];
  imagen_url?: string;
  notas?: string;
}

export type AlertaNivel = 'critico' | 'precaucion' | 'info';

export type GuiaBlock =
  | {
      id: string;
      type: 'checklist';
      titulo: string;
      items: ChecklistItem[];
    }
  | {
      id: string;
      type: 'materiales';
      titulo: string;
      grupos: MaterialGrupo[];
    }
  | {
      id: string;
      type: 'pasos';
      titulo: string;
      pasos: PasoItem[];
    }
  | {
      id: string;
      type: 'alerta';
      nivel: AlertaNivel;
      titulo: string;
      mensaje: string;
    }
  | {
      id: string;
      type: 'diagrama';
      titulo: string;
      imagen_url: string;
      descripcion?: string;
    }
  | {
      id: string;
      type: 'selector_variantes';
      titulo: string;
      etiqueta_filtro_1: string;
      etiqueta_filtro_2: string;
      etiqueta_filtro_3?: string;
      variantes: VarianteConfig[];
    };

export interface Guia {
  id: string;
  categoria_id: string | null;
  categoria_nombre?: string | null;
  categoria_icono?: string | null;
  categoria_color?: string | null;
  titulo: string;
  subtitulo?: string | null;
  tipo: GuiaTipo;
  icono?: string | null;
  bloques: GuiaBlock[];
  texto_busqueda?: string;
  destacada: boolean;
  publicada: boolean;
  orden: number;
  creado_por_id?: string | null;
  creado_por_nombre?: string | null;
  actualizado_por_nombre?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GuiaPayload {
  categoria_id: string | null;
  titulo: string;
  subtitulo?: string;
  tipo: GuiaTipo;
  icono?: string;
  bloques: GuiaBlock[];
  destacada: boolean;
  publicada: boolean;
  orden?: number;
}

export const GUIA_TIPO_META: Record<
  GuiaTipo,
  { label: string; shortLabel: string; color: string; icon: string }
> = {
  CHECKLIST_SALIDA: {
    label: 'Checklist Pre-Salida',
    shortLabel: 'Pre-Salida',
    color: '#0284c7',
    icon: 'briefcase-outline',
  },
  CHECKLIST_SITIO: {
    label: 'Checklist en Sitio',
    shortLabel: 'En Sitio',
    color: '#16a34a',
    icon: 'checkbox-outline',
  },
  GUIA_TECNICA: {
    label: 'Guía Técnica / Medidas',
    shortLabel: 'Guía Técnica',
    color: '#d97706',
    icon: 'construct-outline',
  },
};

export const CATEGORIA_ICONOS = [
  'sunny-outline',
  'videocam-outline',
  'snow-outline',
  'flash-outline',
  'construct-outline',
  'hardware-chip-outline',
  'shield-checkmark-outline',
  'book-outline',
  'car-outline',
  'cube-outline',
];

export const CATEGORIA_COLORES = [
  '#f59e0b',
  '#0284c7',
  '#06b6d4',
  '#dc2626',
  '#16a34a',
  '#7c3aed',
  '#ea580c',
  '#0d9488',
];

export const generateBlockId = (prefix = 'blk'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const createEmptyBlock = (type: GuiaBlock['type']): GuiaBlock => {
  const id = generateBlockId(type);
  switch (type) {
    case 'checklist':
      return {
        id,
        type: 'checklist',
        titulo: 'Puntos a Verificar',
        items: [{ id: generateBlockId('chk'), texto: '' }],
      };
    case 'materiales':
      return {
        id,
        type: 'materiales',
        titulo: 'Herramienta y Material',
        grupos: [
          {
            id: generateBlockId('grp'),
            nombre: 'General',
            items: [{ id: generateBlockId('mat'), nombre: '', cantidad: '' }],
          },
        ],
      };
    case 'pasos':
      return {
        id,
        type: 'pasos',
        titulo: 'Procedimiento Paso a Paso',
        pasos: [{ id: generateBlockId('paso'), titulo: '', detalle: '' }],
      };
    case 'alerta':
      return {
        id,
        type: 'alerta',
        nivel: 'precaucion',
        titulo: 'Aviso Importante',
        mensaje: '',
      };
    case 'diagrama':
      return {
        id,
        type: 'diagrama',
        titulo: 'Diagrama de Referencia',
        imagen_url: '',
        descripcion: '',
      };
    case 'selector_variantes':
      return {
        id,
        type: 'selector_variantes',
        titulo: 'Selector de Medidas y Conexiones',
        etiqueta_filtro_1: 'Medida / Modelo',
        etiqueta_filtro_2: 'Configuración',
        etiqueta_filtro_3: 'Cantidad',
        variantes: [
          {
            id: generateBlockId('var'),
            valor_1: '',
            valor_2: '',
            valor_3: '',
            cortes: [{ pieza: '', instruccion: '' }],
            materiales: [{ nombre: '', cantidad: '' }],
          },
        ],
      };
  }
};

/**
 * Convierte texto multilínea pegado desde Word/PDF en ítems limpios.
 * Detecta opcionalmente una cantidad al inicio (ej. "20 Jacks Panduit").
 */
export const parsePastedLines = (
  rawText: string
): { texto: string; cantidad?: string }[] => {
  return rawText
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[•▪■□☐✓✔\-*]+|\d+[.)])\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length > 0)
    .map((clean) => {
      const match = clean.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (match && match[2].length >= 2) {
        return { cantidad: match[1], texto: match[2].trim() };
      }
      return { texto: clean };
    });
};

export const normalizeSearch = (str: string): string =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const collectGuideImageUrls = (bloques: GuiaBlock[]): string[] => {
  const urls = new Set<string>();
  for (const block of bloques || []) {
    if (block.type === 'diagrama' && block.imagen_url) {
      urls.add(block.imagen_url);
    } else if (block.type === 'pasos') {
      for (const paso of block.pasos || []) {
        if (paso.imagen_url) urls.add(paso.imagen_url);
      }
    } else if (block.type === 'selector_variantes') {
      for (const v of block.variantes || []) {
        if (v.imagen_url) urls.add(v.imagen_url);
      }
    }
  }
  return Array.from(urls);
};

export const getCheckableKeysForBlock = (block: GuiaBlock): string[] => {
  const keys: string[] = [];
  if (block.type === 'checklist') {
    for (const item of block.items || []) {
      keys.push(`${block.id}:${item.id}`);
    }
  } else if (block.type === 'materiales') {
    for (const grupo of block.grupos || []) {
      for (const item of grupo.items || []) {
        keys.push(`${block.id}:${grupo.id}:${item.id}`);
      }
    }
  }
  return keys;
};

export const countCheckableItems = (bloques: GuiaBlock[]): number => {
  let total = 0;
  for (const block of bloques || []) {
    total += getCheckableKeysForBlock(block).length;
  }
  return total;
};

export type GuiaTemplateKey = 'BLANK' | 'CHECKLIST_SALIDA' | 'CHECKLIST_SITIO' | 'GUIA_TECNICA';

export const GUIA_TEMPLATES: Record<
  GuiaTemplateKey,
  { label: string; descripcion: string; tipo: GuiaTipo; icono: string; bloques: () => GuiaBlock[] }
> = {
  CHECKLIST_SALIDA: {
    label: 'Checklist Pre-Salida',
    descripcion: 'Lista de herramienta y material antes de salir a obra',
    tipo: 'CHECKLIST_SALIDA',
    icono: 'briefcase-outline',
    bloques: () => [
      createEmptyBlock('alerta'),
      createEmptyBlock('materiales'),
      createEmptyBlock('checklist'),
    ],
  },
  CHECKLIST_SITIO: {
    label: 'Checklist / Inspección en Sitio',
    descripcion: 'Puntos críticos y pasos secuenciales en instalación',
    tipo: 'CHECKLIST_SITIO',
    icono: 'checkbox-outline',
    bloques: () => [
      {
        id: generateBlockId('alerta'),
        type: 'alerta',
        nivel: 'critico',
        titulo: 'Validación de Seguridad',
        mensaje: '',
      },
      createEmptyBlock('checklist'),
    ],
  },
  GUIA_TECNICA: {
    label: 'Guía Técnica / Medidas',
    descripcion: 'Selector por medida/configuración, pasos y diagramas con zoom',
    tipo: 'GUIA_TECNICA',
    icono: 'construct-outline',
    bloques: () => [
      createEmptyBlock('selector_variantes'),
      createEmptyBlock('diagrama'),
      createEmptyBlock('pasos'),
    ],
  },
  BLANK: {
    label: 'Guía en Blanco',
    descripcion: 'Empieza desde cero agregando los bloques que necesites',
    tipo: 'CHECKLIST_SITIO',
    icono: 'document-text-outline',
    bloques: () => [],
  },
};
