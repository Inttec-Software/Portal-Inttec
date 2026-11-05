import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import { InventarioListSkeleton } from '@/components/skeleton';
import { decodeHtmlEntities } from '@/utils/helpers';
import { useHeaderAction } from '@/context/HeaderActionContext';
import { EmpleadoInventarioTabType } from '../types';
import { useDevoluciones } from '../hooks/useDevoluciones';
import { styles as devolucionesStyles } from './devolucionesStyles';
import { styles as empStyles } from './empleadoInventarioStyles';
import DevolucionCard from './DevolucionCard';
import GastoCard from './GastoCard';

interface EmpleadoInventarioViewProps {
  initialTab?: EmpleadoInventarioTabType;
}

export default function EmpleadoInventarioView({
  initialTab = 'stock',
}: EmpleadoInventarioViewProps) {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { setHeaderRight } = useHeaderAction();

  const {
    activeTab,
    setActiveTab,
    inventario,
    filteredInventario,
    searchQuery,
    setSearchQuery,
    handleSelectForGasto,
    handleSelectForDevolucion,
    isLoading,
    clientes,
    sucursalesCliente,
    materialesDevolver,
    materialesGasto,
    expandedDevolucion,
    setExpandedDevolucion,
    expandedGasto,
    setExpandedGasto,
    observacionesDevolucion,
    setObservacionesDevolucion,
    isSubmittingDevolucion,
    tipoGasto,
    setTipoGasto,
    detalleTrabajo,
    setDetalleTrabajo,
    selectedCliente,
    setSelectedCliente,
    selectedClienteId,
    setSelectedClienteId,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    sucursal,
    setSucursal,
    selectedSucursalId,
    setSelectedSucursalId,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    isSubmittingGasto,
    isSubmittingGastoYDevolucion,
    feedbackMessage,
    totalDevolverGeneral,
    totalGastoGeneral,
    totalRestanteGeneral,
    handleDirectQty,
    handleConditionChange,
    handleSetAllCondition,
    handleClearItem,
    handleAutollenarDevolucionTodo,
    handleTransferirRestanteADevolucion,
    handleEnviarDevolucion,
    handleEnviarGasto,
  } = useDevoluciones(initialTab);

  // Botón en Header: Acceso rápido a retirar material del almacén
  useEffect(() => {
    setHeaderRight(
      <TouchableOpacity
        onPress={() => router.push('/(empleado)/retiro-material' as any)}
        style={{ padding: 8, marginRight: 4 }}
        activeOpacity={0.7}
      >
        <Ionicons name="cart-outline" size={24} color={themeColors.text} />
      </TouchableOpacity>
    );

    return () => {
      setHeaderRight(null);
    };
  }, [themeColors, router, setHeaderRight]);

  if (isLoading) {
    return (
      <View style={[empStyles.container, { backgroundColor: themeColors.background }]}>
        <ScrollView style={{ flex: 1 }}>
          <InventarioListSkeleton isMobile={true} count={5} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[empStyles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={empStyles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* BANNER DE NOTIFICACIÓN EN PANTALLA */}
        {feedbackMessage && (
          <View
            style={[
              empStyles.feedbackBanner,
              {
                backgroundColor:
                  feedbackMessage.type === 'success' ? themeColors.success + '20' : themeColors.danger + '20',
                borderColor: feedbackMessage.type === 'success' ? themeColors.success : themeColors.danger,
              },
            ]}
          >
            <Ionicons
              name={feedbackMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={feedbackMessage.type === 'success' ? themeColors.success : themeColors.danger}
            />
            <Text
              style={{
                color: feedbackMessage.type === 'success' ? themeColors.success : themeColors.danger,
                fontWeight: '600',
                fontSize: 13,
                flex: 1,
              }}
            >
              {feedbackMessage.text}
            </Text>
          </View>
        )}

        {/* SELECTOR DE PESTAÑAS (SEGMENTED CONTROL ESTANDARIZADO) */}
        <View
          style={[
            empStyles.tabsContainer,
            { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          {/* Pestaña 1: En Posesión */}
          <TouchableOpacity
            style={[
              empStyles.tabBtn,
              activeTab === 'stock' && [
                empStyles.activeTabBtn,
                { backgroundColor: themeColors.primary },
              ],
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('stock');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="cube-outline"
              size={15}
              color={activeTab === 'stock' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                empStyles.tabBtnText,
                { color: activeTab === 'stock' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              En Posesión ({inventario.length})
            </Text>
          </TouchableOpacity>

          {/* Pestaña 2: Devolver al Almacén */}
          <TouchableOpacity
            style={[
              empStyles.tabBtn,
              activeTab === 'devolucion' && [
                empStyles.activeTabBtn,
                { backgroundColor: themeColors.primary },
              ],
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('devolucion');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="return-down-back-outline"
              size={15}
              color={activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                empStyles.tabBtnText,
                { color: activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Devolver
            </Text>
            {totalDevolverGeneral > 0 && activeTab !== 'devolucion' && (
              <View style={[empStyles.tabBadge, { backgroundColor: themeColors.primary }]}>
                <Text style={empStyles.tabBadgeText}>{totalDevolverGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Pestaña 3: Marcar Gasto */}
          <TouchableOpacity
            style={[
              empStyles.tabBtn,
              activeTab === 'gasto' && [empStyles.activeTabBtn, { backgroundColor: '#10B981' }],
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('gasto');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="construct-outline"
              size={15}
              color={activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                empStyles.tabBtnText,
                { color: activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Gasto
            </Text>
            {totalGastoGeneral > 0 && activeTab !== 'gasto' && (
              <View style={[empStyles.tabBadge, { backgroundColor: '#10B981' }]}>
                <Text style={empStyles.tabBadgeText}>{totalGastoGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ==================== TAB 1: EN POSESIÓN (STOCK ACTUAL) ==================== */}
        {activeTab === 'stock' && (
          <View>
            {/* Buscador de Materiales */}
            {inventario.length > 0 && (
              <View
                style={[
                  empStyles.searchContainer,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Ionicons name="search" size={18} color={themeColors.textSecondary} />
                <TextInput
                  placeholder="Buscar material o SKU..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={[empStyles.searchInput, { color: themeColors.text }]}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {inventario.length === 0 ? (
              <View
                style={[
                  empStyles.emptyContainer,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
                <Text
                  style={{
                    color: themeColors.text,
                    marginTop: Spacing.two,
                    textAlign: 'center',
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  No tienes material asignado
                </Text>
                <Text
                  style={{
                    color: themeColors.textSecondary,
                    marginTop: 4,
                    textAlign: 'center',
                    fontSize: 13,
                    maxWidth: 300,
                  }}
                >
                  Los materiales que retires del almacén general aparecerán listados aquí.
                </Text>
                <TouchableOpacity
                  style={{
                    marginTop: Spacing.three,
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: BorderRadius.medium,
                    backgroundColor: themeColors.primary,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onPress={() => router.push('/(empleado)/retiro-material' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart-outline" size={16} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    Solicitar Material
                  </Text>
                </TouchableOpacity>
              </View>
            ) : filteredInventario.length === 0 ? (
              <View
                style={[
                  empStyles.emptyContainer,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Ionicons name="search-outline" size={40} color={themeColors.textSecondary} />
                <Text
                  style={{
                    color: themeColors.text,
                    marginTop: Spacing.two,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Sin coincidencias
                </Text>
                <Text
                  style={{
                    color: themeColors.textSecondary,
                    marginTop: 2,
                    fontSize: 12,
                  }}
                >
                  No hay artículos que coincidan con &quot;{searchQuery}&quot;
                </Text>
              </View>
            ) : (
              <View>
                {filteredInventario.map((item) => {
                  const prod = Array.isArray(item.producto) ? item.producto[0] : item.producto;
                  const total = Number(item.cantidad_disponible) || 0;
                  const cNuevo = Number(item.cantidad_nuevo) || 0;
                  const cUsado = Number(item.cantidad_usado) || 0;
                  const cPorRev = Number(item.cantidad_por_revisar) || 0;
                  const unidad = prod?.unidad || 'pza';

                  return (
                    <View
                      key={item.id || item.producto_id}
                      style={[
                        empStyles.stockCard,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      {/* Encabezado del Producto */}
                      <View style={empStyles.stockHeader}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[empStyles.stockTitle, { color: themeColors.text }]}>
                            {decodeHtmlEntities(prod?.nombre_oficial || 'Producto')}
                          </Text>
                          <Text style={[empStyles.stockSku, { color: themeColors.textSecondary }]}>
                            SKU: {prod?.sku_interno || '-'} {prod?.categoria ? `• ${prod.categoria}` : ''}
                          </Text>
                        </View>

                        <View style={[empStyles.stockBadge, { backgroundColor: themeColors.primary + '15' }]}>
                          <Text style={[empStyles.stockBadgeText, { color: themeColors.primary }]}>
                            {total} {unidad}
                          </Text>
                        </View>
                      </View>

                      {/* Desglose por condición si existe usado o por revisar */}
                      {(cUsado > 0 || cPorRev > 0) && (
                        <View style={empStyles.pillsRow}>
                          {cNuevo > 0 && (
                            <View
                              style={[
                                empStyles.conditionPill,
                                {
                                  borderColor: '#10B98140',
                                  backgroundColor: '#10B98115',
                                },
                              ]}
                            >
                              <Text style={[empStyles.conditionPillText, { color: '#10B981' }]}>
                                Nuevo: {cNuevo}
                              </Text>
                            </View>
                          )}

                          {cUsado > 0 && (
                            <View
                              style={[
                                empStyles.conditionPill,
                                {
                                  borderColor: '#3B82F640',
                                  backgroundColor: '#3B82F615',
                                },
                              ]}
                            >
                              <Text style={[empStyles.conditionPillText, { color: '#3B82F6' }]}>
                                Usado: {cUsado}
                              </Text>
                            </View>
                          )}

                          {cPorRev > 0 && (
                            <View
                              style={[
                                empStyles.conditionPill,
                                {
                                  borderColor: '#F59E0B40',
                                  backgroundColor: '#F59E0B15',
                                },
                              ]}
                            >
                              <Text style={[empStyles.conditionPillText, { color: '#F59E0B' }]}>
                                Revisar: {cPorRev}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Botones de acción directa */}
                      <View style={[empStyles.stockActionsRow, { borderTopColor: themeColors.border }]}>
                        <TouchableOpacity
                          style={[
                            empStyles.actionBtn,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border,
                              borderWidth: 1,
                            },
                          ]}
                          onPress={() => handleSelectForDevolucion(item.producto_id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="return-down-back-outline" size={14} color={themeColors.textSecondary} />
                          <Text style={[empStyles.actionBtnText, { color: themeColors.textSecondary }]}>
                            Devolver
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            empStyles.actionBtn,
                            {
                              backgroundColor: '#10B98118',
                              borderColor: '#10B981',
                              borderWidth: 1,
                            },
                          ]}
                          onPress={() => handleSelectForGasto(item.producto_id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="construct-outline" size={14} color="#10B981" />
                          <Text style={[empStyles.actionBtnText, { color: '#10B981' }]}>
                            Marcar Gasto
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ==================== TAB 2: DEVOLUCIÓN AL ALMACÉN ==================== */}
        {activeTab === 'devolucion' && (
          <View
            style={[
              devolucionesStyles.card,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: Spacing.two,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>
                Materiales a Devolver ({materialesDevolver.length})
              </Text>

              <TouchableOpacity
                onPress={handleAutollenarDevolucionTodo}
                style={[
                  devolucionesStyles.quickPresetBtn,
                  {
                    borderColor: themeColors.primary,
                    backgroundColor: themeColors.primary + '18',
                  },
                ]}
              >
                <Ionicons name="sparkles" size={14} color={themeColors.primary} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: themeColors.primary,
                  }}
                >
                  Devolver Todo
                </Text>
              </TouchableOpacity>
            </View>

            {materialesDevolver.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                  No tienes material disponible para devolver.
                </Text>
              </View>
            ) : (
              materialesDevolver.map((m, idx) => (
                <DevolucionCard
                  key={m.productoId}
                  m={m}
                  idx={idx}
                  themeColors={themeColors}
                  isExpanded={!!expandedDevolucion[m.productoId]}
                  onToggleExpand={() =>
                    setExpandedDevolucion((prev) => ({
                      ...prev,
                      [m.productoId]: !prev[m.productoId],
                    }))
                  }
                  handleClearItem={handleClearItem}
                  handleDirectQty={handleDirectQty}
                  handleSetAllCondition={handleSetAllCondition}
                  handleConditionChange={handleConditionChange}
                />
              ))
            )}

            {/* Observaciones de devolución */}
            <View style={{ marginTop: Spacing.two }}>
              <Text
                style={{
                  color: themeColors.text,
                  marginBottom: Spacing.half,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                Observaciones (Opcional)
              </Text>
              <TextInput
                placeholder="Ej. Sobrante de instalación, herramienta por revisar..."
                placeholderTextColor={themeColors.textSecondary}
                value={observacionesDevolucion}
                onChangeText={setObservacionesDevolucion}
                multiline
                numberOfLines={3}
                style={[
                  devolucionesStyles.textInput,
                  {
                    minHeight: 65,
                    textAlignVertical: 'top',
                    backgroundColor: themeColors.background,
                    color: themeColors.text,
                    borderColor: themeColors.border,
                  },
                ]}
              />
            </View>

            {/* Botón Enviar Devolución */}
            <View style={{ marginTop: Spacing.four }}>
              <CustomButton
                title={
                  totalDevolverGeneral > 0
                    ? `Enviar Devolución (${totalDevolverGeneral} unidades)`
                    : 'Enviar Solicitud de Devolución'
                }
                variant="primary"
                onPress={handleEnviarDevolucion}
                loading={isSubmittingDevolucion}
                disabled={totalDevolverGeneral === 0}
              />
            </View>
          </View>
        )}

        {/* ==================== TAB 3: MARCAR GASTO DE MATERIAL ==================== */}
        {activeTab === 'gasto' && (
          <View
            style={[
              devolucionesStyles.card,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* 1. Tipo de Gasto */}
            <View style={{ marginBottom: Spacing.three }}>
              <Text
                style={{
                  color: themeColors.text,
                  marginBottom: Spacing.half,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                Tipo de Aplicación
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map((tipo) => {
                  const isSelected = tipoGasto === tipo;
                  return (
                    <TouchableOpacity
                      key={tipo}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: BorderRadius.medium,
                        borderWidth: 1.5,
                        borderColor: isSelected ? '#10B981' : themeColors.border,
                        backgroundColor: isSelected ? '#10B98115' : themeColors.background,
                        alignItems: 'center',
                      }}
                      onPress={() => setTipoGasto(tipo)}
                    >
                      <Text
                        style={{
                          color: isSelected ? '#10B981' : themeColors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                          fontSize: 12,
                        }}
                      >
                        {tipo}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Cliente Relacionado */}
            <View style={{ marginBottom: Spacing.three, zIndex: 20 }}>
              <Text
                style={{
                  color: themeColors.text,
                  marginBottom: Spacing.half,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                Cliente Relacionado (Opcional)
              </Text>
              <TouchableOpacity
                style={[
                  devolucionesStyles.dropdownTrigger,
                  {
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                  },
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowCliDropdown(!showCliDropdown);
                  setShowSucursalDropdown(false);
                }}
              >
                <Ionicons
                  name="business-outline"
                  size={18}
                  color={themeColors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    flex: 1,
                    color: selectedCliente ? themeColors.text : themeColors.textSecondary,
                  }}
                >
                  {selectedCliente || 'Selecciona un cliente'}
                </Text>
                {selectedCliente ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setSelectedCliente('');
                      setSelectedClienteId(null);
                      setSucursal('');
                      setSelectedSucursalId(null);
                    }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={themeColors.textSecondary}
                    />
                  </TouchableOpacity>
                ) : (
                  <Ionicons
                    name={showCliDropdown ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={themeColors.text}
                  />
                )}
              </TouchableOpacity>

              {showCliDropdown && (
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  style={devolucionesStyles.dropdownListWrapper}
                >
                  <View
                    style={[
                      devolucionesStyles.dropdownList,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <TextInput
                      placeholder="Buscar cliente..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={clienteSearch}
                      onChangeText={setClienteSearch}
                      style={[
                        devolucionesStyles.textInput,
                        {
                          height: 38,
                          marginBottom: 6,
                          backgroundColor: themeColors.backgroundElement,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                    />
                    <ScrollView
                      nestedScrollEnabled={true}
                      style={{ maxHeight: 200 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      {clientes
                        .filter(
                          (cli) =>
                            !clienteSearch ||
                            (cli.nombre &&
                              cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                        )
                        .map((cli) => (
                          <TouchableOpacity
                            key={cli.id}
                            style={[
                              devolucionesStyles.dropdownItem,
                              { borderBottomColor: themeColors.border },
                            ]}
                            onPress={() => {
                              setSelectedCliente(cli.nombre);
                              setSelectedClienteId(cli.id);
                              const cliSucs = sucursalesCliente.filter(
                                (s) => s.cliente_id === cli.id
                              );
                              if (cliSucs.length === 1) {
                                setSucursal(cliSucs[0].nombre);
                                setSelectedSucursalId(cliSucs[0].id);
                              } else {
                                setSucursal('');
                                setSelectedSucursalId(null);
                              }
                              setShowCliDropdown(false);
                            }}
                          >
                            <Text style={{ color: themeColors.text }}>{cli.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                </Pressable>
              )}
            </View>

            {/* 3. Sucursal */}
            {selectedClienteId && (
              <View style={{ marginBottom: Spacing.three, zIndex: 10 }}>
                <Text
                  style={{
                    color: themeColors.text,
                    marginBottom: Spacing.half,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  Sucursal
                </Text>
                <TouchableOpacity
                  style={[
                    devolucionesStyles.dropdownTrigger,
                    {
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowSucursalDropdown(!showSucursalDropdown);
                    setShowCliDropdown(false);
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={themeColors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: sucursal ? themeColors.text : themeColors.textSecondary,
                    }}
                  >
                    {sucursal || 'Selecciona una sucursal'}
                  </Text>
                  <Ionicons
                    name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={themeColors.text}
                  />
                </TouchableOpacity>

                {showSucursalDropdown && (
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={devolucionesStyles.dropdownListWrapper}
                  >
                    <View
                      style={[
                        devolucionesStyles.dropdownList,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <TextInput
                        placeholder="Buscar sucursal..."
                        placeholderTextColor={themeColors.textSecondary}
                        value={sucursalSearch}
                        onChangeText={setSucursalSearch}
                        style={[
                          devolucionesStyles.textInput,
                          {
                            height: 38,
                            marginBottom: 6,
                            backgroundColor: themeColors.backgroundElement,
                            color: themeColors.text,
                            borderColor: themeColors.border,
                          },
                        ]}
                      />
                      <ScrollView
                        nestedScrollEnabled={true}
                        style={{ maxHeight: 200 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        {sucursalesCliente
                          .filter((s) => s.cliente_id === selectedClienteId)
                          .filter(
                            (s) =>
                              !sucursalSearch ||
                              (s.nombre &&
                                s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase()))
                          )
                          .map((s) => (
                            <TouchableOpacity
                              key={s.id}
                              style={[
                                devolucionesStyles.dropdownItem,
                                { borderBottomColor: themeColors.border },
                              ]}
                              onPress={() => {
                                setSucursal(s.nombre);
                                setSelectedSucursalId(s.id);
                                setShowSucursalDropdown(false);
                              }}
                            >
                              <Text style={{ color: themeColors.text }}>{s.nombre}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>
            )}

            {/* 4. Detalle de Trabajo */}
            <View style={{ marginBottom: Spacing.three }}>
              <Text
                style={{
                  color: themeColors.text,
                  marginBottom: Spacing.half,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                Detalle del Trabajo / Justificación
              </Text>
              <TextInput
                placeholder="Ej. Instalación de cableado estructurado en rack principal..."
                placeholderTextColor={themeColors.textSecondary}
                value={detalleTrabajo}
                onChangeText={setDetalleTrabajo}
                multiline
                numberOfLines={2}
                style={[
                  devolucionesStyles.textInput,
                  {
                    minHeight: 55,
                    textAlignVertical: 'top',
                    backgroundColor: themeColors.background,
                    color: themeColors.text,
                    borderColor: themeColors.border,
                  },
                ]}
              />
            </View>

            {/* Listado de Materiales para Consumo */}
            <View style={{ marginBottom: Spacing.two }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text }}>
                Material Utilizado
              </Text>
            </View>

            {materialesGasto.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                  No tienes material disponible para registrar gasto.
                </Text>
              </View>
            ) : (
              materialesGasto.map((m, idx) => (
                <GastoCard
                  key={m.productoId}
                  m={m}
                  idx={idx}
                  themeColors={themeColors}
                  isExpanded={!!expandedGasto[m.productoId]}
                  onToggleExpand={() =>
                    setExpandedGasto((prev) => ({
                      ...prev,
                      [m.productoId]: !prev[m.productoId],
                    }))
                  }
                  handleClearItem={handleClearItem}
                  handleDirectQty={handleDirectQty}
                  handleSetAllCondition={handleSetAllCondition}
                  handleConditionChange={handleConditionChange}
                />
              ))
            )}

            {/* BOTONES DE ACCIÓN PARA GASTO */}
            <View style={{ marginTop: Spacing.four, gap: Spacing.two }}>
              <CustomButton
                title={
                  totalGastoGeneral > 0
                    ? `Reportar Consumo (${totalGastoGeneral} unidades)`
                    : 'Reportar Consumo de Material'
                }
                variant="primary"
                onPress={() => handleEnviarGasto(false)}
                loading={isSubmittingGasto}
                disabled={totalGastoGeneral === 0}
                style={{ backgroundColor: '#10B981' }}
              />

              {totalRestanteGeneral > 0 && totalGastoGeneral > 0 && (
                <TouchableOpacity
                  onPress={() => handleEnviarGasto(true)}
                  disabled={isSubmittingGastoYDevolucion || isSubmittingGasto}
                  style={[
                    devolucionesStyles.dualActionBtn,
                    {
                      backgroundColor: themeColors.primary + '18',
                      borderColor: themeColors.primary,
                    },
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={18} color={themeColors.primary} />
                  <Text style={[devolucionesStyles.dualActionBtnText, { color: themeColors.primary }]}>
                    Reportar Consumo ({totalGastoGeneral}) y Devolver Restante (
                    {totalRestanteGeneral}) al Almacén
                  </Text>
                </TouchableOpacity>
              )}

              {totalRestanteGeneral > 0 && (
                <TouchableOpacity
                  onPress={handleTransferirRestanteADevolucion}
                  style={[
                    devolucionesStyles.dualActionBtn,
                    {
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={16}
                    color={themeColors.textSecondary}
                  />
                  <Text
                    style={[
                      devolucionesStyles.dualActionBtnText,
                      { color: themeColors.textSecondary, fontSize: 12 },
                    ]}
                  >
                    Pasar sobrante ({totalRestanteGeneral} pzas) a Devolución al Almacén
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
