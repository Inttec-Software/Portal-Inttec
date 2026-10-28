import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, BorderRadius } from '@/constants/theme';

export interface DescripcionProductoEditorProps {
  value: string;
  onChangeText: (text: string) => void;
  productoNombre?: string;
  placeholder?: string;
  minHeight?: number;
}

export const DescripcionProductoEditor: React.FC<DescripcionProductoEditorProps> = ({
  value,
  onChangeText,
  productoNombre = 'Producto',
  placeholder = 'Describe los detalles, especificaciones, qué incluye...',
  minHeight = 72,
}) => {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [modalVisible, setModalVisible] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  // Manejo inteligente de texto: detección de Enter en listas estilo Word
  const handleTextChange = (newText: string) => {
    const oldText = value || '';

    // Si se acaba de insertar un salto de línea (Enter)
    if (newText.length === oldText.length + 1 && newText.endsWith('\n')) {
      const lines = oldText.split('\n');
      const lastLine = lines[lines.length - 1];

      // Caso 1: Enter sobre viñeta vacía '• ' -> Salir de la lista (borrar viñeta vacía)
      if (lastLine.trim() === '•' || lastLine.trim() === '-') {
        const withoutLastBullet = lines.slice(0, lines.length - 1).join('\n') + '\n';
        onChangeText(withoutLastBullet);
        return;
      }

      // Caso 2: Enter sobre número vacío '1.' -> Salir de la lista
      if (/^\d+[\.\-\)]$/.test(lastLine.trim())) {
        const withoutLastNum = lines.slice(0, lines.length - 1).join('\n') + '\n';
        onChangeText(withoutLastNum);
        return;
      }

      // Caso 3: Enter después de un elemento con viñeta -> Crear automáticamente siguiente viñeta
      if (/^[•\-\*\+]\s+/.test(lastLine)) {
        onChangeText(newText + '• ');
        return;
      }

      // Caso 4: Enter después de un elemento numerado -> Crear automáticamente número siguiente
      const numMatch = lastLine.match(/^(\d+)[\.\-\)]\s+/);
      if (numMatch) {
        const nextNum = parseInt(numMatch[1], 10) + 1;
        onChangeText(newText + `${nextNum}. `);
        return;
      }
    }

    onChangeText(newText);
  };

  // Toggle de negrita inteligente: si ya tiene **, las quita en lugar de duplicarlas
  const handleToggleBold = () => {
    const text = value || '';
    const start = Math.min(selection.start, text.length);
    const end = Math.min(selection.end, text.length);

    if (start !== end) {
      const selected = text.slice(start, end);
      // Si la selección ya está envuelta en **, quitar los asteriscos
      if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
        const unwrapped = selected.slice(2, selected.length - 2);
        onChangeText(text.slice(0, start) + unwrapped + text.slice(end));
        return;
      }
      // O si justo antes y después hay **, des-envolver
      if (start >= 2 && text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
        onChangeText(text.slice(0, start - 2) + selected + text.slice(end + 2));
        return;
      }
      // Envolver selección
      onChangeText(text.slice(0, start) + '**' + selected + '**' + text.slice(end));
    } else {
      // Sin selección: verificar si estamos al final de un ** para no duplicar
      if (text.endsWith('**')) {
        // No volver a agregar **
        return;
      }
      const needsNewline = text.length > 0 && !text.endsWith('\n') && !text.endsWith(' ');
      const prefix = needsNewline ? ' **' : '**';
      onChangeText(text + prefix + 'negrita**');
    }
  };

  const insertBullet = () => {
    const text = value || '';
    const needsNewline = text.length > 0 && !text.endsWith('\n');
    onChangeText(text + (needsNewline ? '\n• ' : '• '));
  };

  const insertNumbered = () => {
    const text = value || '';
    const lines = text.split('\n');
    let nextNum = 1;

    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/^(\d+)[\.\-\)]\s/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
        break;
      }
    }

    const needsNewline = text.length > 0 && !text.endsWith('\n');
    onChangeText(text + (needsNewline ? `\n${nextNum}. ` : `${nextNum}. `));
  };

  return (
    <View style={styles.wrapper}>
      {/* Mini Barra de herramientas integrada */}
      <View style={[styles.inlineToolbar, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
        <View style={styles.toolbarButtonGroup}>
          {/* Negrita */}
          <TouchableOpacity
            style={[styles.toolBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={handleToggleBold}
          >
            <Text style={[styles.toolBtnBoldText, { color: themeColors.text }]}>B</Text>
          </TouchableOpacity>

          {/* Viñeta */}
          <TouchableOpacity
            style={[styles.toolBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={insertBullet}
          >
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.text, marginRight: 2 }}>•</Text>
            <Text style={[styles.toolBtnText, { color: themeColors.text }]}>Lista</Text>
          </TouchableOpacity>

          {/* Numerada */}
          <TouchableOpacity
            style={[styles.toolBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
            onPress={insertNumbered}
          >
            <Text style={[styles.toolBtnText, { color: themeColors.text, fontWeight: 'bold' }]}>1.</Text>
            <Text style={[styles.toolBtnText, { color: themeColors.text, marginLeft: 2 }]}>Núm</Text>
          </TouchableOpacity>
        </View>

        {/* Botón de Expandir / Vista Previa */}
        <TouchableOpacity
          style={[styles.expandBtn, { backgroundColor: '#0284c715', borderColor: '#0284c740' }]}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="expand-outline" size={14} color="#0284c7" style={{ marginRight: 4 }} />
          <Text style={[styles.expandBtnText, { color: '#0284c7' }]}>Editor & Vista PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Input de texto en línea con auto-viñetas en Enter */}
      <TextInput
        style={[
          styles.input,
          {
            color: themeColors.text,
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
            minHeight,
          },
        ]}
        multiline={true}
        numberOfLines={3}
        blurOnSubmit={false}
        value={value}
        onChangeText={handleTextChange}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        placeholder={placeholder}
        placeholderTextColor={themeColors.textSecondary}
      />

      {/* Modal Avanzado */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            {/* Header del Modal */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Editor de Descripción de Partida
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                  {productoNombre}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalCloseBtn, { backgroundColor: themeColors.background }]}
              >
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Pestañas en Móvil */}
            {isMobile && (
              <View style={[styles.mobileTabBar, { borderBottomColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[styles.mobileTabBtn, mobileTab === 'editor' && styles.mobileTabBtnActive]}
                  onPress={() => setMobileTab('editor')}
                >
                  <Ionicons name="create-outline" size={16} color={mobileTab === 'editor' ? '#111' : themeColors.textSecondary} />
                  <Text style={[styles.mobileTabText, mobileTab === 'editor' && { color: '#111', fontWeight: 'bold' }]}>
                    Editor
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mobileTabBtn, mobileTab === 'preview' && styles.mobileTabBtnActive]}
                  onPress={() => setMobileTab('preview')}
                >
                  <Ionicons name="eye-outline" size={16} color={mobileTab === 'preview' ? '#111' : themeColors.textSecondary} />
                  <Text style={[styles.mobileTabText, mobileTab === 'preview' && { color: '#111', fontWeight: 'bold' }]}>
                    Vista Previa PDF
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Cuerpo del Modal */}
            <View style={styles.modalBody}>
              {(!isMobile || mobileTab === 'editor') && (
                <View style={[styles.editorColumn, !isMobile && { flex: 1.1, borderRightWidth: 1, borderRightColor: themeColors.border }]}>
                  <View style={[styles.richToolbar, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <TouchableOpacity style={styles.richBtn} onPress={handleToggleBold}>
                      <Text style={[styles.richBtnBold, { color: themeColors.text }]}>B</Text>
                      <Text style={[styles.richBtnLabel, { color: themeColors.text }]}>Negrita</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.richBtn} onPress={insertBullet}>
                      <Text style={{ fontWeight: 'bold', fontSize: 13, color: themeColors.text }}>•</Text>
                      <Text style={[styles.richBtnLabel, { color: themeColors.text }]}>Viñeta</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.richBtn} onPress={insertNumbered}>
                      <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 13 }}>1.</Text>
                      <Text style={[styles.richBtnLabel, { color: themeColors.text }]}>Número</Text>
                    </TouchableOpacity>

                    {!!value && (
                      <TouchableOpacity style={[styles.richBtn, { marginLeft: 'auto' }]} onPress={() => onChangeText('')}>
                        <Ionicons name="trash-outline" size={15} color="#ff6b6b" />
                        <Text style={[styles.richBtnLabel, { color: '#ff6b6b' }]}>Limpiar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={[
                      styles.modalTextarea,
                      {
                        color: themeColors.text,
                        backgroundColor: themeColors.backgroundElement,
                        borderColor: themeColors.border,
                      },
                    ]}
                    multiline={true}
                    value={value}
                    onChangeText={handleTextChange}
                    onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                    placeholder="Escribe la descripción...&#10;Al dar Enter en una viñeta se creará automáticamente la siguiente."
                    placeholderTextColor={themeColors.textSecondary}
                  />

                  <View style={styles.helperTipBox}>
                    <Ionicons name="information-circle-outline" size={16} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={[styles.helperTipText, { color: themeColors.textSecondary }]}>
                      <Text style={{ fontWeight: 'bold' }}>Funciona como Word:</Text> Da <Text style={{ fontWeight: 'bold' }}>Enter</Text> para continuar listas de viñetas o números. Presiona <Text style={{ fontWeight: 'bold' }}>Enter o Backspace</Text> en una viñeta vacía para salir de la lista.
                    </Text>
                  </View>
                </View>
              )}

              {/* Columna Derecha: Vista Previa */}
              {(!isMobile || mobileTab === 'preview') && (
                <View style={[styles.previewColumn, !isMobile && { flex: 1 }]}>
                  <ScrollView style={{ flex: 1 }}>
                    <View style={styles.previewContainer}>
                      <View style={styles.previewPdfHeader}>
                        <Text style={styles.previewPdfBadge}>VISTA PREVIA EN PDF</Text>
                        <Text style={styles.previewPdfSub}>Estilo Odoo Oficial</Text>
                      </View>

                      <View style={styles.previewPaper}>
                        <Text style={styles.previewProductTitle}>{productoNombre || 'Nombre del Producto'}</Text>

                        {!value ? (
                          <Text style={styles.previewEmptyText}>
                            Escribe en el editor para previsualizar la descripción en el PDF...
                          </Text>
                        ) : (
                          <View style={{ marginTop: 8 }}>
                            {value.split('\n').map((rawLine, idx) => {
                              const line = rawLine.trim();
                              if (!line) return <View key={idx} style={{ height: 6 }} />;

                              const bulletMatch = line.match(/^([•\-\*\+])\s+(.*)$/);
                              if (bulletMatch) {
                                return (
                                  <View key={idx} style={styles.previewListItem}>
                                    <Text style={styles.previewBulletDot}>•</Text>
                                    <View style={{ flex: 1 }}>
                                      <ParsedInlineText text={bulletMatch[2]} />
                                    </View>
                                  </View>
                                );
                              }

                              const numberMatch = line.match(/^(\d+[\.\-\)])\s+(.*)$/);
                              if (numberMatch) {
                                return (
                                  <View key={idx} style={styles.previewListItem}>
                                    <Text style={styles.previewNumberPrefix}>{numberMatch[1]}</Text>
                                    <View style={{ flex: 1 }}>
                                      <ParsedInlineText text={numberMatch[2]} />
                                    </View>
                                  </View>
                                );
                              }

                              return (
                                <View key={idx} style={styles.previewParagraph}>
                                  <ParsedInlineText text={line} />
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.modalFooterSaveBtn, { backgroundColor: '#111111' }]}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.modalFooterSaveText}>Listo, Guardar en Cotización</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Renderiza negritas inline en color negro puro
const ParsedInlineText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

  return (
    <Text style={styles.previewLineText}>
      {parts.map((part, index) => {
        if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('*') && part.endsWith('*'))) {
          const clean = part.replace(/^\*+|\*+$/g, '');
          return (
            <Text key={index} style={styles.previewBoldText}>
              {clean}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  inlineToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  toolbarButtonGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  toolBtnBoldText: { fontWeight: '900', fontSize: 12 },
  toolBtnText: { fontSize: 11, fontWeight: '600' },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  expandBtnText: { fontSize: 11, fontWeight: '700' },
  input: {
    fontSize: 12.5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    textAlignVertical: 'top',
    lineHeight: 18,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'vertical' } as any) : {}),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 900,
    height: '88%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold' },
  modalSubtitle: { fontSize: 12, marginTop: 2 },
  modalCloseBtn: { padding: 6, borderRadius: 8 },
  mobileTabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  mobileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  mobileTabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#111' },
  mobileTabText: { fontSize: 13, color: '#666' },
  modalBody: { flex: 1, flexDirection: 'row' },
  editorColumn: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column' },
  richToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    gap: 6,
  },
  richBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    borderRadius: 6,
    gap: 4,
  },
  richBtnBold: { fontWeight: '900', fontSize: 14 },
  richBtnLabel: { fontSize: 12, fontWeight: '600' },
  modalTextarea: {
    flex: 1,
    minHeight: 240,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    lineHeight: 22,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  helperTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0284c710',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
  },
  helperTipText: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  previewColumn: { flex: 1, padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.02)' },
  previewContainer: { width: '100%' },
  previewPdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewPdfBadge: { fontSize: 10, fontWeight: '800', color: '#111', letterSpacing: 0.5 },
  previewPdfSub: { fontSize: 11, color: '#888' },
  previewPaper: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  previewProductTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 6,
  },
  previewEmptyText: {
    fontSize: 12,
    color: '#999999',
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 18,
  },
  previewListItem: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2, paddingLeft: 4 },
  previewBulletDot: { fontSize: 14, color: '#333333', width: 14, fontWeight: 'bold', lineHeight: 17 },
  previewNumberPrefix: { fontSize: 11, color: '#333333', fontWeight: 'bold', width: 18, lineHeight: 17 },
  previewParagraph: { marginVertical: 2, paddingLeft: 2 },
  previewLineText: { fontSize: 12, color: '#333333', lineHeight: 18 },
  previewBoldText: { fontWeight: 'bold', color: '#111111' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  modalFooterSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalFooterSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});
