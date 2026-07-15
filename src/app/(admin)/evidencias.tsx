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
  Image,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario, Evidencia } from '@/services/supabase';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewerModal from '@/components/ImageViewerModal';

export default function AdminEvidenciasScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [adminUser, setAdminUser] = useState<Usuario | null>(null);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [employees, setEmployees] = useState<Usuario[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal de Detalles
  const [selectedEvidencia, setSelectedEvidencia] = useState<Evidencia | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Modal de imagen a pantalla completa
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const handleOpenPhoto = (uri: string | null | undefined) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
    }
  };

  async function refreshData(isRefresh = false) {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      // 1. Obtener todas las evidencias
      const { data: evidencesData, error: evidencesErr } = await supabase
        .from('evidencias')
        .select('*')
        .order('created_at', { ascending: false });

      if (evidencesErr) throw evidencesErr;
      setEvidencias(evidencesData || []);

      // 2. Obtener lista de personal (usuarios de tipo EMPLEADO)
      const { data: employeesData, error: employeesErr } = await supabase
        .from('usuarios')
        .select('*')
        .eq('rol', 'EMPLEADO')
        .order('nombre');

      if (employeesErr) throw employeesErr;
      setEmployees(employeesData || []);
    } catch (err: any) {
      console.error('Error al actualizar evidencias:', err.message);
      Alert.alert('Error', 'No se pudieron recuperar los reportes de trabajo.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user || user.rol !== 'ADMIN') {
        router.replace('/');
        return;
      }
      setAdminUser(user);
      await refreshData();
    };
    init();
  }, [router]);

  const filteredEvidencias = useMemo(() => {
    let result = evidencias;

    // Filtro por Empleado
    if (selectedEmployeeId) {
      result = result.filter((e) => e.empleado_id === selectedEmployeeId);
    }

    // Filtro por Caja de Búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.cliente.toLowerCase().includes(q) ||
          e.descripcion_trabajo.toLowerCase().includes(q) ||
          (e.empleado_nombre && e.empleado_nombre.toLowerCase().includes(q)) ||
          (e.materiales_usados && e.materiales_usados.toLowerCase().includes(q))
      );
    }

    return result;
  }, [searchQuery, selectedEmployeeId, evidencias]);

  const handleExportPDF = async (ev: Evidencia) => {
    setIsExporting(true);
    try {
      await EvidenceReportGenerator.exportToPDF(
        ev,
        ev.foto_antes_url || null,
        ev.foto_despues_url || null,
        ev.empleado_nombre || 'Técnico Autorizado',
        ev.fotos_adicionales_urls || []
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo exportar el PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const formatFriendlyDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr.split('T')[0];
      }
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Evidencias de Trabajo</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <CustomInput
          placeholder="Buscar por cliente, descripción, material o técnico..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          iconName="search-outline"
        />
      </View>

      {/* Filtro horizontal de Empleados */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          <TouchableOpacity
            onPress={() => setSelectedEmployeeId(null)}
            style={[
              styles.filterPill,
              {
                backgroundColor: selectedEmployeeId === null ? themeColors.accent : themeColors.backgroundElement,
                borderColor: selectedEmployeeId === null ? themeColors.accent : themeColors.border,
              },
            ]}
          >
            <Text style={[styles.filterPillText, { color: selectedEmployeeId === null ? '#ffffff' : themeColors.textSecondary }]}>
              Todos
            </Text>
          </TouchableOpacity>

          {employees.map((emp) => (
            <TouchableOpacity
              key={emp.id}
              onPress={() => setSelectedEmployeeId(emp.id)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: selectedEmployeeId === emp.id ? themeColors.accent : themeColors.backgroundElement,
                  borderColor: selectedEmployeeId === emp.id ? themeColors.accent : themeColors.border,
                },
              ]}
            >
              <Text style={[styles.filterPillText, { color: selectedEmployeeId === emp.id ? '#ffffff' : themeColors.textSecondary }]}>
                {emp.nombre.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Listado de Reportes */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>
            Cargando evidencias...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvidencias}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => refreshData(true)}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.backgroundElement,
                  borderColor: themeColors.border,
                },
              ]}
              onPress={() => {
                setSelectedEvidencia(item);
                setModalVisible(true);
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardClient, { color: themeColors.text }]} numberOfLines={1}>
                  {item.cliente}
                </Text>
                <Text style={[styles.cardDate, { color: themeColors.textSecondary }]}>
                  {formatFriendlyDate(item.created_at).split(',')[0]}
                </Text>
              </View>

              <Text style={[styles.cardTechName, { color: themeColors.accent, fontWeight: '700' }]}>
                Técnico: {item.empleado_nombre || 'Desconocido'}
              </Text>

              <Text style={[styles.cardDesc, { color: themeColors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
                {item.descripcion_trabajo}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.indicatorGroup}>
                  {item.foto_antes_url && (
                    <View style={[styles.indicator, { backgroundColor: themeColors.danger + '20' }]}>
                      <Text style={[styles.indicatorText, { color: themeColors.danger }]}>Antes</Text>
                    </View>
                  )}
                  {item.foto_despues_url && (
                    <View style={[styles.indicator, { backgroundColor: themeColors.success + '20' }]}>
                      <Text style={[styles.indicatorText, { color: themeColors.success }]}>Después</Text>
                    </View>
                  )}
                  {item.resumen_ia && (
                    <View style={[styles.indicator, { backgroundColor: themeColors.accent + '20' }]}>
                      <Ionicons name="sparkles" size={10} color={themeColors.accent} />
                      <Text style={[styles.indicatorText, { color: themeColors.accent, marginLeft: 2 }]}>IA</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={64} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No se encontraron reportes técnicos de trabajo.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal de Detalle */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle de Evidencia</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSelectedEvidencia(null);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {selectedEvidencia && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                {/* Fotos de Evidencia */}
                <View style={styles.evidencePhotosContainer}>
                  {selectedEvidencia.foto_antes_url ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => handleOpenPhoto(selectedEvidencia.foto_antes_url)}
                      style={styles.photoWrapper}
                    >
                      <Text style={[styles.photoTypeLabel, { color: themeColors.danger }]}>Antes</Text>
                      <Image
                        source={{ uri: selectedEvidencia.foto_antes_url }}
                        style={styles.modalImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.modalNoImage, { backgroundColor: themeColors.backgroundElement }]}>
                      <Ionicons name="camera-outline" size={32} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Sin foto del Antes</Text>
                    </View>
                  )}

                  {selectedEvidencia.foto_despues_url ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => handleOpenPhoto(selectedEvidencia.foto_despues_url)}
                      style={styles.photoWrapper}
                    >
                      <Text style={[styles.photoTypeLabel, { color: themeColors.success }]}>Después</Text>
                      <Image
                        source={{ uri: selectedEvidencia.foto_despues_url }}
                        style={styles.modalImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.modalNoImage, { backgroundColor: themeColors.backgroundElement }]}>
                      <Ionicons name="camera-outline" size={32} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Sin foto del Después</Text>
                    </View>
                  )}
                </View>

                {/* Campos de Información */}
                <View style={styles.modalDetails}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Técnico Responsable</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text, fontWeight: '700' }]}>
                      {selectedEvidencia.empleado_nombre || 'N/D'}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Cliente / Ubicación</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {selectedEvidencia.cliente}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Fecha de Registro</Text>
                    <Text style={[styles.detailValue, { color: themeColors.text }]}>
                      {formatFriendlyDate(selectedEvidencia.created_at)}
                    </Text>
                  </View>

                  {(() => {
                    let listTrabajos = [];
                    let isJson = false;
                    try {
                      if (selectedEvidencia.descripcion_trabajo && selectedEvidencia.descripcion_trabajo.trim().startsWith('[')) {
                        listTrabajos = JSON.parse(selectedEvidencia.descripcion_trabajo);
                        isJson = true;
                      }
                    } catch (e) {}

                    if (isJson && listTrabajos.length > 0) {
                      return (
                        <View style={{ marginTop: Spacing.two, marginBottom: Spacing.two }}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: Spacing.one }]}>
                            Trabajos Realizados
                          </Text>
                          {listTrabajos.map((t: any, index: number) => (
                            <View key={index} style={{
                              marginBottom: Spacing.two,
                              padding: Spacing.two,
                              borderWidth: 1,
                              borderColor: themeColors.border,
                              borderRadius: BorderRadius.medium,
                              backgroundColor: themeColors.backgroundElement
                            }}>
                              <Text style={{ fontWeight: '700', fontSize: 13, color: themeColors.accent, marginBottom: 4 }}>
                                Trabajo #{index + 1}
                              </Text>
                              <Text style={{ fontSize: 13, color: themeColors.text, marginBottom: 2 }}>
                                <Text style={{ fontWeight: '600' }}>Descripción: </Text>{t.descripcion}
                              </Text>
                              {t.materiales && (
                                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 2 }}>
                                  <Text style={{ fontWeight: '600' }}>Materiales: </Text>{t.materiales}
                                </Text>
                              )}
                              {(t.solucion || t.observaciones) && (
                                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                                  <Text style={{ fontWeight: '600' }}>Solución: </Text>{t.solucion || t.observaciones}
                                </Text>
                              )}
                            </View>
                          ))}
                        </View>
                      );
                    }

                    return (
                      <>
                        <View style={styles.detailItem}>
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Descripción del Trabajo</Text>
                          <Text style={[styles.detailValue, { color: themeColors.text }]}>
                            {selectedEvidencia.descripcion_trabajo}
                          </Text>
                        </View>

                        {selectedEvidencia.materiales_usados && (
                          <View style={styles.detailItem}>
                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Materiales Utilizados</Text>
                            <Text style={[styles.detailValue, { color: themeColors.text }]}>
                              {selectedEvidencia.materiales_usados}
                            </Text>
                          </View>
                        )}

                        {selectedEvidencia.observaciones && (
                          <View style={styles.detailItem}>
                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Solución</Text>
                            <Text style={[styles.detailValue, { color: themeColors.text }]}>
                              {selectedEvidencia.observaciones}
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}

                  {selectedEvidencia.fotos_adicionales_urls && selectedEvidencia.fotos_adicionales_urls.length > 0 && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: Spacing.two }]}>
                        Fotos Adicionales
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adicionalPhotosScroll}>
                        {selectedEvidencia.fotos_adicionales_urls.map((url, index) => (
                          <TouchableOpacity
                            key={index}
                            activeOpacity={0.9}
                            onPress={() => handleOpenPhoto(url)}
                            style={styles.adicionalPhotoCard}
                          >
                            <Image source={{ uri: url }} style={styles.adicionalModalImage} resizeMode="cover" />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Resumen IA */}
                  {selectedEvidencia.resumen_ia && (
                    <View style={styles.aiReportSection}>
                      <View style={styles.aiHeader}>
                        <Ionicons name="sparkles" size={18} color={themeColors.accent} />
                        <Text style={[styles.aiTitle, { color: themeColors.accent }]}>
                          Análisis Técnico IA (Gemini)
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.aiReportBox,
                          {
                            backgroundColor: themeColors.backgroundElement,
                            borderColor: themeColors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.aiText, { color: themeColors.text }]}>
                          {selectedEvidencia.resumen_ia}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Acciones */}
                <View style={styles.modalActionContainer}>
                  <CustomButton
                    title="EXPORTAR REPORTE (PDF)"
                    onPress={() => handleExportPDF(selectedEvidencia)}
                    loading={isExporting}
                    variant="primary"
                    icon={<Ionicons name="document-text-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  backBtn: {
    padding: Spacing.one,
  },
  searchContainer: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  filterSection: {
    marginBottom: Spacing.two,
  },
  filterScrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  filterPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  card: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardClient: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: Spacing.two,
  },
  cardDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardTechName: {
    fontSize: 12,
    marginTop: 4,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  indicatorGroup: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  indicatorText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.seven,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    height: '90%',
    padding: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalScroll: {
    paddingBottom: Spacing.six,
  },
  evidencePhotosContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  photoWrapper: {
    flex: 1,
    position: 'relative',
    height: 140,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  photoTypeLabel: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.small,
    textTransform: 'uppercase',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalNoImage: {
    flex: 1,
    height: 140,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
  },
  modalDetails: {
    gap: Spacing.three,
  },
  detailItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: Spacing.one,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 18,
  },
  aiReportSection: {
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  aiReportBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
  },
  aiText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalActionContainer: {
    marginTop: Spacing.four,
  },
  adicionalPhotosScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.two,
  },
  adicionalPhotoCard: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    marginRight: Spacing.two,
    backgroundColor: '#000',
  },
  adicionalModalImage: {
    width: '100%',
    height: '100%',
  },
});
