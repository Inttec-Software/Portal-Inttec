/**
 * Script idempotente para precargar categorías y guías iniciales
 * basadas en los documentos de Contenido Guias.
 *
 * Uso:
 *   node scripts/seed-guias.js --env=test
 *   node scripts/seed-guias.js --env=prod
 */
const fs = require('fs');
const path = require('path');

const dotenv = require(path.resolve(__dirname, '../backend/node_modules/dotenv'));
const { Pool } = require(path.resolve(__dirname, '../backend/node_modules/pg'));

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const envArg = process.argv.find((a) => a.startsWith('--env='));
const targetEnv = envArg ? envArg.split('=')[1].trim().toLowerCase() : 'test';
const dbEnv = targetEnv === 'cloud' || targetEnv === 'prod' ? 'prod' : 'test';
const database = `inttec_${dbEnv}`;

function extractSearchText(titulo, subtitulo, bloques) {
  const parts = [titulo || '', subtitulo || ''];
  for (const block of bloques || []) {
    if (block.titulo) parts.push(block.titulo);
    if (block.mensaje) parts.push(block.mensaje);
    if (block.descripcion) parts.push(block.descripcion);
    if (Array.isArray(block.items)) {
      for (const item of block.items) {
        if (item.texto) parts.push(item.texto);
        if (item.cantidad) parts.push(item.cantidad);
        if (item.nota) parts.push(item.nota);
      }
    }
    if (Array.isArray(block.grupos)) {
      for (const g of block.grupos) {
        if (g.nombre) parts.push(g.nombre);
        for (const item of g.items || []) {
          if (item.nombre) parts.push(item.nombre);
          if (item.cantidad) parts.push(item.cantidad);
          if (item.nota) parts.push(item.nota);
        }
      }
    }
    if (Array.isArray(block.pasos)) {
      for (const p of block.pasos) {
        if (p.titulo) parts.push(p.titulo);
        if (p.detalle) parts.push(p.detalle);
      }
    }
    if (Array.isArray(block.variantes)) {
      for (const v of block.variantes) {
        parts.push(v.valor_1 || '', v.valor_2 || '', v.valor_3 || '', v.notas || '');
        for (const c of v.cortes || []) {
          parts.push(c.pieza || '', c.instruccion || '');
        }
        for (const m of v.materiales || []) {
          parts.push(m.nombre || '', m.cantidad || '');
        }
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const mkChecklist = (id, titulo, items) => ({
  id,
  type: 'checklist',
  titulo,
  items: items.map((item, idx) =>
    typeof item === 'string'
      ? { id: `${id}_i${idx + 1}`, texto: item }
      : { id: `${id}_i${idx + 1}`, ...item }
  ),
});

const mkMateriales = (id, titulo, grupos) => ({
  id,
  type: 'materiales',
  titulo,
  grupos: grupos.map((g, gIdx) => ({
    id: `${id}_g${gIdx + 1}`,
    nombre: g.nombre,
    items: g.items.map((it, iIdx) => ({
      id: `${id}_g${gIdx + 1}_i${iIdx + 1}`,
      nombre: it.nombre,
      cantidad: it.cantidad || undefined,
      nota: it.nota || undefined,
    })),
  })),
});

const DIAGRAMA_BASE_URL =
  'https://portal-inttec-storage.s3.us-east-2.amazonaws.com/inttec/guias/diagramas_paneles';

const SLIDE_BY_VAR_ID = {
  var_240x130_1xn_2: 5,
  var_240x130_1xn_4: 6,
  var_240x130_1xn_6: 7,
  var_240x130_1xn_8: 8,
  var_240x130_1xn_10: 9,
  var_240x130_2xn_6: 10,
  var_220x110_2xn_6: 11,
  var_240x130_2xn_8: 12,
  var_240x110_2xn_8: 13,
  var_240x130_2xn_10: 14,
  var_240x130_vert_4: 15,
  var_218x110_1xn_6: 16,
  var_240x110_1xn_4: 17,
  var_240x110_1xn_2: 18,
};

const VARIANTES_PANELES_RAW = [
  {
    id: 'var_240x130_1xn_2',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '2 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal (x2)', instruccion: '2 rieles de 472 cm, cortar 118 cm a cada uno.' },
      { pieza: 'Riel Vertical', instruccion: '1 riel de 472 cm cortado a la mitad (236 cm c/u).' },
      { pieza: 'Patas (punto de apoyo)', instruccion: 'Se toman los 2 cortes de 118 cm sobrantes.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '3' },
      { nombre: 'Lfoot', cantidad: '4' },
      { nombre: 'Climber', cantidad: '4' },
      { nombre: 'Tilt', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '2' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '4' },
    ],
  },
  {
    id: 'var_240x130_1xn_4',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '4 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal', instruccion: '2 rieles completos de 472 cm.' },
      { pieza: 'Extensión Horizontal', instruccion: 'Sobrante de 124 cm se corta a 62 cm para sacar 2 tramos.' },
      { pieza: 'Riel Vertical', instruccion: '2 rieles a la mitad (236 cm). Sobra 1/2 riel.' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel: 3 cortes a 116 cm (sobra 124 cm).' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '5' },
      { nombre: 'Lfoot', cantidad: '6' },
      { nombre: 'Climber', cantidad: '6' },
      { nombre: 'Tilt', cantidad: '3' },
      { nombre: 'Riel Connector', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '6' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '6' },
    ],
  },
  {
    id: 'var_240x130_1xn_6',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '6 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal (completos)', instruccion: '2 rieles completos de 472 cm.' },
      { pieza: 'Riel Horizontal (cortados)', instruccion: '2 rieles de 354 cm (cortar 118 cm a cada uno).' },
      { pieza: 'Riel Vertical', instruccion: '2 rieles a la mitad (236 cm). Ya salen 2 patas del corte.' },
      { pieza: 'Patas (punto de apoyo)', instruccion: 'Ya tienes 2 patas + 1 riel con 2 cortes a 118 cm (sobra 1/2 riel).' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '7' },
      { nombre: 'Lfoot', cantidad: '8' },
      { nombre: 'Climber', cantidad: '8' },
      { nombre: 'Tilt', cantidad: '4' },
      { nombre: 'Riel Connector', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '10' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '8' },
    ],
  },
  {
    id: 'var_240x130_1xn_8',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '8 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal (completos)', instruccion: '4 rieles completos de 472 cm.' },
      { pieza: 'Riel Horizontal (tramos)', instruccion: '1 riel: 2 tramos de 118 cm (sobran 2 tramos de 118 cm para 2 patas).' },
      { pieza: 'Riel Vertical', instruccion: '3 rieles a la mitad (236 cm).' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel partido en 4 partes iguales a 118 cm + 2 patas del riel horizontal.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '9' },
      { nombre: 'Lfoot', cantidad: '12' },
      { nombre: 'Climber', cantidad: '12' },
      { nombre: 'Riel Connector', cantidad: '4' },
      { nombre: 'Mid Clamp', cantidad: '14' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '12' },
    ],
  },
  {
    id: 'var_240x130_1xn_10',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '10 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal', instruccion: '6 rieles completos de 472 cm.' },
      { pieza: 'Riel Vertical', instruccion: '3.5 rieles a la mitad (236 cm).' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '2 rieles partidos en 4 partes iguales a 118 cm (sobra 1 pata).' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '12' },
      { nombre: 'Lfoot', cantidad: '14' },
      { nombre: 'Climber', cantidad: '14' },
      { nombre: 'Riel Connector', cantidad: '4' },
      { nombre: 'Mid Clamp', cantidad: '22' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '14' },
    ],
  },
  {
    id: 'var_240x130_2xn_6',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 2xN',
    valor_3: '6 Módulos',
    cortes: [
      { pieza: 'Rieles Verticales', instruccion: '3 rieles de 472 cm completos.' },
      { pieza: 'Rieles Horizontales', instruccion: '4 rieles a 410 cm (se les cortan 62 cm).' },
      { pieza: 'Patas Altas', instruccion: '2 rieles de 472 cm cortados a la mitad (236 cm).' },
      { pieza: 'Patas Bajas', instruccion: 'Mitad sobrante cortada a la mitad (118 cm) + 3er tramo de 118 cm de sobrantes.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '9' },
      { nombre: 'Lfoot', cantidad: '9' },
      { nombre: 'Climber', cantidad: '9' },
      { nombre: 'Mid Clamp', cantidad: '8' },
      { nombre: 'End Clamp', cantidad: '8' },
      { nombre: 'Barrenanclas', cantidad: '9' },
    ],
  },
  {
    id: 'var_240x130_2xn_8',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 2xN',
    valor_3: '8 Módulos',
    cortes: [
      { pieza: 'Rieles Verticales', instruccion: '4 rieles de 472 cm completos.' },
      { pieza: 'Rieles Horizontales', instruccion: '4 rieles de 472 cm completos.' },
      { pieza: 'Extensión Horizontal', instruccion: '1 riel cortado en 4 tramos de 118 cm.' },
      { pieza: 'Patas Altas', instruccion: '2 rieles de 472 cm cortados a la mitad (236 cm).' },
      { pieza: 'Patas Bajas', instruccion: '1 riel cortado en 4 tramos de 118 cm.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '12' },
      { nombre: 'Lfoot', cantidad: '12' },
      { nombre: 'Climber', cantidad: '12' },
      { nombre: 'Riel Connector', cantidad: '4' },
      { nombre: 'Mid Clamp', cantidad: '12' },
      { nombre: 'End Clamp', cantidad: '8' },
      { nombre: 'Barrenanclas', cantidad: '12' },
    ],
  },
  {
    id: 'var_240x130_2xn_10',
    valor_1: '240x130 cm',
    valor_2: 'Arreglo 2xN',
    valor_3: '10 Módulos',
    cortes: [
      { pieza: 'Rieles Verticales', instruccion: '4 rieles de 472 cm completos.' },
      { pieza: 'Rieles Horizontales', instruccion: '4 rieles de 472 cm completos.' },
      { pieza: 'Extensión Horizontal', instruccion: '2 rieles de 472 cm cortados a la mitad (236 cm).' },
      { pieza: 'Patas Altas', instruccion: '2 rieles de 472 cm cortados a la mitad (236 cm).' },
      { pieza: 'Patas Bajas', instruccion: '1 riel cortado en 4 tramos de 118 cm.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '13' },
      { nombre: 'Lfoot', cantidad: '12' },
      { nombre: 'Climber', cantidad: '12' },
      { nombre: 'Riel Connector', cantidad: '4' },
      { nombre: 'Mid Clamp', cantidad: '16' },
      { nombre: 'End Clamp', cantidad: '8' },
      { nombre: 'Barrenanclas', cantidad: '12' },
    ],
  },
  {
    id: 'var_240x130_vert_4',
    valor_1: '240x130 cm',
    valor_2: 'Vertical',
    valor_3: '4 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal', instruccion: '2 rieles completos de 472 cm.' },
      { pieza: 'Extensión Horizontal', instruccion: 'Sobrante de 124 cm se corta a 62 cm para sacar 2 tramos.' },
      { pieza: 'Riel Vertical', instruccion: '2 rieles (sobra 1/2 riel).' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel: 3 cortes a 116 cm (sobra 124 cm).' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '5' },
      { nombre: 'Lfoot', cantidad: '6' },
      { nombre: 'Climber', cantidad: '6' },
      { nombre: 'Tilt', cantidad: '3' },
      { nombre: 'Riel Connector', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '6' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '6' },
    ],
  },
  {
    id: 'var_220x110_2xn_6',
    valor_1: '220x110 cm',
    valor_2: 'Arreglo 2xN',
    valor_3: '6 Módulos',
    cortes: [
      { pieza: 'Rieles Verticales', instruccion: '3 rieles de 472 cm completos.' },
      { pieza: 'Rieles Horizontales', instruccion: '4 rieles a 410 cm (se les cortan 62 cm).' },
      { pieza: 'Patas Altas', instruccion: '1 riel de 472 cm: quitar tramo de 122 cm; los 350 cm restantes cortarlos a la mitad (2 patas de 175 cm).' },
      { pieza: 'Patas Bajas', instruccion: 'Mitad sobrante cortada a la mitad (118 cm) + 3er tramo de 118 cm de sobrantes.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '9' },
      { nombre: 'Lfoot', cantidad: '9' },
      { nombre: 'Climber', cantidad: '9' },
      { nombre: 'Mid Clamp', cantidad: '8' },
      { nombre: 'End Clamp', cantidad: '8' },
      { nombre: 'Barrenanclas', cantidad: '9' },
    ],
  },
  {
    id: 'var_240x110_2xn_8',
    valor_1: '240x110 cm',
    valor_2: 'Arreglo 2xN',
    valor_3: '8 Módulos',
    cortes: [
      { pieza: 'Rieles Verticales', instruccion: '3 rieles de 472 cm completos.' },
      { pieza: 'Rieles Horizontales', instruccion: '4 rieles de 472 cm completos.' },
      { pieza: 'Patas Altas', instruccion: '1 riel de 472 cm cortado a la mitad (236 cm).' },
      { pieza: 'Patas Bajas', instruccion: '1 riel a 3/4, se corta un tramo de 118 cm.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '9' },
      { nombre: 'Lfoot', cantidad: '12' },
      { nombre: 'Climber', cantidad: '12' },
      { nombre: 'Riel Connector', cantidad: '4' },
      { nombre: 'Mid Clamp', cantidad: '12' },
      { nombre: 'End Clamp', cantidad: '8' },
      { nombre: 'Barrenanclas', cantidad: '12' },
    ],
  },
  {
    id: 'var_218x110_1xn_6',
    valor_1: '218x110 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '6 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal (completos)', instruccion: '2 rieles completos de 472 cm.' },
      { pieza: 'Riel Horizontal (extensión)', instruccion: '1 riel en 2 partes de 236 cm.' },
      { pieza: 'Riel Vertical', instruccion: '2 rieles en 2 partes de 236 cm.' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel en 4 partes de 118 cm c/u.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '6' },
      { nombre: 'Lfoot', cantidad: '8' },
      { nombre: 'Climber', cantidad: '8' },
      { nombre: 'Riel Connector', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '10' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '8' },
    ],
  },
  {
    id: 'var_240x110_1xn_4',
    valor_1: '240x110 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '4 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal', instruccion: '2 rieles completos de 472 cm.' },
      { pieza: 'Riel Vertical', instruccion: '2 rieles a la mitad (236 cm). Sobra 1/2 riel.' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel: 1 corte a 118 cm + 2 patas salen del medio riel vertical.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '5' },
      { nombre: 'Lfoot', cantidad: '6' },
      { nombre: 'Climber', cantidad: '6' },
      { nombre: 'Tilt', cantidad: '3' },
      { nombre: 'Mid Clamp', cantidad: '6' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '6' },
    ],
  },
  {
    id: 'var_240x110_1xn_2',
    valor_1: '240x110 cm',
    valor_2: 'Arreglo 1xN',
    valor_3: '2 Módulos',
    cortes: [
      { pieza: 'Riel Horizontal', instruccion: '1 riel cortado a la mitad (236 cm).' },
      { pieza: 'Riel Vertical', instruccion: '1 riel cortado a la mitad (236 cm).' },
      { pieza: 'Patas (punto de apoyo)', instruccion: '1 riel: 2 cortes de 118 cm.' },
    ],
    materiales: [
      { nombre: 'Rieles de 472 cm', cantidad: '3' },
      { nombre: 'Lfoot', cantidad: '4' },
      { nombre: 'Climber', cantidad: '4' },
      { nombre: 'Tilt', cantidad: '2' },
      { nombre: 'Mid Clamp', cantidad: '2' },
      { nombre: 'End Clamp', cantidad: '4' },
      { nombre: 'Barrenanclas', cantidad: '4' },
    ],
  },
];

const GUIAS_SEED = [
  {
    categoriaNombre: 'Paneles Solares',
    titulo: 'Manual de Cortes y Medidas — Paneles Solares',
    subtitulo: 'Calculadora rápida de rieles (472 cm), inclinación y herrajes por tamaño de panel',
    tipo: 'GUIA_TECNICA',
    icono: 'grid-outline',
    destacada: true,
    orden: 1,
    bloques: [
      {
        id: 'b_paneles_info',
        type: 'alerta',
        nivel: 'info',
        titulo: 'Reglas Generales de Estructura e Inclinación',
        mensaje:
          '• Inclinación recomendada: 28° orientada al SUR.\n• Pata única / pata alta: 97% de la distancia total del riel; pata central en 2xN: 50% del riel.\n• Patas laterales: separación de 20 cm hacia arriba y hacia un lado.\n• Patas centrales: un punto de apoyo cada 2 m (si sobra 1 m, distribuir entre apoyos).\n• Rieles horizontales: separación central de 40 cm (20 cm arriba y 20 cm abajo del centro).\n• Bases de inversor (3.6–6 kW): dejar 30 cm libres a los lados y arriba del inversor.',
      },
      {
        id: 'b_paneles_selector',
        type: 'selector_variantes',
        titulo: 'Selector de Cortes y Material por Arreglo',
        etiqueta_filtro_1: 'Medida de Panel',
        etiqueta_filtro_2: 'Tipo de Arreglo',
        etiqueta_filtro_3: 'Módulos',
        variantes: VARIANTES_PANELES_RAW.map((v) => ({
          ...v,
          imagen_url: SLIDE_BY_VAR_ID[v.id]
            ? `${DIAGRAMA_BASE_URL}/slide_${String(SLIDE_BY_VAR_ID[v.id]).padStart(2, '0')}.png`
            : undefined,
        })),
      },
      {
        id: 'b_paneles_diag_bases',
        type: 'diagrama',
        titulo: 'Dibujo de Bases para Inversores (3.6–6 kW)',
        imagen_url: `${DIAGRAMA_BASE_URL}/slide_02.png`,
        descripcion:
          'Medidas estándar para base de 1 o 2 inversores con centro de carga (30 cm, 40 cm, 60 cm, 100 cm).',
      },
      {
        id: 'b_paneles_diag_inclinacion',
        type: 'diagrama',
        titulo: 'Dibujo de Inclinación de Arreglos (28°)',
        imagen_url: `${DIAGRAMA_BASE_URL}/slide_03.png`,
        descripcion:
          'Arreglos 1xN y 2xN a 28°: pata única/alta al 97% y pata central al 50% de la distancia total del riel.',
      },
      {
        id: 'b_paneles_diag_distribucion',
        type: 'diagrama',
        titulo: 'Distribución de Medidas y Puntos de Apoyo',
        imagen_url: `${DIAGRAMA_BASE_URL}/slide_04.png`,
        descripcion:
          'Separación lateral de 20 cm, rieles horizontales 40 cm al centro y patas centrales cada 2 m.',
      },
    ],
  },
  {
    categoriaNombre: 'Seguridad Eléctrica',
    titulo: 'Puntos de Inspección Antes de Encender Inversor',
    subtitulo: 'Validación obligatoria de tierra física, MC4, interruptores térmicos y AC antes de energizar',
    tipo: 'CHECKLIST_SITIO',
    icono: 'flash-outline',
    destacada: true,
    orden: 2,
    bloques: [
      {
        id: 'b_inv_alerta',
        type: 'alerta',
        nivel: 'critico',
        titulo: 'ALTO — Revisar antes de energizar',
        mensaje:
          'Revisar la conexión de interruptores térmicos SIEMPRE con el interruptor en modo OFF y verificar polaridad Positivo/Negativo antes de conectar al inversor.',
      },
      mkChecklist('b_inv_tierra', '1. Conexión a Tierra Física', [
        { texto: 'Varilla de tierra conectada', critico: true },
        { texto: 'Chasis de inversor aterrizado', critico: true },
        { texto: 'Tierra conectada en Conector AC', critico: true },
        'Estructura de aluminio de todos los arreglos aterrizada',
        'Verificar cajas de registro para asegurar que no existan empalmes indebidos',
        'Verificar conexión a tierra con conector Groundie en estructura de paneles',
      ]),
      mkChecklist('b_inv_mc4', '2. Verificar Conexión de Conectores MC4', [
        'Terminales bien sujetadas / ponchadas',
        { texto: 'Hacen correctamente el PLUG (clic) de conexión', critico: true },
        'Empalmes de cable bien realizados y correctamente aislados',
        { texto: 'Conectores Positivo (+) y Negativo (-) bien polarizados', critico: true },
        'Bien conectados a los MPPT del inversor',
      ]),
      mkChecklist('b_inv_termicos', '3. Interruptores Térmicos (en modo OFF)', [
        { texto: 'Terminal Ferrul en la punta del cable', critico: true },
        { texto: 'Polaridad correcta en ambos extremos del interruptor', critico: true },
        'Bornes bien apretados',
      ]),
      mkChecklist('b_inv_ac', '4. Conexión de Terminal AC', [
        'Terminal Ferrul en la punta del cable',
        { texto: 'Polaridad correcta en Fase, Fase y Tierra', critico: true },
        'Conector realiza correctamente su PLUG',
      ]),
    ],
  },
  {
    categoriaNombre: 'Paneles Solares',
    titulo: 'Checklist Instalación de Paneles Solares',
    subtitulo: 'Herramienta a considerar, 1er visita, montaje fotovoltaico y revisión final para CFE',
    tipo: 'CHECKLIST_SALIDA',
    icono: 'sunny-outline',
    destacada: true,
    orden: 3,
    bloques: [
      {
        id: 'b_solar_alerta',
        type: 'alerta',
        nivel: 'precaucion',
        titulo: 'Puntos Clave de Garantía y Normativa',
        mensaje:
          '• Dejar mínimo 30 cm libres hacia los lados y arriba del inversor por garantía.\n• Usar calibre 12 AWG DC solo en tubería y cable fotovoltaico cuando esté expuesto.\n• Usar mínimo calibre 10 AC (uso rudo 3x10 de centro de carga a inversor) y mínimo MC4 para conexiones.',
      },
      mkMateriales('b_solar_mat', 'Lista de Materiales y Herramienta a Considerar', [
        {
          nombre: 'Herramienta',
          items: [
            { nombre: 'SDS Plus con brocas de 3/8 y 1/2' },
            { nombre: 'Kit taladros inalámbricos con brocas de 5/16 y 1/4' },
            { nombre: 'Kit ponchador MC4' },
            { nombre: 'Esmeriladora angular' },
            { nombre: 'Multímetro' },
            { nombre: 'Llave crescent y llave perica' },
            { nombre: 'Desarmadores y pinzas eléctricas' },
            { nombre: 'Martillo, flexómetro, nivel y dobla tubos' },
            { nombre: 'Pistola de silicón' },
            { nombre: 'Escalera de tijera y aspiradora' },
          ],
        },
        {
          nombre: 'Herrajes y Estructura',
          items: [
            { nombre: 'Lfoot, Tilt conector (N3) y Climber (TopClip)' },
            { nombre: 'Rail conector (si aplica), EndClamp y MidClamp' },
            { nombre: 'Groundy (conector tierra) y varilla de tierra' },
            { nombre: 'Barrenanclas, taquetes y tornillos de 5/16 y 1/4' },
            { nombre: 'Impermeabilizante y silicón' },
          ],
        },
        {
          nombre: 'Eléctrico y Canalización',
          items: [
            { nombre: 'Cable rojo, negro y verde calibre 12 (DC en tubería)' },
            { nombre: 'Cable fotovoltaico rojo y negro (expuesto)' },
            { nombre: 'Cable negro y verde calibre 10 y uso rudo 3x10 (AC)' },
            { nombre: 'Prefabricados MC4 y terminales ponchables' },
            { nombre: 'Tubería 3/4 conduit pared delgada, conectores y coples compresión 3/4' },
            { nombre: 'Canal unistrut, abrazaderas unistrut, uñas y monitores' },
            { nombre: 'Cajas Fs (LB, LL, LR, tipo C, tipo TEE), conectores glándula y registro' },
            { nombre: 'Centros de carga, térmicos de AC y térmicos de DC' },
          ],
        },
      ]),
      mkChecklist('b_solar_visita', '1. Estructura, Montaje y 1er Visita', [
        'Revisar espacio, sombras, orientación al SUR e inclinación de 28°',
        'Revisar rutas de cableado AC hacia tablero principal y tubería DC hacia inversor',
        'Confirmar si el domicilio tiene 220V (si no, preparar 5ta terminal y 2da fase)',
        'Definir taquete químico o barrenancla y hacer pruebas de resistencia al montar',
        'Colocar sellador dentro de perforaciones Lfoot e impermeabilizar todas las patas',
        'Apretar toda la tornillería inoxidable y cuidar escuadra/nivelación antes de montar módulos',
        'Paneles sin golpes/grietas, abrazaderas certificadas y cableado sin tensión o dobleces',
      ]),
      mkChecklist('b_solar_elec', '2. Cableado, Inversor, Protecciones y Cierre CFE', [
        'Conectar paneles en serie respetando código de colores: ROJO (+), NEGRO (-), VERDE (Tierra)',
        'Cable fotovoltaico certificado sin empalmes no certificados y MC4 bien ensamblados',
        'Tubería PVC/conduit exterior bien fijada, curvas suaves, protección UV y entradas selladas',
        'Registro hermético en pata de estructura con conector glándula y terminales ponchables',
        'Inversor firmemente anclado en zona ventilada con 30 cm libres arriba y a los lados',
        'Interruptor DC, interruptor AC, SPD contra sobretensiones y breaker bien dimensionados y etiquetados',
        'Puesta a tierra en estructura, módulos, inversor y varilla con continuidad verificada',
        { texto: 'Verificar voltaje de strings dentro de rango, encender sin alarmas y validar monitoreo', critico: true },
        { texto: 'Tomar fotografías para CFE: paneles, etiqueta de paneles, inversor instalado, etiqueta inversor y medidor', critico: true },
      ]),
    ],
  },
  {
    categoriaNombre: 'CCTV / Cámaras',
    titulo: 'Checklist Instalación y Mantenimiento CCTV',
    subtitulo: 'Lista de herramienta/material para salir a obra y puntos de inspección de cámaras y DVR/NVR',
    tipo: 'CHECKLIST_SALIDA',
    icono: 'videocam-outline',
    destacada: false,
    orden: 4,
    bloques: [
      mkMateriales('b_cctv_mat', 'Antes de Salir — Herramienta y Material de Instalación', [
        {
          nombre: 'Herramienta Eléctrica',
          items: [
            { nombre: 'Rotomartillo SDS Plus (brocas 1/4", 3/8" y 1")', cantidad: '1' },
            { nombre: 'Taladros de impacto', cantidad: '2' },
            { nombre: 'Cortadora o pulidora (con guarda y discos)', cantidad: '1' },
          ],
        },
        {
          nombre: 'Herramienta de Mano',
          items: [
            { nombre: 'Pinza eléctrica y pinza de corte fino' },
            { nombre: 'Ponchadoras y desforradoras' },
            { nombre: 'Pinza perico y llave Stilson' },
            { nombre: 'Llaves Allen, Torx y navaja' },
          ],
        },
        {
          nombre: 'Herramienta Electrónica',
          items: [
            { nombre: 'Etiquetadora (con cartucho de cinta continua)' },
            { nombre: 'Tester, pollo y multímetro' },
          ],
        },
        {
          nombre: 'Material Base',
          items: [
            { nombre: 'Patch panel (verificar si es Panduit o NetKey)', cantidad: '1' },
            { nombre: 'Jacks Panduit o NetKey (según patch panel)', cantidad: '20' },
            { nombre: 'Organizador horizontal', cantidad: '1' },
            { nombre: 'Cajas redondas para cámara', cantidad: '10' },
            { nombre: 'Cajas Gewiss', cantidad: '10' },
            { nombre: 'Patch cords', cantidad: '20' },
            { nombre: 'Jacks de terminación en campo', cantidad: '10' },
            { nombre: 'Cable Panduit color gris' },
          ],
        },
      ]),
      mkChecklist('b_cctv_fisica', '1. Revisión Física y Calidad de Imagen', [
        'Cámara firmemente sujeta al soporte, altura adecuada y protegida contra vandalismo',
        'Carcasa/housing sin grietas, sellos y empaques en buen estado contra lluvia/humedad',
        'Lente o domo limpio, orientación correcta y sin obstrucciones en campo de visión',
        'Imagen nítida, enfoque correcto, sin reflejos, sobreexposición ni ruido en video',
        'Modo nocturno / infrarrojo y cambio automático día/noche funcionando',
      ]),
      mkChecklist('b_cctv_red', '2. Cableado, Energía, DVR/NVR y Pruebas', [
        'Cable UTP/coaxial y conectores RJ45/BNC en buen estado, etiquetados y sin tensión',
        'Canalización (tubería/conduit) y cajas de registro revisadas',
        { texto: 'Fuente de poder, voltaje de salida, breaker/fusible y tierra física correctos sin sobrecalentamiento', critico: true },
        'DVR/NVR operativo: disco duro activo, capacidad disponible, fecha/hora exactas y ventilación',
        'Switch/router estable, IPs verificadas y todas las cámaras grabando',
        'Visualización en monitor, reproducción de grabaciones, detección de movimiento, alertas y app móvil activas',
      ]),
    ],
  },
  {
    categoriaNombre: 'Minisplits',
    titulo: 'Checklist Instalación Minisplits',
    subtitulo: 'Herramienta requerida y secuencia paso a paso de montaje, vacío, pruebas y entrega',
    tipo: 'CHECKLIST_SALIDA',
    icono: 'snow-outline',
    destacada: false,
    orden: 5,
    bloques: [
      {
        id: 'b_mini_alerta',
        type: 'alerta',
        nivel: 'precaucion',
        titulo: 'Vacío Obligatorio y Limpieza en Pared',
        mensaje:
          '• Utilizar aspiradora al perforar la pared para no propagar polvo.\n• Hacer vacío en las líneas de gas durante 10–15 minutos para asegurar cero filtraciones antes de abrir el gas.',
      },
      mkMateriales('b_mini_mat', 'Lista de Materiales y Herramienta', [
        {
          nombre: 'Herramienta y Equipo',
          items: [
            { nombre: 'Taladro rotomartillo SDS Max + broca 2" o 1 1/2" (THOR)' },
            { nombre: 'Kit taladros inalámbricos + brocas de 1/4 y 5/16' },
            { nombre: 'Bomba de vacío y extensión eléctrica' },
            { nombre: 'Manómetros' },
            { nombre: 'Pistola de temperatura y multímetro' },
            { nombre: 'Llaves crescent, pericas y llaves Allen' },
            { nombre: 'Desarmadores y pinzas aisladas eléctricas' },
            { nombre: 'Escalera de tijera y de extensión' },
            { nombre: 'Aspiradora' },
          ],
        },
        {
          nombre: 'Consumibles y Fijación',
          items: [
            { nombre: 'Taquetes y tornillos 5/16 o 1/4' },
            { nombre: 'Cinta poliken, cinta momia y espuma aislante' },
            { nombre: 'Omegas y uñas' },
          ],
        },
      ]),
      mkChecklist('b_mini_pasos', 'Pasos de Instalación, Pruebas y Entrega', [
        'Definir ubicación de unidad interior y exterior (ménsula o techo)',
        'Instalar plantilla interior centrada, alineada, nivelada y dejando respiración superior',
        'Perforar pared usando aspiradora para no propagar polvo',
        'Unir líneas de gas asegurando conectores firmes y formar caracol junto al compresor',
        'Colocar uñas o tubo para desagüe; en tubería exterior separar del piso con canal unistrut y abrazaderas',
        'Hacer conexiones eléctricas entre unidad interior/exterior y hacia protección termomagnética',
        { texto: 'Hacer vacío en líneas de gas por 10–15 minutos para asegurar que no haya filtraciones', critico: true },
        'Colocar espuma aislante, cinta momia encima y cinta poliken sobre la cinta momia',
        'Aplicar plastilina en agujero y poner cubierta de PVC para taparlo',
        'Abrir líneas de gas, encender equipo y validar temperatura con pistola térmica',
        'Recoger basura/escombro, limpiar equipos y entregar al cliente control remoto, manuales y filtros',
      ]),
    ],
  },
];

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database,
    user: 'inttec_admin',
    password: process.env.INTTEC_DB_PASSWORD || '',
  });

  try {
    console.log(`[Seed Guías] Conectando a ${database}...`);
    const sqlPath = path.resolve(__dirname, '../BaseDatos_Guias.sql');
    const schemaSql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(schemaSql);
    console.log('[Seed Guías] Esquema y categorías verificadas.');

    const { rows: cats } = await pool.query('SELECT id, nombre FROM guias_categorias');
    const catMap = new Map(cats.map((c) => [c.nombre.toLowerCase(), c.id]));

    for (const g of GUIAS_SEED) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM guias WHERE LOWER(titulo) = LOWER($1) LIMIT 1',
        [g.titulo]
      );
      const categoriaId = catMap.get(g.categoriaNombre.toLowerCase()) || null;
      const textoBusqueda = extractSearchText(g.titulo, g.subtitulo, g.bloques);

      if (existing.length > 0) {
        console.log(`[Seed Guías] Ya existe: "${g.titulo}" (omitida).`);
        continue;
      }

      await pool.query(
        `INSERT INTO guias
          (categoria_id, titulo, subtitulo, tipo, icono, bloques, texto_busqueda, destacada, publicada, orden, creado_por_nombre, actualizado_por_nombre)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, TRUE, $9, 'Sistema Seed', 'Sistema Seed')`,
        [
          categoriaId,
          g.titulo,
          g.subtitulo,
          g.tipo,
          g.icono,
          JSON.stringify(g.bloques),
          textoBusqueda,
          g.destacada,
          g.orden,
        ]
      );
      console.log(`[Seed Guías] Insertada: "${g.titulo}".`);
    }

    const { rows: countRows } = await pool.query(
      'SELECT (SELECT COUNT(*) FROM guias_categorias) AS categorias, (SELECT COUNT(*) FROM guias) AS guias'
    );
    console.log('[Seed Guías] Resumen final:', countRows[0]);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[Seed Guías] Error:', err.message || err);
  process.exit(1);
});
