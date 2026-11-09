import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { InventarioListSkeleton } from '@/components/skeleton';
import PaginationControls from '@/components/PaginationControls';
import { adminInventarioStyles as styles } from './adminInventarioStyles';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminCatalogoTab({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    scheme,
    isMobile,
    isLoading,
    stagingItems,
    setStagingItems,
    isAnalyzing,
    handlePickDocument,
    selectedProveedorId,
    activeProveedorName,
    openProveedorSelector,
    folioFactura,
    setFolioFactura,
    folioDuplicado,
    handleUpdateStagingItem,
    categorias,
    productos,
    openProductSelectorForStaging,
    isSavingAIImport,
    handleSaveAIImport,
    searchTerm,
    setSearchTerm,
    selectedCategoryFilter,
    activeCategoryName,
    openCategoryFilter,
    showOutOfStock,
    setShowOutOfStock,
    showInactive,
    setShowInactive,
    handleOpenCreateModal,
    filteredProducts,
    selectedProductIds,
    toggleSelectAll,
    clearSelection,
    paginatedProducts,
    currentPageProd,
    setCurrentPageProd,
    totalPagesProd,
    pageSizeProd,
    setPageSizeProd,
    toggleSelectProduct,
    quickStockAdjustments,
    setQuickStockAdjustments,
    handleQuickAddStock,
    handleOpenEditModal,
    handleReactivateProduct,
    handleSoftDeleteProduct,
    handleHardDeleteProduct,
    loadAllData,
  } = inv;

  return (
    <View style={{ flex: 1 }}>
      {isLoading ? (
        <ScrollView style={{ flex: 1 }}>
          <InventarioListSkeleton count={7} isMobile={isMobile} />
        </ScrollView>
      ) : (
        <FlatList
          ListHeaderComponent={
            <>
              {/* VISTA 2: IMPORTACIÓN POR IA */}
              <View style={{ padding: 16, backgroundColor: themeColors.backgroundElement, borderBottomWidth: 1, borderColor: themeColors.border, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.half, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Extraer Factura con IA</Text>
                  {stagingItems.length > 0 && (
                    <View style={{
                      backgroundColor: themeColors.accent + '20',
                      borderColor: themeColors.accent,
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <Ionicons name="cube-outline" size={16} color={themeColors.accent} />
                      <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                        {`${stagingItems.length} ${stagingItems.length === 1 ? 'producto' : 'productos'}`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                  Sube un PDF de factura o imagen de recibo para extraer los productos, su cantidad y mapear su SKU en tu catálogo oficial mediante IA.
                </Text>

                {isAnalyzing ? (
                  <View style={styles.analyzingCard}>
                    <ActivityIndicator size="large" color={themeColors.warning} />
                    <Text style={[styles.analyzingText, { color: themeColors.text }]}>
                      Analizando archivo mediante IA...
                    </Text>
                  </View>
                ) : stagingItems.length === 0 ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickDocument}
                    style={[styles.dropzone, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                  >
                    <Ionicons name="document-attach-outline" size={42} color={themeColors.accent} />
                    <Text style={[styles.dropzoneText, { color: themeColors.text }]}>Seleccionar Factura (PDF o Imagen)</Text>
                    <Text style={[styles.dropzoneSub, { color: themeColors.textSecondary }]}>
                      Formatos soportados: PDF, JPEG, PNG, WEBP
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ gap: Spacing.two }}>
                    <View style={[styles.metadataCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      {/* Proveedor */}
                      <View style={[styles.customDropdownContainer, { marginBottom: 16 }]}>
                        <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Proveedor Asignado *</Text>
                        <TouchableOpacity
                          style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                          onPress={openProveedorSelector}
                        >
                          <Text style={{ color: selectedProveedorId ? themeColors.text : themeColors.textSecondary }}>
                            {activeProveedorName || 'Selecciona el proveedor'}
                          </Text>
                          <Ionicons name="search" size={18} color={themeColors.text} />
                        </TouchableOpacity>
                      </View>

                      {/* Folio Factura */}
                      <CustomInput
                        label="Folio de Factura *"
                        placeholder="Ej. FACT-2023"
                        value={folioFactura}
                        onChangeText={setFolioFactura}
                        error={folioDuplicado ? 'Este folio ya fue registrado previamente.' : undefined}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing.one }}>
                      <Text style={[styles.subTitle, { color: themeColors.text, marginBottom: 0 }]}>Borrador de Staging Extraído:</Text>
                      <View style={{ backgroundColor: themeColors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 13 }}>
                          {`${stagingItems.length} ${stagingItems.length === 1 ? 'producto' : 'productos'}`}
                        </Text>
                      </View>
                    </View>

                    {stagingItems.map(item => (
                      <View
                        key={item.id}
                        style={[styles.stagingItemCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      >
                        <CustomInput
                          label="Nombre Extraído"
                          value={item.nombreFactura}
                          onChangeText={txt => handleUpdateStagingItem(item.id, { nombreFactura: txt })}
                        />

                        <View style={styles.stagingFieldsRow}>
                          <View style={{ flex: 1 }}>
                            <CustomInput
                              label="Cantidad"
                              keyboardType="numeric"
                              value={item.cantidad.toString()}
                              onChangeText={txt => handleUpdateStagingItem(item.id, { cantidad: parseInt(txt, 10) || 0 })}
                            />
                          </View>
                          <View style={{ flex: 1.2 }}>
                            <CustomInput
                              label="Precio Unit."
                              keyboardType="numeric"
                              value={item.precioUnitario.toString()}
                              onChangeText={txt => handleUpdateStagingItem(item.id, { precioUnitario: parseFloat(txt) || 0 })}
                            />
                          </View>
                          <View style={{ flex: 1.2 }}>
                            <CustomInput
                              label="Precio con IVA"
                              value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.precioUnitario * 1.16)}
                              editable={false}
                              style={{ backgroundColor: themeColors.background }}
                            />
                          </View>
                        </View>

                        <View style={{ marginTop: Spacing.one }}>
                          {item.esNuevoProducto ? (
                            <View style={styles.newProductContainer}>
                              <View style={styles.badgeNew}>
                                <Text style={styles.badgeNewText}>NUEVO PRODUCTO</Text>
                              </View>
                              <View style={{ marginTop: Spacing.one }}>
                                <CustomInput
                                  label="SKU Sugerido (editable)"
                                  value={item.skuSugerido || ''}
                                  onChangeText={txt => handleUpdateStagingItem(item.id, { skuSugerido: txt })}
                                />
                              </View>
                              {/* Dropdown de Categoría */}
                              <View style={{ marginTop: Spacing.one }}>
                                <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 11 }]}>Categoría Asignada</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                                  {categorias.map(cat => {
                                    const isSelected = item.categoriaSeleccionadaId === cat.id;
                                    return (
                                      <TouchableOpacity
                                        key={cat.id}
                                        onPress={() => handleUpdateStagingItem(item.id, { categoriaSeleccionadaId: cat.id })}
                                        style={[
                                          styles.catChip,
                                          isSelected
                                            ? { backgroundColor: themeColors.accent }
                                            : { backgroundColor: themeColors.background, borderColor: themeColors.border },
                                        ]}
                                      >
                                        <Text style={[styles.catChipText, { color: isSelected ? '#fff' : themeColors.text }]}>
                                          {cat.nombre.substring(0, 15)}...
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.mappingContainer}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 11 }]}>Mapear con Catálogo:</Text>
                                <TouchableOpacity
                                  onPress={() => openProductSelectorForStaging(item.id)}
                                  style={{ padding: 4 }}
                                >
                                  <Ionicons name="search" size={16} color={themeColors.accent} />
                                </TouchableOpacity>
                              </View>

                              {item.productoIdSugerido ? (
                                (() => {
                                  const selectedProd = productos.find(p => p.id === item.productoIdSugerido);
                                  return (
                                    <View style={[styles.mappedProductRow, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                                      <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={[styles.mappedProductTitle, { color: themeColors.text }]} numberOfLines={1}>
                                          {selectedProd ? selectedProd.nombre_oficial : 'Producto No Encontrado'}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                                          SKU: {selectedProd ? selectedProd.sku_interno : '-'}
                                        </Text>
                                      </View>
                                      <TouchableOpacity
                                        onPress={() => handleUpdateStagingItem(item.id, { productoIdSugerido: undefined })}
                                      >
                                        <Ionicons name="close-circle" size={18} color={themeColors.danger} />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })()
                              ) : (
                                <TouchableOpacity
                                  activeOpacity={0.7}
                                  style={[styles.searchPlaceholderBtn, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                                  onPress={() => openProductSelectorForStaging(item.id)}
                                >
                                  <Ionicons name="search-outline" size={15} color={themeColors.textSecondary} />
                                  <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginLeft: 6 }}>
                                    Buscar producto en el catálogo...
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>

                        <TouchableOpacity
                          onPress={() => handleUpdateStagingItem(item.id, { esNuevoProducto: !item.esNuevoProducto })}
                          style={styles.toggleStagingBtn}
                        >
                          <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 12 }}>
                            {item.esNuevoProducto ? 'Asociar a Producto Existente' : 'Registrar como Nuevo Producto'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <View style={styles.stagingActions}>
                      <CustomButton
                        title="Cancelar y Descartar"
                        variant="danger"
                        onPress={() => setStagingItems([])}
                        style={{ flex: 1 }}
                      />
                      <CustomButton
                        title={`Procesar y Guardar (${stagingItems.length} ${stagingItems.length === 1 ? 'producto' : 'productos'})`}
                        variant="success"
                        loading={isSavingAIImport}
                        onPress={handleSaveAIImport}
                        style={{ flex: 1.5 }}
                      />
                    </View>
                  </View>
                )}
              </View>
              <View style={styles.filterSection}>
                <CustomInput
                  placeholder="Buscar por nombre o SKU..."
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  iconName="search-outline"
                  style={{ marginBottom: Spacing.one }}
                />

                {/* Selector de Categoría y Filtro Sin Stock */}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={[styles.customDropdownContainer, { flex: 1, minWidth: 180 }]}>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={openCategoryFilter}
                    >
                      <Text style={{ color: selectedCategoryFilter ? themeColors.text : themeColors.textSecondary }}>
                        {activeCategoryName || 'Filtrar por Categoría'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={themeColors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Toggle Switch para Productos Agotados e Inactivos */}
                  <TouchableOpacity
                    onPress={() => setShowOutOfStock(prev => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: showOutOfStock ? themeColors.accent + '20' : themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor: showOutOfStock ? themeColors.accent : themeColors.border,
                    }}
                    {...(Platform.OS === 'web' ? { title: showOutOfStock ? "Ocultar productos con stock 0" : "Mostrar productos sin stock" } as any : {})}
                  >
                    <Ionicons
                      name={showOutOfStock ? "eye-outline" : "eye-off-outline"}
                      size={16}
                      color={showOutOfStock ? themeColors.accent : themeColors.textSecondary}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: showOutOfStock ? themeColors.accent : themeColors.textSecondary }}>
                      {showOutOfStock ? 'Ver agotados ON' : 'Ver agotados OFF'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowInactive(prev => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: showInactive ? '#FF980020' : themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor: showInactive ? '#FF9800' : themeColors.border,
                    }}
                    {...(Platform.OS === 'web' ? { title: showInactive ? "Ocultar productos inactivos" : "Mostrar productos deshabilitados / inactivos" } as any : {})}
                  >
                    <Ionicons
                      name="archive-outline"
                      size={16}
                      color={showInactive ? '#FF9800' : themeColors.textSecondary}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: showInactive ? '#FF9800' : themeColors.textSecondary }}>
                      {showInactive ? 'Ver inactivos ON' : 'Ver inactivos OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                <CustomButton
                  title="➕ Agregar Producto"
                  onPress={handleOpenCreateModal}
                  style={{ backgroundColor: themeColors.primary }}
                />
              </View>

              {/* Barra de Selección Masiva */}
              <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                  onPress={toggleSelectAll}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={
                      filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.includes(p.id))
                        ? 'checkbox'
                        : filteredProducts.some(p => selectedProductIds.includes(p.id))
                        ? 'remove-circle-outline'
                        : 'square-outline'
                    }
                    size={22}
                    color={
                      filteredProducts.some(p => selectedProductIds.includes(p.id))
                        ? themeColors.primary
                        : themeColors.textSecondary
                    }
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                    {filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.includes(p.id))
                      ? 'Deseleccionar todos'
                      : `Seleccionar todos (${filteredProducts.length})`}
                  </Text>
                </TouchableOpacity>

                {selectedProductIds.length > 0 && (
                  <TouchableOpacity
                    onPress={clearSelection}
                    style={{ paddingVertical: 4, paddingHorizontal: 8 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.danger }}>
                      Limpiar ({selectedProductIds.length})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          }
          scrollEnabled={true}
          style={{ flex: 1 }}
          data={paginatedProducts}
          ListFooterComponent={
            filteredProducts.length > 0 ? (
              <PaginationControls
                currentPage={currentPageProd}
                totalPages={totalPagesProd}
                totalItems={filteredProducts.length}
                itemsPerPage={pageSizeProd}
                onPageChange={setCurrentPageProd}
                onItemsPerPageChange={(newSize: number) => {
                  setPageSizeProd(newSize);
                  setCurrentPageProd(1);
                }}
                itemsPerPageOptions={[20, 25, 50, 100]}
                isLoading={isLoading}
                style={{ marginTop: 12, marginBottom: 24 }}
              />
            ) : null
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, selectedProductIds.length > 0 && { paddingBottom: 110 }]}
          renderItem={({ item }) => {
            const cat = categorias.find(c => c.id === item.categoria_id);
            const precioFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.precio_unitario || 0);
            const isSelected = selectedProductIds.includes(item.id);
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    backgroundColor: isSelected
                      ? (scheme === 'dark' ? 'rgba(76, 175, 80, 0.12)' : '#f1f8e9')
                      : themeColors.backgroundElement,
                    borderColor: isSelected ? themeColors.primary : themeColors.border,
                    borderWidth: isSelected ? 1.5 : 1,
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    padding: isMobile ? 12 : Spacing.three,
                    gap: isMobile ? 8 : 0,
                  }
                ]}
              >
                {isMobile ? (
                  /* VISTA MÓVIL: TARJETA ESTRUCTURADA SIN EMPALMAMIENTO */
                  <>
                    {/* Fila 1: Checkbox + SKU + Inactivo + Precio */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <TouchableOpacity
                          onPress={() => toggleSelectProduct(item.id)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ padding: 2 }}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? themeColors.primary : themeColors.textSecondary}
                          />
                        </TouchableOpacity>

                        <View style={{ backgroundColor: '#ffc10718', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#ffc10740' }}>
                          <Text style={styles.skuText}>{item.sku_interno}</Text>
                        </View>

                        {!item.activo && (
                          <View style={{ backgroundColor: '#FF980020', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#FF9800' }}>
                            <Text style={{ color: '#FF9800', fontSize: 10, fontWeight: 'bold' }}>INACTIVO</Text>
                          </View>
                        )}
                      </View>

                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: themeColors.primary }}>
                        {precioFmt}
                      </Text>
                    </View>

                    {/* Fila 2: Nombre del Producto completo a todo el ancho */}
                    <View style={{ gap: 4 }}>
                      <Text style={[styles.itemText, { color: themeColors.text, opacity: item.activo ? 1 : 0.6, fontSize: 13.5, lineHeight: 19 }]}>
                        {item.nombre_oficial}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <View style={{ backgroundColor: themeColors.border + '60', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '600' }}>
                            📁 {cat ? cat.nombre : 'Sin Categoría'}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.stockText,
                            { color: item.stock_actual < 10 ? themeColors.danger : themeColors.success, marginTop: 0, fontWeight: 'bold' },
                          ]}
                        >
                          Stock Total: {item.stock_actual} {item.unidad || 'pzas'}
                        </Text>
                      </View>
                    </View>

                    {/* Fila 3: Desglose de Stock por Condición */}
                    {(() => {
                      const nuevo = item.stock_nuevo !== undefined ? item.stock_nuevo : (item.stock_usado || item.stock_por_revisar ? 0 : item.stock_actual);
                      const usado = item.stock_usado || 0;
                      const porRevisar = item.stock_por_revisar || 0;
                      const tieneDesglose = usado > 0 || porRevisar > 0;

                      return (
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <View style={[styles.stateBadge, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}>
                            <Text style={[styles.stateBadgeText, { color: '#059669', fontSize: 11 }]}>
                              🟢 {nuevo} {item.unidad || 'pzas'} nuevas
                            </Text>
                          </View>
                          {tieneDesglose ? (
                            <>
                              <View style={[styles.stateBadge, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                                <Text style={[styles.stateBadgeText, { color: '#D97706', fontSize: 11 }]}>
                                  🟡 {usado} usadas
                                </Text>
                              </View>
                              <View style={[styles.stateBadge, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                                <Text style={[styles.stateBadgeText, { color: '#DC2626', fontSize: 11 }]}>
                                  🔴 {porRevisar} dañado
                                </Text>
                              </View>
                            </>
                          ) : null}
                        </View>
                      );
                    })()}

                    {/* Fila 4: Barra de Acciones Móvil */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 8, marginTop: 2 }}>
                      {/* Ajuste rápido de stock */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '600' }}>Rápido:</Text>
                        <TextInput
                          style={[
                            styles.quickStockInput,
                            { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background, width: 48, height: 30, fontSize: 12 },
                          ]}
                          placeholder="+1"
                          placeholderTextColor={themeColors.textSecondary}
                          keyboardType="decimal-pad"
                          value={quickStockAdjustments[item.id] || ''}
                          onChangeText={txt => setQuickStockAdjustments(prev => ({ ...prev, [item.id]: txt.replace(/[^0-9.]/g, '') }))}
                        />
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleQuickAddStock(item)}
                          style={[styles.quickStockBtn, { backgroundColor: themeColors.success, width: 30, height: 30, borderRadius: 6 }]}
                        >
                          <Ionicons name="add" size={16} color="#ffffff" />
                        </TouchableOpacity>
                      </View>

                      {/* Botones de acción */}
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => handleOpenEditModal(item)}
                          style={{ padding: 6, borderRadius: 6, backgroundColor: themeColors.accent + '15' }}
                          {...(Platform.OS === 'web' ? { title: "Editar Producto" } as any : {})}
                        >
                          <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                        </TouchableOpacity>

                        {!item.activo ? (
                          <TouchableOpacity
                            onPress={() => handleReactivateProduct(item)}
                            style={{ padding: 6, borderRadius: 6, backgroundColor: themeColors.success + '15' }}
                            {...(Platform.OS === 'web' ? { title: "Reactivar Producto" } as any : {})}
                          >
                            <Ionicons name="refresh-circle-outline" size={18} color={themeColors.success} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleSoftDeleteProduct(item)}
                            style={{ padding: 6, borderRadius: 6, backgroundColor: themeColors.textSecondary + '15' }}
                            {...(Platform.OS === 'web' ? { title: "Desactivar Producto" } as any : {})}
                          >
                            <Ionicons name="eye-off-outline" size={18} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          onPress={() => handleHardDeleteProduct(item)}
                          style={{ padding: 6, borderRadius: 6, backgroundColor: themeColors.danger + '15' }}
                          {...(Platform.OS === 'web' ? { title: "Borrar Definitivamente" } as any : {})}
                        >
                          <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  /* VISTA ESCRITORIO */
                  <>
                    {/* Checkbox de Selección */}
                    <TouchableOpacity
                      style={styles.checkboxContainer}
                      onPress={() => toggleSelectProduct(item.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? themeColors.primary : themeColors.textSecondary}
                      />
                    </TouchableOpacity>

                    <View style={{ flex: 1, gap: 2, marginLeft: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.skuText}>{item.sku_interno}</Text>
                        {!item.activo && (
                          <View style={{ backgroundColor: '#FF980020', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: '#FF9800' }}>
                            <Text style={{ color: '#FF9800', fontSize: 10, fontWeight: 'bold' }}>INACTIVO</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.itemText, { color: themeColors.text, opacity: item.activo ? 1 : 0.6 }]}>{item.nombre_oficial}</Text>
                      <Text style={[styles.itemSubtext, { color: themeColors.textSecondary }]}>
                        {cat ? cat.nombre : 'Sin Categoría'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <Text
                          style={[
                            styles.stockText,
                            { color: item.stock_actual < 10 ? themeColors.danger : themeColors.success },
                          ]}
                        >
                          Stock Total: {item.stock_actual} {item.unidad || 'pzas'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                          • {precioFmt}
                        </Text>
                      </View>

                      {/* Desglose de Stock por Condición */}
                      {(() => {
                        const nuevo = item.stock_nuevo !== undefined ? item.stock_nuevo : (item.stock_usado || item.stock_por_revisar ? 0 : item.stock_actual);
                        const usado = item.stock_usado || 0;
                        const porRevisar = item.stock_por_revisar || 0;
                        const tieneDesglose = usado > 0 || porRevisar > 0;

                        return (
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            <View style={[styles.stateBadge, { backgroundColor: '#10B98115', borderColor: '#10B98140' }]}>
                              <Text style={[styles.stateBadgeText, { color: '#059669' }]}>
                                🟢 {nuevo} {item.unidad || 'pzas'} nuevas
                              </Text>
                            </View>
                            {tieneDesglose ? (
                              <>
                                <View style={[styles.stateBadge, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                                  <Text style={[styles.stateBadgeText, { color: '#D97706' }]}>
                                    🟡 {usado} usadas
                                  </Text>
                                </View>
                                <View style={[styles.stateBadge, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                                  <Text style={[styles.stateBadgeText, { color: '#DC2626' }]}>
                                    🔴 {porRevisar} dañado/incompleto
                                  </Text>
                                </View>
                              </>
                            ) : null}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
                      {/* Ajuste rápido de stock */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, gap: 4 }}>
                        <TextInput
                          style={[
                            styles.quickStockInput,
                            { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background },
                          ]}
                          placeholder="+"
                          placeholderTextColor={themeColors.textSecondary}
                          keyboardType="decimal-pad"
                          value={quickStockAdjustments[item.id] || ''}
                          onChangeText={txt => setQuickStockAdjustments(prev => ({ ...prev, [item.id]: txt.replace(/[^0-9.]/g, '') }))}
                        />
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleQuickAddStock(item)}
                          style={[styles.quickStockBtn, { backgroundColor: themeColors.success }]}
                        >
                          <Ionicons name="add" size={14} color="#ffffff" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        onPress={() => handleOpenEditModal(item)}
                        {...(Platform.OS === 'web' ? { title: "Editar Producto" } as any : {})}
                      >
                        <Ionicons name="create-outline" size={20} color={themeColors.accent} />
                      </TouchableOpacity>

                      {!item.activo ? (
                        <TouchableOpacity
                          onPress={() => handleReactivateProduct(item)}
                          {...(Platform.OS === 'web' ? { title: "Reactivar Producto" } as any : {})}
                        >
                          <Ionicons name="refresh-circle-outline" size={22} color={themeColors.success} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleSoftDeleteProduct(item)}
                          {...(Platform.OS === 'web' ? { title: "Desactivar Producto (Soft Delete)" } as any : {})}
                        >
                          <Ionicons name="eye-off-outline" size={20} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={() => handleHardDeleteProduct(item)}
                        {...(Platform.OS === 'web' ? { title: "Borrar Definitivamente (Hard Delete)" } as any : {})}
                      >
                        <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No hay productos en inventario que coincidan.
              </Text>
            </View>
          }
          refreshing={isLoading}
          onRefresh={() => loadAllData()}
        />
      )}
    </View>
  );
}
