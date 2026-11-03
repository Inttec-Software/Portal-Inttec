import React from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { styles } from './adminGastosStyles';
import { useAdminGastos, TIPOS_PROYECTO } from '../hooks/useAdminGastos';

interface AdminLinkSaleModalProps {
  vm: ReturnType<typeof useAdminGastos>;
}

export function AdminLinkSaleModal({ vm }: AdminLinkSaleModalProps) {
  const {
    themeColors,
    isLinkSaleModalVisible,
    setIsLinkSaleModalVisible,
    isRelinkingSaleMode,
    setIsRelinkingSaleMode,
    isLoadingSalesForLinking,
    linkSaleSearch,
    setLinkSaleSearch,
    isQuickSaleFormVisible,
    setIsQuickSaleFormVisible,
    quickSaleFecha,
    setQuickSaleFecha,
    quickSaleCliente,
    setQuickSaleCliente,
    quickSaleFactura,
    setQuickSaleFactura,
    quickSaleTipoProyecto,
    setQuickSaleTipoProyecto,
    quickSaleProveedor,
    setQuickSaleProveedor,
    quickSaleNotas,
    setQuickSaleNotas,
    quickSalePartidas,
    showQuickSaleTipoDropdown,
    setShowQuickSaleTipoDropdown,
    showQuickSaleCliDropdown,
    setShowQuickSaleCliDropdown,
    quickSaleCliSearch,
    setQuickSaleCliSearch,
    isSavingQuickSale,
    clientesCatalog,
    sucursalesCatalog,
    quickSaleSucursal,
    setQuickSaleSucursal,
    showQuickSaleSucursalDropdown,
    setShowQuickSaleSucursalDropdown,
    quickSaleSucursalSearch,
    setQuickSaleSucursalSearch,
    quickSaleTotals,
    filteredSalesForLinking,
    filteredClientsForQuickSale,
    executeRelinkGastoVenta,
    executeApproveGasto,
    handleOpenQuickSaleForm,
    addQuickSalePartida,
    removeQuickSalePartida,
    updateQuickSalePartida,
    handleSaveQuickSale,
    formatCurrency,
  } = vm;

  return (
    <Modal statusBarTranslucent={true}
      visible={isLinkSaleModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setIsLinkSaleModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '80%', paddingBottom: Spacing.four }]}>
          {/* Header del Modal */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border, borderBottomWidth: 1, paddingBottom: Spacing.two }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
               {isQuickSaleFormVisible && (
                 <TouchableOpacity onPress={() => setIsQuickSaleFormVisible(false)} style={{ marginRight: 4 }}>
                   <Ionicons name="arrow-back" size={24} color={themeColors.text} />
                 </TouchableOpacity>
               )}
               <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                 {isQuickSaleFormVisible
                   ? 'Crear Venta Rápida'
                   : isRelinkingSaleMode
                     ? 'Vincular o Cambiar Venta'
                     : '¿Vincular Gasto a Venta?'}
               </Text>
             </View>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
               {!isQuickSaleFormVisible && (
                 <TouchableOpacity onPress={handleOpenQuickSaleForm} style={{ padding: 4 }}>
                   <Ionicons name="add-circle" size={28} color={themeColors.success} />
                 </TouchableOpacity>
               )}
               <TouchableOpacity onPress={() => setIsLinkSaleModalVisible(false)} style={{ padding: 4 }}>
                 <Ionicons name="close" size={24} color={themeColors.text} />
               </TouchableOpacity>
             </View>
          </View>

          {!isQuickSaleFormVisible ? (
            <>
              {/* Buscador de Ventas */}
              <View style={{ paddingTop: Spacing.two, marginBottom: Spacing.two }}>
                <CustomInput
                  placeholder="Buscar por cliente, factura o tipo..."
                  value={linkSaleSearch}
                  onChangeText={setLinkSaleSearch}
                  iconName="search-outline"
                />
              </View>

              {/* Lista de Ventas */}
              <View style={{ flex: 1, marginBottom: Spacing.two }}>
                {isLoadingSalesForLinking ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={themeColors.accent} />
                    <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando ventas...</Text>
                  </View>
                ) : filteredSalesForLinking.length === 0 ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.one }}>
                    <Ionicons name="alert-circle-outline" size={40} color={themeColors.textSecondary} />
                    <Text style={{ color: themeColors.textSecondary, textAlign: 'center', fontSize: 13 }}>
                      No se encontraron ventas para asociar.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredSalesForLinking}
                    initialNumToRender={5}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                    removeClippedSubviews={true}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: Spacing.two }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => {
                          if (isRelinkingSaleMode) {
                            executeRelinkGastoVenta(item.id);
                          } else {
                            setIsLinkSaleModalVisible(false);
                            executeApproveGasto(item.id);
                          }
                        }}
                        style={[
                          styles.linkSaleItem,
                          {
                            backgroundColor: themeColors.backgroundElement,
                            borderColor: themeColors.border,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>
                            {item.cliente}
                          </Text>
                          {item.sucursal ? (
                            <Text style={{ color: themeColors.primary, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                              Sucursal: {item.sucursal}
                            </Text>
                          ) : null}
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {item.fecha} {item.tipo_proyecto ? `| ${item.tipo_proyecto}` : ''}
                          </Text>
                          {item.factura_referencia ? (
                            <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 1 }}>
                              Factura: {item.factura_referencia}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ color: themeColors.accent, fontWeight: '800', fontSize: 14, alignSelf: 'center' }}>
                          {formatCurrency(item.precio_total_facturado)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>

              {/* Footer con opciones */}
              <View style={{ gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                <CustomButton
                  title={isRelinkingSaleMode ? "Desvincular de venta" : "Aprobar sin vincular"}
                  onPress={() => {
                    if (isRelinkingSaleMode) {
                      executeRelinkGastoVenta(null);
                    } else {
                      setIsLinkSaleModalVisible(false);
                      executeApproveGasto(null);
                    }
                  }}
                  variant={isRelinkingSaleMode ? "danger" : "primary"}
                  style={{ width: '100%' }}
                />
                <CustomButton
                  title="Cancelar"
                  onPress={() => {
                    setIsLinkSaleModalVisible(false);
                    setIsRelinkingSaleMode(false);
                  }}
                  variant="secondary"
                  style={{ width: '100%' }}
                />
              </View>
            </>
          ) : (
            // Formulario de Venta Rápida
            <View style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Fecha */}
                <CustomInput
                  label="Fecha (AAAA-MM-DD) *"
                  placeholder="2026-07-06"
                  value={quickSaleFecha}
                  onChangeText={setQuickSaleFecha}
                  iconName="calendar-outline"
                />

                {/* Selector de Cliente y Sucursal */}
                {(() => {
                  const currentClient = clientesCatalog.find(c => c.nombre === quickSaleCliente);
                  const sucs = currentClient ? sucursalesCatalog.filter(s => s.cliente_id === currentClient.id) : [];

                  return (
                    <View style={{ width: '100%' }}>
                      <View style={{ zIndex: 3000, marginBottom: Spacing.two }}>
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>
                          Cliente <Text style={{ color: themeColors.danger }}>*</Text>
                        </Text>
                        <TouchableOpacity
                          style={[styles.customDropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                          onPress={() => {
                            Keyboard.dismiss();
                            setShowQuickSaleCliDropdown(!showQuickSaleCliDropdown);
                          }}
                        >
                          <Text style={{ color: quickSaleCliente ? themeColors.text : themeColors.textSecondary }}>
                            {quickSaleCliente || 'Selecciona un cliente'}
                          </Text>
                          <Ionicons name={showQuickSaleCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.textSecondary} />
                        </TouchableOpacity>

                        {showQuickSaleCliDropdown && (
                          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                            <View style={[styles.customDropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                              <CustomInput
                                placeholder="Buscar cliente..."
                                value={quickSaleCliSearch}
                                onChangeText={setQuickSaleCliSearch}
                                iconName="search-outline"
                                style={{ margin: Spacing.one, height: 40 }}
                              />
                              <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                                {filteredClientsForQuickSale.map((c, index, array) => (
                                  <TouchableOpacity
                                    key={c.id}
                                    onPress={() => {
                                      setQuickSaleCliente(c.nombre);
                                      setQuickSaleSucursal('');
                                      setShowQuickSaleCliDropdown(false);
                                    }}
                                    style={[
                                      styles.customDropdownItem,
                                      index === array.length - 1 && { borderBottomWidth: 0 },
                                      { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderBottomColor: themeColors.border }
                                    ]}
                                  >
                                    <Ionicons name="person-circle-outline" size={24} color={themeColors.primary} />
                                    <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{c.nombre}</Text>
                                  </TouchableOpacity>
                                ))}
                                {filteredClientsForQuickSale.length === 0 && (
                                  <Text style={{ padding: Spacing.two, color: themeColors.textSecondary }}>No hay clientes que coincidan.</Text>
                                )}
                              </ScrollView>
                            </View>
                          </Pressable>
                        )}
                      </View>

                      <View style={{ zIndex: 2000, marginBottom: Spacing.two }}>
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>
                          Sucursal del cliente <Text style={{ color: themeColors.danger }}>*</Text>
                        </Text>
                        <TouchableOpacity
                          style={[styles.customDropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, opacity: !quickSaleCliente ? 0.5 : 1 }]}
                          disabled={!quickSaleCliente}
                          onPress={() => {
                            Keyboard.dismiss();
                            setShowQuickSaleSucursalDropdown(!showQuickSaleSucursalDropdown);
                          }}
                        >
                          <Text style={{ color: quickSaleSucursal ? themeColors.text : themeColors.textSecondary }}>
                            {quickSaleSucursal || (quickSaleCliente ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                          </Text>
                          <Ionicons name={showQuickSaleSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.textSecondary} />
                        </TouchableOpacity>

                        {showQuickSaleSucursalDropdown && (
                          <View style={{ width: '100%', zIndex: 1000 }}>
                            <View style={[styles.customDropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                              <CustomInput
                                placeholder="Buscar sucursal..."
                                value={quickSaleSucursalSearch}
                                onChangeText={setQuickSaleSucursalSearch}
                                iconName="search-outline"
                                style={{ margin: Spacing.one, height: 40 }}
                              />
                              <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                                {(() => {
                                  const filteredSucs = sucs.filter(s => s.nombre.toLowerCase().includes(quickSaleSucursalSearch.toLowerCase()));
                                  if (filteredSucs.length === 0) {
                                    return <Text style={{ padding: Spacing.two, color: themeColors.textSecondary }}>No hay sucursales registradas.</Text>;
                                  }
                                  return filteredSucs.map((s, index, array) => (
                                    <TouchableOpacity
                                      key={s.id}
                                      onPress={() => {
                                        setQuickSaleSucursal(s.nombre);
                                        setShowQuickSaleSucursalDropdown(false);
                                      }}
                                      style={[
                                        styles.customDropdownItem,
                                        index === array.length - 1 && { borderBottomWidth: 0 },
                                        { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderBottomColor: themeColors.border }
                                      ]}
                                    >
                                      <Ionicons name="business-outline" size={24} color={themeColors.primary} />
                                      <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{s.nombre}</Text>
                                    </TouchableOpacity>
                                  ));
                                })()}
                              </ScrollView>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })()}

                {/* Factura Referencia */}
                <CustomInput
                  label="Factura / Referencia (Opcional)"
                  placeholder="F-12345"
                  value={quickSaleFactura}
                  onChangeText={setQuickSaleFactura}
                  iconName="document-text-outline"
                />

                {/* Tipo de Proyecto Selector */}
                <View style={{ zIndex: 8, position: 'relative', marginBottom: Spacing.two }}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 4 }]}>Tipo de Proyecto</Text>
                  <TouchableOpacity
                    onPress={() => setShowQuickSaleTipoDropdown(!showQuickSaleTipoDropdown)}
                    style={[styles.customDropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  >
                    <Text style={{ color: quickSaleTipoProyecto ? themeColors.text : themeColors.textSecondary }}>
                      {quickSaleTipoProyecto || 'Selecciona un tipo...'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {showQuickSaleTipoDropdown && (
                    <View style={[styles.customDropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      {TIPOS_PROYECTO.map((tipo) => (
                        <TouchableOpacity
                          key={tipo}
                          onPress={() => {
                            setQuickSaleTipoProyecto(tipo);
                            setShowQuickSaleTipoDropdown(false);
                          }}
                          style={[styles.customDropdownItem, { borderBottomColor: themeColors.border }]}
                        >
                          <Text style={{ color: themeColors.text }}>{tipo}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Proveedor */}
                <CustomInput
                  label="Proveedor (Opcional)"
                  placeholder="Ej. Centro, Norte o sucursal relacionada..."
                  value={quickSaleProveedor}
                  onChangeText={setQuickSaleProveedor}
                  iconName="location-outline"
                  style={{ marginTop: Spacing.two }}
                />

                {/* Notas */}
                <CustomInput
                  label="Notas / Observaciones"
                  placeholder="Detalles de la venta..."
                  value={quickSaleNotas}
                  onChangeText={setQuickSaleNotas}
                  multiline
                  numberOfLines={2}
                  iconName="create-outline"
                />

                {/* Partidas de Venta */}
                <View style={{ marginTop: Spacing.three }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                    <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 16 }}>Partidas desglosadas</Text>
                    <TouchableOpacity onPress={addQuickSalePartida} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="add-circle-outline" size={18} color={themeColors.accent} />
                      <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 13 }}>Agregar Partida</Text>
                    </TouchableOpacity>
                  </View>

                  {quickSalePartidas.map((partida, index) => (
                    <View
                      key={partida.id}
                      style={[
                        styles.partidaCard,
                        {
                          backgroundColor: themeColors.backgroundElement + '50',
                          borderColor: themeColors.border,
                          padding: Spacing.two,
                          borderRadius: BorderRadius.medium,
                          borderWidth: 1,
                          marginBottom: Spacing.two,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                        <Text style={{ color: themeColors.textSecondary, fontWeight: '600', fontSize: 12 }}>Partida #{index + 1}</Text>
                        {quickSalePartidas.length > 1 && (
                          <TouchableOpacity onPress={() => removeQuickSalePartida(partida.id)}>
                            <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <CustomInput
                        placeholder="Descripción del producto o servicio..."
                        value={partida.descripcion}
                        onChangeText={(val) => updateQuickSalePartida(partida.id, 'descripcion', val)}
                      />

                      <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one }}>
                        <View style={{ flex: 1 }}>
                          <CustomInput
                            label="Cant."
                            placeholder="1"
                            keyboardType="numeric"
                            value={partida.cantidad}
                            onChangeText={(val) => updateQuickSalePartida(partida.id, 'cantidad', val)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <CustomInput
                            label="Unidad"
                            placeholder="PZA"
                            value={partida.unidad}
                            onChangeText={(val) => updateQuickSalePartida(partida.id, 'unidad', val)}
                          />
                        </View>
                        <View style={{ flex: 1.5 }}>
                          <CustomInput
                            label="Costo Prov ($)"
                            placeholder="0.00"
                            keyboardType="numeric"
                            value={partida.costo_unitario_proveedor}
                            onChangeText={(val) => updateQuickSalePartida(partida.id, 'costo_unitario_proveedor', val)}
                          />
                        </View>
                        <View style={{ flex: 1.5 }}>
                          <CustomInput
                            label="Precio Venta ($)"
                            placeholder="0.00"
                            keyboardType="numeric"
                            value={partida.precio_unitario_venta}
                            onChangeText={(val) => updateQuickSalePartida(partida.id, 'precio_unitario_venta', val)}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Resumen Financiero Rápido */}
                <View
                  style={[
                    styles.financialSummary,
                    {
                      backgroundColor: themeColors.backgroundSelected,
                      borderRadius: BorderRadius.medium,
                      padding: Spacing.two,
                      marginTop: Spacing.two,
                    },
                  ]}
                >
                  <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14, marginBottom: Spacing.one }}>
                    Resumen Financiero de la Venta
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Costo Proveedor Total:</Text>
                    <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }}>{formatCurrency(quickSaleTotals.costoTotal)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Precio de Venta Total:</Text>
                    <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>{formatCurrency(quickSaleTotals.precioTotal)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Utilidad Bruta:</Text>
                    <Text style={{ color: quickSaleTotals.utilidad >= 0 ? themeColors.success : themeColors.danger, fontWeight: '700', fontSize: 13 }}>
                      {formatCurrency(quickSaleTotals.utilidad)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Margen de Utilidad:</Text>
                    <Text style={{ color: quickSaleTotals.utilidad >= 0 ? themeColors.success : themeColors.danger, fontWeight: '700', fontSize: 13 }}>
                      {Math.round(quickSaleTotals.margen * 10000) / 100}%
                    </Text>
                  </View>
                </View>
              </ScrollView>

              {/* Footer de Venta Rápida */}
              <View style={{ gap: Spacing.one, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                <CustomButton
                  title="Crear y Vincular Venta"
                  onPress={handleSaveQuickSale}
                  variant="success"
                  loading={isSavingQuickSale}
                  style={{ width: '100%' }}
                />
                <CustomButton
                  title="Volver al buscador"
                  onPress={() => setIsQuickSaleFormVisible(false)}
                  variant="secondary"
                  style={{ width: '100%' }}
                  disabled={isSavingQuickSale}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
