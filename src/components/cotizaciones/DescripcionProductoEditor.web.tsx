import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
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

// Convierte texto plano o markdown heredado a HTML visual limpio para contentEditable
function formatToInitialHtml(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Si ya tiene etiquetas HTML, devolver tal cual
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  const lines = input.split('\n');
  let inUl = false;
  let inOl = false;
  let html = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Viñeta: •, -, *, +
    const bulletMatch = line.match(/^([•\-\*\+])\s+(.*)$/);
    // Lista numerada: 1., 2), etc.
    const numberMatch = line.match(/^(\d+[\.\-\)])\s+(.*)$/);

    if (bulletMatch) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      const content = parseMarkdownInline(bulletMatch[2]);
      html += `<li>${content}</li>`;
      continue;
    }

    if (numberMatch) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      const content = parseMarkdownInline(numberMatch[2]);
      html += `<li>${content}</li>`;
      continue;
    }

    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }

    if (!line) {
      html += '<br/>';
    } else {
      html += `<div>${parseMarkdownInline(line)}</div>`;
    }
  }

  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';

  return html;
}

function parseMarkdownInline(text: string): string {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+?)\*/g, '<b>$1</b>');
}

export const DescripcionProductoEditor: React.FC<DescripcionProductoEditorProps> = ({
  value,
  onChangeText,
  productoNombre = 'Producto',
  placeholder = 'Escribe detalles, especificaciones, qué incluye...',
  minHeight = 72,
}) => {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [modalVisible, setModalVisible] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isUlActive, setIsUlActive] = useState(false);
  const [isOlActive, setIsOlActive] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const modalEditorRef = useRef<HTMLDivElement | null>(null);

  // Sincronizar estado visual de los botones de la barra de herramientas
  const checkActiveFormats = useCallback(() => {
    if (typeof document === 'undefined') return;
    try {
      setIsBoldActive(document.queryCommandState('bold'));
      setIsUlActive(document.queryCommandState('insertUnorderedList'));
      setIsOlActive(document.queryCommandState('insertOrderedList'));
    } catch {
      // Ignore
    }
  }, []);

  // Actualizar contenido del editor en línea cuando value cambia externamente
  useEffect(() => {
    if (editorRef.current && document.activeElement !== editorRef.current) {
      const targetHtml = formatToInitialHtml(value || '');
      if (editorRef.current.innerHTML !== targetHtml) {
        editorRef.current.innerHTML = targetHtml;
      }
    }
  }, [value]);

  // Actualizar contenido del modal cuando se abre
  useEffect(() => {
    if (modalVisible && modalEditorRef.current) {
      modalEditorRef.current.innerHTML = formatToInitialHtml(value || '');
    }
  }, [modalVisible]);

  // Handler para escribir en el editor inline
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    onChangeText(html);
    checkActiveFormats();
  };

  // Botón B (Negrita): activa o desactiva negrita visualmente sin asteriscos
  const handleToggleBold = (e: React.MouseEvent) => {
    e.preventDefault(); // Evita desenfocar el editor
    document.execCommand('bold', false);
    checkActiveFormats();
    const activeRef = modalVisible ? modalEditorRef.current : editorRef.current;
    if (activeRef) {
      onChangeText(activeRef.innerHTML);
    }
  };

  // Botón Viñeta: inserta lista con viñeta estilo Word
  const handleToggleBullet = (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand('insertUnorderedList', false);
    checkActiveFormats();
    const activeRef = modalVisible ? modalEditorRef.current : editorRef.current;
    if (activeRef) {
      onChangeText(activeRef.innerHTML);
    }
  };

  // Botón Lista numerada: inserta lista numerada estilo Word
  const handleToggleNumbered = (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand('insertOrderedList', false);
    checkActiveFormats();
    const activeRef = modalVisible ? modalEditorRef.current : editorRef.current;
    if (activeRef) {
      onChangeText(activeRef.innerHTML);
    }
  };

  const handleClear = () => {
    onChangeText('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    if (modalEditorRef.current) modalEditorRef.current.innerHTML = '';
  };

  const handleInsertTemplate = () => {
    const template = `<div><b>Especificaciones:</b></div><ul><li>Modelo / Marca: </li><li>Material / Dimensiones: </li></ul><div><b>Incluye:</b></div><ul><li>Accesorios estándar</li><li>Garantía de 1 año</li></ul>`;
    const activeRef = modalVisible ? modalEditorRef.current : editorRef.current;
    if (activeRef) {
      activeRef.innerHTML = activeRef.innerHTML ? activeRef.innerHTML + template : template;
      onChangeText(activeRef.innerHTML);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Estilos CSS web para asegurar negritas negras y listas limpias */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .wysiwyg-desc-editor {
              outline: none !important;
              font-family: inherit;
              font-size: 13px;
              line-height: 1.45;
              color: ${themeColors.text};
              word-break: break-word;
            }
            .wysiwyg-desc-editor b, 
            .wysiwyg-desc-editor strong {
              font-weight: 700 !important;
              color: #111111 !important;
            }
            .wysiwyg-desc-editor ul, 
            .wysiwyg-desc-editor ol {
              margin: 3px 0 3px 18px !important;
              padding: 0 !important;
              color: #333333 !important;
            }
            .wysiwyg-desc-editor li {
              margin-bottom: 2px !important;
              line-height: 1.4 !important;
              color: #333333 !important;
            }
            .wysiwyg-desc-editor div, 
            .wysiwyg-desc-editor p {
              margin: 0 0 2px 0 !important;
            }
            .wysiwyg-desc-editor:empty:before {
              content: attr(data-placeholder);
              color: ${themeColors.textSecondary};
              pointer-events: none;
              opacity: 0.7;
            }
          `,
        }}
      />

      {/* Mini Barra de herramientas WYSIWYG */}
      <View style={[styles.inlineToolbar, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
        <View style={styles.toolbarButtonGroup}>
          {/* Negrita Visual */}
          <button
            type="button"
            onMouseDown={handleToggleBold}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px 9px',
              borderRadius: 4,
              border: `1px solid ${isBoldActive ? '#111' : themeColors.border}`,
              backgroundColor: isBoldActive ? '#111' : themeColors.backgroundElement,
              color: isBoldActive ? '#fff' : themeColors.text,
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 12,
            }}
            title="Negrita directa (Ctrl+B)"
          >
            B
          </button>

          {/* Viñeta de Lista estilo Word */}
          <button
            type="button"
            onMouseDown={handleToggleBullet}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isUlActive ? '#0284c7' : themeColors.border}`,
              backgroundColor: isUlActive ? '#0284c715' : themeColors.backgroundElement,
              color: isUlActive ? '#0284c7' : themeColors.text,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Lista con viñetas (como en Word)"
          >
            <span style={{ fontSize: 13, fontWeight: 'bold' }}>•</span> Lista
          </button>

          {/* Lista Numerada estilo Word */}
          <button
            type="button"
            onMouseDown={handleToggleNumbered}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isOlActive ? '#0284c7' : themeColors.border}`,
              backgroundColor: isOlActive ? '#0284c715' : themeColors.backgroundElement,
              color: isOlActive ? '#0284c7' : themeColors.text,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Lista numerada (como en Word)"
          >
            <span style={{ fontSize: 11, fontWeight: 'bold' }}>1.</span> Núm
          </button>
        </View>

        {/* Botón de Expandir & Vista Previa PDF */}
        <TouchableOpacity
          style={[styles.expandBtn, { backgroundColor: '#0284c715', borderColor: '#0284c740' }]}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="expand-outline" size={14} color="#0284c7" style={{ marginRight: 4 }} />
          <Text style={[styles.expandBtnText, { color: '#0284c7' }]}>Editor & Vista PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Editor WYSIWYG en línea con contentEditable */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning={true}
        onInput={handleInput}
        onKeyUp={checkActiveFormats}
        onMouseUp={checkActiveFormats}
        className="wysiwyg-desc-editor"
        data-placeholder={placeholder}
        style={{
          minHeight,
          padding: '8px 10px',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: themeColors.border,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
          backgroundColor: themeColors.backgroundElement,
          boxSizing: 'border-box',
          resize: 'vertical',
          overflow: 'auto',
        }}
      />

      {/* Modal Avanzado con Editor y Vista Previa PDF */}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="document-text-outline" size={20} color="#111" />
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                    Editor de Descripción de Partida
                  </Text>
                </View>
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
              {/* Columna Izquierda: Editor */}
              {(!isMobile || mobileTab === 'editor') && (
                <View style={[styles.editorColumn, !isMobile && { flex: 1.1, borderRightWidth: 1, borderRightColor: themeColors.border }]}>
                  {/* Barra de formato en modal */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 6,
                      padding: 8,
                      borderRadius: 8,
                      border: `1px solid ${themeColors.border}`,
                      backgroundColor: themeColors.background,
                      marginBottom: 10,
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={handleToggleBold}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${isBoldActive ? '#111' : themeColors.border}`,
                        backgroundColor: isBoldActive ? '#111' : themeColors.backgroundElement,
                        color: isBoldActive ? '#fff' : themeColors.text,
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      B Negrita
                    </button>

                    <button
                      type="button"
                      onMouseDown={handleToggleBullet}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${isUlActive ? '#0284c7' : themeColors.border}`,
                        backgroundColor: isUlActive ? '#0284c715' : themeColors.backgroundElement,
                        color: isUlActive ? '#0284c7' : themeColors.text,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      • Viñeta
                    </button>

                    <button
                      type="button"
                      onMouseDown={handleToggleNumbered}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${isOlActive ? '#0284c7' : themeColors.border}`,
                        backgroundColor: isOlActive ? '#0284c715' : themeColors.backgroundElement,
                        color: isOlActive ? '#0284c7' : themeColors.text,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      1. Lista numerada
                    </button>

                    <button
                      type="button"
                      onClick={handleInsertTemplate}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: `1px solid ${themeColors.border}`,
                        backgroundColor: themeColors.backgroundElement,
                        color: '#10ac84',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      ⚡ Plantilla
                    </button>

                    <button
                      type="button"
                      onClick={handleClear}
                      style={{
                        marginLeft: 'auto',
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #ff6b6b40',
                        backgroundColor: '#ff6b6b15',
                        color: '#ff6b6b',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      Limpiar
                    </button>
                  </div>

                  {/* Área editable amplia del modal */}
                  <div
                    ref={modalEditorRef}
                    contentEditable
                    suppressContentEditableWarning={true}
                    onInput={(e) => {
                      const html = e.currentTarget.innerHTML;
                      onChangeText(html);
                      if (editorRef.current) editorRef.current.innerHTML = html;
                      checkActiveFormats();
                    }}
                    onKeyUp={checkActiveFormats}
                    onMouseUp={checkActiveFormats}
                    className="wysiwyg-desc-editor"
                    data-placeholder={placeholder}
                    style={{
                      flex: 1,
                      minHeight: 240,
                      padding: 14,
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: 8,
                      backgroundColor: themeColors.backgroundElement,
                      boxSizing: 'border-box',
                      overflowY: 'auto',
                    }}
                  />

                  <View style={styles.helperTipBox}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={[styles.helperTipText, { color: themeColors.textSecondary }]}>
                      <Text style={{ fontWeight: 'bold' }}>Funciona como Word:</Text> Usa <Text style={{ fontWeight: 'bold', color: '#111' }}>B Negrita</Text> para escribir directamente en negritas negras. Al dar <Text style={{ fontWeight: 'bold' }}>Enter</Text> en una lista se creará automáticamente la siguiente viñeta; presiona <Text style={{ fontWeight: 'bold' }}>Enter o Backspace</Text> en una viñeta vacía para salir de la lista.
                    </Text>
                  </View>
                </View>
              )}

              {/* Columna Derecha: Vista Previa Real en PDF */}
              {(!isMobile || mobileTab === 'preview') && (
                <View style={[styles.previewColumn, !isMobile && { flex: 1 }]}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
                    <View style={styles.previewContainer}>
                      <View style={styles.previewPdfHeader}>
                        <Text style={styles.previewPdfBadge}>VISTA PREVIA EN PDF</Text>
                        <Text style={styles.previewPdfSub}>Estilo Odoo Oficial</Text>
                      </View>

                      <View style={styles.previewPaper}>
                        <Text style={styles.previewProductTitle}>{productoNombre || 'Nombre del Producto'}</Text>

                        {!value ? (
                          <Text style={styles.previewEmptyText}>
                            Escribe en el editor para previsualizar exactamente cómo se verá la descripción en el PDF...
                          </Text>
                        ) : (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              lineHeight: '1.4',
                              color: '#333333',
                            }}
                            dangerouslySetInnerHTML={{
                              __html: formatToInitialHtml(value),
                            }}
                          />
                        )}
                      </View>
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Footer del Modal */}
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

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
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
  toolbarButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '700',
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
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
  },
  mobileTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  mobileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  mobileTabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#111',
  },
  mobileTabText: {
    fontSize: 13,
    color: '#666',
  },
  modalBody: {
    flex: 1,
    flexDirection: 'row',
  },
  editorColumn: {
    flex: 1,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  helperTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0284c710',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
  },
  helperTipText: {
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  previewColumn: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  previewContainer: {
    width: '100%',
  },
  previewPdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewPdfBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111',
    letterSpacing: 0.5,
  },
  previewPdfSub: {
    fontSize: 11,
    color: '#888',
  },
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
  modalFooterSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
