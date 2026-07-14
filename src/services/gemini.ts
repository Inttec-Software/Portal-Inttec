const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

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


/**
 * Limpia y parsea de forma robusta la respuesta JSON de Gemini, eliminando markdown,
 * comentarios de una línea o multilínea, y comas finales adicionales (trailing commas).
 */
function cleanAndParseJson<T>(rawText: string): T {
  let cleanJsonStr = rawText.trim();
  
  // 1. Quitar bloques de código markdown si los hay
  const markdownMatch = cleanJsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    cleanJsonStr = markdownMatch[1].trim();
  }
  
  // 2. Extraer el primer objeto o arreglo JSON para evitar texto basura antes o después
  const firstBrace = cleanJsonStr.indexOf('{');
  const lastBrace = cleanJsonStr.lastIndexOf('}');
  const firstBracket = cleanJsonStr.indexOf('[');
  const lastBracket = cleanJsonStr.lastIndexOf(']');
  
  let startIdx = -1;
  let endIdx = -1;
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = lastBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = lastBracket;
  }
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    cleanJsonStr = cleanJsonStr.substring(startIdx, endIdx + 1);
  }
  
  // 3. Eliminar comentarios de una línea (//...) y comentarios multilínea (/*...*/)
  cleanJsonStr = cleanJsonStr.replace(/\/\/.*$/gm, '');
  cleanJsonStr = cleanJsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 4. Eliminar comas sueltas antes de un cierre de objeto o arreglo (trailing commas)
  cleanJsonStr = cleanJsonStr.replace(/,\s*([}\]])/g, '$1');
  
  try {
    return JSON.parse(cleanJsonStr) as T;
  } catch (e: any) {
    console.error('Failed to parse Gemini output:', cleanJsonStr);
    throw new Error('Error al interpretar el JSON generado por Gemini: ' + e.message);
  }
}

export const GeminiService = {
  async scanTicket(base64Image: string, cantidadPersonas: number = 1, mimeType: string = 'image/jpeg'): Promise<GeminiOcrResult> {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API Key is missing. Check your environment variables.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `Analiza la imagen de este ticket de compra de gastos. Extrae y devuelve un objeto JSON puro (sin formato markdown ni bloques de código, solo el texto del JSON) con las siguientes propiedades:
{
  "monto": number (monto total del ticket incluyendo centavos/decimales de forma exacta, no redondees el valor, si no es legible o no hay, usa null),
  "proveedor": string (nombre del establecimiento o proveedor, si no hay usa null),
  "sucursal": string (nombre de la sucursal o filial si aparece en el ticket, si no usa null),
  "fecha": string (la fecha de compra o emisión del ticket en formato DD/MM/AAAA, si no es legible o no hay, usa null),
  "metodo_pago": string (debe ser exactamente uno de estos valores: "efectivo", "tarjeta_debito", "tarjeta_credito". Identifícalo según el ticket por palabras como "EFECTIVO", "PAGO EN EFECTIVO", "DÉBITO", "CRÉDITO", "VISA", "MASTERCARD", "DEBIT", "CREDIT". Si no se puede determinar o no dice, usa null),
  "justificacion_sugerida": string (una breve sugerencia de justificación comercial en español basada en los artículos comprados o el establecimiento, ej: "Consumo de alimentos en comisión de trabajo" o "Compra de insumos de papelería para oficina", si no se puede determinar usa null),
  "categoria": string (una categoría sugerida de gasto como Alimentos, Transporte, Papelería, Peajes, Combustible, etc. de acuerdo a la compra),
  "subcategoria": string (una subcategoría específica sugerida de acuerdo a la categoría anterior, ej: Desayuno, Taxis, Gasolina, Hojas bond, si no hay usa null),
  "estado": string (debe ser exactamente uno de los 32 estados de la República Mexicana: Aguascalientes, Baja California, Baja California Sur, Campeche, Chiapas, Chihuahua, Coahuila, Colima, Ciudad de México, Durango, Guanajuato, Guerrero, Hidalgo, Jalisco, Estado de México, Michoacán, Morelos, Nayarit, Nuevo León, Oaxaca, Puebla, Querétaro, Quintana Roo, San Luis Potosí, Sinaloa, Sonora, Tabasco, Tamaulipas, Tlaxcala, Veracruz, Yucatán, Zacatecas. Identifícalo de forma inteligente según la dirección, RFC, código postal, sucursal, teléfono o texto del ticket. Si no se puede determinar usa null),
  "alerta_politica": string (Genera una alerta descriptiva en español si detectas alguna de las siguientes infracciones:
  - Consumo de alcohol/bebidas alcohólicas, cigarros o tabaco (totalmente prohibido).
  - Consumo de dulces, chocolates, galletas, chucherías o comida chatarra (como papitas, papas fritas, frituras, gomitas, etc.). Nota: La compra de refrescos/bebidas gaseosas normales SÍ está permitida y NO debe generar alerta.
  - Gastos excesivos o sin sentido comercial justificable.
  - Compras en tiendas de conveniencia (como Oxxo, 7-Eleven) o restaurantes de artículos que NO sean estrictamente alimentos (comidas/bebidas), por ejemplo: cargadores de celular, juguetes, medicamentos, cigarros, etc.
  - Si se trata de consumo de alimentos (comida, restaurante, cafetería) y el monto total de consumo (incluyendo propina si la hubiera en el ticket) supera los $${280 * cantidadPersonas} MXN, genera una alerta indicando que se excedió el límite general por comida de $${280 * cantidadPersonas} MXN (límite de $280 MXN por persona, el cual incluye comida y propina, calculado para ${cantidadPersonas} personas).
  Si no detectas ninguna de estas infracciones de política, usa null)
}`;

    // Gemini inlineData.data must be pure base64 (no "data:image/...;base64," prefix)
    let cleanBase64 = base64Image;
    let detectedMime = mimeType;
    const dataUrlMatch = base64Image.match(/^data:([a-zA-Z0-9+\-./]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      detectedMime = dataUrlMatch[1];
      cleanBase64 = dataUrlMatch[2];
    }

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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json();
      const textResult = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResult) {
        throw new Error('No se pudo extraer texto del ticket.');
      }

      const parsed = cleanAndParseJson<GeminiOcrResult>(textResult);

      return {
        monto: parsed.monto ?? null,
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
      console.error('Error in scanTicket:', err);
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
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API Key is missing. Check your environment variables.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
          data: antesBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
        },
      });
    }

    if (despuesBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: despuesBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json();
      const textResult = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResult) {
        throw new Error('No se pudo generar el reporte formal con la IA.');
      }

      return textResult.trim();
    } catch (err: any) {
      console.error('Error in generateTechnicalSummary:', err);
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
    partidas_extraidas: Array<{
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
    }>;
  }> {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API Key is missing. Check your environment variables.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

    const cleanBase64 = base64File.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '');

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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json();
      const textResult = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResult) {
        throw new Error('No se pudo extraer el contenido de la factura.');
      }

      return cleanAndParseJson<any>(textResult);
    } catch (err: any) {
      console.error('Error in extractInvoiceProducts:', err);
      throw new Error(err.message || 'Error al procesar la factura con Inteligencia Artificial.');
    }
  },

  async analyzeInvoiceSales(
    base64File: string,
    mimeType: string
  ): Promise<GeminiSalesResult> {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API Key is missing. Check your environment variables.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

Formato de Salida: Devuelve estrictamente un objeto JSON con esta estructura, sin texto adicional:
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

    const cleanBase64 = base64File.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '');

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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
      }

      const resData = await response.json();
      const textResult = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResult) {
        throw new Error('No se pudo extraer el contenido de la factura de venta.');
      }

      const parsed = cleanAndParseJson<GeminiSalesResult>(textResult);

      // Re-calcular totales en código para evitar errores matemáticos de la IA
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
      console.error('Error in analyzeInvoiceSales:', err);
      throw new Error(err.message || 'Error al procesar la factura de venta con Inteligencia Artificial.');
    }
  }
};

export interface GeminiSalesResult {
  informacion_general: {
    fecha: string | null;
    cliente: string | null;
    factura_o_referencia: string | null;
    tipo_de_proyecto: string | null;
    proveedor: string | null;
    descripcion: string | null;
  };
  partidas_o_productos: Array<{
    descripcion: string;
    cantidad: number;
    unidad: string;
    precio_unitario_venta: number;
    costo_unitario_proveedor: number;
    precio_total_venta: number;
    costo_total_proveedor: number;
  }>;
  totales_calculados: {
    precio_total_facturado: number;
    costo_total: number;
    utilidad_bruta: number;
    margen_porcentual: number;
  };
}
