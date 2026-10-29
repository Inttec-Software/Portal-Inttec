import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomInput from '@/components/CustomInput';
import { EvidenciasTableSkeleton, EvidenciasCardsListSkeleton } from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import ImageViewerModal from '@/components/ImageViewerModal';
import { useEvidenciasList } from '@/features/evidencias/hooks/useEvidenciasList';
import EvidenciaDetailModal from '@/features/evidencias/components/EvidenciaDetailModal';
import { EvidenciaItem } from '@/features/evidencias/types';

export default function AdminEvidenciasScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 1024;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    evidencias,
    paginatedEvidencias,
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount,
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
  } = useEvidenciasList({ isAdmin: true });

  const formatFriendlyDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
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

  const getCleanDescription = (desc: any) => {
    try {
      const list = typeof desc === 'string' ? JSON.parse(desc) : desc;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((t: any, i: number) => `#${i + 1}: ${t.descripcion}`).join(' • ');
      }
    } catch {}
    return String(desc || '');
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header y Filtros */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Evidencias de Trabajo</Text>
      </View>

      <View style={styles.searchContainer}>
        <CustomInput
          placeholder="Buscar por cliente, descripción o técnico..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          iconName="search-outline"
        />
      </View>

      {/* Filtro por empleado */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
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
            <Text
              style={[
                styles.filterPillText,
                { color: selectedEmployeeId === null ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Todos ({evidencias.length})
            </Text>
          </TouchableOpacity>

          {employees.map((emp) => (
            <TouchableOpacity
              key={emp.id}
              onPress={() => setSelectedEmployeeId(selectedEmployeeId === emp.id ? null : emp.id)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: selectedEmployeeId === emp.id ? themeColors.accent : themeColors.backgroundElement,
                  borderColor: selectedEmployeeId === emp.id ? themeColors.accent : themeColors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: selectedEmployeeId === emp.id ? '#ffffff' : themeColors.textSecondary },
                ]}
              >
                {emp.nombre.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Contenido: Desktop Table o Mobile Cards */}
      {isLoading ? (
        <ScrollView style={{ flex: 1 }}>
          {isDesktop ? <EvidenciasTableSkeleton count={8} /> : <EvidenciasCardsListSkeleton count={6} />}
        </ScrollView>
      ) : isDesktop ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: Spacing.three, paddingBottom: 30 }}>
          <View
            style={[
              styles.tableHeaderRow,
              { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border },
            ]}
          >
            <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%' }]}>Fecha</Text>
            <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '20%' }]}>Empleado</Text>
            <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '25%' }]}>Cliente</Text>
            <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%' }]}>Fotos</Text>
            <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '15%' }]}>Material</Text>
            <View style={{ width: '10%', alignItems: 'center' }}>
              <Ionicons name="settings-outline" size={14} color={themeColors.text} />
            </View>
          </View>

          <View
            style={[
              styles.tableBody,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            {totalCount === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  No se encontraron evidencias.
                </Text>
              </View>
            ) : (
              paginatedEvidencias.map((item) => {
                const totalFotos =
                  (item.foto_antes_url ? 1 : 0) +
                  (item.foto_despues_url ? 1 : 0) +
                  (item.fotos_adicionales_urls?.length || 0);

                const techName = item.creado_por_nombre || item.usuario?.nombre || 'Técnico';

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleOpenDetail(item)}
                    style={({ hovered }: any) => [
                      styles.tableRow,
                      { borderBottomColor: themeColors.border },
                      hovered && { backgroundColor: themeColors.backgroundSelected },
                    ]}
                  >
                    <Text style={[styles.tableCell, { color: themeColors.text, width: '15%' }]}>
                      {formatFriendlyDate(item.created_at || item.fecha)}
                    </Text>
                    <Text style={[styles.tableCell, { color: themeColors.text, width: '20%', fontWeight: '600' }]} numberOfLines={1}>
                      {techName}
                    </Text>
                    <Text style={[styles.tableCell, { color: themeColors.text, width: '25%' }]} numberOfLines={1}>
                      {item.cliente || 'Sin cliente'}
                    </Text>
                    <Text style={[styles.tableCell, { width: '15%', color: themeColors.textSecondary }]}>
                      {totalFotos} fotos
                    </Text>
                    <Text style={[styles.tableCell, { width: '15%', color: themeColors.textSecondary }]}>
                      {item.materiales_usados ? 'Sí' : 'No'}
                    </Text>
                    <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {totalCount > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize: number) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              itemsPerPageOptions={[20, 25, 50, 100]}
              isLoading={isLoading}
              style={{ marginTop: 14 }}
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={evidencias}
          keyExtractor={(item) => item.id}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingHorizontal: Spacing.three, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const totalFotos =
              (item.foto_antes_url ? 1 : 0) +
              (item.foto_despues_url ? 1 : 0) +
              (item.fotos_adicionales_urls?.length || 0);
            const techName = item.creado_por_nombre || item.usuario?.nombre || 'Técnico';

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
                    {formatFriendlyDate(item.created_at || item.fecha)}
                  </Text>
                </View>

                <Text style={{ fontSize: 12, color: themeColors.primary, fontWeight: '600', marginTop: 2 }}>
                  👤 {techName}
                </Text>

                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }} numberOfLines={2}>
                  {getCleanDescription(item.descripcion_trabajo)}
                </Text>

                <View style={styles.mobileCardFooter}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={[styles.tag, { backgroundColor: themeColors.primary + '15' }]}>
                      <Text style={{ fontSize: 11, color: themeColors.primary, fontWeight: '700' }}>
                        📷 {totalFotos} fotos
                      </Text>
                    </View>
                    {item.materiales_usados ? (
                      <View style={[styles.tag, { backgroundColor: themeColors.success + '15' }]}>
                        <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '700' }}>
                          📦 Material
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No se encontraron evidencias.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal de Detalle Compartido */}
      <EvidenciaDetailModal
        visible={modalVisible}
        evidencia={selectedEvidencia}
        isAdmin={true}
        isExporting={isExporting}
        onClose={handleCloseDetail}
        onExportPDF={handleExportPDF}
        onEdit={(ev) => {
          handleCloseDetail();
          router.push(`/(admin)/editar-evidencia?id=${ev.id}`);
        }}
        onOpenPhoto={handleOpenPhoto}
      />

      {/* Modal Visor de Fotos */}
      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={handleClosePhoto}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  filterSection: {
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  filterScrollContent: {
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: BorderRadius.medium,
    borderTopRightRadius: BorderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
  },
  tableBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: BorderRadius.medium,
    borderBottomRightRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 13,
  },
  emptyContainer: {
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  mobileCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    marginBottom: 8,
  },
  mobileCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  mobileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
  },
});
