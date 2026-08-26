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
  useWindowDimensions,
  Linking,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { DocumentoService, Documento, DocumentoFirmado } from '@/services/supabase';
import { PdfDocumentoService } from '@/services/pdfDocumentoService';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';

export default function AdminDocumentosScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de Detalle de Firmas por Empleado
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [firmasDetalle, setFirmasDetalle] = useState<DocumentoFirmado[]>([]);
  const [isLoadingFirmas, setIsLoadingFirmas] = useState(false);
  const [modalFirmasVisible, setModalFirmasVisible] = useState(false);

  useEffect(() => {
    cargarDocumentos();
  }, []);

  const cargarDocumentos = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await DocumentoService.obtenerDocumentosAdmin();
      setDocumentos(data);
    } catch (error) {
      console.error('Error al cargar documentos:', error);
      Alert.alert('Error', 'No se pudieron cargar los documentos corporativos.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleOpenDetalleFirmas = async (doc: Documento) => {
    setSelectedDoc(doc);
    setModalFirmasVisible(true);
    setIsLoadingFirmas(true);

    try {
      const detalle = await DocumentoService.obtenerFirmasDeDocumento(doc.id);
      setFirmasDetalle(detalle);
    } catch (error) {
      console.error('Error al cargar detalle de firmas:', error);
      Alert.alert('Error', 'No se pudo obtener el desglose de firmas.');
    } finally {
      setIsLoadingFirmas(false);
    }
  };

  const handleEliminarDocumento = (doc: Documento) => {
    const ejecutarEliminacion = async () => {
      try {
        await DocumentoService.eliminarDocumento(doc.id);
        await cargarDocumentos();
        if (selectedDoc?.id === doc.id) setModalFirmasVisible(false);
      } catch (err: any) {
        console.error('Error al eliminar documento:', err);
        const msg = err?.message || String(err);
        if (Platform.OS === 'web') {
          window.alert(`Error: No se pudo eliminar el documento. (${msg})`);
        } else {
          Alert.alert('Error', `No se pudo eliminar el documento: ${msg}`);
        }
      }
    };

    const mensaje = `¿Estás seguro de eliminar "${doc.titulo}" y todo su historial de firmas? Esta acción no se puede deshacer.`;

    if (Platform.OS === 'web') {
      const confirmado = window.confirm(mensaje);
      if (confirmado) {
        ejecutarEliminacion();
      }
    } else {
      Alert.alert(
        'Eliminar Documento',
        mensaje,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: ejecutarEliminacion,
          },
        ]
      );
    }
  };

  const documentosFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return documentos;
    const query = searchQuery.toLowerCase();
    return documentos.filter(
      (d) =>
        d.titulo.toLowerCase().includes(query) ||
        (d.descripcion && d.descripcion.toLowerCase().includes(query)) ||
        d.creador_nombre.toLowerCase().includes(query)
    );
  }, [documentos, searchQuery]);

  const renderDocumentoCard = ({ item }: { item: Documento }) => {
    const total = item.total_asignados || 0;
    const firmados = item.total_firmados || 0;
    const porcentaje = total > 0 ? Math.round((firmados / total) * 100) : 0;

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
              <View style={[styles.badgeState, { backgroundColor: '#e0f2fe' }]}>
                <Text style={[styles.badgeText, { color: '#0369a1' }]}>{item.estado}</Text>
              </View>
              {item.requiere_todos && (
                <View style={[styles.badgeState, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.badgeText, { color: '#b45309' }]}>Todos los Empleados</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{item.titulo}</Text>
          </View>

          <TouchableOpacity
            onPress={() => handleEliminarDocumento(item)}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {item.descripcion ? (
          <Text numberOfLines={2} style={[styles.cardDesc, { color: themeColors.textSecondary }]}>
            {item.descripcion}
          </Text>
        ) : null}

        {/* Barra de Progreso de Firmas */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTextRow}>
            <Text style={[styles.progressLabel, { color: themeColors.text }]}>
              Estatus de Firmas: <Text style={{ fontWeight: 'bold' }}>{firmados} de {total}</Text>
            </Text>
            <Text style={[styles.progressPercent, { color: themeColors.accent }]}>{porcentaje}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${porcentaje}%`, backgroundColor: porcentaje === 100 ? '#10b981' : '#0284c7' },
              ]}
            />
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.cardMeta, { color: themeColors.textSecondary }]}>
            Emitido por: {item.creador_nombre} • {new Date(item.created_at || '').toLocaleDateString()}
          </Text>
          <TouchableOpacity
            style={styles.detailBtn}
            onPress={() => handleOpenDetalleFirmas(item)}
          >
            <Ionicons name="people-outline" size={16} color="#ffffff" />
            <Text style={styles.detailBtnText}>Ver Firmantes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header & Botón Crear */}
      <View style={styles.topHeader}>
        <View>
          <Text style={[styles.title, { color: themeColors.text }]}>Módulo de Documentos y Firmas</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Gestión corporativa de comunicados, cartas responsivas y acuerdos legales.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.newDocBtn}
          onPress={() => router.push('/(admin)/nuevo-documento' as any)}
        >
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={styles.newDocBtnText}>Emitir Documento</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={{ marginBottom: 16 }}>
        <CustomInput
          placeholder="Buscar por título, descripción o emisor..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          iconName="search-outline"
        />
      </View>

      {/* Lista */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Cargando documentos...</Text>
        </View>
      ) : (
        <FlatList
          data={documentosFiltrados}
          keyExtractor={(item) => item.id}
          renderItem={renderDocumentoCard}
          contentContainerStyle={{ paddingBottom: 40 }}
          onRefresh={() => cargarDocumentos(true)}
          refreshing={isRefreshing}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>
                No hay documentos emitidos aún.
              </Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }}>
                Presiona "Emitir Documento" para crear el primero.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Detalle de Firmas */}
      <Modal
        visible={modalFirmasVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalFirmasVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={[styles.modalHeaderIconBg, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe' }]}>
                  <Ionicons name="document-text" size={22} color="#0284c7" />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {selectedDoc?.titulo}
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    Desglose de Firmas por Empleado
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: scheme === 'dark' ? '#334155' : '#f1f5f9' }]}
                onPress={() => setModalFirmasVisible(false)}
              >
                <Ionicons name="close" size={20} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Contador Resumen Simétrico */}
            {firmasDetalle.length > 0 && (
              <View style={[styles.modalStatsRow, { backgroundColor: scheme === 'dark' ? '#0f172a' : '#f8fafc', borderColor: themeColors.border }]}>
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '700', letterSpacing: 0.5 }}>TOTAL</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text, marginTop: 2 }}>{firmasDetalle.length}</Text>
                </View>
                <View style={[styles.modalStatDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: '#059669', fontWeight: '700', letterSpacing: 0.5 }}>FIRMADOS</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#059669', marginTop: 2 }}>
                    {firmasDetalle.filter((f) => f.estado === 'FIRMADO').length}
                  </Text>
                </View>
                <View style={[styles.modalStatDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.modalStatItem}>
                  <Text style={{ fontSize: 10, color: '#d97706', fontWeight: '700', letterSpacing: 0.5 }}>PENDIENTES</Text>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#d97706', marginTop: 2 }}>
                    {firmasDetalle.filter((f) => f.estado !== 'FIRMADO' && f.estado !== 'RECHAZADO').length}
                  </Text>
                </View>
              </View>
            )}

            {isLoadingFirmas ? (
              <ActivityIndicator size="large" color={themeColors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView
                style={{ maxHeight: 440 }}
                contentContainerStyle={{ paddingVertical: 4, paddingRight: 6, gap: 10 }}
                showsVerticalScrollIndicator={true}
              >
                {firmasDetalle.map((firmante) => {
                  const isFirmado = firmante.estado === 'FIRMADO';
                  const isRechazado = firmante.estado === 'RECHAZADO';
                  const initials = (firmante.empleado_nombre || 'E')
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <View
                      key={firmante.id}
                      style={[
                        styles.firmanteCard,
                        {
                          backgroundColor: scheme === 'dark' ? '#1e293b' : '#ffffff',
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      {/* Avatar e Información del Empleado */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
                        <View
                          style={[
                            styles.firmanteAvatar,
                            {
                              backgroundColor: isFirmado
                                ? (scheme === 'dark' ? '#064e3b' : '#d1fae5')
                                : (scheme === 'dark' ? '#334155' : '#e2e8f0'),
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: 'bold',
                              color: isFirmado ? '#059669' : themeColors.text,
                            }}
                          >
                            {initials}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.firmanteName, { color: themeColors.text }]}>
                            {firmante.empleado_nombre}
                          </Text>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 1 }}>
                            {firmante.empleado_email || 'Sin correo registrado'}
                          </Text>
                          {firmante.firmado_at && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Ionicons name="checkmark-circle" size={13} color="#10b981" />
                              <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '500' }}>
                                Firmado el {new Date(firmante.firmado_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(firmante.firmado_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Estado y Botón de Acción */}
                      <View style={styles.firmanteActionCol}>
                        <View
                          style={[
                            styles.modalBadge,
                            {
                              backgroundColor: isFirmado
                                ? '#d1fae5'
                                : isRechazado
                                ? '#fee2e2'
                                : '#fef3c7',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.modalBadgeText,
                              {
                                color: isFirmado
                                  ? '#047857'
                                  : isRechazado
                                  ? '#b91c1c'
                                  : '#b45309',
                              },
                            ]}
                          >
                            {firmante.estado}
                          </Text>
                        </View>

                        {isFirmado && (
                          <>
                            {/* Ver PDF Limpio Estándar */}
                            <TouchableOpacity
                              style={[styles.pdfButtonFilled, { backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe' }]}
                              onPress={async () => {
                                if (firmante.pdf_firmado_url) {
                                  Linking.openURL(firmante.pdf_firmado_url);
                                } else if (selectedDoc && firmante.firma_base64) {
                                  try {
                                    await PdfDocumentoService.generarYCompartirPdf({
                                      documento: selectedDoc,
                                      firmado: firmante,
                                      firmaBase64: firmante.firma_base64,
                                      ipRegistro: firmante.ip_registro || 'Registrado',
                                      ubicacionGps: firmante.ubicacion_gps || 'No registrada',
                                      dispositivoInfo: firmante.dispositivo_info || 'Móvil/Web',
                                      incluirConstancia: false,
                                    });
                                  } catch (e) {
                                    Alert.alert('Error', 'No se pudo generar la vista del PDF firmado.');
                                  }
                                }
                              }}
                            >
                              <Ionicons name="document-text-outline" size={13} color="#0284c7" />
                              <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '700' }}>
                                Ver PDF
                              </Text>
                            </TouchableOpacity>

                            {/* Descargar PDF con Constancia NOM-151 */}
                            {selectedDoc && firmante.firma_base64 && (
                              <TouchableOpacity
                                style={[
                                  styles.constanciaButton,
                                  {
                                    backgroundColor: scheme === 'dark' ? '#1e1b4b' : '#f5f3ff',
                                    borderColor: scheme === 'dark' ? '#4338ca' : '#ddd6fe',
                                  },
                                ]}
                                onPress={async () => {
                                  try {
                                    await PdfDocumentoService.generarYCompartirPdf({
                                      documento: selectedDoc,
                                      firmado: firmante,
                                      firmaBase64: firmante.firma_base64,
                                      ipRegistro: firmante.ip_registro || 'Registrado',
                                      ubicacionGps: firmante.ubicacion_gps || 'No registrada',
                                      dispositivoInfo: firmante.dispositivo_info || 'Móvil/Web',
                                      incluirConstancia: true,
                                    });
                                  } catch (e) {
                                    Alert.alert('Error', 'No se pudo generar el PDF con constancia.');
                                  }
                                }}
                              >
                                <Ionicons name="shield-checkmark-outline" size={12} color="#7c3aed" />
                                <Text style={{ color: '#7c3aed', fontSize: 10, fontWeight: '700' }}>
                                  + Constancia
                                </Text>
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  newDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  newDocBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
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
    marginTop: 6,
    marginBottom: 12,
  },
  deleteBtn: {
    padding: 4,
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
  progressContainer: {
    marginVertical: 12,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 13,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 6,
  },
  cardMeta: {
    fontSize: 11,
    flex: 1,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  detailBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  modalStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  modalStatDivider: {
    width: 1,
    height: 24,
  },
  firmanteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  firmanteAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firmanteName: {
    fontSize: 14,
    fontWeight: '700',
  },
  firmanteActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: 118,
  },
  modalBadge: {
    width: '100%',
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  pdfButtonFilled: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 8,
  },
  constanciaButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
});
