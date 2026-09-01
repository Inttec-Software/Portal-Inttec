import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  Linking,
  Platform,
  PanResponder,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { supabase, DocumentoService, Usuario, sortUsuariosByRoleAndName } from '@/services/supabase';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';

export default function NuevoDocumentoScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user: authUser } = useAuth();

  const [tipoDocumento, setTipoDocumento] = useState<'TEXTO' | 'PDF'>('TEXTO');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [contenidoHtml, setContenidoHtml] = useState('');

  // Subida de PDF Original y Ubicación de Firma
  const [selectedPdf, setSelectedPdf] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [posicionFirma, setPosicionFirma] = useState<'AL_FINAL' | 'PIE_PAGINA' | 'PAGINA_1' | 'PERSONALIZADO'>('PERSONALIZADO');
  const [firmaPos, setFirmaPos] = useState<{ x: number; y: number }>({ x: 50, y: 70 });
  const [paginaSeleccionada, setPaginaSeleccionada] = useState<number>(1);
  const [totalPaginas, setTotalPaginas] = useState<number>(1);
  const [pageAspectRatios, setPageAspectRatios] = useState<number[]>([]);
  const [modoInteraccion, setModoInteraccion] = useState<'FIRMA' | 'NAVEGAR'>('FIRMA');

  const canvasRef = useRef<View>(null);
  const canvasLayout = useRef<{ width: number; height: number; pageX: number; pageY: number }>({
    width: 500,
    height: 320,
    pageX: 0,
    pageY: 0,
  });

  const isDraggingBox = useRef(false);
  const activePageRef = useRef<number>(1);

  const updateBoxPositionForPage = (e: any, pageNum: number) => {
    let clickX = 0;
    let clickY = 0;
    const rect = (Platform.OS === 'web' && e.currentTarget && e.currentTarget.getBoundingClientRect)
      ? e.currentTarget.getBoundingClientRect()
      : null;

    const w = rect ? rect.width : (canvasLayout.current.width || 500);
    const h = rect ? rect.height : (canvasLayout.current.height || 700);

    if (rect) {
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      clickX = clientX - rect.left;
      clickY = clientY - rect.top;
    } else {
      clickX = e.nativeEvent?.locationX || 0;
      clickY = e.nativeEvent?.locationY || 0;
    }

    // El recuadro de firma ocupa exactamente 24% del ancho de la hoja con proporción 2.6:1
    const boxW = w * 0.24;
    const boxH = boxW / 2.6;

    // Centrar la caja en el punto de clic/toque
    const posX = clickX - (boxW / 2);
    const posY = clickY - (boxH / 2);

    // Calcular porcentajes exactos de la hoja
    const rawXPct = (posX / w) * 100;
    const rawYPct = (posY / h) * 100;

    // Límites para que el recuadro nunca sobresalga de la hoja física
    const maxXPct = 100 - 24;
    const maxYPct = 100 - ((boxH / h) * 100);

    const xPct = Math.min(Math.max(Math.round(rawXPct), 0), Math.max(0, Math.round(maxXPct)));
    const yPct = Math.min(Math.max(Math.round(rawYPct), 0), Math.max(0, Math.round(maxYPct)));

    console.log(`[PAGINA-DETECTADA-AUTOMATICA] Hoja ${pageNum} de ${totalPaginas} | Click: (${clickX.toFixed(0)}, ${clickY.toFixed(0)}) en [${w.toFixed(0)}x${h.toFixed(0)}px] → X=${xPct}%, Y=${yPct}%, Página=${pageNum}`);

    setPaginaSeleccionada(pageNum);
    setFirmaPos({ x: xPct, y: yPct });
    setPosicionFirma('PERSONALIZADO');
  };

  const handlePointerDownPage = (e: any, pageNum: number) => {
    isDraggingBox.current = true;
    activePageRef.current = pageNum;
    updateBoxPositionForPage(e, pageNum);
  };

  const handlePointerMovePage = (e: any, pageNum: number) => {
    if (isDraggingBox.current && activePageRef.current === pageNum) {
      updateBoxPositionForPage(e, pageNum);
    }
  };

  const handlePointerUpPage = () => {
    isDraggingBox.current = false;
  };

  const [modoDestinatarios, setModoDestinatarios] = useState<'TODOS' | 'EMPLEADOS' | 'DEVS' | 'ADMINS' | 'PERSONALIZADO'>('TODOS');
  const [requiereTodos, setRequiereTodos] = useState(true);
  const [empleados, setEmpleados] = useState<Usuario[]>([]);
  const [empleadosSeleccionados, setEmpleadosSeleccionados] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    cargarEmpleados();
  }, []);

  const cargarEmpleados = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('*');
      const users = sortUsuariosByRoleAndName(data || []);
      setEmpleados(users);
      setEmpleadosSeleccionados(users.map((u) => u.id));
    } catch (e) {
      console.error('Error al cargar usuarios:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeleccionarGrupo = (modo: 'TODOS' | 'EMPLEADOS' | 'DEVS' | 'ADMINS' | 'PERSONALIZADO') => {
    setModoDestinatarios(modo);

    if (modo === 'TODOS') {
      setRequiereTodos(true);
      setEmpleadosSeleccionados(empleados.map((e) => e.id));
    } else if (modo === 'EMPLEADOS') {
      setRequiereTodos(false);
      const ids = empleados
        .filter((e) => !e.rol || e.rol.toUpperCase() === 'EMPLEADO')
        .map((e) => e.id);
      setEmpleadosSeleccionados(ids);
    } else if (modo === 'DEVS') {
      setRequiereTodos(false);
      const ids = empleados
        .filter((e) => e.rol && e.rol.toUpperCase() === 'DEV')
        .map((e) => e.id);
      setEmpleadosSeleccionados(ids);
    } else if (modo === 'ADMINS') {
      setRequiereTodos(false);
      const ids = empleados
        .filter((e) => e.rol && e.rol.toUpperCase() === 'ADMIN')
        .map((e) => e.id);
      setEmpleadosSeleccionados(ids);
    } else if (modo === 'PERSONALIZADO') {
      setRequiereTodos(false);
    }
  };

  const toggleEmpleado = (id: string) => {
    setModoDestinatarios('PERSONALIZADO');
    setRequiereTodos(false);
    setEmpleadosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handlePickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedPdf({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
        });
        if (!titulo) {
          setTitulo(asset.name.replace(/\.pdf$/i, ''));
        }

        // Detectar número de páginas y dimensiones exactas de cada página usando pdf-lib (Web y Móvil)
        try {
          let pdfArrayBuffer: ArrayBuffer;
          if (Platform.OS === 'web') {
            const response = await fetch(asset.uri);
            pdfArrayBuffer = await response.arrayBuffer();
          } else {
            const base64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: 'base64',
            });
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            pdfArrayBuffer = bytes.buffer;
          }

          const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
          const count = pdfDoc.getPageCount();
          console.log(`[PDF-DETECT] Documento cargado: ${count} páginas detectadas automáticamente.`);
          setTotalPaginas(count);
          setPaginaSeleccionada(count); // Por defecto AUTOMÁTICO: la última página donde van las firmas

          const ratios: number[] = [];
          for (let i = 0; i < count; i++) {
            const page = pdfDoc.getPage(i);
            const { width: pW, height: pH } = page.getSize();
            ratios.push(pW / pH);
          }
          setPageAspectRatios(ratios);
        } catch (errPages) {
          console.warn('[PDF-DETECT] Error detectando páginas del PDF:', errPages);
        }
      }
    } catch (err) {
      console.error('Error al seleccionar PDF:', err);
      Alert.alert('Error', 'No se pudo seleccionar el archivo PDF.');
    }
  };

  const handleInsertarTagFirma = () => {
    setContenidoHtml((prev) => prev + '\n<p style="text-align: center;">{{FIRMA_EMPLEADO}}</p>\n');
  };

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'Ok', onPress: onOk }] : undefined);
    }
  };

  const handleGuardar = async () => {
    if (!titulo.trim()) {
      showAlert('Campo requerido', 'Por favor ingresa el título del documento.');
      return;
    }

    if (tipoDocumento === 'TEXTO' && !contenidoHtml.trim()) {
      showAlert('Campo requerido', 'Por favor redacta el cuerpo o texto del documento.');
      return;
    }

    if (tipoDocumento === 'PDF' && !selectedPdf) {
      showAlert('Archivo requerido', 'Por favor selecciona un archivo PDF para subir.');
      return;
    }

    const finalRequiereTodos = modoDestinatarios === 'TODOS';
    const finalEmpleados = finalRequiereTodos ? [] : empleadosSeleccionados;

    if (!finalRequiereTodos && finalEmpleados.length === 0) {
      showAlert('Sin destinatarios', 'Por favor selecciona al menos un destinatario o elige la opción A Todos.');
      return;
    }

    setIsSubmitting(true);
    try {
      let pdfUrl: string | undefined = undefined;

      if (tipoDocumento === 'PDF' && selectedPdf) {
        pdfUrl = await DocumentoService.subirPdfOriginal(selectedPdf.uri, selectedPdf.name);
      }

      const posicionObj = {
        x: firmaPos.x,
        y: firmaPos.y,
        page: paginaSeleccionada || totalPaginas || 1,
      };
      const posicionFirmaGuardada = JSON.stringify(posicionObj);
      console.log('[ADMIN] ── Guardando Documento ──');
      console.log('[ADMIN] modoDestinatarios:', modoDestinatarios);
      console.log('[ADMIN] finalRequiereTodos:', finalRequiereTodos);
      console.log('[ADMIN] total destinatarios:', finalRequiereTodos ? empleados.length : finalEmpleados.length);
      console.log('[ADMIN] Valor a guardar en DB posicion_firma:', posicionFirmaGuardada);

      await DocumentoService.crearDocumento(
        {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          contenido_html: tipoDocumento === 'PDF' ? 'Documento cargado en formato PDF original.' : contenidoHtml.trim(),
          archivo_pdf_url: pdfUrl,
          tipo_documento: tipoDocumento,
          posicion_firma: posicionFirmaGuardada,
          creador_id: authUser?.id,
          creador_nombre: authUser?.nombre || 'Administración',
          requiere_todos: finalRequiereTodos,
          estado: 'PUBLICADO',
        },
        finalRequiereTodos ? [] : finalEmpleados
      );

      showAlert('¡Éxito!', 'El documento ha sido publicado y asignado para su firma.', () => {
        router.replace('/(admin)/documentos' as any);
      });
    } catch (error: any) {
      console.error('Error al crear documento:', error);
      const errMsg = error?.message || error?.details || String(error);
      showAlert(
        'Error al Guardar',
        `No se pudo emitir el documento.\n\nDetalle: ${errMsg}\n\nAsegúrate de haber ejecutado el script SQL "BaseDatos_Documentos.sql" en la consola de tu Supabase.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.card, { backgroundColor: themeColors.backgroundElement }]}>
        <Text style={[styles.heading, { color: themeColors.text }]}>Emitir Nuevo Documento Corporativo</Text>
        <Text style={[styles.subheading, { color: themeColors.textSecondary }]}>
          Los empleados asignados recibirán este aviso para leer y firmar digitalmente desde su aplicación.
        </Text>

        {/* Selector de Modo: Texto vs PDF */}
        <View style={[styles.tipoSelector, { backgroundColor: scheme === 'dark' ? '#0f172a' : '#f1f5f9' }]}>
          <TouchableOpacity
            style={[
              styles.tipoTab,
              tipoDocumento === 'TEXTO' && styles.tipoTabActive,
            ]}
            onPress={() => setTipoDocumento('TEXTO')}
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={tipoDocumento === 'TEXTO' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tipoTabText,
                { color: tipoDocumento === 'TEXTO' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Redactar Texto / Plantilla
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tipoTab,
              tipoDocumento === 'PDF' && styles.tipoTabActive,
            ]}
            onPress={() => setTipoDocumento('PDF')}
          >
            <Ionicons
              name="document-attach-outline"
              size={18}
              color={tipoDocumento === 'PDF' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tipoTabText,
                { color: tipoDocumento === 'PDF' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Subir Archivo PDF Original
            </Text>
          </TouchableOpacity>
        </View>

        <CustomInput
          label="Título del Documento *"
          placeholder="Ej: Carta Responsiva de Equipo de Cómputo"
          value={titulo}
          onChangeText={setTitulo}
        />

        <CustomInput
          label="Descripción o Asunto (Opcional)"
          placeholder="Breve resumen del contenido para los empleados..."
          value={descripcion}
          onChangeText={setDescripcion}
        />

        {tipoDocumento === 'TEXTO' ? (
          /* Editor de Contenido / Texto */
          <View style={styles.editorContainer}>
            <View style={styles.editorHeader}>
              <Text style={[styles.label, { color: themeColors.text }]}>Cuerpo o Texto del Documento *</Text>
              <TouchableOpacity
                style={[styles.tagBtn, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe' }]}
                onPress={handleInsertarTagFirma}
              >
                <Ionicons name="sparkles-outline" size={14} color={scheme === 'dark' ? '#38bdf8' : '#0284c7'} />
                <Text style={[styles.tagBtnText, { color: scheme === 'dark' ? '#38bdf8' : '#0284c7' }]}>
                  Insertar Campo {"{{FIRMA_EMPLEADO}}"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.hintText, { color: themeColors.textSecondary }]}>
              Tip: Puedes escribir en texto plano o HTML simple. Usa la etiqueta <Text style={{ fontWeight: 'bold', color: scheme === 'dark' ? '#38bdf8' : '#0284c7' }}>{"{{FIRMA_EMPLEADO}}"}</Text> donde quieras colocar la firma. Si no la incluyes, se estampará automáticamente al final.
            </Text>

            <CustomInput
              placeholder="Por medio de la presente hago constar que he recibido el equipo..."
              value={contenidoHtml}
              onChangeText={setContenidoHtml}
              multiline
              numberOfLines={10}
              style={{ height: 200, textAlignVertical: 'top' }}
            />
          </View>
        ) : (
          /* Selector de Archivo PDF Original */
          <View style={[styles.pdfUploadBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc' }]}>
            <Ionicons name="cloud-upload-outline" size={48} color={themeColors.accent} />
            <Text style={[styles.pdfUploadTitle, { color: themeColors.text }]}>
              {selectedPdf ? 'Archivo PDF Seleccionado' : 'Subir Documento PDF sin Firmar'}
            </Text>

            {selectedPdf ? (
              <View style={{ width: '100%', gap: 12, marginTop: 10 }}>
                {/* Barra de info del archivo */}
                <View style={[styles.pdfSelectedInfo, { backgroundColor: scheme === 'dark' ? '#1e293b' : '#ffffff', borderColor: themeColors.border }]}>
                  <Ionicons name="document-text-outline" size={24} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', color: themeColors.text }} numberOfLines={1}>
                      {selectedPdf.name}
                    </Text>
                    {selectedPdf.size && (
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                        {(selectedPdf.size / (1024 * 1024)).toFixed(2)} MB
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedPdf(null)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {/* Previsualización del PDF Embebido en la Pantalla */}
                <View style={{ width: '100%', marginTop: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: themeColors.text, marginBottom: 6 }}>
                    👁️ Vista Previa del Documento:
                  </Text>
                  {Platform.OS === 'web' ? (
                    <iframe
                      src={selectedPdf.uri}
                      width="100%"
                      height="450px"
                      style={{
                        borderRadius: 10,
                        border: scheme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                      }}
                    />
                  ) : (
                    <TouchableOpacity
                      style={[styles.previewPdfBtn, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe', paddingVertical: 14 }]}
                      onPress={() => {
                        if (selectedPdf?.uri) {
                          Linking.openURL(selectedPdf.uri);
                        }
                      }}
                    >
                      <Ionicons name="eye-outline" size={20} color={scheme === 'dark' ? '#38bdf8' : '#0284c7'} />
                      <Text style={[styles.previewPdfBtnText, { color: scheme === 'dark' ? '#38bdf8' : '#0284c7', fontSize: 14 }]}>
                        Abrir y Leer PDF en Pantalla Completa
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity style={[styles.pickPdfBtn, { backgroundColor: themeColors.accent }]} onPress={handlePickPdf}>
                <Ionicons name="attach-outline" size={20} color="#ffffff" />
                <Text style={styles.pickPdfBtnText}>Seleccionar Archivo PDF...</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.hintText, { color: themeColors.textSecondary, marginTop: 12, textAlign: 'center' }]}>
              Los empleados podrán visualizar este PDF en pantalla completa y estampar su firma digital al final con Hoja de Auditoría inalterable.
            </Text>
          </View>
        )}

        {/* Ubicación / Acomodo de la Firma */}
        <View style={[styles.sectionBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc' }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 4 }]}>
            📍 Acomodar Ubicación de la Estampa de Firma
          </Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 12 }}>
            Define en qué posición del documento impreso se colocará la recuadradura con la firma autógrafa del empleado.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              { id: 'PERSONALIZADO', label: '🎯 Posición Personalizada (Mover Cuadro en Documento)', desc: 'Interactivo' },
              { id: 'AL_FINAL', label: '📌 Al Final del Documento (Última Página)', desc: 'Recomendado' },
              { id: 'PIE_PAGINA', label: '📌 Pie de Página (Esquina Inferior)', desc: 'Última Hoja' },
              { id: 'PAGINA_1', label: '📌 Primera Página (Pie de Hoja 1)', desc: 'Inicio' },
            ].map((opt) => {
              const active = posicionFirma === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.posChip,
                    {
                      backgroundColor: active ? '#0284c7' : themeColors.backgroundElement,
                      borderColor: active ? '#0284c7' : themeColors.border,
                    },
                  ]}
                  onPress={() => {
                    setPosicionFirma(opt.id as any);
                    if (opt.id === 'PAGINA_1') {
                      setPaginaSeleccionada(1);
                      setFirmaPos({ x: 50, y: 80 });
                    } else if (opt.id === 'PIE_PAGINA') {
                      setPaginaSeleccionada(totalPaginas || 1);
                      setFirmaPos({ x: 55, y: 80 });
                    } else if (opt.id === 'AL_FINAL') {
                      setPaginaSeleccionada(totalPaginas || 1);
                      setFirmaPos({ x: 50, y: 75 });
                    }
                  }}
                >
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={active ? '#ffffff' : themeColors.textSecondary}
                  />
                  <Text style={[styles.posChipText, { color: active ? '#ffffff' : themeColors.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selector de Página PDF cuando hay múltiples páginas */}
          {tipoDocumento === 'PDF' && selectedPdf && totalPaginas > 1 && (
            <View style={{ marginBottom: 12, backgroundColor: scheme === 'dark' ? '#1e293b' : '#e2e8f0', padding: 10, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: themeColors.text, marginBottom: 8 }}>
                📄 Selecciona la página donde colocarás la firma ({totalPaginas} páginas detectadas):
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((pageNum) => {
                  const isSelected = paginaSeleccionada === pageNum;
                  return (
                    <TouchableOpacity
                      key={pageNum}
                      style={[
                        styles.posChip,
                        {
                          backgroundColor: isSelected ? '#0284c7' : themeColors.backgroundElement,
                          borderColor: isSelected ? '#0284c7' : themeColors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        },
                      ]}
                      onPress={() => setPaginaSeleccionada(pageNum)}
                    >
                      <Ionicons
                        name={isSelected ? 'document' : 'document-outline'}
                        size={14}
                        color={isSelected ? '#ffffff' : themeColors.text}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: isSelected ? '#ffffff' : themeColors.text,
                        }}
                      >
                        Página {pageNum} {pageNum === totalPaginas ? '(Última)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Lienzo Interactivo de Posicionamiento Tipo DocuSign / Adobe Acrobat */}
          <View style={{ marginTop: 8 }}>
            {/* Selector de Modo: Firma vs Navegación */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={[
                  styles.posChip,
                  {
                    flex: 1,
                    justifyContent: 'center',
                    backgroundColor: modoInteraccion === 'FIRMA' ? '#0284c7' : themeColors.backgroundElement,
                    borderColor: modoInteraccion === 'FIRMA' ? '#0284c7' : themeColors.border,
                  },
                ]}
                onPress={() => setModoInteraccion('FIRMA')}
              >
                <Ionicons name="create-outline" size={16} color={modoInteraccion === 'FIRMA' ? '#ffffff' : themeColors.text} />
                <Text style={{ color: modoInteraccion === 'FIRMA' ? '#ffffff' : themeColors.text, fontWeight: 'bold', fontSize: 12 }}>
                  ✍️ Acomodar Recuadro Firma
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posChip,
                  {
                    flex: 1,
                    justifyContent: 'center',
                    backgroundColor: modoInteraccion === 'NAVEGAR' ? '#0284c7' : themeColors.backgroundElement,
                    borderColor: modoInteraccion === 'NAVEGAR' ? '#0284c7' : themeColors.border,
                  },
                ]}
                onPress={() => setModoInteraccion('NAVEGAR')}
              >
                <Ionicons name="document-text-outline" size={16} color={modoInteraccion === 'NAVEGAR' ? '#ffffff' : themeColors.text} />
                <Text style={{ color: modoInteraccion === 'NAVEGAR' ? '#ffffff' : themeColors.text, fontWeight: 'bold', fontSize: 12 }}>
                  📜 Navegar / Leer Hojas PDF
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: themeColors.text }}>
                {modoInteraccion === 'FIRMA'
                  ? '👇 Toca o haz clic sobre cualquier hoja para posicionar la firma:'
                  : '📜 Puedes desplazarte y leer las páginas del archivo PDF:'}
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.accent, fontWeight: 'bold' }}>
                📍 Hoja {paginaSeleccionada} de {totalPaginas} | X: {firmaPos.x}% | Y: {firmaPos.y}%
              </Text>
            </View>

            {/* Presets y Ajuste Fino con Flechas */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  setFirmaPos({ x: 55, y: 70 });
                  setPosicionFirma('PERSONALIZADO');
                }}
              >
                <Text style={styles.presetBtnText}>📍 Abajo Derecha</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  setFirmaPos({ x: 10, y: 70 });
                  setPosicionFirma('PERSONALIZADO');
                }}
              >
                <Text style={styles.presetBtnText}>📍 Abajo Izquierda</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  setFirmaPos({ x: 35, y: 45 });
                  setPosicionFirma('PERSONALIZADO');
                }}
              >
                <Text style={styles.presetBtnText}>📍 Centro Documento</Text>
              </TouchableOpacity>

              {/* Botones de Ajuste Fino (+ / - 2%) con límites seguros */}
              <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
                <TouchableOpacity
                  style={[styles.presetBtn, { paddingHorizontal: 6 }]}
                  onPress={() => setFirmaPos((prev) => ({ ...prev, y: Math.max(prev.y - 2, 3) }))}
                >
                  <Text style={styles.presetBtnText}>⬆️ Subir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetBtn, { paddingHorizontal: 6 }]}
                  onPress={() => setFirmaPos((prev) => ({ ...prev, y: Math.min(prev.y + 2, 85) }))}
                >
                  <Text style={styles.presetBtnText}>⬇️ Bajar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetBtn, { paddingHorizontal: 6 }]}
                  onPress={() => setFirmaPos((prev) => ({ ...prev, x: Math.max(prev.x - 2, 3) }))}
                >
                  <Text style={styles.presetBtnText}>⬅️ Izq</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetBtn, { paddingHorizontal: 6 }]}
                  onPress={() => setFirmaPos((prev) => ({ ...prev, x: Math.min(prev.x + 2, 75) }))}
                >
                  <Text style={styles.presetBtnText}>➡️ Der</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Contenedor tipo Escritorio que muestra las hojas de documento con proporción real 1:1 */}
            <View style={[styles.canvasDeskContainer, { backgroundColor: scheme === 'dark' ? '#0f172a' : '#f1f5f9' }]}>
              {tipoDocumento === 'PDF' && selectedPdf ? (
                // Renderizado vertical de TODAS las páginas del PDF
                <View style={{ width: '100%', alignItems: 'center', gap: 20 }}>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((pageNum) => {
                    const isTargetPage = (paginaSeleccionada || totalPaginas) === pageNum;
                    const ratio = (pageAspectRatios.length >= pageNum && pageAspectRatios[pageNum - 1])
                      ? pageAspectRatios[pageNum - 1]
                      : (1 / 1.414);

                    return (
                      <View key={`page-wrapper-${pageNum}`} style={{ width: '100%', alignItems: 'center' }}>
                        {/* Encabezado visible de la hoja */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 540, marginBottom: 6, paddingHorizontal: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: isTargetPage ? '#0284c7' : themeColors.textSecondary }}>
                            📄 Hoja {pageNum} de {totalPaginas} {pageNum === totalPaginas ? '(Última Hoja)' : ''}
                          </Text>
                          {isTargetPage ? (
                            <View style={{ backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                              <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: 'bold' }}>✓ FIRMA ASIGNADA AQUÍ</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={() => {
                                setPaginaSeleccionada(pageNum);
                                setPosicionFirma('PERSONALIZADO');
                              }}
                              style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                            >
                              <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '600' }}>Mover firma aquí ↗</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Hoja de papel interactiva */}
                        <View
                          onLayout={(e) => {
                            if (isTargetPage) {
                              canvasLayout.current.width = e.nativeEvent.layout.width;
                              canvasLayout.current.height = e.nativeEvent.layout.height;
                            }
                          }}
                          style={[
                            styles.interactivePaperCanvas,
                            {
                              aspectRatio: ratio,
                              borderColor: isTargetPage ? '#0284c7' : '#cbd5e1',
                              borderWidth: isTargetPage ? 2 : 1,
                            },
                          ]}
                        >
                          {/* Fondo de la página PDF */}
                          <View style={{ width: '100%', height: '100%', position: 'absolute', left: 0, top: 0, zIndex: 1 }}>
                            {Platform.OS === 'web' ? (
                              <iframe
                                key={`pdf-view-p${pageNum}`}
                                src={`${selectedPdf.uri}#page=${pageNum}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                                width="100%"
                                height="100%"
                                style={{
                                  border: 'none',
                                  display: 'block',
                                  pointerEvents: modoInteraccion === 'NAVEGAR' ? 'auto' : 'none',
                                }}
                              />
                            ) : (
                              <View style={[styles.paperContentBackground, { justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="document-text-outline" size={48} color="#0284c7" />
                                <Text style={{ fontWeight: 'bold', color: '#1e293b', marginTop: 8 }}>{selectedPdf.name} - Página {pageNum}</Text>
                              </View>
                            )}
                          </View>

                          {/* Capa de detección de clics y arrastre para esta página específica */}
                          {modoInteraccion === 'FIRMA' && (
                            Platform.OS === 'web' ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 5,
                                  cursor: 'crosshair',
                                }}
                                onMouseDown={(e) => handlePointerDownPage(e, pageNum)}
                                onMouseMove={(e) => handlePointerMovePage(e, pageNum)}
                                onMouseUp={handlePointerUpPage}
                              />
                            ) : (
                              <TouchableOpacity
                                activeOpacity={1}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }}
                                onPress={(e) => updateBoxPositionForPage(e, pageNum)}
                              />
                            )
                          )}

                          {/* Cuadro de firma (sólo visible sobre la página activa seleccionada) */}
                          {isTargetPage && (
                            <View
                              style={[
                                styles.draggableSignatureBox,
                                {
                                  left: `${firmaPos.x}%`,
                                  top: `${firmaPos.y}%`,
                                  zIndex: 10,
                                },
                              ]}
                              pointerEvents="none"
                            >
                              <View style={styles.sigBoxInner}>
                                <Text style={styles.sigBoxFieldText}>
                                  AQUI VA LA FIRMA
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                // Documento redactado en Texto
                <View
                  ref={canvasRef}
                  onLayout={(e) => {
                    canvasLayout.current.width = e.nativeEvent.layout.width;
                    canvasLayout.current.height = e.nativeEvent.layout.height;
                  }}
                  style={[styles.interactivePaperCanvas, { aspectRatio: 1 / 1.414 }]}
                >
                  <View style={[styles.paperContentBackground, { zIndex: 1 }]}>
                    <Text style={styles.paperHeaderTitle}>
                      {titulo.trim() || 'DOCUMENTO Y CONVENIO DE SERVICIOS'}
                    </Text>
                    <Text style={styles.paperBodyText} numberOfLines={5}>
                      {contenidoHtml.replace(/<[^>]*>?/gm, '') ||
                        'Leído que fue el presente contrato y enteradas las partes de su contenido y alcance legal, lo firman de conformidad al margen y al calce en la fecha indicada...'}
                    </Text>
                    <View style={styles.paperFooterRow}>
                      <View style={styles.paperSignBox}>
                        <View style={styles.paperLine} />
                        <Text style={styles.paperSignRole}>EL PATRÓN</Text>
                        <Text style={styles.paperSignSub}>Firma Representante Legal</Text>
                      </View>

                      <View style={styles.paperSignBox}>
                        <View style={styles.paperLine} />
                        <Text style={styles.paperSignRole}>EL TRABAJADOR / EMPLEADO</Text>
                        <Text style={styles.paperSignSub}>Firma de Conformidad</Text>
                      </View>
                    </View>
                  </View>

                  {modoInteraccion === 'FIRMA' && (
                    Platform.OS === 'web' ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 5,
                          cursor: 'crosshair',
                        }}
                        onMouseDown={(e) => handlePointerDownPage(e, 1)}
                        onMouseMove={(e) => handlePointerMovePage(e, 1)}
                        onMouseUp={handlePointerUpPage}
                      />
                    ) : (
                      <TouchableOpacity
                        activeOpacity={1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }}
                        onPress={(e) => updateBoxPositionForPage(e, 1)}
                      />
                    )
                  )}

                  <View
                    style={[
                      styles.draggableSignatureBox,
                      {
                        left: `${firmaPos.x}%`,
                        top: `${firmaPos.y}%`,
                        zIndex: 10,
                      },
                    ]}
                    pointerEvents="none"
                  >
                    <View style={styles.sigBoxInner}>
                      <Text style={styles.sigBoxFieldText}>
                        AQUI VA LA FIRMA
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Destinatarios */}
        <View style={[styles.sectionBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
              👥 Destinatarios del Documento
            </Text>
            <View style={{ backgroundColor: scheme === 'dark' ? '#1e293b' : '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0284c7' }}>
                {modoDestinatarios === 'TODOS'
                  ? `Todos (${empleados.length})`
                  : `${empleadosSeleccionados.length} seleccionados`}
              </Text>
            </View>
          </View>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 14 }}>
            Elige a qué grupo de usuarios asignar el documento o selecciona personas específicas.
          </Text>

          {/* Botones de Selección Rápida de Grupo */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              { id: 'TODOS', label: '👥 A Todos', desc: `${empleados.length} usuarios` },
              { id: 'EMPLEADOS', label: '👔 Todos los Empleados', desc: `${empleados.filter((e) => !e.rol || e.rol.toUpperCase() === 'EMPLEADO').length} emp.` },
              { id: 'DEVS', label: '💻 Todos los Devs', desc: `${empleados.filter((e) => e.rol && e.rol.toUpperCase() === 'DEV').length} devs` },
              { id: 'ADMINS', label: '🛡️ Todos los Admin', desc: `${empleados.filter((e) => e.rol && e.rol.toUpperCase() === 'ADMIN').length} admins` },
              { id: 'PERSONALIZADO', label: '🎯 Personalizado', desc: 'Selección manual' },
            ].map((grp) => {
              const active = modoDestinatarios === grp.id;
              return (
                <TouchableOpacity
                  key={grp.id}
                  style={[
                    styles.posChip,
                    {
                      backgroundColor: active ? '#0284c7' : (scheme === 'dark' ? '#1e293b' : '#ffffff'),
                      borderColor: active ? '#0284c7' : themeColors.border,
                      flexGrow: 1,
                      justifyContent: 'center',
                    },
                  ]}
                  onPress={() => handleSeleccionarGrupo(grp.id as any)}
                >
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={active ? '#ffffff' : themeColors.textSecondary}
                  />
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: active ? '#ffffff' : themeColors.text }}>
                      {grp.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : themeColors.textSecondary }}>
                      {grp.desc}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Listado de Usuarios con Selección Individual */}
          <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.label, { color: themeColors.text, marginBottom: 0 }]}>
                Listado de Usuarios ({empleados.length}):
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    setModoDestinatarios('PERSONALIZADO');
                    setRequiereTodos(false);
                    setEmpleadosSeleccionados(empleados.map((e) => e.id));
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '600' }}>Marcar todos</Text>
                </TouchableOpacity>
                <Text style={{ color: themeColors.border }}>|</Text>
                <TouchableOpacity
                  onPress={() => {
                    setModoDestinatarios('PERSONALIZADO');
                    setRequiereTodos(false);
                    setEmpleadosSeleccionados([]);
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '600' }}>Desmarcar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color={themeColors.accent} />
            ) : (
              <View style={styles.empList}>
                {empleados.map((emp) => {
                  const isSelected = modoDestinatarios === 'TODOS' || empleadosSeleccionados.includes(emp.id);
                  const roleUpper = (emp.rol || 'EMPLEADO').toUpperCase();
                  const roleBadgeColor =
                    roleUpper === 'ADMIN' ? '#ef4444' : roleUpper === 'DEV' ? '#8b5cf6' : '#0284c7';

                  return (
                    <TouchableOpacity
                      key={emp.id}
                      style={[
                        styles.empChip,
                        {
                          backgroundColor: isSelected ? (scheme === 'dark' ? '#0f2b48' : '#e0f2fe') : (scheme === 'dark' ? '#1e293b' : '#ffffff'),
                          borderColor: isSelected ? '#0284c7' : themeColors.border,
                        },
                      ]}
                      onPress={() => toggleEmpleado(emp.id)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={isSelected ? '#0284c7' : themeColors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.empChipText, { color: themeColors.text, fontWeight: isSelected ? '700' : '500' }]}>
                          {emp.nombre}
                        </Text>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }} numberOfLines={1}>
                          {emp.email}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: roleBadgeColor + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: roleBadgeColor }}>
                          {roleUpper}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Botón Acción */}
        <View style={{ marginTop: 24 }}>
          <CustomButton
            title="Emitir Documento y Asignar"
            onPress={handleGuardar}
            loading={isSubmitting}
            icon={<Ionicons name="send" size={18} color="#ffffff" />}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    marginBottom: 16,
  },
  tipoSelector: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tipoTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tipoTabActive: {
    backgroundColor: '#0284c7',
  },
  tipoTabText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  editorContainer: {
    marginVertical: 12,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tagBtnText: {
    color: '#0284c7',
    fontSize: 11,
    fontWeight: 'bold',
  },
  hintText: {
    fontSize: 12,
    marginVertical: 6,
  },
  pdfUploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    backgroundColor: '#f8fafc',
  },
  pdfUploadTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 12,
  },
  pickPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  pickPdfBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  pdfSelectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    width: '100%',
  },
  sectionBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  empList: {
    gap: 8,
    marginTop: 8,
  },
  empChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  empChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  previewPdfBtnText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  posChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  posChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  presetBtn: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284c7',
  },
  canvasDeskContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  interactivePaperCanvas: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  paperContentBackground: {
    padding: 20,
    height: '100%',
    justifyContent: 'space-between',
  },
  paperHeaderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  paperBodyText: {
    fontSize: 10,
    color: '#475569',
    textAlign: 'justify',
    lineHeight: 15,
  },
  paperFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  paperSignBox: {
    alignItems: 'center',
    width: 140,
  },
  paperLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#94a3b8',
    marginBottom: 4,
  },
  paperSignRole: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  paperSignSub: {
    fontSize: 8,
    color: '#64748b',
  },
  draggableSignatureBox: {
    position: 'absolute',
    width: '24%',
    aspectRatio: 2.6,
    zIndex: 10,
  },
  sigBoxInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224, 242, 254, 0.88)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#0284c7',
    borderRadius: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  sigBoxFieldText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284c7',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
