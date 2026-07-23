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

/**
 * Ejecuta una petición HTTP a la API de Gemini pero devuelve el JSON completo en lugar de solo texto.
 * Esto es necesario para Function Calling (Tools).
 */
async function callGeminiRaw(requestBody: any): Promise<any> {
  if (!GEMINI_API_KEY) {
    throw new Error('La clave API de Gemini no está configurada.');
  }

  let lastErrorMsg = '';

  for (const model of FALLBACK_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorText = await response.text();
        logger.warn(`Modelo Gemini ${model} falló en callGeminiRaw: ${errorText}`);
        lastErrorMsg = `Respuesta ${response.status}`;
      }
    } catch (err: any) {
      logger.warn(`Excepción en callGeminiRaw a modelo ${model}:`, err);
      lastErrorMsg = err.message || 'Error de conexión';
    }
  }

  throw new Error(`Error en la llamada a la IA (${lastErrorMsg}).`);
}


/**
 * Elimina propiedades pesadas e irrelevantes para ahorrar tokens en la IA
 */
function minifyData(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(minifyData);
  }
  if (typeof data === 'object') {
    const minified = { ...data };
    
    // Lista de campos largos o irrelevantes a eliminar
    const keysToRemove = [
      'factura_url', 'comprobante_url', 'evidencia_url', 'fotografia_url',
      'factura_base64', 'comprobante_base64', 
      'created_at', 'updated_at', 'deleted_at',
      'device_info'
    ];
    
    keysToRemove.forEach(k => delete minified[k]);

    // Recortar campos de justificación si son excesivamente largos
    if (minified.justificacion && typeof minified.justificacion === 'string' && minified.justificacion.length > 500) {
      minified.justificacion = minified.justificacion.substring(0, 500) + '...';
    }

    // Iterar sub-objetos
    for (const key in minified) {
      if (typeof minified[key] === 'object') {
        minified[key] = minifyData(minified[key]);
      }
    }
    
    return minified;
  }
  return data;
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
TU OBJETIVO ES RESPONDER CON EXACTITUD A LAS CONSULTAS DEL ADMINISTRADOR. NO TIENES LA BASE DE DATOS EN TU PROMPT, DEBES USAR TUS HERRAMIENTAS (Function Calling) PARA BUSCAR DATOS ESPECÍFICOS CUANDO SE TE PREGUNTE.

Herramientas disponibles que puedes usar si es necesario:
- obtener_resumen_financiero: Muestra el total de registros.
- buscar_gastos: Filtra gastos (por empleado, categoría, empresa).
- buscar_ventas: Busca proyectos y ventas.
- buscar_asistencias: Busca entradas/salidas en el checador.

REGLAS DE RESPUESTA:
- Sé analítico, preciso y profesional.
- Usa Markdown (negritas para totales/nombres y viñetas) para facilitar la lectura.
- Muestra siempre montos en MXN ($).
- Responde de manera clara y amigable.
`;

    // Herramientas de Gemini
    const geminiTools = [{
      functionDeclarations: [
        {
          name: "obtener_resumen_financiero",
          description: "Obtiene información general sobre cuántos datos hay cargados y datos consolidados",
        },
        {
          name: "buscar_gastos",
          description: "Busca gastos en la base de datos de Inttec o Daravisa según los filtros proporcionados",
          parameters: {
            type: "OBJECT",
            properties: {
              empresa: { type: "STRING", description: "Filtra por empresa (Inttec, Daravisa)" },
              empleado_nombre: { type: "STRING", description: "Filtra por el nombre del empleado (ej. 'Carlos')" },
              categoria: { type: "STRING", description: "Filtra por categoría del gasto" },
              status: { type: "STRING", description: "Filtra por status (PENDING, APPROVED, REJECTED)" }
            }
          }
        },
        {
          name: "buscar_ventas",
          description: "Busca ventas o proyectos",
          parameters: {
            type: "OBJECT",
            properties: {
              empresa: { type: "STRING", description: "Filtra por empresa" },
              cliente: { type: "STRING", description: "Filtra por nombre del cliente" }
            }
          }
        },
        {
          name: "buscar_asistencias",
          description: "Busca los registros del checador (asistencias)",
          parameters: {
            type: "OBJECT",
            properties: {
              empleado_nombre: { type: "STRING", description: "Filtra por nombre de empleado" },
            }
          }
        }
      ]
    }];

    // Implementación local de las herramientas
    const localTools: Record<string, Function> = {
      obtener_resumen_financiero: () => {
        return {
          datos_empresa_actual_autenticada: { 
            empresa: contextData.datos_empresa_actual_autenticada?.empresa,
            total_gastos: contextData.datos_empresa_actual_autenticada?.gastos?.length || 0,
            total_ventas: contextData.datos_empresa_actual_autenticada?.ventas?.length || 0,
            total_empleados: contextData.datos_empresa_actual_autenticada?.usuarios?.length || 0
          },
          datos_empresa_inttec: { 
            total_gastos: contextData.datos_empresa_inttec?.gastos?.length || 0,
          },
          datos_empresa_daravisa: { 
            total_gastos: contextData.datos_empresa_daravisa?.gastos?.length || 0,
          }
        };
      },
      buscar_gastos: (args: any) => {
        let gastos: any[] = [];
        if (args.empresa?.toLowerCase() === 'daravisa' && contextData.datos_empresa_daravisa) gastos = contextData.datos_empresa_daravisa.gastos;
        else if (args.empresa?.toLowerCase() === 'inttec' && contextData.datos_empresa_inttec) gastos = contextData.datos_empresa_inttec.gastos;
        else gastos = contextData.datos_empresa_actual_autenticada?.gastos || [];

        if (args.empleado_nombre) gastos = gastos.filter(g => g.empleado_nombre?.toLowerCase().includes(args.empleado_nombre.toLowerCase()));
        if (args.categoria) gastos = gastos.filter(g => g.categoria?.toLowerCase().includes(args.categoria.toLowerCase()));
        if (args.status) gastos = gastos.filter(g => g.status === args.status);
        
        return minifyData(gastos).slice(0, 50); // Límite para proteger los tokens
      },
      buscar_ventas: (args: any) => {
        let ventas: any[] = [];
        if (args.empresa?.toLowerCase() === 'daravisa' && contextData.datos_empresa_daravisa) ventas = contextData.datos_empresa_daravisa.ventas;
        else if (args.empresa?.toLowerCase() === 'inttec' && contextData.datos_empresa_inttec) ventas = contextData.datos_empresa_inttec.ventas;
        else ventas = contextData.datos_empresa_actual_autenticada?.ventas || [];

        if (args.cliente) ventas = ventas.filter(v => v.cliente?.toLowerCase().includes(args.cliente.toLowerCase()));
        return minifyData(ventas).slice(0, 30);
      },
      buscar_asistencias: (args: any) => {
        let asist: any[] = contextData.datos_empresa_actual_autenticada?.asistencias || [];
        if (args.empleado_nombre) asist = asist.filter(a => a.empleado_nombre?.toLowerCase().includes(args.empleado_nombre.toLowerCase()));
        return minifyData(asist).slice(0, 30);
      }
    };

    // Convert history to Gemini API format
    const formattedContents: any[] = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Add the new user message
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    try {
      let limitIterations = 5;
      
      while (limitIterations > 0) {
        limitIterations--;
        const requestBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: formattedContents,
          tools: geminiTools,
          generationConfig: { temperature: 0.2 }
        };

        const res = await callGeminiRaw(requestBody);
        const part = res?.candidates?.[0]?.content?.parts?.[0];

        if (part?.functionCall) {
          const { name, args } = part.functionCall;
          
          formattedContents.push({
            role: 'model',
            parts: [{ functionCall: { name, args } }]
          });

          let resultData = null;
          if (localTools[name]) {
            resultData = localTools[name](args || {});
          } else {
            resultData = { error: "Herramienta no encontrada o no implementada" };
          }

          formattedContents.push({
            role: 'function',
            parts: [{
              functionResponse: {
                name,
                response: { name, content: resultData }
              }
            }]
          });
        } else if (part?.text) {
          return part.text;
        } else {
          return "Lo siento, no pude encontrar esa información de forma clara.";
        }
      }
      return "El asistente tomó demasiado tiempo tratando de recolectar la información, inténtalo de nuevo con una pregunta más específica.";
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
1. El empleado ÚNICAMENTE puede consultar información sobre sus propios gastos y registros personales provistos en tu contexto inicial o mediante herramientas.
2. Si el empleado pregunta por finanzas generales de la empresa, ventas de la empresa o datos de otros empleados, responde educadamente que no tienes acceso a esa información por políticas de privacidad.
3. Responde siempre con amabilidad, claridad y precisión usando Markdown (listas con viñetas y negritas).
4. NO tienes los manuales de instalación técnicos en tu memoria inmediata. Para responder sobre instalación de minisplits o paneles solares, DEBES usar obligatoriamente la herramienta "consultar_manual_tecnico".

--- REGISTROS PERSONALES DEL EMPLEADO ---
${JSON.stringify(minifyData(employeeData))}
--- FIN DEL CONTEXTO ---
`;

    // Herramientas de Gemini para el Empleado
    const geminiTools = [{
      functionDeclarations: [
        {
          name: "consultar_manual_tecnico",
          description: "Consulta el checklist oficial de la empresa para instalación de equipos (minisplits, paneles solares). Úsalo cuando el empleado pida guía sobre instalación, procedimientos técnicos o lista de materiales.",
          parameters: {
            type: "OBJECT",
            properties: {
              tema: { type: "STRING", description: "El tema a consultar. Ejemplos: 'minisplit', 'paneles'" }
            },
            required: ["tema"]
          }
        }
      ]
    }];

    // Diccionario de manuales
    const manuales: Record<string, string> = {
      minisplit: `📋 CHECK LIST MINISPLITS (INSTALACIÓN Y MATERIALES)
Pasos de Instalación:
1. Definir la ubicación de la unidad interior y exterior.
2. Definir si va a llevar ménsula para soporte exterior.
3. Instalar plantilla de Unidad interior centrada, alineada y nivelada.
4. Tomar en cuenta la altura para dejar respiración superior.
5. Hacer la Perforación de la pared (usando aspiradora).
6. Unir líneas de gas, conectores firmes.
7. Colocar tubo para el desagüe del mini Split.
8. Formar un caracol junto al compresor.
9. Conexiones eléctricas interior/exterior y protección termomagnética.
10. Separar tubería del piso con canal unistrut y abrazaderas.
11. Hacer vacío en las líneas de gas por 10-15 minutos.
12. Aplicar espuma aislante, cinta momia y cinta Poliken.
13. Aplicar plastilina y cubierta PVC en agujero.
14. Abrir líneas de gas y encender equipo. Validar temperatura.
15. Recoger escombro, limpiar y entregar a cliente.

Materiales: Taladro rotomartillo SDS Max, broca 2" o 1 1/2, taquetes/tornillos 5/16 o 1/4, manómetros, llaves cresent/pericas/allen, escalera, cinta poliken/momia, bomba vacío, desarmadores y pinzas aisladas, multímetro, pistola temperatura.`,
      paneles: `📋 CHECK LIST PANELES SOLARES (1ER VISITA Y MATERIALES)
Pasos de Instalación:
1. Revisar espacio, orientación y rutas para cableado eléctrico y tubería DC.
2. Revisar sombras, orientación al SUR e inclinación 28 grados.
3. Confirmar anclaje (taquete químico o barrenancla).
4. Asegurar 220V en domicilio. Poner varilla a tierra física.
5. Perforaciones para LFOOT con sellador. Apretar todos los tornillos.
6. Impermeabilizar patas. Montar paneles cuidando escuadra.
7. Usar calibre 12 AWG DC por tubería y fotovoltaico expuesto.
8. Usar mínimo calibre 10 para corriente alterna (inversor a centro carga).
9. Usar cable prefabricado MC4 para conexiones DC.
10. Separación mínima 30 cm para inversor.
11. Pruebas de resistencia a barrenanclas.
12. Conectar paneles en serie: ROJO + Y NEGRO - (Verde tierra).
13. Revisar polaridad DC. Colocar registro hermético en pata.
14. Tomar fotografías de evidencia para CFE.

Materiales: SDS plus (brocas 3/8 y 1/2), Lfoot, Tilt conector, Climber, Rail conector, EndClamp, MidClamp, Groundy. Cables calibres 10 y 12. Canal unistrut. Impermeabilizante. Varilla tierra.`
    };

    const localTools: Record<string, Function> = {
      consultar_manual_tecnico: (args: any) => {
        const tema = (args.tema || '').toLowerCase();
        if (tema.includes('minisplit') || tema.includes('clima') || tema.includes('aire')) {
          return manuales['minisplit'];
        }
        if (tema.includes('panel') || tema.includes('solar')) {
          return manuales['paneles'];
        }
        return "Manual no encontrado para ese tema. Solo tenemos: minisplits y paneles solares.";
      }
    };

    // Convert history to Gemini API format
    const formattedContents: any[] = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    try {
      let limitIterations = 3; // Menos iteraciones para el empleado
      
      while (limitIterations > 0) {
        limitIterations--;
        const requestBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: formattedContents,
          tools: geminiTools,
          generationConfig: { temperature: 0.2 }
        };

        const res = await callGeminiRaw(requestBody);
        const part = res?.candidates?.[0]?.content?.parts?.[0];

        if (part?.functionCall) {
          const { name, args } = part.functionCall;
          
          formattedContents.push({
            role: 'model',
            parts: [{ functionCall: { name, args } }]
          });

          let resultData = null;
          if (localTools[name]) {
            resultData = localTools[name](args || {});
          } else {
            resultData = { error: "Herramienta no encontrada" };
          }

          formattedContents.push({
            role: 'function',
            parts: [{
              functionResponse: {
                name,
                response: { name, content: resultData }
              }
            }]
          });
        } else if (part?.text) {
          return part.text;
        } else {
          return "Lo siento, no pude procesar esa solicitud.";
        }
      }
      return "El sistema tardó demasiado, inténtalo nuevamente.";
    } catch (err: any) {
      logger.error('Error en chatWithEmployeeContext:', err);
      throw new Error(err.message || 'No se pudo procesar tu consulta.');
    }
  }
};
