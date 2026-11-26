import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Gasto, GastoHelper } from '@/services/supabase';
import ExpenseCard from '@/components/ExpenseCard';
import {
  GastosTableSkeleton,
  GastosCardsListSkeleton,
} from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';
import { ProyectosTabView } from '@/features/proyectos/components/ProyectosTabView';
import {
  getProyectoNombreFromGasto,
  getOrComputeHospedajeDias,
  isGastoHospedaje,
} from '@/features/proyectos/types';

interface AdminGastosMainListProps {
  vm: ReturnType<typeof useAdminGastos>;
}

export function AdminGastosMainList({ vm }: AdminGastosMainListProps) {
  const {
    scheme,
    themeColors,
    company,
    isDesktop,
    isLoading,
    activeTab,
    setActiveTab,
    facturaFilter,
    setFacturaFilter,
    pendingFilter,
    setPendingFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount,
    backendTotals,
    searchQuery,
    setSearchQuery,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    setDateFilterModalVisible,
    pendingGastos,
    operativosGastos,
    historyGastos,
    totalPendientes,
    totalAprobados,
    proyectos,
    isLoadingProyectos,
    proyectoStatusFilter,
    setProyectoStatusFilter,
    proyectoSearchQuery,
    setProyectoSearchQuery,
    selectedProyectoId,
    selectedProyectoDetail,
    isLoadingProyectoDetail,
    loadProyectos,
    loadProyectoDetail,
    handleOpenNewProyecto,
    handleOpenEditProyecto,
    handleToggleProyectoStatus,
    handleSelectProyecto,
    handleCloseProyectoDetail,
    handleOpenAssignProyecto,
    handleExportProyectoPDF,
    handleExportProyectoXLSX,
    isExportingProyecto,
    setSelectedGasto,
    setReviewModalVisible,
    handleToggleCompany,
    handleDeleteGasto,
    refreshData,
    formatCurrency,
    formatFriendlyDate,
  } = vm;

  const renderProyectoDestinoBadge = (item: Gasto, showAssignAction = true) => {
    const proyName = getProyectoNombreFromGasto(item, proyectos);
    const isOperativo =
      item.tipo_gasto === 'OPERATIVO' ||
      (!item.proyecto_id &&
        (item.tipo_servicio_proyecto || '').toLowerCase() === 'operativo');

    if (proyName) {
      return (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            if (showAssignAction) handleOpenAssignProyecto(item);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: themeColors.primary + '18',
            borderColor: themeColors.primary + '40',
            borderWidth: 1,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 8,
            alignSelf: 'flex-start',
            marginTop: 2,
          }}
        >
          <Ionicons name="folder-open" size={11} color={themeColors.primary} />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              color: themeColors.primary,
            }}
            numberOfLines={1}
          >
            {proyName}
          </Text>
        </TouchableOpacity>
      );
    }

    if (isOperativo) {
      return (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            if (showAssignAction) handleOpenAssignProyecto(item);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: '#0284c718',
            borderColor: '#0284c740',
            borderWidth: 1,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 8,
            alignSelf: 'flex-start',
            marginTop: 2,
          }}
        >
          <Ionicons name="business-outline" size={11} color="#0284c7" />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              color: '#0284c7',
            }}
            numberOfLines={1}
          >
            Operativo / General
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          handleOpenAssignProyecto(item);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: themeColors.warning + '18',
          borderColor: themeColors.warning + '50',
          borderWidth: 1,
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 8,
          alignSelf: 'flex-start',
          marginTop: 2,
        }}
      >
        <Ionicons
          name="add-circle-outline"
          size={11}
          color={themeColors.warning}
        />
        <Text
          style={{
            fontSize: 10,
            fontWeight: '800',
            color: themeColors.warning,
          }}
          numberOfLines={1}
        >
          Sin proyecto • Asignar
        </Text>
      </TouchableOpacity>
    );
  };

  const renderScreenHeader = () => (
    <View>
      {/* Switch de Empresa - Fila Dedicada */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Spacing.four,
          marginBottom: Spacing.two,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            backgroundColor:
              scheme === 'dark'
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)',
            borderRadius: 20,
            padding: 2,
            alignItems: 'center',
            width: 220,
          }}
        >
          <TouchableOpacity
            onPress={() =>
              company !== 'inttec' && handleToggleCompany('inttec')
            }
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor:
                company === 'inttec' ? themeColors.accent : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color:
                  company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
              }}
            >
              INTTEC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              company !== 'daravisa' && handleToggleCompany('daravisa')
            }
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor:
                company === 'daravisa' ? themeColors.accent : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color:
                  company === 'daravisa'
                    ? '#ffffff'
                    : themeColors.textSecondary,
              }}
            >
              DARAVISA
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Resumen Cards */}
      <View style={styles.summaryContainer}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: themeColors.warning + '18',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="time" size={14} color={themeColors.warning} />
            </View>
            <Text
              style={[
                styles.summaryLabel,
                { color: themeColors.textSecondary },
              ]}
              numberOfLines={1}
            >
              POR REVISAR
            </Text>
          </View>
          <Text
            style={[styles.summaryValue, { color: themeColors.warning }]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
          >
            {formatCurrency(totalPendientes)}
          </Text>
        </View>

        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: themeColors.success + '18',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={themeColors.success}
              />
            </View>
            <Text
              style={[
                styles.summaryLabel,
                { color: themeColors.textSecondary },
              ]}
              numberOfLines={1}
            >
              APROBADO
            </Text>
          </View>
          <Text
            style={[styles.summaryValue, { color: themeColors.success }]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
          >
            {formatCurrency(totalAprobados)}
          </Text>
        </View>
      </View>

      {/* BARRA DE BÚSQUEDA Y FILTRO DE CALENDARIO DE FECHAS (Oculta cuando estamos en la pestaña de Proyectos) */}
      {activeTab !== 'proyectos' && (
        <View
          style={{
            paddingHorizontal: Spacing.three,
            marginBottom: Spacing.two,
            gap: Spacing.one,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: Spacing.one,
              alignItems: 'center',
            }}
          >
            {/* Campo de Búsqueda */}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.border,
                paddingHorizontal: Spacing.two,
                height: 42,
              }}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={themeColors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                placeholder="Buscar por empleado, proyecto, proveedor, UUID, cliente, sucursal o monto..."
                placeholderTextColor={themeColors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={themeColors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Botón de Calendario / Filtro de Fechas */}
            <TouchableOpacity
              onPress={() => setDateFilterModalVisible(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor:
                  startDateFilter || endDateFilter
                    ? themeColors.accent + '20'
                    : themeColors.backgroundElement,
                borderColor:
                  startDateFilter || endDateFilter
                    ? themeColors.accent
                    : themeColors.border,
                borderWidth: 1,
                borderRadius: BorderRadius.medium,
                paddingHorizontal: Spacing.two,
                height: 42,
                gap: 6,
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={
                  startDateFilter || endDateFilter
                    ? themeColors.accent
                    : themeColors.text
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color:
                    startDateFilter || endDateFilter
                      ? themeColors.accent
                      : themeColors.text,
                }}
              >
                {startDateFilter && endDateFilter
                  ? startDateFilter === endDateFilter
                    ? formatFriendlyDate(startDateFilter)
                    : `${formatFriendlyDate(startDateFilter)} - ${formatFriendlyDate(
                        endDateFilter
                      )}`
                  : 'Fechas'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Indicador de Fechas Activas */}
          {(startDateFilter || endDateFilter) && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                Filtrado:{' '}
                {startDateFilter === endDateFilter
                  ? formatFriendlyDate(startDateFilter)
                  : `${formatFriendlyDate(
                      startDateFilter
                    )} a ${formatFriendlyDate(endDateFilter)}`}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setStartDateFilter(null);
                  setEndDateFilter(null);
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: themeColors.danger,
                    fontWeight: 'bold',
                  }}
                >
                  Limpiar fechas
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Segmented Control: LAS 4 PESTAÑAS DE ADMINISTRACIÓN */}
      <View
        style={[
          styles.tabsSegmentedContainer,
          {
            backgroundColor: themeColors.border,
            marginHorizontal: Spacing.three,
          },
        ]}
      >
        {[
          {
            key: 'pendientes' as const,
            label: `1. Por revisar (${
              backendTotals ? backendTotals.countPendientes : pendingGastos.length
            })`,
            shortLabel: `Por revisar (${
              backendTotals ? backendTotals.countPendientes : pendingGastos.length
            })`,
          },
          {
            key: 'proyectos' as const,
            label: `2. Proyectos (${proyectos.length})`,
            shortLabel: `Proyectos (${proyectos.length})`,
          },
          {
            key: 'operativos' as const,
            label: `3. Operativos (${
              backendTotals?.countOperativos ?? operativosGastos.length
            })`,
            shortLabel: `Operativos (${
              backendTotals?.countOperativos ?? operativosGastos.length
            })`,
          },
          {
            key: 'historial' as const,
            label: `4. Histórico / Sin proy. (${
              backendTotals?.countHistorico ?? historyGastos.length
            })`,
            shortLabel: `Histórico (${
              backendTotals?.countHistorico ?? historyGastos.length
            })`,
          },
        ].map((tabItem) => {
          const isActive = activeTab === tabItem.key;
          return (
            <TouchableOpacity
              key={tabItem.key}
              onPress={() => {
                if (activeTab !== tabItem.key) {
                  setActiveTab(tabItem.key);
                  setCurrentPage(1);
                }
              }}
              style={[
                styles.tabSegment,
                { paddingHorizontal: 4 },
                isActive && { backgroundColor: themeColors.backgroundElement },
              ]}
            >
              <Text
                style={[
                  styles.tabSegmentText,
                  {
                    fontSize: isDesktop ? 12 : 11,
                    color: isActive
                      ? themeColors.text
                      : themeColors.textSecondary,
                    fontWeight: isActive ? '800' : '600',
                    textAlign: 'center',
                  },
                ]}
                numberOfLines={1}
              >
                {isDesktop ? tabItem.label : tabItem.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // =====================================================================
  // PESTAÑA 2: PROYECTOS
  // =====================================================================
  if (activeTab === 'proyectos') {
    return (
      <View style={{ flex: 1 }}>
        <ProyectosTabView
          proyectos={proyectos}
          statusFilter={proyectoStatusFilter}
          onChangeStatusFilter={setProyectoStatusFilter}
          proyectoSearch={proyectoSearchQuery}
          onChangeProyectoSearch={setProyectoSearchQuery}
          isLoadingProyectos={isLoadingProyectos}
          selectedProyectoId={selectedProyectoId}
          selectedProyectoDetail={selectedProyectoDetail}
          isLoadingProyectoDetail={isLoadingProyectoDetail}
          isDesktop={isDesktop}
          themeColors={themeColors}
          formatCurrency={formatCurrency}
          formatFriendlyDate={formatFriendlyDate}
          onOpenNewProyecto={handleOpenNewProyecto}
          onOpenEditProyecto={handleOpenEditProyecto}
          onToggleProyectoStatus={handleToggleProyectoStatus}
          onSelectProyecto={handleSelectProyecto}
          onCloseProyectoDetail={handleCloseProyectoDetail}
          onRefreshProyectos={() => loadProyectos(false)}
          onRefreshProyectoDetail={() => {
            if (selectedProyectoId) loadProyectoDetail(selectedProyectoId, false);
          }}
          onSelectGastoForReview={(gasto) => {
            setSelectedGasto(gasto);
            setReviewModalVisible(true);
          }}
          onOpenAssignProyecto={handleOpenAssignProyecto}
          onExportProyectoPDF={handleExportProyectoPDF}
          onExportProyectoXLSX={handleExportProyectoXLSX}
          isExportingProyecto={isExportingProyecto}
          headerComponent={selectedProyectoId ? undefined : renderScreenHeader()}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <ScrollView style={{ flex: 1 }}>
        {renderScreenHeader()}
        {(activeTab === 'historial' || activeTab === 'operativos') && (
          <View
            style={{
              flexDirection: 'row',
              marginHorizontal: Spacing.three,
              marginBottom: Spacing.two,
              marginTop: Spacing.one,
              backgroundColor: themeColors.backgroundElement,
              borderRadius: BorderRadius.medium,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: themeColors.border,
            }}
          >
            <View
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                backgroundColor:
                  facturaFilter === 'TODOS'
                    ? themeColors.accent + '20'
                    : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: facturaFilter === 'TODOS' ? 'bold' : '600',
                  color:
                    facturaFilter === 'TODOS'
                      ? themeColors.accent
                      : themeColors.textSecondary,
                }}
              >
                TODOS
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: themeColors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: themeColors.textSecondary,
                }}
              >
                FACTURADOS
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRightWidth: 1,
                borderColor: themeColors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: themeColors.textSecondary,
                }}
              >
                PEND. ENTREGAR
              </Text>
            </View>
            <View
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center' }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: themeColors.textSecondary,
                }}
              >
                NO FACTURADOS
              </Text>
            </View>
          </View>
        )}
        {isDesktop ? (
          <GastosTableSkeleton
            isHistorial={activeTab !== 'pendientes'}
            count={8}
          />
        ) : (
          <GastosCardsListSkeleton count={6} />
        )}
      </ScrollView>
    );
  }

  const renderFacturaFilterBar = () => (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: Spacing.three,
        marginBottom: Spacing.two,
        marginTop: Spacing.one,
        backgroundColor: themeColors.backgroundElement,
        borderRadius: BorderRadius.medium,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: themeColors.border,
      }}
    >
      <TouchableOpacity
        onPress={() => {
          setFacturaFilter('TODOS');
          setCurrentPage(1);
        }}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor:
            facturaFilter === 'TODOS'
              ? themeColors.accent + '20'
              : 'transparent',
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: facturaFilter === 'TODOS' ? 'bold' : '600',
            color:
              facturaFilter === 'TODOS'
                ? themeColors.accent
                : themeColors.textSecondary,
          }}
        >
          TODOS
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setFacturaFilter('FACTURADOS');
          setCurrentPage(1);
        }}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor:
            facturaFilter === 'FACTURADOS'
              ? themeColors.accent + '20'
              : 'transparent',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: themeColors.border,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: facturaFilter === 'FACTURADOS' ? 'bold' : '600',
            color:
              facturaFilter === 'FACTURADOS'
                ? themeColors.accent
                : themeColors.textSecondary,
          }}
        >
          FACTURADOS
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setFacturaFilter('PENDIENTE_ENTREGA');
          setCurrentPage(1);
        }}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor:
            facturaFilter === 'PENDIENTE_ENTREGA'
              ? themeColors.warning + '20'
              : 'transparent',
          borderRightWidth: 1,
          borderColor: themeColors.border,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: facturaFilter === 'PENDIENTE_ENTREGA' ? 'bold' : '600',
            color:
              facturaFilter === 'PENDIENTE_ENTREGA'
                ? themeColors.warning
                : themeColors.textSecondary,
          }}
        >
          PEND. ENTREGAR
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setFacturaFilter('NO_FACTURADOS');
          setCurrentPage(1);
        }}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor:
            facturaFilter === 'NO_FACTURADOS'
              ? themeColors.danger + '20'
              : 'transparent',
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: facturaFilter === 'NO_FACTURADOS' ? 'bold' : '600',
            color:
              facturaFilter === 'NO_FACTURADOS'
                ? themeColors.danger
                : themeColors.textSecondary,
          }}
        >
          NO FACTURADOS
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* ===================================================================== */}
      {/* PESTAÑA 1: POR REVISAR (BANDEJA ÚNICA DE PENDIENTES / OBSERVADOS)     */}
      {/* ===================================================================== */}
      {activeTab === 'pendientes' && (
        <>
          {isDesktop ? (
            <ScrollView style={{ flex: 1 }}>
              {renderScreenHeader()}
              <View
                style={{
                  paddingHorizontal: Spacing.three,
                  paddingVertical: Spacing.two,
                }}
              >
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onItemsPerPageChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                  isLoading={isLoading}
                  style={{ marginBottom: Spacing.two }}
                />
                <View
                  style={[
                    styles.tableHeaderRow,
                    {
                      backgroundColor: themeColors.background,
                      borderBottomColor: themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '12%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Categoría
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '15%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Proyecto / Destino
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '12%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Empleado
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '15%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Proveedor / Cliente
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '9%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Sucursal
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '8%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Fecha
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '11%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Estado / Tipo
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '9%',
                        fontWeight: 'bold',
                        textAlign: 'right',
                      },
                    ]}
                  >
                    Monto
                  </Text>
                  <View style={{ width: '9%', alignItems: 'center' }}>
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color={themeColors.text}
                    />
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: themeColors.backgroundElement,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderTopWidth: 0,
                  }}
                >
                  {pendingGastos.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={48}
                        color={themeColors.success}
                      />
                      <Text
                        style={[
                          styles.emptyText,
                          { color: themeColors.textSecondary },
                        ]}
                      >
                        ¡Al corriente! No hay gastos pendientes de revisión.
                      </Text>
                    </View>
                  ) : (
                    pendingGastos.map((item) => {
                      const fecha = formatFriendlyDate(
                        item.fecha_comprobante || item.created_at
                      );
                      const isDevueltoFactura = Boolean(
                        item.devuelto_por_factura
                      );
                      const isNuevoConFactura =
                        !isDevueltoFactura &&
                        Boolean(
                          item.factura_sugerida_rel || item.factura_sugerida_id
                        );
                      const hospDias = isGastoHospedaje(item)
                        ? getOrComputeHospedajeDias(item)
                        : [];

                      let statusText = 'PENDIENTE';
                      let statusColor: string = themeColors.warning;
                      if (isDevueltoFactura) {
                        statusText = '📄 FACTURA DETECTADA';
                        statusColor = '#0284C7';
                      } else if (isNuevoConFactura) {
                        statusText = '🔎 COMPROBAR FACTURA';
                        statusColor = '#D97706';
                      } else if (item.status === 'APPROVED') {
                        statusText = 'APROBADO';
                        statusColor = themeColors.success;
                      } else if (item.status === 'REJECTED') {
                        statusText = 'RECHAZADO';
                        statusColor = themeColors.danger;
                      } else if (item.status === 'ACTION_REQUIRED') {
                        statusText = 'ACCIÓN REQ.';
                        statusColor = themeColors.actionRequired;
                      }

                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            setSelectedGasto(item);
                            setReviewModalVisible(true);
                          }}
                          style={({ hovered }: any) =>
                            [
                              styles.tableRow,
                              {
                                borderBottomColor: themeColors.border,
                                borderLeftWidth:
                                  isDevueltoFactura || isNuevoConFactura
                                    ? 3
                                    : 0,
                                borderLeftColor: isDevueltoFactura
                                  ? '#0284C7'
                                  : isNuevoConFactura
                                  ? '#D97706'
                                  : 'transparent',
                                backgroundColor: isDevueltoFactura
                                  ? '#0284C708'
                                  : isNuevoConFactura
                                  ? '#F59E0B08'
                                  : 'transparent',
                              },
                              hovered && {
                                backgroundColor: themeColors.backgroundSelected,
                              },
                            ] as any
                          }
                        >
                          <View style={{ width: '12%', paddingRight: 4 }}>
                            <Text
                              style={[
                                styles.tableCell,
                                {
                                  color: themeColors.text,
                                  fontWeight: '600',
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {GastoHelper.getCategoria(item) || 'Sin Cat.'}
                            </Text>
                            {hospDias.length > 0 && (
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: '700',
                                  color: '#4f46e5',
                                }}
                                numberOfLines={1}
                              >
                                🏨 {hospDias.length}{' '}
                                {hospDias.length === 1 ? 'noche' : 'noches'}
                              </Text>
                            )}
                          </View>

                          <View style={{ width: '15%', paddingRight: 6 }}>
                            {renderProyectoDestinoBadge(item)}
                          </View>

                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '12%' },
                            ]}
                            numberOfLines={1}
                          >
                            {item.empleado_nombre}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                width: '15%',
                                color: themeColors.textSecondary,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getProveedor(item)}{' '}
                            {GastoHelper.getProveedor(item) &&
                            GastoHelper.getCliente(item)
                              ? ' | '
                              : ''}{' '}
                            {GastoHelper.getCliente(item)}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                color: themeColors.textSecondary,
                                width: '9%',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getSucursal(item) || '-'}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '8%' },
                            ]}
                          >
                            {fecha}
                          </Text>
                          <View style={{ width: '11%' }}>
                            <View
                              style={{
                                backgroundColor: statusColor + '18',
                                paddingVertical: 2,
                                paddingHorizontal: 6,
                                borderRadius: 12,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: 'bold',
                                  color: statusColor,
                                }}
                              >
                                {statusText}
                              </Text>
                            </View>
                            {isDevueltoFactura ? (
                              <Text
                                style={{
                                  fontSize: 9,
                                  color: '#0284C7',
                                  fontWeight: '600',
                                  marginTop: 1,
                                }}
                                numberOfLines={1}
                              >
                                Devuelto de Historial
                              </Text>
                            ) : isNuevoConFactura ? (
                              <Text
                                style={{
                                  fontSize: 9,
                                  color: '#D97706',
                                  fontWeight: '600',
                                  marginTop: 1,
                                }}
                                numberOfLines={1}
                              >
                                ⚠️ Comprobar coincidencia
                              </Text>
                            ) : null}
                          </View>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                color: themeColors.text,
                                width: '9%',
                                fontWeight: '700',
                                textAlign: 'right',
                              },
                            ]}
                          >
                            {formatCurrency(item.monto)}
                          </Text>
                          <View
                            style={{
                              width: '9%',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedGasto(item);
                                setReviewModalVisible(true);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="eye-outline"
                                size={16}
                                color={themeColors.accent}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteGasto(item.id);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color={themeColors.danger}
                              />
                            </TouchableOpacity>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              scrollEnabled={true}
              style={{ flex: 1 }}
              ListHeaderComponent={renderScreenHeader()}
              data={pendingGastos}
              ListFooterComponent={
                totalCount > pageSize ? (
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                    onItemsPerPageChange={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                    isLoading={isLoading}
                    style={{
                      marginHorizontal: Spacing.three,
                      marginBottom: Spacing.four,
                    }}
                  />
                ) : null
              }
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 4 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      marginBottom: 4,
                    }}
                  >
                    {renderProyectoDestinoBadge(item)}
                  </View>
                  <ExpenseCard
                    gasto={item}
                    showEmployeeName
                    onPress={() => {
                      setSelectedGasto(item);
                      setReviewModalVisible(true);
                    }}
                  />
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={48}
                    color={themeColors.success}
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: themeColors.textSecondary },
                    ]}
                  >
                    ¡Al corriente! No hay gastos pendientes de revisión.
                  </Text>
                </View>
              }
              refreshing={isLoading}
              onRefresh={refreshData}
            />
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 3: OPERATIVOS (GASTOS GENERALES SIN PROYECTO)                 */}
      {/* ===================================================================== */}
      {activeTab === 'operativos' && (
        <>
          {renderFacturaFilterBar()}
          {isDesktop ? (
            <ScrollView style={{ flex: 1 }}>
              {renderScreenHeader()}
              <View
                style={{
                  paddingHorizontal: Spacing.three,
                  paddingVertical: Spacing.two,
                }}
              >
                <View
                  style={{
                    backgroundColor: '#0284c712',
                    borderColor: '#0284c740',
                    borderWidth: 1,
                    borderRadius: BorderRadius.medium,
                    padding: Spacing.two,
                    marginBottom: Spacing.two,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="business" size={18} color="#0284c7" />
                  <Text style={{ fontSize: 12, color: themeColors.text, flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: '#0284c7' }}>
                      Gastos Operativos / Generales:{' '}
                    </Text>
                    Pagos de oficina, IMSS, ISN, Telmex, JMAS, nómina, software o
                    mantenimiento que no pertenecen a una obra en particular.
                  </Text>
                </View>

                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onItemsPerPageChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                  isLoading={isLoading}
                  style={{ marginBottom: Spacing.two }}
                />

                <View
                  style={[
                    styles.tableHeaderRow,
                    {
                      backgroundColor: themeColors.background,
                      borderBottomColor: themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '14%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Categoría
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '13%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Empleado
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '18%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Proveedor / Detalle
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '10%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Fecha
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '10%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Estado
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '12%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Destino
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '13%',
                        fontWeight: 'bold',
                        textAlign: 'right',
                      },
                    ]}
                  >
                    Monto
                  </Text>
                  <View style={{ width: '10%', alignItems: 'center' }}>
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color={themeColors.text}
                    />
                  </View>
                </View>

                <View
                  style={{
                    backgroundColor: themeColors.backgroundElement,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderTopWidth: 0,
                  }}
                >
                  {operativosGastos.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons
                        name="business-outline"
                        size={48}
                        color={themeColors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.emptyText,
                          { color: themeColors.textSecondary },
                        ]}
                      >
                        No hay gastos operativos registrados con este filtro.
                      </Text>
                    </View>
                  ) : (
                    operativosGastos.map((item) => {
                      const fecha = formatFriendlyDate(
                        item.fecha_comprobante || item.created_at
                      );
                      let statusText = 'PENDIENTE';
                      let statusColor: string = themeColors.warning;
                      if (item.status === 'APPROVED') {
                        statusText = 'APROBADO';
                        statusColor = themeColors.success;
                      } else if (item.status === 'REJECTED') {
                        statusText = 'RECHAZADO';
                        statusColor = themeColors.danger;
                      } else if (item.status === 'ACTION_REQUIRED') {
                        statusText = 'ACCIÓN REQ.';
                        statusColor = themeColors.actionRequired;
                      }

                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            setSelectedGasto(item);
                            setReviewModalVisible(true);
                          }}
                          style={({ hovered }: any) =>
                            [
                              styles.tableRow,
                              { borderBottomColor: themeColors.border },
                              hovered && {
                                backgroundColor: themeColors.backgroundSelected,
                              },
                            ] as any
                          }
                        >
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                color: themeColors.text,
                                width: '14%',
                                fontWeight: '600',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getCategoria(item) || 'Sin Cat.'}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '13%' },
                            ]}
                            numberOfLines={1}
                          >
                            {item.empleado_nombre}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                width: '18%',
                                color: themeColors.textSecondary,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getProveedor(item) ||
                              item.detalle_servicio_proyecto ||
                              '-'}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '10%' },
                            ]}
                          >
                            {fecha}
                          </Text>
                          <View style={{ width: '10%' }}>
                            <View
                              style={{
                                backgroundColor: statusColor + '18',
                                paddingVertical: 2,
                                paddingHorizontal: 6,
                                borderRadius: 12,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: 'bold',
                                  color: statusColor,
                                }}
                              >
                                {statusText}
                              </Text>
                            </View>
                          </View>
                          <View style={{ width: '12%' }}>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleOpenAssignProyecto(item);
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: themeColors.primary + '15',
                                paddingVertical: 3,
                                paddingHorizontal: 8,
                                borderRadius: 8,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Ionicons
                                name="folder-open-outline"
                                size={12}
                                color={themeColors.primary}
                              />
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color: themeColors.primary,
                                }}
                              >
                                Mover a Proy.
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                width: '13%',
                                fontWeight: '700',
                                color: themeColors.text,
                                textAlign: 'right',
                              },
                            ]}
                          >
                            {formatCurrency(item.monto)}
                          </Text>
                          <View
                            style={{
                              width: '10%',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedGasto(item);
                                setReviewModalVisible(true);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="eye-outline"
                                size={16}
                                color={themeColors.accent}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteGasto(item.id);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color={themeColors.danger}
                              />
                            </TouchableOpacity>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              scrollEnabled={true}
              style={{ flex: 1 }}
              ListHeaderComponent={renderScreenHeader()}
              data={operativosGastos}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 6 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      marginBottom: 4,
                    }}
                  >
                    {renderProyectoDestinoBadge(item)}
                  </View>
                  <ExpenseCard
                    gasto={item}
                    showEmployeeName
                    onPress={() => {
                      setSelectedGasto(item);
                      setReviewModalVisible(true);
                    }}
                    onDelete={() => handleDeleteGasto(item.id)}
                  />
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="business-outline"
                    size={48}
                    color={themeColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: themeColors.textSecondary },
                    ]}
                  >
                    No hay gastos operativos registrados.
                  </Text>
                </View>
              }
              ListFooterComponent={
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onItemsPerPageChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                  isLoading={isLoading}
                  style={{ marginTop: Spacing.two, marginBottom: Spacing.four }}
                />
              }
              refreshing={isLoading}
              onRefresh={refreshData}
            />
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 4: HISTÓRICO / SIN PROYECTO (CON BOTÓN "ASIGNAR A PROYECTO")  */}
      {/* ===================================================================== */}
      {activeTab === 'historial' && (
        <>
          {renderFacturaFilterBar()}
          {isDesktop ? (
            <ScrollView style={{ flex: 1 }}>
              {renderScreenHeader()}
              <View
                style={{
                  paddingHorizontal: Spacing.three,
                  paddingVertical: Spacing.two,
                }}
              >
                <View
                  style={{
                    backgroundColor: themeColors.warning + '12',
                    borderColor: themeColors.warning + '40',
                    borderWidth: 1,
                    borderRadius: BorderRadius.medium,
                    padding: Spacing.two,
                    marginBottom: Spacing.two,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="archive-outline"
                    size={18}
                    color={themeColors.warning}
                  />
                  <Text style={{ fontSize: 12, color: themeColors.text, flex: 1 }}>
                    <Text
                      style={{ fontWeight: '800', color: themeColors.warning }}
                    >
                      Histórico / Sin proyecto:{' '}
                    </Text>
                    Gastos anteriores conservados intactos con sus facturas SAT y
                    registros de gasolina. Usa el botón{' '}
                    <Text style={{ fontWeight: '800' }}>
                      &quot;Asignar a proyecto&quot;
                    </Text>{' '}
                    para mover gastos recientes a su proyecto.
                  </Text>
                </View>

                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={pageSize}
                  onPageChange={(p) => setCurrentPage(p)}
                  onItemsPerPageChange={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                  isLoading={isLoading}
                  style={{ marginBottom: Spacing.two }}
                />
                <View
                  style={[
                    styles.tableHeaderRow,
                    {
                      backgroundColor: themeColors.background,
                      borderBottomColor: themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '10%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Categoría
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '10%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Empleado
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '14%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Proveedor / Cliente
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '11%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Ref. Anterior / Suc.
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '8%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Fecha
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '8%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Estado
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '10%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Reembolso
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '13%',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    Asignar a Proyecto
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        color: themeColors.text,
                        width: '9%',
                        fontWeight: 'bold',
                        textAlign: 'right',
                      },
                    ]}
                  >
                    Monto
                  </Text>
                  <View style={{ width: '7%', alignItems: 'center' }}>
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color={themeColors.text}
                    />
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: themeColors.backgroundElement,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderTopWidth: 0,
                  }}
                >
                  {historyGastos.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text
                        style={[
                          styles.emptyText,
                          { color: themeColors.textSecondary },
                        ]}
                      >
                        No hay registros históricos sin proyecto en esta página.
                      </Text>
                    </View>
                  ) : (
                    historyGastos.map((item) => {
                      const fecha = formatFriendlyDate(
                        item.fecha_comprobante || item.created_at
                      );

                      let statusText = 'PENDIENTE';
                      let statusColor: string = themeColors.warning;
                      if (item.status === 'APPROVED') {
                        statusText = 'APROBADO';
                        statusColor = themeColors.success;
                      } else if (item.status === 'REJECTED') {
                        statusText = 'RECHAZADO';
                        statusColor = themeColors.danger;
                      } else if (item.status === 'ACTION_REQUIRED') {
                        statusText = 'ACCIÓN REQ.';
                        statusColor = themeColors.actionRequired;
                      }

                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            setSelectedGasto(item);
                            setReviewModalVisible(true);
                          }}
                          style={({ hovered }: any) =>
                            [
                              styles.tableRow,
                              { borderBottomColor: themeColors.border },
                              hovered && {
                                backgroundColor: themeColors.backgroundSelected,
                              },
                            ] as any
                          }
                        >
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                color: themeColors.text,
                                width: '10%',
                                fontWeight: '600',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getCategoria(item) || 'Sin Cat.'}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '10%' },
                            ]}
                            numberOfLines={1}
                          >
                            {item.empleado_nombre}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                width: '14%',
                                color: themeColors.textSecondary,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {GastoHelper.getProveedor(item)}{' '}
                            {GastoHelper.getProveedor(item) &&
                            GastoHelper.getCliente(item)
                              ? ' | '
                              : ''}{' '}
                            {GastoHelper.getCliente(item)}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              {
                                color: themeColors.textSecondary,
                                width: '11%',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {item.detalle_servicio_proyecto ||
                              GastoHelper.getSucursal(item) ||
                              '-'}
                          </Text>
                          <Text
                            style={[
                              styles.tableCell,
                              { color: themeColors.text, width: '8%' },
                            ]}
                          >
                            {fecha}
                          </Text>
                          <View style={{ width: '8%' }}>
                            <View
                              style={{
                                backgroundColor: statusColor + '18',
                                paddingVertical: 2,
                                paddingHorizontal: 6,
                                borderRadius: 12,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: 'bold',
                                  color: statusColor,
                                }}
                              >
                                {statusText}
                              </Text>
                            </View>
                          </View>
                          <View style={{ width: '10%' }}>
                            {item.estado_reembolso === 'PENDIENTE_REEMBOLSO' ? (
                              <View
                                style={{
                                  backgroundColor: themeColors.warning + '18',
                                  paddingVertical: 2,
                                  paddingHorizontal: 6,
                                  borderRadius: 12,
                                  alignSelf: 'flex-start',
                                  borderWidth: 1,
                                  borderColor: themeColors.warning + '40',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 'bold',
                                    color: themeColors.warning,
                                  }}
                                >
                                  ⏳ Pend. Reemb.
                                </Text>
                              </View>
                            ) : item.estado_reembolso === 'REEMBOLSADO' ? (
                              <View
                                style={{
                                  backgroundColor: '#8b5cf618',
                                  paddingVertical: 2,
                                  paddingHorizontal: 6,
                                  borderRadius: 12,
                                  alignSelf: 'flex-start',
                                  borderWidth: 1,
                                  borderColor: '#8b5cf640',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 'bold',
                                    color: '#8b5cf6',
                                  }}
                                >
                                  ↩️ Reembolsado
                                </Text>
                              </View>
                            ) : (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: themeColors.textSecondary,
                                }}
                              >
                                -
                              </Text>
                            )}
                          </View>

                          {/* Botón Rápido "Asignar a proyecto" */}
                          <View style={{ width: '13%', paddingRight: 4 }}>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleOpenAssignProyecto(item);
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: themeColors.primary + '18',
                                borderColor: themeColors.primary + '50',
                                borderWidth: 1,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                borderRadius: BorderRadius.small,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Ionicons
                                name="folder-open-outline"
                                size={12}
                                color={themeColors.primary}
                              />
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: themeColors.primary,
                                }}
                                numberOfLines={1}
                              >
                                Asignar a proyecto
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <Text
                            style={[
                              styles.tableCell,
                              {
                                width: '9%',
                                fontWeight: '700',
                                color: themeColors.text,
                                textAlign: 'right',
                              },
                            ]}
                          >
                            {formatCurrency(item.monto)}
                          </Text>
                          <View
                            style={{
                              width: '7%',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedGasto(item);
                                setReviewModalVisible(true);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="eye-outline"
                                size={16}
                                color={themeColors.accent}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteGasto(item.id);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color={themeColors.danger}
                              />
                            </TouchableOpacity>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              scrollEnabled={true}
              style={{ flex: 1 }}
              ListHeaderComponent={renderScreenHeader()}
              data={historyGastos}
              ListFooterComponent={
                totalCount > pageSize ? (
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                    onItemsPerPageChange={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                    isLoading={isLoading}
                    style={{
                      marginHorizontal: Spacing.three,
                      marginBottom: Spacing.four,
                    }}
                  />
                ) : null
              }
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 6 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      marginBottom: 4,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleOpenAssignProyecto(item)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: themeColors.primary + '18',
                        borderColor: themeColors.primary + '50',
                        borderWidth: 1,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: BorderRadius.small,
                      }}
                    >
                      <Ionicons
                        name="folder-open-outline"
                        size={13}
                        color={themeColors.primary}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: themeColors.primary,
                        }}
                      >
                        Asignar a proyecto
                      </Text>
                    </TouchableOpacity>

                    {item.detalle_servicio_proyecto ? (
                      <Text
                        style={{
                          fontSize: 11,
                          color: themeColors.textSecondary,
                          flex: 1,
                          textAlign: 'right',
                          marginLeft: 8,
                        }}
                        numberOfLines={1}
                      >
                        Ref: {item.detalle_servicio_proyecto}
                      </Text>
                    ) : null}
                  </View>
                  <ExpenseCard
                    gasto={item}
                    showEmployeeName
                    onPress={() => {
                      setSelectedGasto(item);
                      setReviewModalVisible(true);
                    }}
                    onDelete={() => handleDeleteGasto(item.id)}
                  />
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="folder-open-outline"
                    size={48}
                    color={themeColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: themeColors.textSecondary },
                    ]}
                  >
                    No hay registros históricos sin proyecto.
                  </Text>
                </View>
              }
              refreshing={isLoading}
              onRefresh={refreshData}
            />
          )}
        </>
      )}
    </View>
  );
}
