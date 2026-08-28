import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import { logger } from '@/utils/logger';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import ImageViewerModal from '@/components/ImageViewerModal';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';

export default function MisEvidenciasHistorial() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [selectedEvidencia, setSelectedEvidencia] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const fetchMisEvidencias = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/evidencias/mis-evidencias`, { headers });
      if (!res.ok) throw new Error('Error al cargar mis evidencias');
      const data = await res.json();
      setEvidencias(data.evidencias || []);
    } catch (error) {
      logger.error('Error fetching mis evidencias', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMisEvidencias();
    }, [])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchMisEvidencias(true);
  };

  const handleOpenPhoto = (uri: string | null | undefined) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
    }
  };

  const handleExportPDF = async (ev: any) => {
    setIsExporting(true);
    try {
      await EvidenceReportGenerator.exportToPDF(
        ev,
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
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateStr.split('T')[0];
    }
  };

  const filteredEvidencias = useMemo(() => {
    if (!searchQuery) return evidencias;
    const lowerQ = searchQuery.toLowerCase();
    return evidencias.filter((ev: any) => {
      const matchClient = ev.cliente?.toLowerCase().includes(lowerQ);
      const matchDesc = ev.descripcion_trabajo?.toLowerCase().includes(lowerQ);
      return matchClient || matchDesc;
    });
  }, [evidencias, searchQuery]);

  const renderItem = ({ item }: { item: any }) => {
    let materialCount = 0;
    try {
      if (item.descripcion_trabajo) {
        const parsed = JSON.parse(item.descripcion_trabajo);
        parsed.forEach((t: any) => {
          if (t.materiales_usados && Array.isArray(t.materiales_usados)) {
            materialCount += t.materiales_usados.length;
          } else if (t.materiales) {
             materialCount += t.materiales.split(',').filter((m: string) => m.trim().length > 0).length;
          }
        });
      } else if (item.materiales_usados) {
        materialCount = item.materiales_usados.split(',').filter((m: string) => m.trim().length > 0).length;
      }
    } catch (e) {}

    const materialText = materialCount > 0 ? `${materialCount} mat.` : 'No';
    const fotosCount = (item.foto_antes_url ? 1 : 0) + (item.foto_despues_url ? 1 : 0) + (item.fotos_adicionales_urls ? item.fotos_adicionales_urls.length : 0);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          setSelectedEvidencia(item);
          setModalVisible(true);
        }}
        style={[styles.tableRow, { borderBottomColor: themeColors.border }]}
      >
        <Text style={[styles.tdText, { flex: 1.5, color: themeColors.textSecondary }]} numberOfLines={2}>
          {dayjs(item.created_at).format('DD/MM/YY, hh:mm A')}
        </Text>
        <Text style={[styles.tdText, { flex: 2.5, color: themeColors.text }]} numberOfLines={2}>
          {item.cliente || 'Sin cliente'}
        </Text>
        <Text style={[styles.tdText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>
          {fotosCount} fotos
        </Text>
        <Text style={[styles.tdText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>
          {materialText}
        </Text>
        <View style={styles.actionCell}>
           <Ionicons name="eye-outline" size={20} color={themeColors.accent} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['bottom', 'left', 'right']}>
      {!isLoading && (
        <View style={styles.topHeader}>
          <Text style={[styles.pageTitle, { color: themeColors.text }]}>Evidencias de Trabajo</Text>
          <CustomInput
            placeholder="Buscar por cliente, descripción o material..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            iconName="search-outline"
          />
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : evidencias.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={64} color={themeColors.border} />
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
            No has subido ninguna evidencia aún.
          </Text>
          <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
            Toca el botón "+" abajo para agregar tu primera evidencia.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={[styles.tableHeader, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.thText, { flex: 1.5, color: themeColors.textSecondary }]}>Fecha de Reg.</Text>
            <Text style={[styles.thText, { flex: 2.5, color: themeColors.textSecondary }]}>Cliente</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>Fotos</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>Material</Text>
            <View style={styles.actionCellHeader}>
               <Ionicons name="settings-outline" size={14} color={themeColors.textSecondary} />
            </View>
          </View>
          <FlatList
            data={filteredEvidencias}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={themeColors.accent} />
            }
          />
        </View>
      )}

      {/* Modal de Detalle */}
      <Modal statusBarTranslucent={true}
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
                    } catch {}

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
                                <Text style={{ fontWeight: '600' }}>Situación encontrada: </Text>{t.descripcion}
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
                          <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Situación encontrada</Text>
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
                        {selectedEvidencia.fotos_adicionales_urls.map((url: string, index: number) => (
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

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: themeColors.accent }]}
        activeOpacity={0.8}
        onPress={() => router.push('/(empleado)/agregar-evidencia')}
      >
        <Ionicons name="add" size={32} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  topHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: Spacing.three,
  },
  emptyText: {
    marginTop: Spacing.three,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: Spacing.one,
    fontSize: 14,
    textAlign: 'center',
  },
  listContainer: {
    padding: 0,
    paddingBottom: 100,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  thText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  tdText: {
    fontSize: 13,
  },
  actionCell: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actionCellHeader: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
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
  adicionalPhotosScroll: {
    gap: Spacing.two,
  },
  adicionalPhotoCard: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    marginRight: Spacing.two,
    backgroundColor: '#000',
  },
  adicionalModalImage: {
    width: '100%',
    height: '100%',
  },
  modalActionContainer: {
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  }
});
