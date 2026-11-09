import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminEmpleadosStockTab({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    handleExportEmpleadosStockExcel,
    isExportingEmpleadosStockExcel,
    filteredEmpleadosStock,
    handleOpenAsignarModal,
    loadEmpleadosStock,
    isLoadingEmpleadosStock,
    empleadosStockSearch,
    setEmpleadosStockSearch,
    selectedEmpleadoStockFilter,
    setSelectedEmpleadoStockFilter,
    empleados,
    setSelectorTitle,
    setSelectorSearch,
    setSelectorOptions,
    setOnSelectOption,
    setSelectorVisible,
    empleadosStockViewMode,
    setEmpleadosStockViewMode,
    filteredPorEmpleado,
    expandedEmpleadoIds,
    setExpandedEmpleadoIds,
    filteredPorProducto,
  } = inv;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header del Módulo */}
      <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 16, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ backgroundColor: '#2563EB20', padding: 6, borderRadius: 8 }}>
                <Ionicons name="people" size={20} color="#2563EB" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Material en Empleados y Camionetas</Text>
            </View>
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
              Auditoría y control de insumos y productos actualmente en posesión y custodia de los colaboradores y técnicos.
            </Text>
          </View>

          {/* Botonera Superior */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity
              onPress={() => handleExportEmpleadosStockExcel()}
              disabled={isExportingEmpleadosStockExcel || filteredEmpleadosStock.length === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#10B981',
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                opacity: isExportingEmpleadosStockExcel || filteredEmpleadosStock.length === 0 ? 0.6 : 1
              }}
            >
              {isExportingEmpleadosStockExcel ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="document-text-outline" size={16} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Exportar Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleOpenAsignarModal('')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#2563EB',
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8
              }}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Asignar Material</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => loadEmpleadosStock()}
              disabled={isLoadingEmpleadosStock}
              style={{
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 9,
                borderRadius: 8,
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <Ionicons name="refresh-outline" size={16} color={themeColors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Filtros y Selector de Modo */}
      <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 14, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1, gap: 12 }}>
        {/* Buscador */}
        <CustomInput
          placeholder="Buscar por colaborador, producto, SKU o categoría..."
          value={empleadosStockSearch}
          onChangeText={setEmpleadosStockSearch}
          iconName="search-outline"
        />

        {/* Fila: Selector de Colaborador + Toggle de Modo de Vista */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Selector de Colaborador */}
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, marginBottom: 4 }}>Filtrar por Colaborador</Text>
            <TouchableOpacity
              style={{
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onPress={() => {
                setSelectorTitle('Filtrar por Colaborador');
                setSelectorSearch('');
                setSelectorOptions([
                  { id: '', label: '👥 Todos los Colaboradores' },
                  ...empleados.map(e => ({ id: e.id, label: e.nombre || e.email }))
                ]);
                setOnSelectOption(() => (id: string) => setSelectedEmpleadoStockFilter(id));
                setSelectorVisible(true);
              }}
            >
              <Text style={{ fontSize: 13, color: selectedEmpleadoStockFilter ? themeColors.text : themeColors.textSecondary }} numberOfLines={1}>
                {selectedEmpleadoStockFilter ? (empleados.find(e => e.id === selectedEmpleadoStockFilter)?.nombre || 'Colaborador seleccionado') : '👥 Todos los Colaboradores'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Toggle de Modo: Por Colaborador vs Por Producto */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text, marginBottom: 4 }}>Agrupar por</Text>
            <View style={{ flexDirection: 'row', backgroundColor: themeColors.background, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, padding: 2 }}>
              <TouchableOpacity
                onPress={() => setEmpleadosStockViewMode('por_empleado')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: empleadosStockViewMode === 'por_empleado' ? themeColors.primary : 'transparent'
                }}
              >
                <Ionicons name="person-outline" size={14} color={empleadosStockViewMode === 'por_empleado' ? '#fff' : themeColors.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: empleadosStockViewMode === 'por_empleado' ? '#fff' : themeColors.textSecondary }}>
                  Colaborador
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setEmpleadosStockViewMode('por_producto')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: empleadosStockViewMode === 'por_producto' ? themeColors.primary : 'transparent'
                }}
              >
                <Ionicons name="cube-outline" size={14} color={empleadosStockViewMode === 'por_producto' ? '#fff' : themeColors.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: empleadosStockViewMode === 'por_producto' ? '#fff' : themeColors.textSecondary }}>
                  Material
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Contenido / Listado */}
      {isLoadingEmpleadosStock ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ marginTop: 10, color: themeColors.textSecondary, fontSize: 13 }}>Cargando inventarios de colaboradores...</Text>
        </View>
      ) : filteredEmpleadosStock.length === 0 ? (
        <View style={{ padding: 40, backgroundColor: themeColors.backgroundElement, borderRadius: 12, alignItems: 'center', borderColor: themeColors.border, borderWidth: 1 }}>
          <Ionicons name="cube-outline" size={44} color={themeColors.textSecondary} />
          <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 16, marginTop: 12 }}>Sin Material Asignado</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4, maxWidth: 350 }}>
            {empleadosStockSearch || selectedEmpleadoStockFilter
              ? 'No hay inventarios de colaboradores que coincidan con la búsqueda o filtro aplicado.'
              : 'No hay colaboradores que tengan material en custodia actualmente. Puedes transferir material usando el botón "Asignar Material".'}
          </Text>
          <TouchableOpacity
            onPress={() => handleOpenAsignarModal(selectedEmpleadoStockFilter || '')}
            style={{
              marginTop: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#2563EB',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Asignar Material Ahora</Text>
          </TouchableOpacity>
        </View>
      ) : empleadosStockViewMode === 'por_empleado' ? (
        /* VISTA 1: AGRUPADO POR COLABORADOR */
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary }}>
              Colaboradores ({filteredPorEmpleado.length})
            </Text>
            {filteredPorEmpleado.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  if (expandedEmpleadoIds.length === filteredPorEmpleado.length) {
                    setExpandedEmpleadoIds([]);
                  } else {
                    setExpandedEmpleadoIds(filteredPorEmpleado.map((e: any) => e.empleado_id));
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 }}
              >
                <Ionicons
                  name={expandedEmpleadoIds.length === filteredPorEmpleado.length ? "contract-outline" : "expand-outline"}
                  size={14}
                  color={themeColors.primary}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                  {expandedEmpleadoIds.length === filteredPorEmpleado.length ? 'Colapsar todos' : 'Expandir todos'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {filteredPorEmpleado.map((emp: any) => {
            const isExpanded = expandedEmpleadoIds.includes(emp.empleado_id);
            return (
              <View
                key={emp.empleado_id}
                style={{
                  backgroundColor: themeColors.backgroundElement,
                  borderRadius: 12,
                  borderColor: themeColors.border,
                  borderWidth: 1,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 2,
                  elevation: 1
                }}
              >
                {/* Header del Colaborador */}
                <TouchableOpacity
                  onPress={() => {
                    setExpandedEmpleadoIds(prev =>
                      prev.includes(emp.empleado_id)
                        ? prev.filter(id => id !== emp.empleado_id)
                        : [...prev, emp.empleado_id]
                    );
                  }}
                  style={{
                    padding: 14,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: themeColors.backgroundElement,
                    borderBottomWidth: isExpanded ? 1 : 0,
                    borderBottomColor: themeColors.border,
                    flexWrap: 'wrap',
                    gap: 10
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#3B82F640' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#2563EB' }}>
                        {(emp.empleado_nombre || 'E').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>{emp.empleado_nombre}</Text>
                        <View style={{ backgroundColor: '#2563EB15', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>{emp.empleado_rol || 'EMPLEADO'}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>{emp.empleado_email || 'Sin email'}</Text>
                    </View>
                  </View>

                  {/* Resumen de Cantidades y Acciones */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#059669' }}>
                          {emp.total_articulos} artículos
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                        {emp.total_partidas} {emp.total_partidas === 1 ? 'partida' : 'partidas'} • ${Number(emp.valor_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                      </Text>
                    </View>

                    {/* Botón Asignar Rápido */}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenAsignarModal(emp.empleado_id);
                      }}
                      style={{
                        backgroundColor: '#2563EB',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6
                      }}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Asignar</Text>
                    </TouchableOpacity>

                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={themeColors.textSecondary}
                    />
                  </View>
                </TouchableOpacity>

                {/* Desglose de Materiales Expandido */}
                {isExpanded && (
                  <View style={{ padding: 12, backgroundColor: themeColors.background, gap: 8 }}>
                    {emp.materiales.map((mat: any, mIdx: number) => {
                      const qNuevo = Number(mat.cantidad_nuevo) || 0;
                      const qUsado = Number(mat.cantidad_usado) || 0;
                      const qPorRev = Number(mat.cantidad_por_revisar) || 0;

                      return (
                        <View
                          key={mIdx}
                          style={{
                            backgroundColor: themeColors.backgroundElement,
                            borderRadius: 8,
                            padding: 12,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                            gap: 6
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>{mat.producto_nombre}</Text>
                              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>SKU: <Text style={{ fontWeight: '600' }}>{mat.producto_sku || '-'}</Text></Text>
                                <View style={{ backgroundColor: themeColors.border, width: 4, height: 4, borderRadius: 2 }} />
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{mat.categoria_nombre}</Text>
                              </View>
                            </View>

                            {/* Cantidad Total */}
                            <View style={{ backgroundColor: '#3B82F620', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '800', color: '#2563EB' }}>
                                {mat.cantidad_disponible} {mat.producto_unidad}
                              </Text>
                            </View>
                          </View>

                          {/* Píldoras de Condición / Estado */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                              {qNuevo > 0 && (
                                <View style={{ backgroundColor: '#10B98118', borderColor: '#10B981', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>🟢 Nuevas: {qNuevo}</Text>
                                </View>
                              )}
                              {qUsado > 0 && (
                                <View style={{ backgroundColor: '#D9770618', borderColor: '#D97706', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>🟡 Usadas: {qUsado}</Text>
                                </View>
                              )}
                              {qPorRev > 0 && (
                                <View style={{ backgroundColor: '#DC262618', borderColor: '#DC2626', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>🔴 Dañadas / Rev: {qPorRev}</Text>
                                </View>
                              )}
                            </View>

                            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                              Valor est: ${Number(mat.valor_estimado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        /* VISTA 2: AGRUPADO POR MATERIAL / PRODUCTO */
        <View style={{ gap: 14 }}>
          {filteredPorProducto.map((prod: any) => (
            <View
              key={prod.producto_id}
              style={{
                backgroundColor: themeColors.backgroundElement,
                borderRadius: 12,
                borderColor: themeColors.border,
                borderWidth: 1,
                padding: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 2,
                elevation: 1,
                gap: 10
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>{prod.producto_nombre}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>SKU: <Text style={{ fontWeight: '600' }}>{prod.producto_sku || '-'}</Text></Text>
                    <View style={{ backgroundColor: themeColors.border, width: 4, height: 4, borderRadius: 2 }} />
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{prod.categoria_nombre}</Text>
                  </View>
                </View>

                {/* Badges de Comparación: Custodia vs Almacén */}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ backgroundColor: '#2563EB20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB' }}>
                      En Técnicos: {prod.total_custodia} {prod.producto_unidad}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                      Almacén: {prod.producto_stock_general} {prod.producto_unidad}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Lista de Colaboradores que tienen este material */}
              <View style={{ backgroundColor: themeColors.background, borderRadius: 8, padding: 10, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                  Distribución en Colaboradores ({prod.empleados.length}):
                </Text>
                {prod.empleados.map((empMat: any, eIdx: number) => (
                  <View
                    key={eIdx}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 4,
                      borderBottomWidth: eIdx === prod.empleados.length - 1 ? 0 : 1,
                      borderBottomColor: themeColors.border
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 8 }}>
                      <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }} numberOfLines={1}>
                        {empMat.empleado_nombre}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: '#2563EB15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB' }}>
                          {empMat.cantidad_disponible} {prod.producto_unidad}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleOpenAsignarModal(empMat.empleado_id)}
                        style={{ padding: 4 }}
                        {...(Platform.OS === 'web' ? { title: "Asignar más a este colaborador" } as any : {})}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
