import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomInput from '@/components/CustomInput';
import { EvidenciasCardsListSkeleton } from '@/components/skeleton';
import ImageViewerModal from '@/components/ImageViewerModal';
import { useEvidenciasList } from '@/features/evidencias/hooks/useEvidenciasList';
import EvidenciaDetailModal from '@/features/evidencias/components/EvidenciaDetailModal';
import { EvidenciaItem } from '@/features/evidencias/types';

export default function MisEvidenciasScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    evidencias,
    searchQuery,
    setSearchQuery,
    isLoading,
    isRefreshing,
    handleRefresh,
    selectedEvidencia,
    modalVisible,
    handleOpenDetail,
    handleCloseDetail,
    isExporting,
    handleExportPDF,
    selectedPhoto,
    viewerVisible,
    handleOpenPhoto,
    handleClosePhoto,
  } = useEvidenciasList({ isAdmin: false });

  const getCleanDescription = (desc: any) => {
    try {
      const list = typeof desc === 'string' ? JSON.parse(desc) : desc;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((t: any, i: number) => `#${i + 1}: ${t.descripcion || t.solucion || ''}`).filter(Boolean).join(' • ');
      }
    } catch {}
    return String(desc || '');
  };

  const countMateriales = (item: EvidenciaItem) => {
    let materialCount = 0;
    try {
      if (item.descripcion_trabajo) {
        const parsed =
          typeof item.descripcion_trabajo === 'string'
            ? JSON.parse(item.descripcion_trabajo)
            : item.descripcion_trabajo;
        if (Array.isArray(parsed)) {
          parsed.forEach((t: any) => {
            if (t.materiales_usados && Array.isArray(t.materiales_usados)) {
              materialCount += t.materiales_usados.length;
            } else if (t.materiales) {
              materialCount += t.materiales.split(',').filter((m: string) => m.trim().length > 0).length;
            }
          });
        }
      } else if (item.materiales_usados) {
        materialCount = item.materiales_usados.split(',').filter((m: string) => m.trim().length > 0).length;
      }
    } catch {}
    return materialCount;
  };

  // Render para celulares (Expo app y web celular)
  const renderMobileCard = ({ item }: { item: EvidenciaItem }) => {
    const materialCount = countMateriales(item);
    const totalFotos =
      (item.foto_antes_url ? 1 : 0) +
      (item.foto_despues_url ? 1 : 0) +
      (item.fotos_adicionales_urls ? item.fotos_adicionales_urls.length : 0);
    const dateText = item.created_at || item.fecha
      ? dayjs(item.created_at || item.fecha).format('DD/MM/YY, hh:mm A')
      : 'N/A';

    return (
      <TouchableOpacity
        onPress={() => handleOpenDetail(item)}
        activeOpacity={0.7}
        style={[
          styles.mobileCard,
          { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.mobileCardTitle, { color: themeColors.text }]} numberOfLines={1}>
            {item.cliente || 'Sin cliente'}
          </Text>
          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
            {dateText}
          </Text>
        </View>

        <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }} numberOfLines={2}>
          {getCleanDescription(item.descripcion_trabajo)}
        </Text>

        <View style={styles.mobileCardFooter}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={[styles.tag, { backgroundColor: themeColors.primary + '15' }]}>
              <Text style={{ fontSize: 11, color: themeColors.primary, fontWeight: '700' }}>
                📷 {totalFotos} fotos
              </Text>
            </View>
            {materialCount > 0 ? (
              <View style={[styles.tag, { backgroundColor: themeColors.success + '15' }]}>
                <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '700' }}>
                  📦 {materialCount} mat.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/(empleado)/editar-evidencia?id=${item.id}` as any);
              }}
            >
              <Ionicons name="create-outline" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render para pantallas de escritorio amplias
  const renderTableRow = ({ item }: { item: EvidenciaItem }) => {
    const materialCount = countMateriales(item);
    const materialText = materialCount > 0 ? `${materialCount} mat.` : 'No';
    const fotosCount =
      (item.foto_antes_url ? 1 : 0) +
      (item.foto_despues_url ? 1 : 0) +
      (item.fotos_adicionales_urls ? item.fotos_adicionales_urls.length : 0);
    const dateText = item.created_at || item.fecha
      ? dayjs(item.created_at || item.fecha).format('DD/MM/YY, hh:mm A')
      : 'N/A';

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleOpenDetail(item)}
        style={[styles.tableRow, { borderBottomColor: themeColors.border }]}
      >
        <Text style={[styles.tdText, { flex: 1.5, color: themeColors.textSecondary }]} numberOfLines={2}>
          {dateText}
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
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => router.push(`/(empleado)/editar-evidencia?id=${item.id}` as any)}
          >
            <Ionicons name="create-outline" size={18} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <Ionicons name="eye-outline" size={18} color={themeColors.accent} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      {!isLoading && (
        <View style={styles.topHeader}>
          <Text style={[styles.pageTitle, { color: themeColors.text }]}>Mis Evidencias de Trabajo</Text>
          <CustomInput
            placeholder="Buscar por cliente, descripción o material..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            iconName="search-outline"
          />
        </View>
      )}

      {isLoading ? (
        <ScrollView style={{ flex: 1 }}>
          <EvidenciasCardsListSkeleton count={5} />
        </ScrollView>
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
      ) : isDesktop ? (
        <View style={{ flex: 1, paddingHorizontal: Spacing.three }}>
          <View
            style={[
              styles.tableHeader,
              { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border },
            ]}
          >
            <Text style={[styles.thText, { flex: 1.5, color: themeColors.textSecondary }]}>Fecha Reg.</Text>
            <Text style={[styles.thText, { flex: 2.5, color: themeColors.textSecondary }]}>Cliente</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>Fotos</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'center', color: themeColors.textSecondary }]}>Material</Text>
            <View style={styles.actionCellHeader}>
              <Ionicons name="settings-outline" size={14} color={themeColors.textSecondary} />
            </View>
          </View>
          <FlatList
            data={evidencias}
            keyExtractor={(item) => item.id}
            renderItem={renderTableRow}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />
            }
          />
        </View>
      ) : (
        <FlatList
          data={evidencias}
          keyExtractor={(item) => item.id}
          renderItem={renderMobileCard}
          contentContainerStyle={[styles.listContainer, { paddingHorizontal: Spacing.three, paddingTop: Spacing.two }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />
          }
        />
      )}

      {/* Modal de Detalle */}
      <EvidenciaDetailModal
        visible={modalVisible}
        evidencia={selectedEvidencia}
        isAdmin={false}
        isExporting={isExporting}
        onClose={handleCloseDetail}
        onExportPDF={handleExportPDF}
        onEdit={(ev) => {
          handleCloseDetail();
          router.push(`/(empleado)/editar-evidencia?id=${ev.id}` as any);
        }}
        onOpenPhoto={handleOpenPhoto}
      />

      {/* Modal Visor de Fotos */}
      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={handleClosePhoto}
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: themeColors.accent }]}
        activeOpacity={0.8}
        onPress={() => router.push('/(empleado)/agregar-evidencia')}
      >
        <Ionicons name="add" size={32} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
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
    gap: 8,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: Spacing.three,
  },
  emptySub: {
    fontSize: 13,
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  // Vista Desktop Table
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  thText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tdText: {
    fontSize: 13,
  },
  actionCellHeader: {
    width: 56,
    alignItems: 'center',
  },
  actionCell: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    width: 56,
    alignItems: 'center',
  },
  // Vista Celular Mobile Cards
  mobileCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  mobileCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  mobileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
  },
  listContainer: {
    paddingBottom: 90,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
});
