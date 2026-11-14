import React from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { normalizeText } from '@/utils/helpers';
import { adminInventarioStyles as styles } from './adminInventarioStyles';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminInventarioModals({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    activeTab,
    crudModalVisible,
    setCrudModalVisible,
    editingProduct,
    formSku,
    setFormSku,
    formNombre,
    setFormNombre,
    formCategoriaId,
    activeFormCategoryName,
    openFormCatSelector,
    setNewProvModalVisible,
    formProveedorId,
    activeFormProveedorName,
    openFormProveedorSelector,
    formStock,
    setFormStock,
    showEstadoBreakdown,
    setShowEstadoBreakdown,
    formStockNuevo,
    setFormStockNuevo,
    formStockUsado,
    setFormStockUsado,
    formStockPorRevisar,
    setFormStockPorRevisar,
    formUnidad,
    setFormUnidad,
    formPrecio,
    setFormPrecio,
    handleSaveProduct,
    isSavingProduct,
    selectorVisible,
    setSelectorVisible,
    selectorTitle,
    selectorSearch,
    setSelectorSearch,
    filteredSelectorOptions,
    onSelectOption,
    setNewProvNombre,
    newCatModalVisible,
    setNewCatModalVisible,
    newCatNombre,
    setNewCatNombre,
    newCatDesc,
    setNewCatDesc,
    handleCreateCategory,
    isSavingNewCat,
    newProvModalVisible,
    newProvNombre,
    newProvRfc,
    setNewProvRfc,
    handleCreateProveedor,
    isSavingNewProv,
    bulkEditModalVisible,
    setBulkEditModalVisible,
    selectedProductIds,
    bulkUpdateCategory,
    setBulkUpdateCategory,
    bulkCategoryId,
    setBulkCategoryId,
    categorias,
    openBulkCategorySelector,
    bulkUpdateProveedor,
    setBulkUpdateProveedor,
    bulkProveedorId,
    setBulkProveedorId,
    proveedores,
    openBulkProveedorSelector,
    bulkUpdateStock,
    setBulkUpdateStock,
    bulkStockValue,
    setBulkStockValue,
    bulkUpdatePrice,
    setBulkUpdatePrice,
    bulkPriceValue,
    setBulkPriceValue,
    handleSaveBulkEdit,
    isSavingBulkEdit,
    asignarModalVisible,
    setAsignarModalVisible,
    asignarEmpleadoId,
    setAsignarEmpleadoId,
    empleados,
    showAsignarEmpDropdown,
    setShowAsignarEmpDropdown,
    asignarEmpSearch,
    setAsignarEmpSearch,
    asignarMotivo,
    setAsignarMotivo,
    asignarProductSearch,
    setAsignarProductSearch,
    productos,
    asignarItems,
    setAsignarItems,
    handleAddProductToAsignar,
    handleRemoveProductFromAsignar,
    handleUpdateAsignarItemQty,
    isSubmittingAsignacion,
    handleConfirmAsignacion,
    gastoModalVisible,
    setGastoModalVisible,
    gastoTargetItem,
    gastoTipo,
    setGastoTipo,
    gastoCantidad,
    setGastoCantidad,
    gastoCantidadNuevo,
    setGastoCantidadNuevo,
    gastoCantidadUsado,
    setGastoCantidadUsado,
    gastoCantidadPorRev,
    setGastoCantidadPorRev,
    showGastoCliDropdown,
    setShowGastoCliDropdown,
    gastoClienteNombre,
    setGastoClienteId,
    setGastoClienteNombre,
    gastoCliSearch,
    setGastoCliSearch,
    clientes,
    gastoSucursal,
    setGastoSucursal,
    gastoMotivo,
    setGastoMotivo,
    isSubmittingGasto,
    handleConfirmGastoPersonal,
    devolverModalVisible,
    setDevolverModalVisible,
    devolverTargetItem,
    devolverCantidad,
    setDevolverCantidad,
    devolverCantidadNuevo,
    setDevolverCantidadNuevo,
    devolverCantidadUsado,
    setDevolverCantidadUsado,
    devolverCantidadPorRev,
    setDevolverCantidadPorRev,
    devolverMotivo,
    setDevolverMotivo,
    isSubmittingDevolucion,
    handleConfirmDevolucionPersonal,
    handleOpenAsignarModal,
    handleOpenBulkEdit,
    handleBulkDelete,
    isBulkDeleting,
    clearSelection,
  } = inv;

  return (
    <>
      {/* ========== MODAL CRUD MANUAL ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={crudModalVisible}
        onRequestClose={() => setCrudModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {editingProduct ? 'Modificar Producto' : 'Nuevo Producto'}
              </Text>
              <TouchableOpacity onPress={() => setCrudModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="SKU Interno *"
                placeholder="Ej. SOL-REN-640W"
                value={formSku}
                onChangeText={setFormSku}
                autoCapitalize="characters"
              />

              <CustomInput
                label="Nombre Oficial *"
                placeholder="Ej. Panel Solar Renesola N-Type..."
                value={formNombre}
                onChangeText={setFormNombre}
              />

              {/* Selector de Categoría en Formulario */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={openFormCatSelector}
                >
                  <Text style={{ color: formCategoriaId ? themeColors.text : themeColors.textSecondary }}>
                    {activeFormCategoryName || 'Selecciona la categoría'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={themeColors.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setNewProvModalVisible(true)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                  <Text style={{ color: themeColors.primary, fontSize: 13, fontWeight: 'bold' }}>+ Crear nuevo proveedor</Text>
                </TouchableOpacity>
              </View>

              {/* Selector de Proveedor en Formulario */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Proveedor *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={openFormProveedorSelector}
                >
                  <Text style={{ color: formProveedorId ? themeColors.text : themeColors.textSecondary }}>
                    {activeFormProveedorName || 'Selecciona el proveedor'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              {/* Stock Inicial & Unidad de Medida (Siempre Visibles) */}
              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Stock Inicial *"
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={formStock}
                    onChangeText={(val) => {
                      const cleanVal = val.replace(/[^0-9.]/g, '');
                      setFormStock(cleanVal);
                      if (!showEstadoBreakdown) {
                        setFormStockNuevo(cleanVal);
                        setFormStockUsado('0');
                        setFormStockPorRevisar('0');
                      }
                    }}
                  />
                </View>
                <View style={{ flex: 1, marginBottom: Spacing.three }}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 14, fontWeight: '600', marginBottom: Spacing.half }]}>
                    Unidad de Medida *
                  </Text>
                  <View
                    style={{
                      height: 48,
                      flexDirection: 'row',
                      backgroundColor: themeColors.backgroundElement,
                      borderRadius: BorderRadius.medium,
                      borderColor: themeColors.border,
                      borderWidth: 1,
                      padding: 4,
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    {[
                      { key: 'pza', label: 'pza' },
                      { key: 'mts', label: 'mts' },
                      { key: 'rollo', label: 'rollo' },
                      { key: 'kit', label: 'kit' },
                    ].map(u => {
                      const isSelected = formUnidad === u.key;
                      return (
                        <TouchableOpacity
                          key={u.key}
                          onPress={() => setFormUnidad(u.key)}
                          activeOpacity={0.7}
                          style={{
                            flex: 1,
                            height: '100%',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRadius: BorderRadius.small,
                            backgroundColor: isSelected ? themeColors.primary : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSelected ? 'bold' : '600',
                              color: isSelected ? '#ffffff' : themeColors.textSecondary,
                            }}
                          >
                            {u.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Botón / Toggle para Desglose Opcional por Estado */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: BorderRadius.medium,
                  backgroundColor: showEstadoBreakdown ? themeColors.primary + '12' : themeColors.backgroundElement,
                  borderWidth: 1,
                  borderColor: showEstadoBreakdown ? themeColors.primary : themeColors.border,
                  marginBottom: showEstadoBreakdown ? Spacing.one : Spacing.two,
                }}
                onPress={() => {
                  const next = !showEstadoBreakdown;
                  setShowEstadoBreakdown(next);
                  if (next && (!formStockUsado || formStockUsado === '0') && (!formStockPorRevisar || formStockPorRevisar === '0')) {
                    setFormStockNuevo(formStock || '0');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons
                    name={showEstadoBreakdown ? 'layers' : 'layers-outline'}
                    size={18}
                    color={showEstadoBreakdown ? themeColors.primary : themeColors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                      Desglosar por estado (Opcional)
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      {showEstadoBreakdown ? 'Ingresa cuántas son nuevas, usadas o dañadas/incompletas' : 'Toca aquí si tienes artículos usados o dañados/incompletos'}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={showEstadoBreakdown ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>

              {/* Formulario Desplegable de Desglose Opcional */}
              {showEstadoBreakdown && (
                <View style={{ backgroundColor: themeColors.backgroundElement, padding: Spacing.two, borderRadius: BorderRadius.medium, borderWidth: 1, borderColor: themeColors.border, marginBottom: Spacing.two }}>
                  {(() => {
                    const totInit = parseFloat(formStock) || 0;
                    const n = parseFloat(formStockNuevo) || 0;
                    const u = parseFloat(formStockUsado) || 0;
                    const r = parseFloat(formStockPorRevisar) || 0;
                    const suma = Math.round((n + u + r) * 100) / 100;
                    const excede = suma > totInit;
                    const exacto = suma === totInit && totInit > 0;

                    return (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one, flexWrap: 'wrap', gap: 4 }}>
                        <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 12, fontWeight: '700', marginBottom: 0 }]}>
                          Condición de los artículos:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: excede ? themeColors.danger : exacto ? themeColors.success : themeColors.primary }}>
                          {excede
                            ? `⚠️ Suma: ${suma} (Supera el total de ${totInit})`
                            : `Suma: ${suma} / ${totInit} ${formUnidad || 'pzas'}`}
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="🟢 Nuevas"
                        placeholder="0"
                        keyboardType="decimal-pad"
                        value={formStockNuevo}
                        onChangeText={(val) => setFormStockNuevo(val.replace(/[^0-9.]/g, ''))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="🟡 Usadas"
                        placeholder="0"
                        keyboardType="decimal-pad"
                        value={formStockUsado}
                        onChangeText={(val) => setFormStockUsado(val.replace(/[^0-9.]/g, ''))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="🔴 Dañado / Incompleto"
                        placeholder="0"
                        keyboardType="decimal-pad"
                        value={formStockPorRevisar}
                        onChangeText={(val) => setFormStockPorRevisar(val.replace(/[^0-9.]/g, ''))}
                      />
                    </View>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Precio Unitario"
                    value={formPrecio}
                    onChangeText={setFormPrecio}
                    keyboardType="numeric"
                    placeholder="0.00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label="Precio con IVA (16%)"
                    value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((parseFloat(formPrecio) || 0) * 1.16)}
                    editable={false}
                    style={{ backgroundColor: themeColors.background }}
                  />
                </View>
              </View>

              <CustomButton
                title={editingProduct ? 'Guardar Cambios' : 'Dar de Alta'}
                onPress={handleSaveProduct}
                loading={isSavingProduct}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== CENTRALIZED SELECTOR MODAL ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={selectorVisible}
        onRequestClose={() => setSelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{selectorTitle}</Text>
              <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <CustomInput
              placeholder="Buscar..."
              value={selectorSearch}
              onChangeText={setSelectorSearch}
              iconName="search-outline"
              style={{ marginBottom: Spacing.two }}
            />

            <FlatList
              scrollEnabled={true}
              style={{ flex: 1 }}
              data={filteredSelectorOptions}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: Spacing.four }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                  onPress={() => {
                    onSelectOption(item.id);
                    setSelectorVisible(false);
                  }}
                >
                  <Text style={{ color: themeColors.text, fontSize: 14, paddingVertical: 4 }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: Spacing.four }}>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginBottom: Spacing.two }}>
                    No se encontraron opciones.
                  </Text>
                  {selectorTitle === 'Seleccionar Proveedor' && selectorSearch.trim().length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectorVisible(false);
                        setNewProvNombre(selectorSearch.trim());
                        setNewProvModalVisible(true);
                      }}
                    >
                      <Text style={{ color: themeColors.primary, fontWeight: 'bold' }}>+ Agregar &quot;{selectorSearch}&quot; como proveedor</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ========== MODAL NUEVA CATEGORÍA ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={newCatModalVisible}
        onRequestClose={() => setNewCatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, borderRadius: 16, width: '100%', maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nueva Categoría</Text>
              <TouchableOpacity onPress={() => setNewCatModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre de Categoría *"
                placeholder="Ej. Conexiones Especiales"
                value={newCatNombre}
                onChangeText={setNewCatNombre}
              />
              <CustomInput
                label="Descripción (Opcional)"
                placeholder="Ej. Coples, reducciones y sellos"
                value={newCatDesc}
                onChangeText={setNewCatDesc}
              />

              <CustomButton
                title="Guardar Categoría"
                onPress={handleCreateCategory}
                loading={isSavingNewCat}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL NUEVO PROVEEDOR ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={newProvModalVisible}
        onRequestClose={() => setNewProvModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, borderRadius: 16, width: '100%', maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nuevo Proveedor</Text>
              <TouchableOpacity onPress={() => setNewProvModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre o Razón Social *"
                placeholder="Ej. Materiales Eléctricos del Norte S.A."
                value={newProvNombre}
                onChangeText={setNewProvNombre}
              />
              <CustomInput
                label="RFC (Opcional)"
                placeholder="Ej. MEN120415XYZ"
                value={newProvRfc}
                onChangeText={(val) => setNewProvRfc(val.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 13))}
                autoCapitalize="characters"
              />

              <CustomButton
                title="Guardar Proveedor"
                onPress={handleCreateProveedor}
                loading={isSavingNewProv}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL EDICIÓN MASIVA ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={bulkEditModalVisible}
        onRequestClose={() => setBulkEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Edición Masiva</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                  {`${selectedProductIds.length} ${selectedProductIds.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBulkEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two, paddingBottom: Spacing.two }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 4 }}>
                Activa y configura únicamente los campos que deseas modificar simultáneamente para todos los productos seleccionados:
              </Text>

              {/* 1. Categoría */}
              <View style={[styles.bulkFieldCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={styles.bulkFieldHeader}
                  onPress={() => setBulkUpdateCategory(!bulkUpdateCategory)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={bulkUpdateCategory ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={bulkUpdateCategory ? themeColors.primary : themeColors.textSecondary}
                  />
                  <Text style={[styles.bulkFieldTitle, { color: themeColors.text }]}>Cambiar Categoría</Text>
                </TouchableOpacity>
                {bulkUpdateCategory && (
                  <View style={{ marginTop: Spacing.one }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                      {categorias.map(cat => {
                        const isSelected = bulkCategoryId === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              backgroundColor: isSelected ? themeColors.primary : themeColors.background,
                              borderColor: isSelected ? themeColors.primary : themeColors.border
                            }}
                            onPress={() => setBulkCategoryId(cat.id)}
                          >
                            <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: isSelected ? '#ffffff' : themeColors.text }}>
                              {cat.nombre}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 2. Proveedor */}
              <View style={[styles.bulkFieldCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={styles.bulkFieldHeader}
                  onPress={() => setBulkUpdateProveedor(!bulkUpdateProveedor)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={bulkUpdateProveedor ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={bulkUpdateProveedor ? themeColors.primary : themeColors.textSecondary}
                  />
                  <Text style={[styles.bulkFieldTitle, { color: themeColors.text }]}>Cambiar Proveedor</Text>
                </TouchableOpacity>
                {bulkUpdateProveedor && (
                  <View style={{ marginTop: Spacing.one }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                      {proveedores.map(p => {
                        const isSelected = bulkProveedorId === p.id;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              backgroundColor: isSelected ? themeColors.primary : themeColors.background,
                              borderColor: isSelected ? themeColors.primary : themeColors.border
                            }}
                            onPress={() => setBulkProveedorId(p.id)}
                          >
                            <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: isSelected ? '#ffffff' : themeColors.text }}>
                              {p.nombre}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 3. Stock */}
              <View style={[styles.bulkFieldCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={styles.bulkFieldHeader}
                  onPress={() => setBulkUpdateStock(!bulkUpdateStock)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={bulkUpdateStock ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={bulkUpdateStock ? themeColors.primary : themeColors.textSecondary}
                  />
                  <Text style={[styles.bulkFieldTitle, { color: themeColors.text }]}>Establecer Stock</Text>
                </TouchableOpacity>
                {bulkUpdateStock && (
                  <View style={{ marginTop: Spacing.one }}>
                    <CustomInput
                      label="Nuevo Stock para todos los seleccionados"
                      placeholder="Ej. 50"
                      keyboardType="numeric"
                      value={bulkStockValue}
                      onChangeText={(val) => setBulkStockValue(val.replace(/[^0-9]/g, ''))}
                    />
                  </View>
                )}
              </View>

              {/* 4. Precio Unitario */}
              <View style={[styles.bulkFieldCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={styles.bulkFieldHeader}
                  onPress={() => setBulkUpdatePrice(!bulkUpdatePrice)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={bulkUpdatePrice ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={bulkUpdatePrice ? themeColors.primary : themeColors.textSecondary}
                  />
                  <Text style={[styles.bulkFieldTitle, { color: themeColors.text }]}>Establecer Precio Unitario</Text>
                </TouchableOpacity>
                {bulkUpdatePrice && (
                  <View style={{ marginTop: Spacing.one }}>
                    <CustomInput
                      label="Nuevo Precio Unitario"
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={bulkPriceValue}
                      onChangeText={setBulkPriceValue}
                    />
                    {bulkPriceValue ? (
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
                        Precio con IVA (16%): {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((parseFloat(bulkPriceValue) || 0) * 1.16)}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>

              <CustomButton
                title={`Aplicar Cambios (${selectedProductIds.length})`}
                onPress={handleSaveBulkEdit}
                loading={isSavingBulkEdit}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL: ASIGNAR MATERIAL A EMPLEADO (CAMIONETA) ========== */}
      <Modal
        statusBarTranslucent={true}
        animationType="fade"
        transparent={true}
        visible={asignarModalVisible}
        onRequestClose={() => setAsignarModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, maxHeight: '92%', width: '92%', maxWidth: 640 }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border, borderBottomWidth: 1, paddingBottom: Spacing.two }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ backgroundColor: '#2563EB20', padding: 6, borderRadius: 8 }}>
                    <Ionicons name="cube-outline" size={22} color="#2563EB" />
                  </View>
                  <Text style={[styles.modalTitle, { color: themeColors.text, fontSize: 18 }]}>
                    Asignar Material a Empleado
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }}>
                  Transfiere material del inventario general a la camioneta / inventario personal del técnico.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAsignarModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: Spacing.two }}>
              {/* 1. Selector de Empleado */}
              <View style={[styles.innerCard, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: Spacing.two, zIndex: 10 }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 13 }]}>
                  Empleado Destinatario (Técnico / Camioneta) *
                </Text>

                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowAsignarEmpDropdown(!showAsignarEmpDropdown);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="person-outline" size={18} color={asignarEmpleadoId ? themeColors.primary : themeColors.textSecondary} />
                    <Text style={{ color: asignarEmpleadoId ? themeColors.text : themeColors.textSecondary, fontWeight: asignarEmpleadoId ? '700' : '400', fontSize: 14 }} numberOfLines={1}>
                      {empleados.find(e => e.id === asignarEmpleadoId)?.nombre || 'Selecciona un empleado...'}
                    </Text>
                  </View>
                  <Ionicons name={showAsignarEmpDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>

                {showAsignarEmpDropdown && (
                  <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: 6 }]}>
                    <CustomInput
                      placeholder="Buscar empleado..."
                      value={asignarEmpSearch}
                      onChangeText={setAsignarEmpSearch}
                      iconName="search-outline"
                      style={{ margin: Spacing.one, height: 38 }}
                    />
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                      {empleados
                        .filter(emp => {
                          const norm = normalizeText(asignarEmpSearch);
                          return !norm || (emp.nombre && normalizeText(emp.nombre).includes(norm)) || (emp.email && normalizeText(emp.email).includes(norm));
                        })
                        .map((emp, index, arr) => (
                          <TouchableOpacity
                            key={emp.id}
                            style={[
                              styles.dropdownItem,
                              index === arr.length - 1 && { borderBottomWidth: 0 },
                              emp.id === asignarEmpleadoId && { backgroundColor: themeColors.primary + '15' },
                              { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }
                            ]}
                            onPress={() => {
                              setAsignarEmpleadoId(emp.id);
                              setShowAsignarEmpDropdown(false);
                              setAsignarEmpSearch('');
                            }}
                          >
                            <Ionicons name="person-circle-outline" size={22} color={themeColors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }}>{emp.nombre}</Text>
                              {emp.email ? <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>{emp.email}</Text> : null}
                            </View>
                            {emp.id === asignarEmpleadoId && (
                              <Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />
                            )}
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 2. Motivo o Referencia */}
              <View style={[styles.innerCard, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 13 }]}>
                  Motivo / Observaciones (Opcional)
                </Text>
                <CustomInput
                  placeholder="Ej. Surtido semanal de camioneta, Proyecto X, Servicios..."
                  value={asignarMotivo}
                  onChangeText={setAsignarMotivo}
                  iconName="clipboard-outline"
                />
              </View>

              {/* 3. Buscador y Selector de Productos del Inventario General */}
              <View style={[styles.innerCard, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: Spacing.two }]}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 13, marginBottom: 6 }]}>
                  Buscar y Agregar Material del Almacén General
                </Text>

                <CustomInput
                  placeholder="Escribe el nombre o SKU del producto..."
                  value={asignarProductSearch}
                  onChangeText={setAsignarProductSearch}
                  iconName="search-outline"
                  style={{ marginBottom: 6 }}
                />

                {asignarProductSearch.trim().length > 0 && (
                  <View style={{ maxHeight: 200, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, backgroundColor: themeColors.backgroundElement, overflow: 'hidden' }}>
                    <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                      {productos
                        .filter(p => {
                          if (!p.activo) return false;
                          const norm = normalizeText(asignarProductSearch);
                          return (
                            (p.nombre_oficial && normalizeText(p.nombre_oficial).includes(norm)) ||
                            (p.sku_interno && normalizeText(p.sku_interno).includes(norm))
                          );
                        })
                        .slice(0, 20)
                        .map((prod, pIdx, arr) => {
                          const isAlreadyAdded = asignarItems.some(it => it.productoId === prod.id);
                          const sinStock = prod.stock_actual <= 0;
                          return (
                            <TouchableOpacity
                              key={prod.id}
                              disabled={sinStock}
                              onPress={() => handleAddProductToAsignar(prod.id)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 10,
                                borderBottomWidth: pIdx === arr.length - 1 ? 0 : 1,
                                borderBottomColor: themeColors.border,
                                opacity: sinStock ? 0.45 : 1,
                                backgroundColor: isAlreadyAdded ? themeColors.primary + '10' : 'transparent'
                              }}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                                  {prod.nombre_oficial}
                                </Text>
                                <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 2 }}>
                                  SKU: {prod.sku_interno || '-'} | Disp: {prod.stock_actual} {prod.unidad || 'pzas'}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ backgroundColor: sinStock ? themeColors.danger + '20' : themeColors.success + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: sinStock ? themeColors.danger : themeColors.success }}>
                                    {sinStock ? 'Agotado' : `${prod.stock_actual} ${prod.unidad || 'pzas'}`}
                                  </Text>
                                </View>
                                {!sinStock && (
                                  <View style={{ backgroundColor: themeColors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                                      {isAlreadyAdded ? '+1' : 'Agregar'}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      {productos.filter(p => {
                        if (!p.activo) return false;
                        const norm = normalizeText(asignarProductSearch);
                        return (
                          (p.nombre_oficial && normalizeText(p.nombre_oficial).includes(norm)) ||
                          (p.sku_interno && normalizeText(p.sku_interno).includes(norm))
                        );
                      }).length === 0 && (
                        <View style={{ padding: 16, alignItems: 'center' }}>
                          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                            No se encontraron productos coincidentes activos.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 4. Lista de Productos a Transferir */}
              <View style={{ marginBottom: Spacing.two }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.subTitle, { color: themeColors.text, marginVertical: 0 }]}>
                    Materiales a Transferir ({asignarItems.length})
                  </Text>
                  {asignarItems.length > 0 && (
                    <TouchableOpacity onPress={() => setAsignarItems([])}>
                      <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '700' }}>Vaciar lista</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {asignarItems.length === 0 ? (
                  <View style={[styles.emptyContainer, { paddingVertical: Spacing.four, backgroundColor: themeColors.background, borderRadius: 12, borderWidth: 1, borderColor: themeColors.border, borderStyle: 'dashed' }]}>
                    <Ionicons name="cart-outline" size={40} color={themeColors.textSecondary} />
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary, marginTop: 6 }]}>
                      Usa el buscador arriba para agregar materiales a la camioneta.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: Spacing.one }}>
                    {asignarItems.map(item => {
                      const prod = productos.find(p => p.id === item.productoId);
                      const maxStock = prod ? prod.stock_actual : 0;
                      const hasExcess = item.cantidad > maxStock;
                      const unidad = prod?.unidad || 'pzas';

                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.stagingItemCard,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: hasExcess ? themeColors.danger : themeColors.border,
                              borderWidth: hasExcess ? 1.5 : 1,
                              padding: Spacing.two
                            }
                          ]}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                                {prod ? prod.nombre_oficial : 'Producto desconocido'}
                              </Text>
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                                SKU: {prod ? prod.sku_interno : '-'} | Stock en Almacén: {maxStock} {unidad}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleRemoveProductFromAsignar(item.id)}
                              style={{ padding: 4 }}
                            >
                              <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>

                          {/* Stepper y Entrada de Cantidad */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                            <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>
                              Cantidad a cargar:
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <TouchableOpacity
                                onPress={() => handleUpdateAsignarItemQty(item.id, Math.max(1, item.cantidad - 1))}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  backgroundColor: themeColors.backgroundElement,
                                  borderWidth: 1,
                                  borderColor: themeColors.border,
                                  justifyContent: 'center',
                                  alignItems: 'center'
                                }}
                              >
                                <Ionicons name="remove" size={16} color={themeColors.text} />
                              </TouchableOpacity>

                              <TextInput
                                style={{
                                  width: 60,
                                  height: 32,
                                  backgroundColor: themeColors.backgroundElement,
                                  borderWidth: 1,
                                  borderColor: hasExcess ? themeColors.danger : themeColors.border,
                                  borderRadius: 6,
                                  textAlign: 'center',
                                  fontSize: 13,
                                  fontWeight: '800',
                                  color: hasExcess ? themeColors.danger : themeColors.text,
                                  paddingHorizontal: 4
                                }}
                                keyboardType="numeric"
                                value={item.cantidad > 0 ? String(item.cantidad) : ''}
                                onChangeText={txt => {
                                  const num = parseFloat(txt.replace(/[^0-9.]/g, '')) || 0;
                                  handleUpdateAsignarItemQty(item.id, num);
                                }}
                              />

                              <TouchableOpacity
                                disabled={item.cantidad >= maxStock}
                                onPress={() => handleUpdateAsignarItemQty(item.id, item.cantidad + 1)}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  backgroundColor: themeColors.backgroundElement,
                                  borderWidth: 1,
                                  borderColor: themeColors.border,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  opacity: item.cantidad >= maxStock ? 0.35 : 1
                                }}
                              >
                                <Ionicons name="add" size={16} color={item.cantidad >= maxStock ? themeColors.textSecondary : themeColors.text} />
                              </TouchableOpacity>

                              <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600', marginLeft: 2 }}>
                                {unidad}
                              </Text>
                            </View>
                          </View>

                          {hasExcess && (
                            <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700', marginTop: 4 }}>
                              ⚠️ La cantidad supera el stock disponible en almacén ({maxStock} {unidad})
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 5. Resumen */}
              {asignarItems.length > 0 && (
                <View style={{ backgroundColor: '#2563EB15', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2563EB30', marginBottom: Spacing.two }}>
                  <Text style={{ color: '#2563EB', fontWeight: '800', fontSize: 13 }}>
                    Resumen del Traspaso:
                  </Text>
                  <Text style={{ color: themeColors.text, fontSize: 12, marginTop: 4 }}>
                    • Partidas a transferir: <Text style={{ fontWeight: '800' }}>{asignarItems.length}</Text>
                  </Text>
                  <Text style={{ color: themeColors.text, fontSize: 12, marginTop: 2 }}>
                    • Total unidades: <Text style={{ fontWeight: '800' }}>{asignarItems.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0)}</Text>
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                    * Los materiales se descontarán del stock general y se sumarán al inventario personal del técnico.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, padding: Spacing.two, gap: Spacing.two }]}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setAsignarModalVisible(false)}
                style={{ flex: 1 }}
              />
              <CustomButton
                title={isSubmittingAsignacion ? "Transfiriendo..." : `Transferir (${asignarItems.length})`}
                onPress={handleConfirmAsignacion}
                loading={isSubmittingAsignacion}
                disabled={
                  isSubmittingAsignacion ||
                  asignarItems.length === 0 ||
                  !asignarEmpleadoId ||
                  asignarItems.some(it => {
                    const p = productos.find(prod => prod.id === it.productoId);
                    const max = p ? (Number(p.stock_actual) || 0) : 0;
                    return it.cantidad <= 0 || it.cantidad > max;
                  })
                }
                style={{ flex: 1.6, backgroundColor: '#2563EB' }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL REPORTAR GASTO PERSONAL ========== */}
      <Modal statusBarTranslucent={true} animationType="fade" transparent={true} visible={gastoModalVisible} onRequestClose={() => setGastoModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="document-text-outline" size={22} color="#D97706" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Reportar Gasto de Material</Text>
              </View>
              <TouchableOpacity onPress={() => setGastoModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              {gastoTargetItem && (
                <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: themeColors.border, gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>
                    {gastoTargetItem.producto?.nombre_oficial || 'Producto'}
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                    SKU: {gastoTargetItem.producto?.sku_interno || '-'} • Disponible: <Text style={{ fontWeight: '700', color: '#10B981' }}>{gastoTargetItem.cantidad_disponible} {gastoTargetItem.producto?.unidad || 'pza'}</Text>
                  </Text>
                </View>
              )}

              {/* Tipo de Gasto */}
              <View>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 6 }]}>Tipo de Operación *</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(['SERVICIO', 'PROYECTO', 'MANTENIMIENTO', 'INTERNO'] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setGastoTipo(t)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        backgroundColor: gastoTipo === t ? themeColors.accent : themeColors.backgroundElement,
                        borderColor: gastoTipo === t ? themeColors.accent : themeColors.border
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: gastoTipo === t ? '#fff' : themeColors.textSecondary }}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Cantidad Total */}
              <View>
                <CustomInput
                  label={`Cantidad a Gastar * (Máx: ${gastoTargetItem?.cantidad_disponible || 0})`}
                  value={gastoCantidad}
                  onChangeText={setGastoCantidad}
                  keyboardType="decimal-pad"
                  placeholder="1"
                />
              </View>

              {/* Desglose de Condición si tiene usadas o por revisar */}
              {((Number(gastoTargetItem?.cantidad_usado) || 0) > 0 || (Number(gastoTargetItem?.cantidad_por_revisar) || 0) > 0) && (
                <View style={{ backgroundColor: themeColors.backgroundElement, padding: 10, borderRadius: 8, gap: 8, borderWidth: 1, borderColor: themeColors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                    Desglose por Estado (Opcional):
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Nuevas"
                        value={gastoCantidadNuevo}
                        onChangeText={setGastoCantidadNuevo}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Usadas"
                        value={gastoCantidadUsado}
                        onChangeText={setGastoCantidadUsado}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Dañadas"
                        value={gastoCantidadPorRev}
                        onChangeText={setGastoCantidadPorRev}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Selector de Cliente */}
              <View>
                <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 4 }]}>Cliente Destino (Opcional)</Text>
                <TouchableOpacity
                  onPress={() => setShowGastoCliDropdown(!showGastoCliDropdown)}
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                >
                  <Text style={{ color: gastoClienteNombre ? themeColors.text : themeColors.textSecondary, fontSize: 13 }}>
                    {gastoClienteNombre || 'Seleccionar cliente...'}
                  </Text>
                  <Ionicons name={showGastoCliDropdown ? "chevron-up" : "chevron-down"} size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>

                {showGastoCliDropdown && (
                  <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, marginTop: 4, maxHeight: 180, overflow: 'hidden' }}>
                    <TextInput
                      style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: themeColors.border, color: themeColors.text, fontSize: 12 }}
                      placeholder="Buscar cliente..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={gastoCliSearch}
                      onChangeText={setGastoCliSearch}
                    />
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 140 }}>
                      <TouchableOpacity
                        onPress={() => { setGastoClienteId(''); setGastoClienteNombre(''); setShowGastoCliDropdown(false); }}
                        style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                      >
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontStyle: 'italic' }}>Sin cliente (Interno / Oficina)</Text>
                      </TouchableOpacity>
                      {clientes
                        .filter(c => !gastoCliSearch || normalizeText(c.nombre).includes(normalizeText(gastoCliSearch)))
                        .map(c => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => { setGastoClienteId(c.id); setGastoClienteNombre(c.nombre); setShowGastoCliDropdown(false); }}
                            style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                          >
                            <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '600' }}>{c.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Sucursal o Ubicación */}
              <CustomInput
                label="Sucursal / Ubicación (Opcional)"
                placeholder="Ej. Matriz, Planta 2, etc."
                value={gastoSucursal}
                onChangeText={setGastoSucursal}
              />

              {/* Motivo o Detalle del Trabajo */}
              <CustomInput
                label="Detalle del Trabajo o Motivo *"
                placeholder="Ej. Reemplazo de cableado dañado en servidor central..."
                value={gastoMotivo}
                onChangeText={setGastoMotivo}
                multiline
                numberOfLines={2}
              />
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, paddingTop: 12, gap: 10 }]}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setGastoModalVisible(false)}
                style={{ flex: 1 }}
              />
              <CustomButton
                title={isSubmittingGasto ? "Guardando..." : "Confirmar Gasto"}
                onPress={handleConfirmGastoPersonal}
                loading={isSubmittingGasto}
                disabled={isSubmittingGasto || !gastoCantidad || parseFloat(gastoCantidad) <= 0}
                style={{ flex: 1.5, backgroundColor: '#D97706' }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL DEVOLVER A ALMACÉN CENTRAL ========== */}
      <Modal statusBarTranslucent={true} animationType="fade" transparent={true} visible={devolverModalVisible} onRequestClose={() => setDevolverModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="arrow-undo-outline" size={22} color="#2563EB" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Devolver a Almacén Central</Text>
              </View>
              <TouchableOpacity onPress={() => setDevolverModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              {devolverTargetItem && (
                <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: themeColors.border, gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>
                    {devolverTargetItem.producto?.nombre_oficial || 'Producto'}
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                    SKU: {devolverTargetItem.producto?.sku_interno || '-'} • En posesión: <Text style={{ fontWeight: '700', color: '#2563EB' }}>{devolverTargetItem.cantidad_disponible} {devolverTargetItem.producto?.unidad || 'pza'}</Text>
                  </Text>
                </View>
              )}

              <View style={{ backgroundColor: '#2563EB10', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2563EB30' }}>
                <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                  ℹ️ Este material se reintegrará inmediatamente al stock general del catálogo y se registrará como ENTRADA / DEVOLUCIÓN en movimientos.
                </Text>
              </View>

              {/* Cantidad Total a Devolver */}
              <CustomInput
                label={`Cantidad a Reintegrar * (Máx: ${devolverTargetItem?.cantidad_disponible || 0})`}
                value={devolverCantidad}
                onChangeText={setDevolverCantidad}
                keyboardType="decimal-pad"
                placeholder={String(devolverTargetItem?.cantidad_disponible || 0)}
              />

              {/* Desglose por Condición */}
              {((Number(devolverTargetItem?.cantidad_usado) || 0) > 0 || (Number(devolverTargetItem?.cantidad_por_revisar) || 0) > 0) && (
                <View style={{ backgroundColor: themeColors.backgroundElement, padding: 10, borderRadius: 8, gap: 8, borderWidth: 1, borderColor: themeColors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase' }}>
                    Desglose por Estado al Reintegrar:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Nuevas"
                        value={devolverCantidadNuevo}
                        onChangeText={setDevolverCantidadNuevo}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Usadas"
                        value={devolverCantidadUsado}
                        onChangeText={setDevolverCantidadUsado}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Dañadas"
                        value={devolverCantidadPorRev}
                        onChangeText={setDevolverCantidadPorRev}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Motivo */}
              <CustomInput
                label="Motivo de la Devolución (Opcional)"
                placeholder="Ej. Sobrante de instalación, material no requerido..."
                value={devolverMotivo}
                onChangeText={setDevolverMotivo}
                multiline
                numberOfLines={2}
              />
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, paddingTop: 12, gap: 10 }]}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setDevolverModalVisible(false)}
                style={{ flex: 1 }}
              />
              <CustomButton
                title={isSubmittingDevolucion ? "Reintegrando..." : "Confirmar Devolución"}
                onPress={handleConfirmDevolucionPersonal}
                loading={isSubmittingDevolucion}
                disabled={isSubmittingDevolucion || !devolverCantidad || parseFloat(devolverCantidad) <= 0}
                style={{ flex: 1.5, backgroundColor: '#2563EB' }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Bulk Action Bar */}
      {selectedProductIds.length > 0 && activeTab === 'importacion' && (
        <View style={[styles.bulkActionBar, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <View style={styles.bulkActionInfo}>
            <View style={[styles.bulkBadge, { backgroundColor: themeColors.primary }]}>
              <Text style={styles.bulkBadgeText}>{selectedProductIds.length}</Text>
            </View>
            <Text style={[styles.bulkActionText, { color: themeColors.text }]} numberOfLines={1}>
              {selectedProductIds.length === 1 ? '1 seleccionado' : `${selectedProductIds.length} seleccionados`}
            </Text>
          </View>
          <View style={styles.bulkActionButtons}>
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => handleOpenAsignarModal(undefined, selectedProductIds)}
              activeOpacity={0.8}
            >
              <Ionicons name="cube-outline" size={16} color="#fff" />
              <Text style={styles.bulkBtnText}>Asignar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: themeColors.accent }]}
              onPress={handleOpenBulkEdit}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.bulkBtnText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: themeColors.danger }]}
              onPress={handleBulkDelete}
              disabled={isBulkDeleting}
              activeOpacity={0.8}
            >
              {isBulkDeleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.bulkBtnText}>Eliminar</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkBtnClose, { borderColor: themeColors.border }]}
              onPress={clearSelection}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}
