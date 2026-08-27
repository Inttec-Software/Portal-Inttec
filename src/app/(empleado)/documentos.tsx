import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { DocumentoService, DocumentoFirmado } from '@/services/supabase';
import { PdfDocumentoService } from '@/services/pdfDocumentoService';
import SignatureCanvasModal from '@/components/SignatureCanvasModal';
import CustomButton from '@/components/CustomButton';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function EmpleadoDocumentosScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user: authUser } = useAuth();

  const [documentos, setDocumentos] = useState<DocumentoFirmado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'firmados'>('pendientes');

  // Modal para Leer y Firmar Documento
  const [selectedDoc, setSelectedDoc] = useState<DocumentoFirmado | null>(null);
  const [modalLecturaVisible, setModalLecturaVisible] = useState(false);
  const [modalFirmaVisible, setModalFirmaVisible] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'Ok', onPress: onOk }] : undefined);
    }
  };

  useEffect(() => {
    cargarDocumentos();
  }, [authUser?.id]);

  const cargarDocumentos = async (isRefresh = false) => {
    if (!authUser?.id) return;
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await DocumentoService.obtenerMisDocumentosEmpleado(authUser.id);
      setDocumentos(data);
    } catch (error) {
      console.error('Error al cargar mis documentos:', error);
      Alert.alert('Error', 'No se pudieron obtener los documentos asignados.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const documentosPendientes = useMemo(
    () => documentos.filter((d) => d.estado === 'PENDIENTE'),
    [documentos]
  );

  const documentosFirmados = useMemo(
    () => documentos.filter((d) => d.estado === 'FIRMADO'),
    [documentos]
  );

  const handleAbrirLectura = (doc: DocumentoFirmado) => {
    setSelectedDoc(doc);
    setModalLecturaVisible(true);
  };

  const handleIniciarFirma = () => {
    setModalFirmaVisible(true);
  };

  const handleConfirmarFirma = async (signatureBase64: string) => {
    if (!selectedDoc || !selectedDoc.documentos) return;
    setIsSigning(true);

    try {
      // 1. Intentar obtener ubicación GPS
      let gpsString = 'No proporcionada';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsString = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        }
      } catch (e) {
        console.warn('GPS no disponible:', e);
      }

      const infoDispositivo = `${Platform.OS.toUpperCase()} (${Platform.Version || 'Mobile/Web'})`;

      // 2. Generar PDF compilado y firmado localmente con Hash SHA-256
      const pdfResult = await PdfDocumentoService.generarYCompartirPdf({
        documento: selectedDoc.documentos,
        firmado: { ...selectedDoc, firmado_at: new Date().toISOString() },
        firmaBase64: signatureBase64,
        ipRegistro: 'App Inttec (Autenticado)',
        ubicacionGps: gpsString,
        dispositivoInfo: infoDispositivo,
      });

      let pdfFirmadoUrl: string | undefined = undefined;

      if (pdfResult?.uri) {
        try {
          pdfFirmadoUrl = await DocumentoService.subirPdfFirmado(
            pdfResult.uri,
            `Firmado_${selectedDoc.empleado_nombre || 'Empleado'}_${selectedDoc.documentos.titulo}.pdf`
          );
        } catch (uploadErr) {
          console.warn('No se pudo subir PDF firmado a almacenamiento remoto:', uploadErr);
        }
      }

      // 3. Registrar firma completa en Supabase con la URL del PDF firmado
      await DocumentoService.registrarFirma(selectedDoc.id, {
        firmaBase64: signatureBase64,
        pdfUrl: pdfFirmadoUrl,
        ipRegistro: 'App Inttec (Autenticado)',
        ubicacionGps: gpsString,
        dispositivoInfo: infoDispositivo,
        hashSha256: pdfResult.hashSha256,
      });

      showAlert('¡Documento Firmado!', 'Has firmado el documento exitosamente con validez legal.', () => {
        setModalLecturaVisible(false);
        cargarDocumentos();
      });
    } catch (error: any) {
      console.error('Error al procesar la firma:', error);
      const msg = error?.message || String(error);
      showAlert('Error', `Ocurrió un fallo al registrar la firma del documento: ${msg}`);
    } finally {
      setIsSigning(false);
    }
  };

  const renderCard = ({ item }: { item: DocumentoFirmado }) => {
    const docInfo = item.documentos;
    const esPendiente = item.estado === 'PENDIENTE';

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View
                style={[
                  styles.badgeState,
                  {
                    backgroundColor: esPendiente ? '#fef3c7' : '#d1fae5',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: esPendiente ? '#b45309' : '#047857' },
                  ]}
                >
                  {esPendiente ? 'Pendiente de Firma' : 'Firmado Digitalmente'}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              {docInfo?.titulo || 'Documento Corporativo'}
            </Text>
          </View>
        </View>

        {docInfo?.descripcion ? (
          <Text numberOfLines={2} style={[styles.cardDesc, { color: themeColors.textSecondary }]}>
            {docInfo.descripcion}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={[styles.cardMeta, { color: themeColors.textSecondary }]}>
            Emitido por: {docInfo?.creador_nombre || 'Administración'} •{' '}
            {new Date(item.created_at || '').toLocaleDateString()}
          </Text>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: esPendiente ? '#0284c7' : '#334155' },
            ]}
            onPress={() => handleAbrirLectura(item)}
          >
            <Ionicons
              name={esPendiente ? 'create-outline' : 'document-text-outline'}
              size={16}
              color="#ffffff"
            />
            <Text style={styles.actionBtnText}>
              {esPendiente ? 'Leer y Firmar' : 'Ver Documento'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listaActual = activeTab === 'pendientes' ? documentosPendientes : documentosFirmados;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={styles.topHeader}>
        <Text style={[styles.title, { color: themeColors.text }]}>Mis Documentos y Firmas</Text>
        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
          Revisa y firma digitalmente las cartas y comunicados oficiales de la empresa.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'pendientes' && { borderBottomColor: '#0284c7', borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('pendientes')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'pendientes' ? '#0284c7' : themeColors.textSecondary },
            ]}
          >
            Pendientes ({documentosPendientes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'firmados' && { borderBottomColor: '#0284c7', borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('firmados')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'firmados' ? '#0284c7' : themeColors.textSecondary },
            ]}
          >
            Firmados ({documentosFirmados.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Cargando documentos...</Text>
        </View>
      ) : (
        <FlatList
          data={listaActual}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{ paddingBottom: 40 }}
          onRefresh={() => cargarDocumentos(true)}
          refreshing={isRefreshing}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={activeTab === 'pendientes' ? 'checkmark-circle-outline' : 'folder-open-outline'}
                size={64}
                color={themeColors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>
                {activeTab === 'pendientes'
                  ? '¡Felicidades! No tienes documentos pendientes por firmar.'
                  : 'No tienes documentos firmados en tu historial.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Modal de Lectura y Firma del Documento */}
      <Modal statusBarTranslucent={true}
        visible={modalLecturaVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalLecturaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {selectedDoc?.documentos?.titulo}
                </Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                  Emitido por: {selectedDoc?.documentos?.creador_nombre}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalLecturaVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.docScrollContent}>
              {selectedDoc?.documentos?.archivo_pdf_url ? (
                <View style={[styles.pdfNoticeBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f2b48' : '#f0f9ff' }]}>
                  <Ionicons name="document-text-outline" size={32} color={scheme === 'dark' ? '#38bdf8' : '#0284c7'} />
                  <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 14, marginTop: 6 }}>
                    Documento PDF Adjunto Original
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center', marginVertical: 6 }}>
                    Haz clic a continuación para abrir y leer el archivo PDF completo de la empresa antes de firmar.
                  </Text>
                  <TouchableOpacity
                    style={[styles.openPdfBtn, { backgroundColor: themeColors.accent }]}
                    onPress={() => {
                      if (selectedDoc.documentos?.archivo_pdf_url) {
                        Linking.openURL(selectedDoc.documentos.archivo_pdf_url);
                      }
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>
                      Abrir y Leer Documento PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.htmlViewBox, { borderColor: themeColors.border, backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc' }]}>
                  <Text style={[styles.htmlContentText, { color: themeColors.text }]}>
                    {selectedDoc?.documentos?.contenido_html.replace(/<[^>]*>?/gm, '')}
                  </Text>
                </View>
              )}

              {selectedDoc?.estado === 'FIRMADO' && (
                <View style={[styles.signedNotice, { backgroundColor: scheme === 'dark' ? '#064e3b' : '#d1fae5' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={scheme === 'dark' ? '#34d399' : '#047857'} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', color: scheme === 'dark' ? '#34d399' : '#047857', fontSize: 13 }}>
                      Documento Firmado el {new Date(selectedDoc.firmado_at || '').toLocaleString()}
                    </Text>
                    <Text style={{ color: scheme === 'dark' ? '#6ee7b7' : '#065f46', fontSize: 11 }}>
                      Hash SHA-256: {selectedDoc.hash_sha256 || 'Registrado'}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              {selectedDoc?.estado === 'PENDIENTE' ? (
                <CustomButton
                  title="Firmar Este Documento Ahora"
                  onPress={handleIniciarFirma}
                  loading={isSigning}
                  icon={<Ionicons name="create-outline" size={20} color="#ffffff" />}
                />
              ) : (
                <CustomButton
                  title="Re-descargar PDF Certificado"
                  onPress={async () => {
                    if (selectedDoc && selectedDoc.documentos) {
                      await PdfDocumentoService.generarYCompartirPdf({
                        documento: selectedDoc.documentos,
                        firmado: selectedDoc,
                        firmaBase64: selectedDoc.firma_base64 || '',
                        ipRegistro: selectedDoc.ip_registro || 'N/A',
                        ubicacionGps: selectedDoc.ubicacion_gps || 'N/A',
                        dispositivoInfo: selectedDoc.dispositivo_info || 'N/A',
                      });
                    }
                  }}
                  icon={<Ionicons name="download-outline" size={20} color="#ffffff" />}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Canvas de Firma Táctil */}
      <SignatureCanvasModal
        visible={modalFirmaVisible}
        onClose={() => setModalFirmaVisible(false)}
        onConfirm={handleConfirmarFirma}
        titulo={`Firma: ${selectedDoc?.documentos?.titulo}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  topHeader: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardDesc: {
    fontSize: 13,
    marginVertical: 8,
  },
  badgeState: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 8,
  },
  cardMeta: {
    fontSize: 11,
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  docScrollContent: {
    marginVertical: 10,
  },
  htmlViewBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#f8fafc',
    minHeight: 180,
  },
  htmlContentText: {
    fontSize: 14,
    lineHeight: 22,
  },
  signedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#d1fae5',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  pdfNoticeBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
  },
  openPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 8,
  },
  modalFooter: {
    marginTop: 16,
  },
});
