import { logger } from '../utils/logger';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

const FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

export interface GeminiOcrResult {
  monto: number | null;
  proveedor: string | null;
  sucursal: string | null;
  fecha: string | null;
  metodo_pago: 'efectivo' | 'tarjeta_debito' | 'tarjeta_credito' | null;
  justificacion_sugerida: string | null;
  categoria: string | null;
  subcategoria: string | null;
  alerta_politica: string | null;
  estado: string | null;
}

export interface CardTransaction {
  fecha: string | null;        // YYYY-MM-DD
  monto: number | null;
  descripcion: string | null;  // comercio / concepto
  tipo: 'cargo' | 'abono' | 'desconocido';
}

export interface CardStatementResult {
  periodo_inicio: string | null;  // YYYY-MM-DD
  periodo_fin: string | null;     // YYYY-MM-DD
  titular: string | null;
  numero_tarjeta_parcial: string | null; // últimos 4 dígitos
  transacciones: CardTransaction[];
}

export interface GeminiSalesResult {
  informacion_general: {
    fecha: string | null;
    cliente: string | null;
    factura_o_referencia: string | null;
    tipo_de_proyecto: string | null;
    proveedor: string | null;
    descripcion: string | null;
  };
  partidas_o_productos: {
    descripcion: string;
    cantidad: number;
    unidad: string;
    precio_unitario_venta: number;
    costo_unitario_proveedor: number;
    precio_total_venta: number;
    costo_total_proveedor: number;
  }[];
  totales_calculados: {
    precio_total_facturado: number;
    costo_total: number;
    utilidad_bruta: number;
    margen_porcentual: number;
  };
}

/**
 * Limpia y parsea de forma robusta la respuesta JSON de Gemini.
 */
function cleanAndParseJson<T>(rawText: string): T {
  let cleanJsonStr = rawText.trim();

  // 1. Quitar bloques de código markdown si los hay
  const markdownMatch = cleanJsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch) {
    cleanJsonStr = markdownMatch[1].trim();
  }

  // 2. Extraer el primer objeto o arreglo JSON contando llaves/corchetes de manera robusta
  const firstBrace = cleanJsonStr.indexOf('{');
  const firstBracket = cleanJsonStr.indexOf('[');

  let startIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let endIdx = -1;

    for (let i = startIdx; i < cleanJsonStr.length; i++) {
      const char = cleanJsonStr[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{' || char === '[') {
          braceCount++;
        } else if (char === '}' || char === ']') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      cleanJsonStr = cleanJsonStr.substring(startIdx, endIdx + 1);
    } else {
      // Fallback a extracción simple
      const lastBrace = cleanJsonStr.lastIndexOf('}');
      const lastBracket = cleanJsonStr.lastIndexOf(']');
      const fallbackEnd = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket) ? lastBrace : lastBracket;
      if (fallbackEnd !== -1 && fallbackEnd >= startIdx) {
        cleanJsonStr = cleanJsonStr.substring(startIdx, fallbackEnd + 1);
      }
    }
  }

  // 3. Eliminar comentarios
  cleanJsonStr = cleanJsonStr.replace(/("([^"\\]|\\.)*")|(\/\/.*)|(\/\*[\s\S]*?\*\/)/g, (match, g1) => {
    if (g1 !== undefined) return match;
    return "";
  });

  // 4. Eliminar comas sueltas finales (trailing commas)
  cleanJsonStr = cleanJsonStr.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleanJsonStr) as T;
  } catch (e: any) {
    logger.error('Failed to parse Gemini output:', cleanJsonStr);
    throw new Error('Error al interpretar la respuesta de la IA: ' + e.message);
  }
}

/**
 * Ejecuta una petición HTTP a la API de Gemini intentando con modelos en cascada (fallback).
 */
async function callGeminiAPI(requestBody: any): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('La clave API de Gemini no está configurada.');
  }

  let lastErrorMsg = '';

  for (const model of FALLBACK_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const resData = await response.json();
        const textResult = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          return textResult.trim();
        }
      } else {
        const errorText = await response.text();
        logger.warn(`Modelo Gemini ${model} falló con código ${response.status}: ${errorText}`);
        lastErrorMsg = `Respuesta ${response.status}`;
      }
    } catch (err: any) {
      logger.warn(`Excepción en petición a modelo ${model}:`, err);
      lastErrorMsg = err.message || 'Error de conexión';
    }
  }

  throw new Error(`No se pudo procesar la imagen con la Inteligencia Artificial (${lastErrorMsg}). Intenta de nuevo con una foto más clara.`);
}

export const GeminiService = {
  async scanTicket(base64Image: string, cantidadPersonas: number = 1, mimeType: string = 'image/jpeg'): Promise<GeminiOcrResult> {
    const prompt = `Analiza la imagen de este ticket de compra de gastos. Extrae y devuelve un objeto JSON puro (sin formato markdown ni bloques de código, solo el texto del JSON) con las siguientes propiedades:
{
  "monto": number (monto total del ticket incluyendo centavos/decimales de forma exacta, no redondees el valor, si no es legible o no hay, usa null),
  "proveedor": string (nombre del establecimiento o proveedor, si no hay usa null),
  "sucursal": string (nombre de la sucursal o filial si aparece en el ticket, si no usa null),
  "fecha": string (la fecha de compra o emisión del ticket en formato DD/MM/AAAA, si no es legible o no hay, usa null),
  "metodo_pago": string (debe ser exactamente uno de estos valores: "efectivo", "tarjeta_debito", "tarjeta_credito". Identifícalo según el ticket por palabras como "EFECTIVO", "PAGO EN EFECTIVO", "DÉBITO", "CRÉDITO", "VISA", "MASTERCARD", "DEBIT", "CREDIT". Si no se puede determinar o no dice, usa null),
  "justificacion_sugerida": string (una breve sugerencia de justificación comercial en español basada en los artículos comprados o el establecimiento, ej: "Consumo de alimentos en comisión de trabajo" o "Compra de herramientas de trabajo" o "Hospedaje por viaje de trabajo", si no se puede determinar usa null),
  "categoria": string (categoría sugerida del gasto. REGLA DE CLASIFICACIÓN ESTRICTA: Si es de ferretería, Home Depot, herramientas, plomería o materiales, usa "Materiales y Herramientas". Si es de hotel, posada, Airbnb u hospedaje, usa "Hospedaje". Si es de gasolinera o combustible, usa "Vehículos". Si es de restaurante, cafetería o fonda, usa "Alimentos"),
  "subcategoria": string (subcategoría específica sugerida de acuerdo a la categoría anterior, ej: Desayuno, Herramientas, Hospedaje, Gasolina, Hojas bond, si no hay usa null),
  "estado": string (debe ser exactamente uno de los 32 estados de la República Mexicana: Aguascalientes, Baja California, Baja California Sur, Campeche, Chiapas, Chihuahua, Coahuila, Colima, Ciudad de México, Durango, Guanajuato, Guerrero, Hidalgo, Jalisco, Estado de México, Michoacán, Morelos, Nayarit, Nuevo León, Oaxaca, Puebla, Querétaro, Quintana Roo, San Luis Potosí, Sinaloa, Sonora, Tabasco, Tamaulipas, Tlaxcala, Veracruz, Yucatán, Zacatecas. Identifícalo de forma inteligente según la dirección, RFC, código postal, sucursal, teléfono o texto del ticket. Si no se puede determinar usa null),
  "alerta_politica": string (Genera una alerta descriptiva en español si detectas alguna de las siguientes infracciones:
  - Consumo de alcohol/bebidas alcohólicas, cigarros o tabaco (totalmente prohibido).
  - Consumo de dulces, chocolates, galletas, chucherías o comida chatarra (como papitas, papas fritas, frituras, gomitas, etc.). Nota: La compra de refrescos/bebidas gaseosas normales SÍ está permitida y NO debe generar alerta.
  - REGLA DE LÍMITE DE MONTO: El límite de $${280 * cantidadPersonas} MXN ($280 por persona) APLICA ÚNICA Y EXCLUSIVAMENTE A GASTOS ESTRICTAMENTE DE ALIMENTOS / COMIDA / RESTAURANTE. NUNCA, BAJO NINGUNA CIRCUNSTANCIA, GENERES ALERTA DE LÍMITE DE $280 MXN PARA GASTOS DE HERRAMIENTAS, MATERIALES, HOSPEDAJE, HOTELES, GASOLINA O PEAJES, SIN IMPORTAR EL MONTO.
  Si no detectas ninguna de estas infracciones de política, usa null)
}`;

    // Limpieza estricta del string base64
    let cleanBase64 = base64Image;
    let detectedMime = mimeType;
    const dataUrlMatch = base64Image.match(/^data:([a-zA-Z0-9+\-./]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      detectedMime = dataUrlMatch[1];
      cleanBase64 = dataUrlMatch[2];
    }
    cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, '');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: detectedMime,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      const parsed = cleanAndParseJson<GeminiOcrResult>(textResult);

      return {
        monto: typeof parsed.monto === 'number' ? parsed.monto : (parsed.monto ? Number(parsed.monto) || null : null),
        proveedor: parsed.proveedor ?? null,
        sucursal: parsed.sucursal ?? null,
        fecha: parsed.fecha ?? null,
        metodo_pago: parsed.metodo_pago ?? null,
        justificacion_sugerida: parsed.justificacion_sugerida ?? null,
        categoria: parsed.categoria ?? null,
        subcategoria: parsed.subcategoria ?? null,
        alerta_politica: parsed.alerta_politica ?? null,
        estado: parsed.estado ?? null,
      };
    } catch (err: any) {
      logger.error('Error en scanTicket:', err);
      throw new Error(err.message || 'Error al procesar el ticket con Inteligencia Artificial.');
    }
  },

  async generateTechnicalSummary(
    antesBase64: string | null,
    despuesBase64: string | null,
    detalles: {
      cliente: string;
      descripcion_trabajo: string;
      materiales_usados?: string | null;
      observaciones?: string | null;
      trabajos?: { descripcion: string; materiales?: string | null; observaciones?: string | null; solucion?: string | null }[];
    }
  ): Promise<string> {
    let trabajosFormatted = '';
    if (detalles.trabajos && detalles.trabajos.length > 0) {
      trabajosFormatted = detalles.trabajos.map((t, idx) => `
Trabajo #${idx + 1}:
- Descripción: ${t.descripcion}
- Materiales utilizados: ${t.materiales || 'Ninguno'}
- Solución: ${t.solucion || t.observaciones || 'Ninguna'}
`).join('\n');
    } else {
      trabajosFormatted = `
Trabajo Realizado:
- Descripción: ${detalles.descripcion_trabajo}
- Materiales utilizados: ${detalles.materiales_usados || 'Ninguno'}
- Solución: ${detalles.observaciones || 'Ninguna'}`;
    }

    const prompt = `Actúa como un supervisor técnico o auditor de control de calidad. Analiza la información y las fotos de evidencia proporcionadas (del ANTES y DESPUÉS del trabajo) y genera un reporte técnico formal, conciso y profesional en español.

Detalles del servicio registrado:
- Cliente / Ubicación: ${detalles.cliente}
${trabajosFormatted}

Instrucciones para el reporte:
1. Analiza visualmente las fotos del "Antes" (si se proporciona) y del "Después" (si se proporciona) y compáralas.
2. Redacta un reporte muy breve, directo y estructurado (máximo 120-150 palabras). Si hay múltiples trabajos, sintetiza la información de forma unificada pero clara.
3. Utiliza formato markdown simple:
   - Usa **negritas** para resaltar subtítulos (ej: **Resumen de Trabajo**, **Resultado Visual**, **Conclusiones**).
   - Usa viñetas (- ) para enumerar puntos clave si es necesario.
4. El tono debe ser formal y técnico. Evita introducciones o saludos. Debe ser muy sintetizado para que el reporte impreso final quepa en una sola página.
5. Devuelve únicamente el texto del reporte en markdown limpio.`;

    const parts: any[] = [{ text: prompt }];

    if (antesBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: antesBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n\s]/g, ''),
        },
      });
    }

    if (despuesBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: despuesBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n\s]/g, ''),
        },
      });
    }

    const requestBody = {
      contents: [
        {
          parts: parts,
        },
      ],
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      return textResult;
    } catch (err: any) {
      logger.error('Error en generateTechnicalSummary:', err);
      throw new Error(err.message || 'Error al generar el reporte técnico con Inteligencia Artificial.');
    }
  },

  async extractInvoiceProducts(
    base64File: string,
    mimeType: string,
    catalogoMaestroJson: string
  ): Promise<{
    factura_metadata: {
      proveedor_original: string | null;
      fecha_compra: string | null;
      folio_factura: string | null;
      rfc_emisor: string | null;
    };
    partidas_extraidas: {
      descripcion_proveedor: string;
      cantidad: number;
      unidad: string;
      precio_unitario: number;
      clasificacion_ia: {
        categoria_maestra: string;
        producto_normalizado: string | null;
        confianza_mapeo: number;
        requiere_revision: boolean;
      };
    }[];
  }> {
    const prompt = `Eres un agente experto en análisis de datos y normalización de inventarios para la plataforma corporativa Portal Inttec. 

Tu tarea es analizar la factura o recibo de compra adjunto (en formato PDF o imagen) y extraer las partidas de productos, ignorando servicios, cargos por envío o pagos electrónicos.

REGLAS DE EXTRACCIÓN Y MAPEO:
1. Extrae la cantidad, la unidad de medida, el precio unitario y la descripción original EXACTA del proveedor.
2. Compara la descripción original del proveedor con nuestro Catálogo Maestro de Productos.
3. Encuentra la coincidencia lógica más cercana, incluso si el proveedor usa abreviaturas, sinónimos o un orden de palabras diferente.
4. Asigna la "categoria_maestra" y el "producto_normalizado" basándote ÚNICAMENTE en el Catálogo Maestro proporcionado.
5. Evalúa tu nivel de certeza en el mapeo con un "confianza_mapeo" (un valor decimal de 0.0 a 1.0). 
6. Si la coincidencia no es clara o la confianza es menor a 0.80, marca "requiere_revision" como true.
7. Si el producto definitivamente no existe en el catálogo, deja "producto_normalizado" en null, asigna la categoría más lógica y marca "requiere_revision" como true.

CATÁLOGO MAESTRO DE REFERENCIA:
${catalogoMaestroJson}

FORMATO DE SALIDA:
Debes responder ESTRICTAMENTE con un objeto JSON válido, sin formato Markdown adicional (sin \`\`\`json), usando la siguiente estructura:

{
  "factura_metadata": {
    "proveedor_original": "Nombre del proveedor",
    "fecha_compra": "YYYY-MM-DD",
    "folio_factura": "Número o folio",
    "rfc_emisor": "RFC si está disponible"
  },
  "partidas_extraidas": [
    {
      "descripcion_proveedor": "TEXTO ORIGINAL DEL PROVEEDOR",
      "cantidad": 0,
      "unidad": "PIEZA/METRO/ETC",
      "precio_unitario": 0.00,
      "clasificacion_ia": {
        "categoria_maestra": "Categoría del Catálogo",
        "producto_normalizado": "Nombre oficial del Catálogo o null",
        "confianza_mapeo": 0.95,
        "requiere_revision": false
      }
    }
  ]
}`;

    const cleanBase64 = base64File.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '').replace(/[\r\n\s]/g, '');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      return cleanAndParseJson<any>(textResult);
    } catch (err: any) {
      logger.error('Error en extractInvoiceProducts:', err);
      throw new Error(err.message || 'Error al procesar la factura con Inteligencia Artificial.');
    }
  },

  async analyzeInvoiceSales(
    base64File: string,
    mimeType: string
  ): Promise<GeminiSalesResult> {
    const prompt = `Rol: Eres un asistente experto en contabilidad y extracción de datos de facturas de compra.

Tarea: Analiza el documento adjunto (imagen o PDF). Este es una ORDEN DE COMPRA (PO) o pedido de un cliente. Los precios que aparecen en el documento representan el monto que el cliente nos va a pagar, es decir, el PRECIO DE VENTA.

Instrucciones:
- Los precios del documento son nuestros ingresos por VENTA (precio_unitario_venta).
- El campo costo_unitario_proveedor debe ser siempre 0.
- Extrae cada producto/servicio con su descripción, cantidad, unidad de medida y precio de venta.

Reglas de extracción:
- Extrae la fecha en formato YYYY-MM-DD
- Extrae el nombre del proveedor o emisor (quien nos vendió el producto)
- Extrae el número de factura, folio, o referencia de orden
- Identifica el tipo de producto/proyecto: "Venta", "Servicio", "Paneles", "Instalación", "Mantenimiento" u otro según el contenido
- Si aparece el nombre del cliente final (a quién se le revenderá), extráelo; si no, usa null
- Extrae cada partida/producto con: descripción exacta, cantidad, unidad de medida, y precio (como precio_unitario_venta, dejando costo_unitario_proveedor en 0)

Formato de Salida: Devuelve strictly un objeto JSON con esta estructura, sin texto adicional:
{
  "informacion_general": {
    "fecha": "YYYY-MM-DD o null",
    "cliente": "Nombre del Cliente final o null",
    "factura_o_referencia": "Número de factura o ID de orden o null",
    "tipo_de_proyecto": "Venta / Servicio / Proyecto / otro",
    "proveedor": "Nombre del proveedor que nos vendió o null",
    "descripcion": "Una descripción corta o concepto general de la factura o proyecto"
  },
  "partidas_o_productos": [
    {
      "descripcion": "Nombre o descripción del producto/servicio",
      "cantidad": 1,
      "unidad": "PZA",
      "precio_unitario_venta": 0.00,
      "costo_unitario_proveedor": 0.00,
      "precio_total_venta": 0.00,
      "costo_total_proveedor": 0.00
    }
  ],
  "totales_calculados": {
    "precio_total_facturado": 0.00,
    "costo_total": 0.00,
    "utilidad_bruta": 0.00,
    "margen_porcentual": 0.00
  }
}`;

    const cleanBase64 = base64File.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '').replace(/[\r\n\s]/g, '');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      const parsed = cleanAndParseJson<GeminiSalesResult>(textResult);

      let precioTotalFacturado = 0;
      let costoTotal = 0;

      const partidasCorregidas = (parsed.partidas_o_productos || []).map(p => {
        const cant = Number(p.cantidad) || 0;
        const precioUV = Number(p.precio_unitario_venta) || 0;
        const costoUP = Number(p.costo_unitario_proveedor) || 0;
        const precioTV = Math.round(cant * precioUV * 100) / 100;
        const costoTP = Math.round(cant * costoUP * 100) / 100;

        precioTotalFacturado += precioTV;
        costoTotal += costoTP;

        return {
          ...p,
          cantidad: cant,
          precio_unitario_venta: precioUV,
          costo_unitario_proveedor: costoUP,
          precio_total_venta: precioTV,
          costo_total_proveedor: costoTP,
        };
      });

      const utilidadBruta = Math.round((precioTotalFacturado - costoTotal) * 100) / 100;
      const margen = precioTotalFacturado > 0
        ? Math.round((utilidadBruta / precioTotalFacturado) * 10000) / 10000
        : 0;

      return {
        informacion_general: {
          fecha: parsed.informacion_general?.fecha ?? null,
          cliente: parsed.informacion_general?.cliente ?? null,
          factura_o_referencia: parsed.informacion_general?.factura_o_referencia ?? null,
          tipo_de_proyecto: parsed.informacion_general?.tipo_de_proyecto ?? null,
          proveedor: parsed.informacion_general?.proveedor ?? null,
          descripcion: parsed.informacion_general?.descripcion ?? null,
        },
        partidas_o_productos: partidasCorregidas,
        totales_calculados: {
          precio_total_facturado: precioTotalFacturado,
          costo_total: costoTotal,
          utilidad_bruta: utilidadBruta,
          margen_porcentual: margen,
        },
      };
    } catch (err: any) {
      logger.error('Error en analyzeInvoiceSales:', err);
      throw new Error(err.message || 'Error al procesar la factura de venta con Inteligencia Artificial.');
    }
  },

  async analyzeCardStatement(
    base64File: string,
    mimeType: string
  ): Promise<CardStatementResult> {
    const prompt = `Eres un experto en análisis de estados de cuenta bancarios y tarjetas corporativas. Analiza el documento adjunto (PDF o imagen de un estado de cuenta de tarjeta de crédito o débito) y extrae TODAS las transacciones que aparezcan.

INSTRUCCIONES:
1. Extrae TODAS las filas de movimientos/transacciones visibles, sin omitir ninguna.
2. Para cada transacción identifica: fecha, monto, descripción del comercio/concepto, y si es cargo (-) o abono (+).
3. Normaliza las fechas al formato YYYY-MM-DD. Si el año no aparece, infiere el año más probable según el período del estado.
4. Los montos deben ser siempre positivos en el campo "monto"; usa el campo "tipo" para indicar si es cargo o abono.
5. Si no puedes determinar si es cargo o abono, usa "desconocido".
6. Intenta identificar el período de corte, el nombre del titular y los últimos 4 dígitos de la tarjeta.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta (sin markdown, sin texto adicional):
{
  "periodo_inicio": "YYYY-MM-DD o null",
  "periodo_fin": "YYYY-MM-DD o null",
  "titular": "Nombre del titular o null",
  "numero_tarjeta_parcial": "Últimos 4 dígitos o null",
  "transacciones": [
    {
      "fecha": "YYYY-MM-DD o null",
      "monto": 123.45,
      "descripcion": "Nombre del comercio o concepto",
      "tipo": "cargo"
    }
  ]
}`;

    const cleanBase64 = base64File.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '').replace(/[\r\n\s]/g, '');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      const parsed = cleanAndParseJson<CardStatementResult>(textResult);

      return {
        periodo_inicio: parsed.periodo_inicio ?? null,
        periodo_fin: parsed.periodo_fin ?? null,
        titular: parsed.titular ?? null,
        numero_tarjeta_parcial: parsed.numero_tarjeta_parcial ?? null,
        transacciones: (parsed.transacciones || []).map(t => ({
          fecha: t.fecha ?? null,
          monto: Number(t.monto) || 0,
          descripcion: t.descripcion ?? null,
          tipo: (['cargo', 'abono', 'desconocido'].includes(t.tipo) ? t.tipo : 'desconocido') as CardTransaction['tipo'],
        })),
      };
    } catch (err: any) {
      logger.error('Error en analyzeCardStatement:', err);
      throw new Error(err.message || 'Error al procesar el estado de cuenta con Inteligencia Artificial.');
    }
  },

  async chatWithContext(
    message: string,
    contextData: any,
    chatHistory: { role: 'user' | 'model'; text: string }[]
  ): Promise<string> {
    const systemPrompt = `Eres el Gerente de Operaciones Virtual y Analista Financiero de Portal Inttec y Daravisa.
Tienes ACCESO COMPLETO a la base de datos de ambas empresas (Inttec y Daravisa) organizadas en el JSON provisto a continuación.

TU OBJETIVO ES RESPONDER CON EXACTITUD A LAS CONSULTAS DEL ADMINISTRADOR SOBRE LOS SIGUIENTES 6 EJES:

1. **Análisis Financiero y Gastos (Trazabilidad Total)**:
   - Calcular gastos por empleado, categoría, proveedor o rango de fechas.
   - Detectar gastos sin factura o pendientes de aprobación/comprobación.
   - Alertar sobre anomalías (aumentos bruscos de gastos en comida, viáticos o insumos).

2. **Análisis de Rentabilidad de Ventas y Proyectos**:
   - Cruzar la tabla de Ventas y Partidas con la tabla de Gastos vinculados.
   - Calcular utilidad neta y margen de ganancia porcentual de un proyecto o cliente específico.
   - Identificar cuáles han sido los proyectos/ventas más rentables.
   - Consultar el estado de entregas ("Pendiente de Entrega") o pagos ("Pendiente de Pago") por empresa (Inttec o Daravisa).

3. **Auditoría de Tarjetas y Conciliación**:
   - Analizar las auditorías de tarjetas corporativas (tabla auditorias_tarjeta).
   - Identificar transacciones sin comprobante o tickets faltantes.
   - Calcular saldos pendientes por comprobar.

4. **Control de Asistencia y Personal (Checador)**:
   - Consultar la tabla de asistencias para ver hora de entrada/salida, retards y ubicación.
   - Reportar qué empleados llegaron tarde o no registraron salida en un periodo.
   - Indicar quiénes están trabajando actualmente y su ubicación de check-in.

5. **Gestión de Vehículos y Gasolina**:
   - Calcular el rendimiento promedio en kilómetros por litro (km/l) usando el odómetro (kilometraje_actual) y los litros cargados en la tabla registro_gasolina.
   - Consultar quién fue el último empleado en cargar combustible a un vehículo por sus placas o número económico.

6. **Generación de Reportes Automáticos**:
   - Redactar resúmenes ejecutivos en texto limpios para copiar y enviar por WhatsApp.
   - Sintetizar los motivos por los que los gastos fueron rechazados (campo motivo_rechazo).

REGLAS DE RESPUESTA:
- Sé analítico, preciso y profesional.
- Usa Markdown (negritas para totales/nombres y viñetas) para facilitar la lectura.
- Si una empresa (Inttec o Daravisa) se menciona explícitamente en la pregunta, filtra únicamente los datos de esa empresa. Si no se especifica, ofrece un desglose o total unificado.
- Muestra siempre montos en MXN ($).

--- ESTRUCTURA DE BASE DE DATOS COMPLETA (INTTEC Y DARAVISA) ---
${JSON.stringify(contextData)}
--- FIN DE LA BASE DE DATOS ---
`;

    // Convert history to Gemini API format
    const formattedContents = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Add the new user message
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: formattedContents,
      generationConfig: {
        temperature: 0.2 // Low temperature for factual data analysis
      }
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      return textResult;
    } catch (err: any) {
      logger.error('Error en chatWithContext:', err);
      throw new Error(err.message || 'No se pudo generar una respuesta. Por favor intenta de nuevo.');
    }
  },

  async chatWithEmployeeContext(
    message: string,
    employeeData: any,
    chatHistory: { role: 'user' | 'model'; text: string }[]
  ): Promise<string> {
    const systemPrompt = `Eres el Asistente Técnico y Guía Operativo de Portal Inttec.
Tu función es ayudar al empleado a responder dudas sobre SUS PROPIOS GASTOS registrados y guiarlo paso a paso con los CHECKLISTS Y LISTAS DE MATERIALES / HERRAMIENTAS OFICIALES de la empresa para trabajos técnicos.

REGLAS DE SEGURIDAD Y PRIVACIDAD:
1. El empleado ÚNICAMENTE puede consultar información sobre sus propios gastos y registros personales provistos en el JSON.
2. Si el empleado pregunta por finanzas generales de la empresa, ventas de la empresa o datos de otros empleados, responde educadamente que no tienes acceso a esa información por políticas de privacidad.
3. Responde siempre con amabilidad, claridad y precisión usando Markdown (listas con viñetas y negritas).

--- CONOCIMIENTO TÉCNICO OFICIAL DE LA EMPRESA (CHECKLISTS Y MATERIALES) ---

📋 **CHECK LIST MINISPLITS (INSTALACIÓN Y MATERIALES)**
Pasos de Instalación:
1. Definir la ubicación de la unidad interior.
2. Definir la ubicación de la unidad exterior.
3. Definir si va a llevar ménsula para el soporte de la unidad exterior o si se va a colocar en el techo.
4. Instalar plantilla de Unidad interior centrada, alineada y nivelada.
5. Tomar en cuenta la altura del mini para dejar respiración en la parte superior del equipo.
6. Hacer la Perforación de la pared, utilizando aspiradora para no propagar el polvo.
7. Unir líneas de gas, asegurando que los conectores queden firmes.
8. Colocar ya sea uñas o un tramo de tubo para el desagüe del mini Split.
9. Formar un caracol junto al compresor.
10. Hacer conexiones eléctricas, entre unidad interior y exterior.
11. Instalar protección termomagnética.
12. Hacer conexiones eléctricas de unidad exterior a protección termomagnética.
13. En caso de usar tubería, separarla del piso con canal unistrut, usar siempre abrazaderas.
14. Hacer vacío en las líneas de gas por 10-15 minutos para asegurar que no haya filtraciones.
15. Asegurar que tengan espuma aislante las líneas.
16. Aplicar cinta momia a las Líneas sobre la espuma aislante.
17. Aplicar cinta Poliken sobre la cinta Momia.
18. Aplicar plastilina en agujero.
19. Poner cubierta de PVC para tapar agujero.
20. Abrir líneas de gas.
21. Encender equipo.
22. Validar temperatura con pistola térmica.
23. Recoger basura y escombro.
24. Limpiar equipos.
25. Entregar a cliente: control remoto, manuales y filtros (Firma Conformidad).

Lista de Materiales y Herramientas a Considerar para Minisplits:
- Taladro rotomartillo SDS Max para la perforación de las líneas
- Broca de 2 pulgadas o 1 ½ (THOR)
- Kit de taladros inalámbricos
- Taquetes y tornillos 5/16 o 1/4 para fijar unidad interior y poner uñas
- Broca de 1/4 y 5/16
- Manómetros
- Llaves cresent y pericas
- Llaves Allen
- Escalera de tijera y de extensión (si el domicilio no tiene para subir al techo)
- Cinta poliken
- Bomba de vacío
- Desarmadores aislados
- Pinzas aisladas eléctricas
- Multímetro
- Pistola de temperatura
- Omegas y uñas
- Extensión para la bomba de vacío
- Aspiradora

---

📋 **CHECK LIST PANELES SOLARES (1ER VISITA Y MATERIALES)**
Pasos de Instalación (1er Visita):
1. Revisar espacio y orientación de los paneles para considerar accesorios y cantidad de rieles.
2. Revisar rutas para cableado eléctrico hacia tablero principal de AC.
3. Confirmar ubicación del inversor para definir rutas de tubería de DC.
4. Revisar sombras que puedan afectar a la producción, orientación al SUR e inclinación de 28 grados.
5. Revisar si se va a usar taquete químico o barrenancla.
6. Asegurar que en el domicilio ya se tenga conexión 220V (SI NO, preparar 5ta terminal y 2da fase).
7. Poner varilla a tierra física para instalación de paneles, aterrizar estructura.
8. Hacer perforaciones para LFOOT y colocar sellador dentro de la perforación para evitar goteras.
9. Revisar que todos y cada uno de los tornillos de la estructura se encuentren correctamente apretados antes de montar los paneles.
10. Impermeabilizar a conciencia todas las patas de la estructura.
11. Montar los paneles siempre cuidando la escuadra de la estructura para que no se desnivele el arreglo y se vea chueco.
12. Usar solo calibre 12 AWG para corriente directa mientras vaya por tubería y solo cable fotovoltaico cuando este esté expuesto.
13. Usar mínimo cable calibre 10 para corriente alterna para llegar de inversor a centro de carga y cable uso rudo 3x10 de centro de carga a inversor.
14. Siempre usar cable prefabricado MC4 para las conexiones de centro de carga DC a inversor.
15. Revisar bien el anclaje que se va a usar para montar el inversor asegurando que por nada se vaya a caer.
16. Dejar una separación mínima de 30 cm hacia los lados y hacia arriba del inversor para cuestión de garantías.
17. Ya que estén montados paneles, hacer pruebas de la resistencia de las barrenanclas para evitar que se vayan a soltar en un futuro.
18. Conectar los paneles en serie respetando código de colores: ROJO + Y NEGRO – (el cable verde siempre va a ser tierra).
19. Revisar polaridad de corriente directa antes de conectar al inversor para evitar algún daño por polaridades invertidas.
20. Colocar registro hermético de conexiones en pata de estructura con su conector glándula y sus terminales ponchables.
21. Colocar puesta a tierra en estructura y módulos.
22. Tomar fotografías de paneles instalados, etiqueta de inversor, inversor instalado, medidor y etiqueta de paneles para preparación de documentación ante CFE (Firma Conformidad).

Lista de Materiales y Herramientas a Considerar para Paneles Solares:
- SDS plus, brocas de 3/8 y 1/2 para SDS plus
- Kit taladros inalámbricos, brocas de 5/16 y 1/4
- Taquetes y tornillos de 5/16 y 1/4
- Lfoot, Tilt conector (N3), Climber (TopClip), Rail conector
- EndClamp, MidClamp, Groundy (Conector Tierra)
- Llave cresent, Llave perica, Pistola de silicón, Martillo, Desarmadores, Pinzas eléctricas, Multímetro
- Escalera de tijera, Aspiradora, Barrenanclas, Kit ponchador MC4, Esmeriladora angular, Flexómetro, Terminales ponchables
- Cable rojo, negro y verde calibre 12
- Cable negro y verde calibre 10
- Fotovoltaico rojo y negro
- Nivel, Dobla tubos, Tubería 3/4 conduit pared delgada
- Conectores compresión 3/4, Coples de compresión 3/4, Canal unistrut, Abrazaderas unistrut, Uñas, Monitores
- LB, LL, LR tipo C tipo TEE cajas Fs, Conectores glándulas, Registro de conexiones
- Prefabricados MC4, Centros de carga, Térmicos de AC, Térmicos de DC, Uso rudo 3x10
- Impermeabilizante, Varilla de tierra, Silicon

--- REGISTROS PERSONALES DEL EMPLEADO ---
${JSON.stringify(employeeData)}
--- FIN DEL CONTEXTO ---
`;

    // Convert history to Gemini API format
    const formattedContents = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: formattedContents,
      generationConfig: {
        temperature: 0.2
      }
    };

    try {
      const textResult = await callGeminiAPI(requestBody);
      return textResult;
    } catch (err: any) {
      logger.error('Error en chatWithEmployeeContext:', err);
      throw new Error(err.message || 'No se pudo procesar tu consulta.');
    }
  }
};
