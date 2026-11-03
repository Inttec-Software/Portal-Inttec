import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { InventarioListSkeleton } from '@/components/skeleton';
import { useHeaderAction } from '@/context/HeaderActionContext';
import { styles } from './retiroMaterialStyles';
import { useRetiroMaterial } from '../hooks/useRetiroMaterial';
import {
  getProductoUnidad,
  hasMultipleStockStates,
  getStockNuevo,
} from '../utils/inventarioUtils';
import RetiroCartDrawer from './RetiroCartDrawer';

export default function RetiroMaterialView() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { setHeaderRight } = useHeaderAction();

  const {
    filteredProductos,
    isLoading,
    searchQuery,
    setSearchQuery,
    cart,
    totalItems,
    isSubmitting,
    cartModalVisible,
    setCartModalVisible,
    motivoRetiro,
    setMotivoRetiro,
    signatureModalVisible,
    setSignatureModalVisible,
    clientes,
    sucursalesCliente,
    tipoGasto,
    setTipoGasto,
    detalleServicioProyecto,
    setDetalleServicioProyecto,
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
    stateModalProduct,
    setStateModalProduct,
    addToCart,
    updateCartQty,
    updateCartStateQty,
    removeFromCart,
    handleConfirmarRetiro,
    handleProcessSignedRetiro,
    handleClearCart,
  } = useRetiroMaterial();

  useEffect(() => {
    setHeaderRight(
      <TouchableOpacity
        style={{ position: 'relative', padding: 8, marginRight: 4 }}
        onPress={() => setCartModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="cart-outline" size={26} color={themeColors.text} />
        {totalItems > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              backgroundColor: themeColors.danger,
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 3,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{totalItems}</Text>
          </View>
        )}
      </TouchableOpacity>
    );

    return () => {
      setHeaderRight(null);
    };
  }, [totalItems, themeColors, setHeaderRight, setCartModalVisible]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Buscador */}
      <View
        style={{
          padding: Spacing.three,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
          backgroundColor: themeColors.background,
        }}
      >
        <View
          style={[
            styles.searchBox,
            { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color={themeColors.textSecondary}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Buscar material o SKU..."
            placeholderTextColor={themeColors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ScrollView style={{ flex: 1 }}>
          <InventarioListSkeleton isMobile={true} count={6} />
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}
        >
          {filteredProductos.length === 0 ? (
            <Text
              style={{
                textAlign: 'center',
                color: themeColors.textSecondary,
                marginTop: 40,
              }}
            >
              No se encontraron materiales disponibles.
            </Text>
          ) : (
            filteredProductos.map((prod) => {
              const cartItem = cart.find((c) => c.producto.id === prod.id);
              const qtyInCart =
                cartItem && typeof cartItem.cantidad === 'number'
                  ? cartItem.cantidad
                  : cartItem && cartItem.cantidad === ''
                  ? ''
                  : 0;
              const numericQtyInCart = typeof qtyInCart === 'number' ? qtyInCart : 0;
              const displayStock = Math.max(
                0,
                Math.round((prod.stock_actual - numericQtyInCart) * 100) / 100
              );
              const unit = getProductoUnidad(prod);
              const inCart = numericQtyInCart > 0 || qtyInCart === '';
              const multiState = hasMultipleStockStates(prod);

              const stockNuevo = getStockNuevo(prod);
              const stockUsado = prod.stock_usado || 0;
              const stockPorRevisar = prod.stock_por_revisar || 0;

              return (
                <View
                  key={prod.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: inCart ? themeColors.primary : themeColors.border,
                      borderWidth: inCart ? 1.5 : 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                    },
                  ]}
                >
                  {/* Info izquierda */}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>
                      {prod.nombre_oficial}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: themeColors.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      SKU: {prod.sku_interno}
                    </Text>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeColors.primary,
                          fontWeight: 'bold',
                        }}
                      >
                        Disponible: {displayStock} {unit}
                      </Text>
                    </View>

                    {/* Chips compactos si tiene varios estados */}
                    {multiState && (
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 6,
                          marginTop: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                          🟢 {stockNuevo} nuevas
                        </Text>
                        {stockUsado > 0 && (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>
                            🟡 {stockUsado} usadas
                          </Text>
                        )}
                        {stockPorRevisar > 0 && (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                            🔴 {stockPorRevisar} dañado/incompleto
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Acciones a la derecha */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {multiState ? (
                      inCart && numericQtyInCart > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TouchableOpacity
                            style={{
                              backgroundColor: themeColors.primary + '20',
                              borderColor: themeColors.primary,
                              borderWidth: 1,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onPress={() => setStateModalProduct(prod)}
                          >
                            <Ionicons name="cart" size={14} color={themeColors.primary} />
                            <Text
                              style={{
                                color: themeColors.primary,
                                fontWeight: 'bold',
                                fontSize: 12,
                              }}
                            >
                              {numericQtyInCart} {unit}
                            </Text>
                            <Ionicons
                              name="pencil"
                              size={12}
                              color={themeColors.primary}
                              style={{ marginLeft: 2 }}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeFromCart(prod.id)}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={{
                            backgroundColor: themeColors.primary,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onPress={() => setStateModalProduct(prod)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={16} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>
                            Seleccionar
                          </Text>
                        </TouchableOpacity>
                      )
                    ) : inCart ? (
                      <View
                        style={[
                          styles.stepperContainer,
                          {
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border,
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={[
                            styles.stepperBtn,
                            { backgroundColor: themeColors.danger + '18' },
                          ]}
                          onPress={() => {
                            const newQty = Math.max(0, numericQtyInCart - 1);
                            if (newQty === 0) {
                              removeFromCart(prod.id);
                            } else {
                              updateCartQty(prod.id, String(newQty));
                            }
                          }}
                        >
                          <Ionicons name="remove" size={16} color={themeColors.danger} />
                        </TouchableOpacity>

                        <TextInput
                          style={[styles.stepperInput, { color: themeColors.text }]}
                          value={qtyInCart.toString()}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          onChangeText={(val) => updateCartQty(prod.id, val)}
                        />

                        <TouchableOpacity
                          style={[
                            styles.stepperBtn,
                            { backgroundColor: themeColors.primary + '18' },
                          ]}
                          onPress={() => addToCart(prod, 1)}
                        >
                          <Ionicons name="add" size={16} color={themeColors.primary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: themeColors.primary }]}
                        onPress={() => addToCart(prod, 1)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add" size={22} color="#ffffff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Floating Bottom Cart Bar */}
      {totalItems > 0 && (
        <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <TouchableOpacity
            style={{
              backgroundColor: themeColors.primary,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 20,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 6,
            }}
            activeOpacity={0.9}
            onPress={() => setCartModalVisible(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cart" size={20} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 15 }}>
                {cart.length} {cart.length === 1 ? 'material en carrito' : 'materiales en carrito'}{' '}
                ({totalItems} total)
              </Text>
            </View>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
              Ver y Confirmar →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <RetiroCartDrawer
        themeColors={themeColors}
        cart={cart}
        cartModalVisible={cartModalVisible}
        setCartModalVisible={setCartModalVisible}
        stateModalProduct={stateModalProduct}
        setStateModalProduct={setStateModalProduct}
        signatureModalVisible={signatureModalVisible}
        setSignatureModalVisible={setSignatureModalVisible}
        isSubmitting={isSubmitting}
        motivoRetiro={motivoRetiro}
        setMotivoRetiro={setMotivoRetiro}
        tipoGasto={tipoGasto}
        setTipoGasto={setTipoGasto}
        detalleServicioProyecto={detalleServicioProyecto}
        setDetalleServicioProyecto={setDetalleServicioProyecto}
        clientes={clientes}
        sucursalesCliente={sucursalesCliente}
        selectedCliente={selectedCliente}
        setSelectedCliente={setSelectedCliente}
        selectedClienteId={selectedClienteId}
        setSelectedClienteId={setSelectedClienteId}
        clienteSearch={clienteSearch}
        setClienteSearch={setClienteSearch}
        showCliDropdown={showCliDropdown}
        setShowCliDropdown={setShowCliDropdown}
        sucursal={sucursal}
        setSucursal={setSucursal}
        selectedSucursalId={selectedSucursalId}
        setSelectedSucursalId={setSelectedSucursalId}
        sucursalSearch={sucursalSearch}
        setSucursalSearch={setSucursalSearch}
        showSucursalDropdown={showSucursalDropdown}
        setShowSucursalDropdown={setShowSucursalDropdown}
        updateCartQty={updateCartQty}
        updateCartStateQty={updateCartStateQty}
        removeFromCart={removeFromCart}
        handleClearCart={handleClearCart}
        handleConfirmarRetiro={handleConfirmarRetiro}
        handleProcessSignedRetiro={handleProcessSignedRetiro}
      />
    </View>
  );
}
