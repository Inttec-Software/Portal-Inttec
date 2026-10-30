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
import { GastoHelper } from '@/services/supabase';
import ExpenseCard from '@/components/ExpenseCard';
import { GastosTableSkeleton, GastosCardsListSkeleton } from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';

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
    historyGastos,
    totalPendientes,
    totalAprobados,
    setSelectedGasto,
    setReviewModalVisible,
    handleToggleCompany,
    handleDeleteGasto,
    refreshData,
    formatCurrency,
    formatFriendlyDate,
  } = vm;

  const renderScreenHeader = () => (
    <View>
      {/* Switch de Empresa - Fila Dedicada */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.four,
        marginBottom: Spacing.two,
      }}>
        <View style={{
          flexDirection: 'row',
          backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 20,
          padding: 2,
          alignItems: 'center',
          width: 220,
        }}>
          <TouchableOpacity
            onPress={() => company !== 'inttec' && handleToggleCompany('inttec')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
            }}>
              INTTEC
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => company !== 'daravisa' && handleToggleCompany('daravisa')}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
              alignItems: 'center'
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
            }}>
              DARAVISA
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Resumen Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: themeColors.warning + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="time" size={14} color={themeColors.warning} />
            </View>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>PENDIENTES</Text>
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

        <View style={[styles.summaryCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: themeColors.success + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={14} color={themeColors.success} />
            </View>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>APROBADO</Text>
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

      {/* BARRA DE BÚSQUEDA Y FILTRO DE CALENDARIO DE FECHAS */}
      <View style={{ paddingHorizontal: Spacing.three, marginBottom: Spacing.two, gap: Spacing.one }}>
        <View style={{ flexDirection: 'row', gap: Spacing.one, alignItems: 'center' }}>
          {/* Campo de Búsqueda */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium, borderWidth: 1, borderColor: themeColors.border, paddingHorizontal: Spacing.two, height: 42 }}>
            <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Buscar empleado, cliente, sucursal, categoría, proveedor, detalle o monto..."
              placeholderTextColor={themeColors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Botón de Calendario / Filtro de Fechas */}
          <TouchableOpacity
            onPress={() => setDateFilterModalVisible(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: (startDateFilter || endDateFilter) ? themeColors.accent + '20' : themeColors.backgroundElement,
              borderColor: (startDateFilter || endDateFilter) ? themeColors.accent : themeColors.border,
              borderWidth: 1,
              borderRadius: BorderRadius.medium,
              paddingHorizontal: Spacing.two,
              height: 42,
              gap: 6
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={(startDateFilter || endDateFilter) ? themeColors.accent : themeColors.text} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: (startDateFilter || endDateFilter) ? themeColors.accent : themeColors.text }}>
              {startDateFilter && endDateFilter
                ? (startDateFilter === endDateFilter ? formatFriendlyDate(startDateFilter) : `${formatFriendlyDate(startDateFilter)} - ${formatFriendlyDate(endDateFilter)}`)
                : 'Fechas'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Indicador de Fechas Activas */}
        {(startDateFilter || endDateFilter) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              Filtrado: {startDateFilter === endDateFilter ? formatFriendlyDate(startDateFilter) : `${formatFriendlyDate(startDateFilter)} a ${formatFriendlyDate(endDateFilter)}`}
            </Text>
            <TouchableOpacity onPress={() => { setStartDateFilter(null); setEndDateFilter(null); }}>
              <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: 'bold' }}>Limpiar fechas</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Segmented Control Tabs */}
      <View style={[styles.tabsSegmentedContainer, { backgroundColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => { if (activeTab !== 'pendientes') { setActiveTab('pendientes'); setCurrentPage(1); } }}
          style={[
            styles.tabSegment,
            activeTab === 'pendientes' && { backgroundColor: themeColors.backgroundElement }
          ]}
        >
          <Text style={[styles.tabSegmentText, { color: activeTab === 'pendientes' ? themeColors.text : themeColors.textSecondary, fontWeight: activeTab === 'pendientes' ? 'bold' : '600' }]}>
            Revisar ({backendTotals ? backendTotals.countPendientes : pendingGastos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { if (activeTab !== 'historial') { setActiveTab('historial'); setCurrentPage(1); } }}
          style={[
            styles.tabSegment,
            activeTab === 'historial' && { backgroundColor: themeColors.backgroundElement }
          ]}
        >
          <Text style={[styles.tabSegmentText, { color: activeTab === 'historial' ? themeColors.text : themeColors.textSecondary, fontWeight: activeTab === 'historial' ? 'bold' : '600' }]}>
            Historial ({activeTab === 'historial' ? totalCount : (backendTotals ? backendTotals.countAprobados : historyGastos.length)})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <ScrollView style={{ flex: 1 }}>
        {renderScreenHeader()}
        {activeTab === 'historial' && (
          <View style={{ flexDirection: 'row', marginHorizontal: Spacing.three, marginBottom: Spacing.two, marginTop: Spacing.one, backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium, overflow: 'hidden', borderWidth: 1, borderColor: themeColors.border }}>
            <View style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'TODOS' ? themeColors.accent + '20' : 'transparent' }}>
              <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'TODOS' ? 'bold' : '600', color: facturaFilter === 'TODOS' ? themeColors.accent : themeColors.textSecondary }}>TODOS</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: themeColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: themeColors.textSecondary }}>FACTURADOS</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRightWidth: 1, borderColor: themeColors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: themeColors.textSecondary }}>PEND. ENTREGAR</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: themeColors.textSecondary }}>NO FACTURADOS</Text>
            </View>
          </View>
        )}
        {isDesktop ? (
          <GastosTableSkeleton isHistorial={activeTab === 'historial'} count={8} />
        ) : (
          <GastosCardsListSkeleton count={6} />
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* REVISAR PENDIENTES */}
      {activeTab === 'pendientes' && (
        isDesktop ? (
          <ScrollView style={{ flex: 1 }}>
            {renderScreenHeader()}
            <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
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
              <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '12%', fontWeight: 'bold' }]}>Categoría</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '12%', fontWeight: 'bold' }]}>Empleado</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '16%', fontWeight: 'bold' }]}>Proveedor / Cliente</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '11%', fontWeight: 'bold' }]}>Sucursal</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Fecha</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '9%', fontWeight: 'bold' }]}>Estado</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Autorizado</Text>
                <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold', textAlign: 'right' }]}>Monto</Text>
                <View style={{ width: '10%', alignItems: 'center' }}>
                  <Ionicons name="settings-outline" size={14} color={themeColors.text} />
                </View>
              </View>
              <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
                {pendingGastos.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="shield-checkmark-outline" size={48} color={themeColors.success} />
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                      ¡Al corriente! No hay gastos pendientes de revisión.
                    </Text>
                  </View>
                ) : (
                  pendingGastos.map((item) => {
                    const fecha = formatFriendlyDate(item.fecha_comprobante || item.created_at);

                    let statusText = 'PENDIENTE';
                    let statusColor: string = themeColors.warning;
                    if (item.status === 'APPROVED') { statusText = 'APROBADO'; statusColor = themeColors.success; }
                    else if (item.status === 'REJECTED') { statusText = 'RECHAZADO'; statusColor = themeColors.danger; }
                    else if (item.status === 'ACTION_REQUIRED') { statusText = 'ACCIÓN REQ.'; statusColor = themeColors.actionRequired; }

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setSelectedGasto(item);
                          setReviewModalVisible(true);
                        }}
                        style={({ hovered }: any) => [
                          styles.tableRow,
                          { borderBottomColor: themeColors.border },
                          hovered && { backgroundColor: themeColors.backgroundSelected }
                        ] as any}
                      >
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '12%', fontWeight: '600' }]} numberOfLines={1}>{GastoHelper.getCategoria(item) || 'Sin Cat.'}</Text>
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '12%' }]} numberOfLines={1}>{item.empleado_nombre}</Text>
                        <Text style={[styles.tableCell, { width: '16%', color: themeColors.textSecondary }]} numberOfLines={1}>
                          {GastoHelper.getProveedor(item)} {GastoHelper.getProveedor(item) && GastoHelper.getCliente(item) ? ' | ' : ''} {GastoHelper.getCliente(item)}
                        </Text>
                        <Text style={[styles.tableCell, { color: themeColors.textSecondary, width: '11%' }]} numberOfLines={1}>{GastoHelper.getSucursal(item) || '-'}</Text>
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '10%' }]}>{fecha}</Text>
                        <View style={{ width: '9%' }}>
                           <View style={{ backgroundColor: statusColor + '18', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                             <Text style={{ fontSize: 9, fontWeight: 'bold', color: statusColor }}>{statusText}</Text>
                           </View>
                        </View>
                        <Text style={[styles.tableCell, { color: themeColors.textSecondary, width: '10%', fontSize: 11 }]} numberOfLines={1}>
                          {item.rejection_feedback?.match(/\[(?:Aprobado|Devuelto|Rechazado) por (.*?)\]/)?.[1] || '-'}
                        </Text>
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '10%', fontWeight: '700', textAlign: 'right' }]}>{formatCurrency(item.monto)}</Text>
                        <View style={{ width: '10%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              setSelectedGasto(item);
                              setReviewModalVisible(true);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteGasto(item.id);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
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
          <FlatList scrollEnabled={true} style={{ flex: 1 }}
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
                  style={{ marginHorizontal: Spacing.three, marginBottom: Spacing.four }}
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
              <ExpenseCard
                gasto={item}
                showEmployeeName
                onPress={() => {
                  setSelectedGasto(item);
                  setReviewModalVisible(true);
                }}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark-outline" size={48} color={themeColors.success} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  ¡Al corriente! No hay gastos pendientes de revisión.
                </Text>
              </View>
            }
            refreshing={isLoading}
            onRefresh={refreshData}
          />
        )
      )}

      {/* HISTORIAL */}
      {activeTab === 'historial' && (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: Spacing.three, marginBottom: Spacing.two, marginTop: Spacing.one, backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium, overflow: 'hidden', borderWidth: 1, borderColor: themeColors.border }}>
            <TouchableOpacity
              onPress={() => { setFacturaFilter('TODOS'); setCurrentPage(1); }}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'TODOS' ? themeColors.accent + '20' : 'transparent' }}
            >
              <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'TODOS' ? 'bold' : '600', color: facturaFilter === 'TODOS' ? themeColors.accent : themeColors.textSecondary }}>TODOS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setFacturaFilter('FACTURADOS'); setCurrentPage(1); }}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'FACTURADOS' ? themeColors.accent + '20' : 'transparent', borderLeftWidth: 1, borderRightWidth: 1, borderColor: themeColors.border }}
            >
              <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'FACTURADOS' ? 'bold' : '600', color: facturaFilter === 'FACTURADOS' ? themeColors.accent : themeColors.textSecondary }}>FACTURADOS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setFacturaFilter('PENDIENTE_ENTREGA'); setCurrentPage(1); }}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'PENDIENTE_ENTREGA' ? themeColors.warning + '20' : 'transparent', borderRightWidth: 1, borderColor: themeColors.border }}
            >
              <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'PENDIENTE_ENTREGA' ? 'bold' : '600', color: facturaFilter === 'PENDIENTE_ENTREGA' ? themeColors.warning : themeColors.textSecondary }}>PEND. ENTREGAR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setFacturaFilter('NO_FACTURADOS'); setCurrentPage(1); }}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: facturaFilter === 'NO_FACTURADOS' ? themeColors.danger + '20' : 'transparent' }}
            >
              <Text style={{ fontSize: 10, fontWeight: facturaFilter === 'NO_FACTURADOS' ? 'bold' : '600', color: facturaFilter === 'NO_FACTURADOS' ? themeColors.danger : themeColors.textSecondary }}>NO FACTURADOS</Text>
            </TouchableOpacity>
          </View>
          {isDesktop ? (
            <ScrollView style={{ flex: 1 }}>
              {renderScreenHeader()}
              <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
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
                <View style={[styles.tableHeaderRow, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '11%', fontWeight: 'bold' }]}>Categoría</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '11%', fontWeight: 'bold' }]}>Empleado</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '14%', fontWeight: 'bold' }]}>Proveedor / Cliente</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold' }]}>Sucursal</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '9%', fontWeight: 'bold' }]}>Fecha</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '8%', fontWeight: 'bold' }]}>Estado</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '11%', fontWeight: 'bold' }]}>Reembolso</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '8%', fontWeight: 'bold' }]}>Autorizado</Text>
                  <Text style={[styles.tableHeaderCell, { color: themeColors.text, width: '10%', fontWeight: 'bold', textAlign: 'right' }]}>Monto</Text>
                  <View style={{ width: '8%', alignItems: 'center' }}>
                    <Ionicons name="settings-outline" size={14} color={themeColors.text} />
                  </View>
                </View>
                <View style={{ backgroundColor: themeColors.backgroundElement, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderTopWidth: 0 }}>
                {historyGastos.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No hay registros históricos.</Text>
                  </View>
                ) : (
                  historyGastos.map((item) => {
                    const fecha = formatFriendlyDate(item.fecha_comprobante || item.created_at);

                    let statusText = 'PENDIENTE';
                    let statusColor: string = themeColors.warning;
                    if (item.status === 'APPROVED') { statusText = 'APROBADO'; statusColor = themeColors.success; }
                    else if (item.status === 'REJECTED') { statusText = 'RECHAZADO'; statusColor = themeColors.danger; }
                    else if (item.status === 'ACTION_REQUIRED') { statusText = 'ACCIÓN REQ.'; statusColor = themeColors.actionRequired; }

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setSelectedGasto(item);
                          setReviewModalVisible(true);
                        }}
                        style={({ hovered }: any) => [
                          styles.tableRow,
                          { borderBottomColor: themeColors.border },
                          hovered && { backgroundColor: themeColors.backgroundSelected }
                        ] as any}
                      >
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '11%', fontWeight: '600' }]} numberOfLines={1}>{GastoHelper.getCategoria(item) || 'Sin Cat.'}</Text>
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '11%' }]} numberOfLines={1}>{item.empleado_nombre}</Text>
                        <Text style={[styles.tableCell, { width: '14%', color: themeColors.textSecondary }]} numberOfLines={1}>
                          {GastoHelper.getProveedor(item)} {GastoHelper.getProveedor(item) && GastoHelper.getCliente(item) ? ' | ' : ''} {GastoHelper.getCliente(item)}
                        </Text>
                        <Text style={[styles.tableCell, { color: themeColors.textSecondary, width: '10%' }]} numberOfLines={1}>{GastoHelper.getSucursal(item) || '-'}</Text>
                        <Text style={[styles.tableCell, { color: themeColors.text, width: '9%' }]}>{fecha}</Text>
                        <View style={{ width: '8%' }}>
                           <View style={{ backgroundColor: statusColor + '18', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                             <Text style={{ fontSize: 9, fontWeight: 'bold', color: statusColor }}>{statusText}</Text>
                           </View>
                        </View>
                        <View style={{ width: '11%' }}>
                          {item.estado_reembolso === 'PENDIENTE_REEMBOLSO' ? (
                            <View style={{ backgroundColor: themeColors.warning + '18', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: themeColors.warning + '40' }}>
                              <Text style={{ fontSize: 9, fontWeight: 'bold', color: themeColors.warning }}>⏳ Pend. Reemb.</Text>
                            </View>
                          ) : item.estado_reembolso === 'REEMBOLSADO' ? (
                            <View style={{ backgroundColor: '#8b5cf618', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#8b5cf640' }}>
                              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#8b5cf6' }}>↩️ Reembolsado</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>-</Text>
                          )}
                        </View>
                        <Text style={[styles.tableCell, { color: themeColors.textSecondary, width: '8%', fontSize: 11 }]} numberOfLines={1}>
                          {item.rejection_feedback?.match(/\[(?:Aprobado|Devuelto|Rechazado) por (.*?)\]/)?.[1] || '-'}
                        </Text>
                        <Text style={[styles.tableCell, { width: '10%', fontWeight: '700', color: themeColors.text, textAlign: 'right' }]}>{formatCurrency(item.monto)}</Text>
                        <View style={{ width: '8%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              setSelectedGasto(item);
                              setReviewModalVisible(true);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="eye-outline" size={16} color={themeColors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteGasto(item.id);
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
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
            <FlatList scrollEnabled={true} style={{ flex: 1 }}
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
                    style={{ marginHorizontal: Spacing.three, marginBottom: Spacing.four }}
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
                <ExpenseCard
                  gasto={item}
                  showEmployeeName
                  onPress={() => {
                    setSelectedGasto(item);
                    setReviewModalVisible(true);
                  }}
                  onDelete={() => handleDeleteGasto(item.id)}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="folder-open-outline" size={48} color={themeColors.textSecondary} />
                  <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                    No hay registros históricos.
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
