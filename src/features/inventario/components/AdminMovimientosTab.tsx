import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import PaginationControls from '@/components/PaginationControls';
import { MovimientoCardItem } from './MovimientoCardItem';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminMovimientosTab({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    paginatedMovimientos,
    filteredMovimientos,
    handleExportMovimientosPDF,
    isExportingMovimientosPDF,
    handleExportMovimientosCSV,
    isExportingMovimientosExcel,
    loadMovimientos,
    isLoadingMovimientos,
    totalMovimientosCount,
    totalEntradasCount,
    totalSalidasCount,
    totalGastosCount,
    movimientosSearch,
    setMovimientosSearch,
    empleados,
    selectedUsuarioMovimiento,
    setSelectedUsuarioMovimiento,
    setSelectorTitle,
    setSelectorSearch,
    setSelectorOptions,
    setOnSelectOption,
    setSelectorVisible,
    selectedTipoMovimiento,
    setSelectedTipoMovimiento,
    selectedDateFilterMov,
    setSelectedDateFilterMov,
    currentPageMov,
    setCurrentPageMov,
    totalPagesMov,
    pageSizeMov,
    setPageSizeMov,
    exportingSingleMovimientoId,
    handleExportSingleMovimientoVale,
    handleEliminarMovimiento,
  } = inv;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      data={paginatedMovimientos}
      keyExtractor={(item) => String(item.id)}
      initialNumToRender={15}
      maxToRenderPerBatch={15}
      windowSize={7}
      removeClippedSubviews={Platform.OS !== 'web'}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {/* Header del Módulo */}
          <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 16, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text, marginBottom: 4 }}>Control y Reportes de Movimientos</Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                  Auditoría integral de inventario: Entradas, Salidas / Retiros, Gastos de material, Compras y Devoluciones.
                </Text>
              </View>

              {/* Botones de Exportación */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  onPress={() => handleExportMovimientosPDF(filteredMovimientos)}
                  disabled={isExportingMovimientosPDF}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: themeColors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    opacity: isExportingMovimientosPDF ? 0.7 : 1
                  }}
                >
                  {isExportingMovimientosPDF ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                  )}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Exportar PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleExportMovimientosCSV(filteredMovimientos)}
                  disabled={isExportingMovimientosExcel}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#10B981',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    opacity: isExportingMovimientosExcel ? 0.7 : 1
                  }}
                >
                  {isExportingMovimientosExcel ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="grid-outline" size={16} color="#fff" />
                  )}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Excel (CSV)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={loadMovimientos}
                  disabled={isLoadingMovimientos}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                    borderWidth: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    opacity: isLoadingMovimientos ? 0.6 : 1
                  }}
                >
                  {isLoadingMovimientos ? (
                    <ActivityIndicator size="small" color={themeColors.text} />
                  ) : (
                    <Ionicons name="reload" size={16} color={themeColors.text} />
                  )}
                  <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 12 }}>Recargar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tarjetas Métricas */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 110, backgroundColor: themeColors.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>Movimientos</Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text, marginTop: 2 }}>{totalMovimientosCount}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 110, backgroundColor: themeColors.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderLeftWidth: 3, borderLeftColor: '#10B981' }}>
                <Text style={{ fontSize: 11, color: '#059669', textTransform: 'uppercase', fontWeight: '600' }}>Entradas</Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#10B981', marginTop: 2 }}>{totalEntradasCount}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 110, backgroundColor: themeColors.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderLeftWidth: 3, borderLeftColor: '#EF4444' }}>
                <Text style={{ fontSize: 11, color: '#DC2626', textTransform: 'uppercase', fontWeight: '600' }}>Salidas</Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#EF4444', marginTop: 2 }}>{totalSalidasCount}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 110, backgroundColor: themeColors.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, borderLeftWidth: 3, borderLeftColor: '#8B5CF6' }}>
                <Text style={{ fontSize: 11, color: '#8B5CF6', textTransform: 'uppercase', fontWeight: '600' }}>Gastos</Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#8B5CF6', marginTop: 2 }}>{totalGastosCount}</Text>
              </View>
            </View>
          </View>

          {/* Filtros */}
          <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 14, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1 }}>
            {/* Buscador de texto */}
            <CustomInput
              placeholder="Buscar por material, SKU, cliente, usuario, concepto..."
              value={movimientosSearch}
              onChangeText={setMovimientosSearch}
              iconName="search-outline"
              style={{ marginBottom: 12 }}
            />

            {/* Filtro por Usuario / Empleado */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, marginBottom: 4 }}>Filtrar por Responsable / Usuario</Text>
              <TouchableOpacity
                style={{ backgroundColor: themeColors.background, borderColor: themeColors.border, borderWidth: 1, padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => {
                  setSelectorTitle('Filtrar por Usuario');
                  setSelectorSearch('');
                  setSelectorOptions([
                    { id: '', label: 'Todos los Usuarios' },
                    ...empleados.map(e => ({ id: e.id, label: e.nombre }))
                  ]);
                  setOnSelectOption(() => (id: string) => {
                    setSelectedUsuarioMovimiento(id);
                  });
                  setSelectorVisible(true);
                }}
              >
                <Text style={{ color: selectedUsuarioMovimiento ? themeColors.text : themeColors.textSecondary, fontSize: 13 }}>
                  {empleados.find(e => e.id === selectedUsuarioMovimiento)?.nombre || 'Todos los Usuarios'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Filtro por Tipo / Subtipo */}
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, marginBottom: 6 }}>Tipo de Movimiento</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['TODOS', 'ENTRADA', 'SALIDA', 'GASTO', 'DEVOLUCIÓN', 'COMPRA/FACTURA'] as const).map(tipo => {
                  const isSelected = selectedTipoMovimiento === tipo;
                  const isGasto = tipo === 'GASTO';
                  const isSalida = tipo === 'SALIDA';
                  const activeColor = isGasto ? '#8B5CF6' : isSalida ? '#DC2626' : themeColors.primary;

                  return (
                    <TouchableOpacity
                      key={tipo}
                      onPress={() => setSelectedTipoMovimiento(tipo)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: isSelected ? activeColor : themeColors.border,
                        backgroundColor: isSelected ? activeColor + '20' : themeColors.background
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: isSelected ? '700' : '500', color: isSelected ? activeColor : themeColors.textSecondary }}>
                        {tipo}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Filtro por Rango de Fecha */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, marginBottom: 6 }}>Periodo</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['TODOS', 'HOY', 'SEMANA', 'MES'] as const).map(f => {
                  const isSelected = selectedDateFilterMov === f;
                  const labels: Record<string, string> = { TODOS: 'Todo el Historial', HOY: 'Hoy', SEMANA: 'Esta Semana', MES: 'Este Mes' };
                  return (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setSelectedDateFilterMov(f)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                        backgroundColor: isSelected ? themeColors.primary + '20' : themeColors.background
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: isSelected ? '700' : '500', color: isSelected ? themeColors.primary : themeColors.textSecondary }}>
                        {labels[f]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      }
      ListEmptyComponent={
        isLoadingMovimientos ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={{ marginTop: 10, color: themeColors.textSecondary, fontSize: 13 }}>Cargando movimientos...</Text>
          </View>
        ) : (
          <View style={{ padding: 30, backgroundColor: themeColors.backgroundElement, borderRadius: 12, alignItems: 'center', borderColor: themeColors.border, borderWidth: 1 }}>
            <Ionicons name="cube-outline" size={40} color={themeColors.textSecondary} />
            <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 15, marginTop: 10 }}>No se encontraron movimientos</Text>
            <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              No hay registros de inventario que coincidan con los filtros aplicados.
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        filteredMovimientos.length > 0 ? (
          <PaginationControls
            currentPage={currentPageMov}
            totalPages={totalPagesMov}
            totalItems={filteredMovimientos.length}
            itemsPerPage={pageSizeMov}
            onPageChange={setCurrentPageMov}
            onItemsPerPageChange={(newSize: number) => {
              setPageSizeMov(newSize);
              setCurrentPageMov(1);
            }}
            itemsPerPageOptions={[20, 25, 50, 100]}
            isLoading={isLoadingMovimientos}
            style={{ marginTop: 14, marginBottom: 20 }}
          />
        ) : null
      }
      renderItem={({ item }) => (
        <MovimientoCardItem
          m={item}
          themeColors={themeColors}
          exportingSingleMovimientoId={exportingSingleMovimientoId}
          onExportSingleVale={handleExportSingleMovimientoVale}
          onDeleteMovimiento={handleEliminarMovimiento}
        />
      )}
    />
  );
}
