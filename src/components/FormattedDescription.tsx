import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

export interface FormattedChunk {
  text: string;
  bold: boolean;
}

/**
 * Parsea descripciones enriquecidas (HTML o Markdown) y devuelve segmentos limpios con formato bold/bullet.
 */
export function parseFormattedChunks(html: string | null | undefined): FormattedChunk[] {
  if (!html) return [];
  let str = String(html);

  // Normalizar negritas en Markdown (**texto**) a <b>texto</b>
  str = str.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Procesar listas ordenadas <ol> a números 1., 2.
  str = str.replace(/<ol[\s\S]*?>([\s\S]*?)<\/ol>/gi, (_, p1) => {
    let count = 1;
    return p1.replace(/<li[\s\S]*?>([\s\S]*?)(?:<\/li>|$)/gi, (_m: string, li: string) => {
      return (count++) + '. ' + li.trim() + '\n';
    });
  });

  // Procesar listas desordenadas <ul> a viñetas •
  str = str.replace(/<li[\s\S]*?>([\s\S]*?)(?:<\/li>|$)/gi, (_m: string, li: string) => {
    return '• ' + li.trim() + '\n';
  });

  // Normalizar saltos de línea y bloques
  str = str.replace(/<br\s*\/?>/gi, '\n');
  str = str.replace(/<\/(p|div|tr)>/gi, '\n');

  // Convertir strong a b
  str = str.replace(/<\/?strong>/gi, match => match.includes('/') ? '</b>' : '<b>');

  // Eliminar todas las demás etiquetas HTML excepto <b> y </b>
  str = str.replace(/<(?!(\/?b\b))[^>]+>/gi, '');

  // Decodificar entidades HTML
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&bull;/gi, '•');

  // Normalizar espacios después de numeraciones
  str = str.replace(/(\d+\.)\s+/g, '$1 ');

  // Limpiar líneas vacías excesivas
  const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const cleanStr = lines.join('\n');

  // Dividir en fragmentos { text, bold }
  const chunks: FormattedChunk[] = [];
  const parts = cleanStr.split(/(<b>[\s\S]*?<\/b>)/gi);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<b>') && part.endsWith('</b>')) {
      const text = part.slice(3, -4);
      chunks.push({ text, bold: true });
    } else {
      chunks.push({ text: part, bold: false });
    }
  }

  return chunks;
}

/**
 * Convierte cualquier HTML o Markdown a texto plano legible (ideal para alertas y campos simples).
 */
export function stripHtmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const chunks = parseFormattedChunks(html);
  return chunks.map(c => c.text).join('').trim();
}

interface FormattedDescriptionProps {
  content?: string | null;
  style?: StyleProp<TextStyle>;
  boldColor?: string;
  numberOfLines?: number;
}

/**
 * Componente React Native universal (Web / iOS / Android) para mostrar descripciones enriquecidas
 * sin etiquetas HTML visibles y con soporte de negritas, viñetas y listas.
 */
export default function FormattedDescription({
  content,
  style,
  boldColor,
  numberOfLines,
}: FormattedDescriptionProps) {
  if (!content || !content.trim()) {
    return null;
  }

  const chunks = parseFormattedChunks(content);
  if (chunks.length === 0) {
    return null;
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {chunks.map((chunk, index) => (
        <Text
          key={index}
          style={chunk.bold ? { fontWeight: 'bold', ...(boldColor ? { color: boldColor } : {}) } : undefined}
        >
          {chunk.text}
        </Text>
      ))}
    </Text>
  );
}
