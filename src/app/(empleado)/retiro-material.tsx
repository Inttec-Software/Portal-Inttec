import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Pressable,
  Keyboard
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { AuthService, Usuario, CatalogoItem, SucursalCliente } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { normalizeText } from '@/utils/helpers';

interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  stock_actual: number;
  stock_nuevo?: number;
  stock_usado?: number;
  stock_por_revisar?: number;
  unidad?: string;
}

interface CartItem {
  producto: Producto;
  cantidad: number | '';
  cantidad_nuevo?: number | '';
  cantidad_usado?: number | '';
  cantidad_por_revisar?: number | '';
}

const getProductoUnidad = (prod: Producto): string => {
  if (prod.unidad && prod.unidad.trim() !== '') {
    const u = prod.unidad.toLowerCase().trim();
    if (u === 'mts' || u === 'm' || u === 'metro' || u === 'metros' || u === 'mtr' || u === 'lm') return 'mts';
    if (u === 'pza' || u === 'pzas' || u === 'pz' || u === 'pieza' || u === 'piezas' || u === 'h87') return 'pza';
    if (u === 'rollo' || u === 'rollos' || u === 'xro') return 'rollo';
    if (u === 'kit' || u === 'kt') return 'kit';
    return prod.unidad;
  }
  const name = (prod.nombre_oficial || '').toLowerCase();
  if (name.includes('metro') || name.includes('cable') || name.includes('bobina')) {
    return 'mts';
  }
  return 'pza';
};

const hasMultipleStockStates = (prod: Producto): boolean => {
  return (prod.stock_usado || 0) > 0 || (prod.stock_por_revisar || 0) > 0;
};

const getStockNuevo = (prod: Producto): number => {
  if (prod.stock_nuevo !== undefined && prod.stock_nuevo !== null) return prod.stock_nuevo;
  if ((prod.stock_usado || 0) > 0 || (prod.stock_por_revisar || 0) > 0) return 0;
  return prod.stock_actual || 0;
};

export default function RetiroMaterialScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [motivoRetiro, setMotivoRetiro] = useState('');

  // Catálogos
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);

  // Campos extendidos del formulario
  const [tipoGasto, setTipoGasto] = useState<'Servicio' | 'Proyecto' | 'Venta' | 'Operativo'>('Servicio');
  const [detalleServicioProyecto, setDetalleServicioProyecto] = useState('');

  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  const [sucursal, setSucursal] = useState('');
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(null);
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);

  const [stateModalProduct, setStateModalProduct] = useState<Producto | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/retiro-material/productos`, { headers });
      if (!res.ok) throw new Error('Error de red al cargar productos');
      
      const { productos: data } = await res.json();
      setProductos(data || []);

      // Cargar catálogos
      const catRes = await fetch(`${getApiUrl()}/api/reportes/form-catalogs`, { headers });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.clientes) setClientes(catData.clientes);
        if (catData.sucursales) setSucursalesCliente(catData.sucursales);
      }
    } catch (err) {
      console.error('Error loading products & catalogs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const normQuery = normalizeText(searchQuery);
  const filteredProductos = productos.filter(p => 
    !normQuery ||
    normalizeText(p.nombre_oficial).includes(normQuery) ||
    normalizeText(p.sku_interno).includes(normQuery)
  );

  const addToCart = (producto: Producto, qty: number = 1) => {
    const unit = getProductoUnidad(producto);
    setCart(prev => {
      const existing = prev.find(item => item.producto.id === producto.id);
      if (existing) {
        const currentQty = typeof existing.cantidad === 'number' ? existing.cantidad : 0;
        const newQty = Math.round((currentQty + qty) * 100) / 100;
        if (newQty > producto.stock_actual) {
          Alert.alert('Stock Insuficiente', `Solo hay ${producto.stock_actual} ${unit} disponibles.`);
          return prev;
        }
        return prev.map(item => item.producto.id === producto.id ? { 
          ...item, 
          cantidad: newQty,
          cantidad_nuevo: hasMultipleStockStates(producto) ? (typeof item.cantidad_nuevo === 'number' ? item.cantidad_nuevo + qty : qty) : newQty
        } : item);
      }
      return [...prev, { 
        producto, 
        cantidad: qty,
        cantidad_nuevo: qty,
        cantidad_usado: 0,
        cantidad_por_revisar: 0
      }];
    });
  };

  const updateCartQty = (productoId: string, text: string) => {
    setCart(prev => {
      const item = prev.find(i => i.producto.id === productoId);
      if (!item) return prev;

      const unit = getProductoUnidad(item.producto);

      if (text.trim() === '') {
        return prev.map(i => i.producto.id === productoId ? { ...i, cantidad: '', cantidad_nuevo: '' } : i);
      }

      const qty = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(qty)) {
        return prev.map(i => i.producto.id === productoId ? { ...i, cantidad: '', cantidad_nuevo: '' } : i);
      }

      if (qty > item.producto.stock_actual) {
        Alert.alert('Stock Insuficiente', `Solo hay ${item.producto.stock_actual} ${unit} disponibles.`);
        return prev.map(i => i.producto.id === productoId ? { ...i, cantidad: item.producto.stock_actual, cantidad_nuevo: item.producto.stock_actual } : i);
      }

      return prev.map(i => i.producto.id === productoId ? { ...i, cantidad: qty, cantidad_nuevo: qty } : i);
    });
  };

  const updateCartStateQty = (
    producto: Producto, 
    state: 'nuevo' | 'usado' | 'por_revisar', 
    val: number | ''
  ) => {
    const unit = getProductoUnidad(producto);
    const maxStock = state === 'nuevo' 
      ? getStockNuevo(producto) 
      : state === 'usado' 
        ? (producto.stock_usado || 0) 
        : (producto.stock_por_revisar || 0);

    let numVal: number | '' = val;
    if (typeof val === 'number') {
      if (val > maxStock) {
        Alert.alert('Stock Insuficiente', `Solo hay ${maxStock} ${unit} de este estado.`);
        numVal = maxStock;
      } else if (val < 0) {
        numVal = 0;
      }
    }

    setCart(prev => {
      const existing = prev.find(i => i.producto.id === producto.id);
      let currentNuevo = existing?.cantidad_nuevo ?? 0;
      let currentUsado = existing?.cantidad_usado ?? 0;
      let currentPorRevisar = existing?.cantidad_por_revisar ?? 0;

      if (state === 'nuevo') currentNuevo = numVal;
      if (state === 'usado') currentUsado = numVal;
      if (state === 'por_revisar') currentPorRevisar = numVal;

      const nNuevo = typeof currentNuevo === 'number' ? currentNuevo : 0;
      const nUsado = typeof currentUsado === 'number' ? currentUsado : 0;
      const nPorRev = typeof currentPorRevisar === 'number' ? currentPorRevisar : 0;
      const total = Math.round((nNuevo + nUsado + nPorRev) * 100) / 100;

      if (total <= 0 && currentNuevo !== '' && currentUsado !== '' && currentPorRevisar !== '') {
        return prev.filter(i => i.producto.id !== producto.id);
      }

      const updatedItem: CartItem = {
        producto,
        cantidad: total,
        cantidad_nuevo: currentNuevo,
        cantidad_usado: currentUsado,
        cantidad_por_revisar: currentPorRevisar,
      };

      if (existing) {
        return prev.map(i => i.producto.id === producto.id ? updatedItem : i);
      } else {
        return [...prev, updatedItem];
      }
    });
  };

  const removeFromCart = (productoId: string) => {
    setCart(prev => prev.filter(item => item.producto.id !== productoId));
  };

  const handleConfirmarRetiro = async () => {
    const validCart = cart
      .filter(item => typeof item.cantidad === 'number' && item.cantidad > 0)
      .map(item => {
        const qty = Number(item.cantidad) || 0;
        const qNuevo = typeof item.cantidad_nuevo === 'number' ? item.cantidad_nuevo : (item.cantidad_usado || item.cantidad_por_revisar ? 0 : qty);
        const qUsado = typeof item.cantidad_usado === 'number' ? item.cantidad_usado : 0;
        const qPorRevisar = typeof item.cantidad_por_revisar === 'number' ? item.cantidad_por_revisar : 0;
        return {
          producto: item.producto,
          cantidad: qty,
          cantidad_nuevo: qNuevo,
          cantidad_usado: qUsado,
          cantidad_por_revisar: qPorRevisar
        };
      });

    if (validCart.length === 0) {
      Alert.alert('Carrito Vacío', 'Agrega al menos un material con cantidad mayor a 0 para retirar.');
      return;
    }

    if (!detalleServicioProyecto.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el Detalle de Servicio o Proyecto.');
      return;
    }

    if (!selectedCliente) {
      Alert.alert('Validación', 'Por favor selecciona el Cliente Relacionado.');
      return;
    }

    if (!motivoRetiro.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un motivo o referencia para el retiro.');
      return;
    }

    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/retiro-material/confirmar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cart: validCart,
          motivoRetiro: motivoRetiro.trim(),
          currentUser,
          tipoGasto,
          detalleServicioProyecto: detalleServicioProyecto.trim(),
          clienteId: selectedClienteId,
          clienteNombre: selectedCliente,
          sucursalId: selectedSucursalId,
          sucursalNombre: sucursal
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al procesar el retiro en el servidor');
      }

      Alert.alert('Éxito', 'Material retirado correctamente.');
      setCart([]);
      setMotivoRetiro('');
      setDetalleServicioProyecto('');
      setSelectedCliente('');
      setSelectedClienteId(null);
      setSucursal('');
      setSelectedSucursalId(null);
      setCartModalVisible(false);
      await loadData(); // recargar para actualizar stock en ui
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'No se pudo registrar el retiro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalItems = cart.reduce((sum, item) => sum + (typeof item.cantidad === 'number' ? item.cantidad : 0), 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <View style={{ padding: Spacing.three, backgroundColor: themeColors.backgroundElement, borderBottomWidth: 1, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Retiro de Material</Text>
        </View>
        <TouchableOpacity 
          style={{ position: 'relative', padding: 4 }}
          onPress={() => setCartModalVisible(true)}
        >
          <Ionicons name="cart-outline" size={26} color={themeColors.primary} />
          {totalItems > 0 && (
            <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: themeColors.danger, borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{totalItems}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={{ padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: themeColors.border, backgroundColor: themeColors.background }}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ marginTop: 10, color: themeColors.textSecondary }}>Cargando catálogo...</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}>
          {filteredProductos.length === 0 ? (
            <Text style={{ textAlign: 'center', color: themeColors.textSecondary, marginTop: 40 }}>
              No se encontraron materiales disponibles.
            </Text>
          ) : (
            filteredProductos.map(prod => {
              const cartItem = cart.find(c => c.producto.id === prod.id);
              const qtyInCart = cartItem && typeof cartItem.cantidad === 'number' ? cartItem.cantidad : (cartItem && cartItem.cantidad === '' ? '' : 0);
              const numericQtyInCart = typeof qtyInCart === 'number' ? qtyInCart : 0;
              const displayStock = Math.max(0, Math.round((prod.stock_actual - numericQtyInCart) * 100) / 100);
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
                      alignItems: 'center'
                    },
                  ]}
                >
                  {/* Info izquierda */}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>{prod.nombre_oficial}</Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>SKU: {prod.sku_interno}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 13, color: themeColors.primary, fontWeight: 'bold' }}>
                        Disponible: {displayStock} {unit}
                      </Text>
                    </View>

                    {/* Chips compactos si tiene varios estados */}
                    {multiState && (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
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
                      /* Si es multi-estado: botón para abrir selector modal */
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
                              gap: 4
                            }}
                            onPress={() => setStateModalProduct(prod)}
                          >
                            <Ionicons name="cart" size={14} color={themeColors.primary} />
                            <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 12 }}>
                              {numericQtyInCart} {unit}
                            </Text>
                            <Ionicons name="pencil" size={12} color={themeColors.primary} style={{ marginLeft: 2 }} />
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
                            gap: 4
                          }}
                          onPress={() => setStateModalProduct(prod)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={16} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>Seleccionar</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      /* Si es de estado único: stepper estándar rápido */
                      inCart ? (
                        <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
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
                            style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
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
                      )
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
              elevation: 6
            }}
            activeOpacity={0.9}
            onPress={() => setCartModalVisible(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cart" size={20} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 15 }}>
                {cart.length} {cart.length === 1 ? 'material en carrito' : 'materiales en carrito'} ({totalItems} total)
              </Text>
            </View>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
              Ver y Confirmar →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL DE CARRITO Y CONFIRMACIÓN */}
      <Modal statusBarTranslucent={true} visible={cartModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCartModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Confirmar Retiro de Material</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>Verifica materiales y datos de asignación</Text>
              </View>
              <TouchableOpacity onPress={() => setCartModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ padding: Spacing.three }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {cart.length === 0 ? (
                <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20 }}>No has seleccionado ningún material.</Text>
              ) : (
                <>
                  {/* SECCIÓN 1: MATERIALES */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.one }}>
                    Materiales a Retirar ({cart.length})
                  </Text>
                  <View style={{ backgroundColor: themeColors.background, borderRadius: 12, padding: Spacing.two, borderWidth: 1, borderColor: themeColors.border, marginBottom: Spacing.three }}>
                    {cart.map(item => {
                      const unit = getProductoUnidad(item.producto);
                      const multiState = hasMultipleStockStates(item.producto);
                      const stockNuevo = getStockNuevo(item.producto);
                      const stockUsado = item.producto.stock_usado || 0;
                      const stockPorRevisar = item.producto.stock_por_revisar || 0;

                      const qNuevo = typeof item.cantidad_nuevo === 'number' ? item.cantidad_nuevo : 0;
                      const qUsado = typeof item.cantidad_usado === 'number' ? item.cantidad_usado : 0;
                      const qPorRev = typeof item.cantidad_por_revisar === 'number' ? item.cantidad_por_revisar : 0;

                      return (
                        <View key={item.producto.id} style={[styles.cartItem, { borderBottomColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.text }}>{item.producto.nombre_oficial}</Text>
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                                SKU: {item.producto.sku_interno} • Total llevando: {item.cantidad} {unit}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => removeFromCart(item.producto.id)} style={{ padding: 4 }}>
                              <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                            </TouchableOpacity>
                          </View>

                          {multiState ? (
                            <View style={{ marginTop: 8, gap: 6, backgroundColor: themeColors.backgroundElement, padding: 8, borderRadius: 8 }}>
                              {/* Nuevas */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>🟢 Nuevas (Stock: {stockNuevo})</Text>
                                <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                  <TouchableOpacity
                                    style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                    onPress={() => updateCartStateQty(item.producto, 'nuevo', Math.max(0, qNuevo - 1))}
                                    disabled={qNuevo <= 0}
                                  >
                                    <Ionicons name="remove" size={12} color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary} />
                                  </TouchableOpacity>
                                  <TextInput
                                    style={[styles.stepperInput, { color: themeColors.text, height: 26, minWidth: 36, fontSize: 12 }]}
                                    value={String(item.cantidad_nuevo ?? 0)}
                                    keyboardType="decimal-pad"
                                    selectTextOnFocus
                                    onChangeText={(val) => updateCartStateQty(item.producto, 'nuevo', val === '' ? '' : (parseFloat(val) || 0))}
                                  />
                                  <TouchableOpacity
                                    style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                    onPress={() => updateCartStateQty(item.producto, 'nuevo', qNuevo + 1)}
                                    disabled={stockNuevo - qNuevo <= 0}
                                  >
                                    <Ionicons name="add" size={12} color={(stockNuevo - qNuevo) > 0 ? themeColors.primary : themeColors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              {/* Usadas */}
                              {stockUsado > 0 && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706' }}>🟡 Usadas (Stock: {stockUsado})</Text>
                                  <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                    <TouchableOpacity
                                      style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                      onPress={() => updateCartStateQty(item.producto, 'usado', Math.max(0, qUsado - 1))}
                                      disabled={qUsado <= 0}
                                    >
                                      <Ionicons name="remove" size={12} color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary} />
                                    </TouchableOpacity>
                                    <TextInput
                                      style={[styles.stepperInput, { color: themeColors.text, height: 26, minWidth: 36, fontSize: 12 }]}
                                      value={String(item.cantidad_usado ?? 0)}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                      onChangeText={(val) => updateCartStateQty(item.producto, 'usado', val === '' ? '' : (parseFloat(val) || 0))}
                                    />
                                    <TouchableOpacity
                                      style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                      onPress={() => updateCartStateQty(item.producto, 'usado', qUsado + 1)}
                                      disabled={stockUsado - qUsado <= 0}
                                    >
                                      <Ionicons name="add" size={12} color={(stockUsado - qUsado) > 0 ? themeColors.primary : themeColors.textSecondary} />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}

                              {/* Dañado / Incompleto */}
                              {stockPorRevisar > 0 && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>🔴 Dañado/Incompleto (Stock: {stockPorRevisar})</Text>
                                  <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                    <TouchableOpacity
                                      style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                                      onPress={() => updateCartStateQty(item.producto, 'por_revisar', Math.max(0, qPorRev - 1))}
                                      disabled={qPorRev <= 0}
                                    >
                                      <Ionicons name="remove" size={12} color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary} />
                                    </TouchableOpacity>
                                    <TextInput
                                      style={[styles.stepperInput, { color: themeColors.text, height: 26, minWidth: 36, fontSize: 12 }]}
                                      value={String(item.cantidad_por_revisar ?? 0)}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                      onChangeText={(val) => updateCartStateQty(item.producto, 'por_revisar', val === '' ? '' : (parseFloat(val) || 0))}
                                    />
                                    <TouchableOpacity
                                      style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                                      onPress={() => updateCartStateQty(item.producto, 'por_revisar', qPorRev + 1)}
                                      disabled={stockPorRevisar - qPorRev <= 0}
                                    >
                                      <Ionicons name="add" size={12} color={(stockPorRevisar - qPorRev) > 0 ? themeColors.primary : themeColors.textSecondary} />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                              <TextInput
                                style={[styles.qtyInput, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                                value={item.cantidad.toString()}
                                keyboardType="decimal-pad"
                                selectTextOnFocus
                                onChangeText={(val) => updateCartQty(item.producto.id, val)}
                              />
                              <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontWeight: '700' }}>{unit}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* SECCIÓN 2: CAMPOS DE ASIGNACIÓN */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
                    Detalles de Asignación y Destino
                  </Text>

                  {/* 1. Tipo de Gasto / Destino */}
                  <View style={{ marginBottom: Spacing.two }}>
                    <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '600', fontSize: 13 }}>
                      Tipo de Gasto / Destino *
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                      {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map(tipo => {
                        const isSelected = tipoGasto === tipo;
                        return (
                          <TouchableOpacity
                            key={tipo}
                            style={{
                              flex: 1,
                              paddingVertical: 10,
                              borderRadius: BorderRadius.medium,
                              borderWidth: 1.5,
                              borderColor: isSelected ? themeColors.primary : themeColors.border,
                              backgroundColor: isSelected ? themeColors.primary + '20' : themeColors.background,
                              alignItems: 'center'
                            }}
                            onPress={() => setTipoGasto(tipo)}
                          >
                            <Text style={{ color: isSelected ? themeColors.primary : themeColors.textSecondary, fontWeight: isSelected ? '700' : '500', fontSize: 13 }}>
                              {tipo}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* 3. Detalle de Servicio o Proyecto */}
                  <View style={{ marginBottom: Spacing.two }}>
                    <CustomInput
                      label="Detalle de Servicio o Proyecto *"
                      placeholder="Escribe el nombre o texto libre..."
                      value={detalleServicioProyecto}
                      onChangeText={setDetalleServicioProyecto}
                      iconName="briefcase-outline"
                    />
                  </View>

                  {/* Cliente Relacionado */}
                  <View style={[styles.customDropdownContainer, { marginBottom: Spacing.two }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowCliDropdown(!showCliDropdown);
                        setShowSucursalDropdown(false);
                      }}
                    >
                      <Ionicons name="person-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ flex: 1, color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                        {selectedCliente || 'Selecciona un cliente'}
                      </Text>
                      <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>

                    {showCliDropdown && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000, marginTop: 4 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                          <TextInput
                            placeholder="Buscar cliente..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={clienteSearch}
                            onChangeText={setClienteSearch}
                            style={[styles.textInput, { height: 38, marginBottom: 6, backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                            {clientes
                              .filter(cli => !clienteSearch || (cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase())))
                              .map(cli => (
                                <TouchableOpacity
                                  key={cli.id}
                                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                                  onPress={() => {
                                    setSelectedCliente(cli.nombre);
                                    setSelectedClienteId(cli.id);
                                    // Auto-seleccionar sucursal si sólo tiene una
                                    const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                                    if (cliSucs.length === 1) {
                                      setSucursal(cliSucs[0].nombre);
                                      setSelectedSucursalId(cliSucs[0].id);
                                    } else {
                                      setSucursal('');
                                      setSelectedSucursalId(null);
                                    }
                                    setClienteSearch('');
                                    setShowCliDropdown(false);
                                  }}
                                >
                                  <Text style={{ color: themeColors.text, fontWeight: '500' }}>{cli.nombre}</Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Sucursal del cliente */}
                  <View style={[styles.customDropdownContainer, { marginBottom: Spacing.two }]}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del cliente *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border, opacity: !selectedCliente ? 0.6 : 1 }]}
                      disabled={!selectedCliente}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowSucursalDropdown(!showSucursalDropdown);
                        setShowCliDropdown(false);
                      }}
                    >
                      <Ionicons name="location-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ flex: 1, color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                        {sucursal || (selectedCliente ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
                      </Text>
                      <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>

                    {showSucursalDropdown && selectedCliente && (
                      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000, marginTop: 4 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                          <TextInput
                            placeholder="Buscar sucursal..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            style={[styles.textInput, { height: 38, marginBottom: 6, backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                          />
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                            <TouchableOpacity
                              style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                              onPress={() => {
                                setSucursal('');
                                setSelectedSucursalId(null);
                                setShowSucursalDropdown(false);
                              }}
                            >
                              <Text style={{ color: themeColors.danger, fontWeight: '600' }}>Sin sucursal (Dejar en blanco)</Text>
                            </TouchableOpacity>
                            {(() => {
                              const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase());
                              const filteredSucs = currentCliente ? sucursalesCliente.filter(s => s.cliente_id === currentCliente.id && (!sucursalSearch || s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase()))) : [];
                              
                              return filteredSucs.map(suc => (
                                <TouchableOpacity
                                  key={suc.id}
                                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                                  onPress={() => {
                                    setSucursal(suc.nombre);
                                    setSelectedSucursalId(suc.id);
                                    setSucursalSearch('');
                                    setShowSucursalDropdown(false);
                                  }}
                                >
                                  <Text style={{ color: themeColors.text, fontWeight: '500' }}>{suc.nombre}</Text>
                                </TouchableOpacity>
                              ));
                            })()}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>

                  {/* Motivo o Referencia del Retiro */}
                  <View style={{ marginBottom: Spacing.four, marginTop: Spacing.one }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, marginBottom: Spacing.half }}>
                      Motivo o Referencia del Retiro *
                    </Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="Ej. Proyecto Alpha, Reparación torre norte, Mantenimiento..."
                      placeholderTextColor={themeColors.textSecondary}
                      value={motivoRetiro}
                      onChangeText={setMotivoRetiro}
                    />
                  </View>
                </>
              )}
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <CustomButton
                title="Cerrar"
                variant="secondary"
                onPress={() => setCartModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.one }}
              />
              <CustomButton
                title="Confirmar Retiro"
                variant="primary"
                onPress={handleConfirmarRetiro}
                loading={isSubmitting}
                style={{ flex: 2 }}
                disabled={cart.length === 0}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL SELECTOR DE CANTIDADES POR ESTADO */}
      <Modal statusBarTranslucent={true} visible={stateModalProduct !== null} animationType="fade" transparent={true} onRequestClose={() => setStateModalProduct(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, maxHeight: '80%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>Seleccionar Cantidades por Estado</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  {stateModalProduct?.nombre_oficial}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStateModalProduct(null)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {stateModalProduct && (() => {
              const prod = stateModalProduct;
              const unit = getProductoUnidad(prod);
              const cartItem = cart.find(c => c.producto.id === prod.id);
              const stockNuevo = getStockNuevo(prod);
              const stockUsado = prod.stock_usado || 0;
              const stockPorRevisar = prod.stock_por_revisar || 0;

              const qNuevo = typeof cartItem?.cantidad_nuevo === 'number' ? cartItem.cantidad_nuevo : 0;
              const qUsado = typeof cartItem?.cantidad_usado === 'number' ? cartItem.cantidad_usado : 0;
              const qPorRev = typeof cartItem?.cantidad_por_revisar === 'number' ? cartItem.cantidad_por_revisar : 0;
              const totalLlevando = typeof cartItem?.cantidad === 'number' ? cartItem.cantidad : 0;

              return (
                <View style={{ padding: Spacing.three }}>
                  <View style={{ marginBottom: 12, backgroundColor: themeColors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>SKU: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{prod.sku_interno}</Text></Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>Stock Total Disponible: <Text style={{ color: themeColors.primary, fontWeight: 'bold' }}>{prod.stock_actual} {unit}</Text></Text>
                  </View>

                  <View style={{ gap: 10 }}>
                    {/* Nuevas */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: themeColors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>🟢 Nuevas</Text>
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                          Disponibles: {stockNuevo} {unit}
                        </Text>
                      </View>
                      <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                          onPress={() => updateCartStateQty(prod, 'nuevo', Math.max(0, qNuevo - 1))}
                          disabled={qNuevo <= 0}
                        >
                          <Ionicons name="remove" size={16} color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary} />
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.stepperInput, { color: themeColors.text }]}
                          value={String(cartItem?.cantidad_nuevo !== undefined ? cartItem.cantidad_nuevo : 0)}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          onChangeText={(val) => updateCartStateQty(prod, 'nuevo', val === '' ? '' : (parseFloat(val) || 0))}
                        />
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                          onPress={() => updateCartStateQty(prod, 'nuevo', qNuevo + 1)}
                          disabled={stockNuevo - qNuevo <= 0}
                        >
                          <Ionicons name="add" size={16} color={(stockNuevo - qNuevo) > 0 ? themeColors.primary : themeColors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Usadas */}
                    {stockUsado > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: themeColors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>🟡 Usadas</Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                            Disponibles: {stockUsado} {unit}
                          </Text>
                        </View>
                        <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                            onPress={() => updateCartStateQty(prod, 'usado', Math.max(0, qUsado - 1))}
                            disabled={qUsado <= 0}
                          >
                            <Ionicons name="remove" size={16} color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary} />
                          </TouchableOpacity>
                          <TextInput
                            style={[styles.stepperInput, { color: themeColors.text }]}
                            value={String(cartItem?.cantidad_usado !== undefined ? cartItem.cantidad_usado : 0)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            onChangeText={(val) => updateCartStateQty(prod, 'usado', val === '' ? '' : (parseFloat(val) || 0))}
                          />
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                            onPress={() => updateCartStateQty(prod, 'usado', qUsado + 1)}
                            disabled={stockUsado - qUsado <= 0}
                          >
                            <Ionicons name="add" size={16} color={(stockUsado - qUsado) > 0 ? themeColors.primary : themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Dañado / Incompleto */}
                    {stockPorRevisar > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: themeColors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>🔴 Dañado / Incompleto</Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                            Disponibles: {stockPorRevisar} {unit}
                          </Text>
                        </View>
                        <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                            onPress={() => updateCartStateQty(prod, 'por_revisar', Math.max(0, qPorRev - 1))}
                            disabled={qPorRev <= 0}
                          >
                            <Ionicons name="remove" size={16} color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary} />
                          </TouchableOpacity>
                          <TextInput
                            style={[styles.stepperInput, { color: themeColors.text }]}
                            value={String(cartItem?.cantidad_por_revisar !== undefined ? cartItem.cantidad_por_revisar : 0)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            onChangeText={(val) => updateCartStateQty(prod, 'por_revisar', val === '' ? '' : (parseFloat(val) || 0))}
                          />
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                            onPress={() => updateCartStateQty(prod, 'por_revisar', qPorRev + 1)}
                            disabled={stockPorRevisar - qPorRev <= 0}
                          >
                            <Ionicons name="add" size={16} color={(stockPorRevisar - qPorRev) > 0 ? themeColors.primary : themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.textSecondary }}>Total seleccionado:</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.primary }}>{totalLlevando} {unit}</Text>
                  </View>
                </View>
              );
            })()}

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              {cart.some(c => c.producto.id === stateModalProduct?.id) && (
                <CustomButton
                  title="Quitar todo"
                  variant="danger"
                  onPress={() => {
                    if (stateModalProduct) removeFromCart(stateModalProduct.id);
                    setStateModalProduct(null);
                  }}
                  style={{ flex: 1, marginRight: Spacing.one }}
                />
              )}
              <CustomButton
                title="Listo"
                variant="primary"
                onPress={() => setStateModalProduct(null)}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperInput: {
    minWidth: 44,
    height: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.three,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  qtyInput: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 50,
    height: 36,
    textAlign: 'center',
    marginRight: 6,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  customDropdownContainer: {
    marginBottom: Spacing.two,
    position: 'relative',
  },
  dropdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
});
