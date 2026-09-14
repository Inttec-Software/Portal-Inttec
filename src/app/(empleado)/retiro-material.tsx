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
  Modal
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, AuthService, Usuario } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';

interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  stock_actual: number;
  unidad?: string;
}

interface CartItem {
  producto: Producto;
  cantidad: number | '';
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
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProductos = productos.filter(p => 
    p.nombre_oficial.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku_interno.toLowerCase().includes(searchQuery.toLowerCase())
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
        return prev.map(item => item.producto.id === producto.id ? { ...item, cantidad: newQty } : item);
      }
      return [...prev, { producto, cantidad: qty }];
    });
  };

  const removeFromCart = (productoId: string) => {
    setCart(prev => prev.filter(item => item.producto.id !== productoId));
  };

  const updateCartQty = (productoId: string, qtyStr: string) => {
    if (qtyStr.trim() === '') {
      setCart(prev => prev.map(item => item.producto.id === productoId ? { ...item, cantidad: '' } : item));
      return;
    }

    const cleanVal = qtyStr.replace(/[^0-9.]/g, '');
    const qty = parseFloat(cleanVal);
    if (qty === 0) {
      removeFromCart(productoId);
      return;
    }

    if (isNaN(qty) || qty < 0) {
      return;
    }

    setCart(prev => prev.map(item => {
      if (item.producto.id === productoId) {
        const unit = getProductoUnidad(item.producto);
        if (qty > item.producto.stock_actual) {
          Alert.alert('Stock Insuficiente', `Solo hay ${item.producto.stock_actual} ${unit} disponibles.`);
          return { ...item, cantidad: item.producto.stock_actual };
        }
        return { ...item, cantidad: qty };
      }
      return item;
    }));
  };

  const handleConfirmarRetiro = async () => {
    const validCart = cart.filter(item => typeof item.cantidad === 'number' && item.cantidad > 0);
    if (validCart.length === 0) {
      Alert.alert('Validación', 'El carrito está vacío o tiene cantidades inválidas.');
      return;
    }
    if (!currentUser) return;
    if (!motivoRetiro.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un motivo o referencia para el retiro.');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/retiro-material/confirmar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cart: validCart,
          motivoRetiro,
          currentUser
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al procesar el retiro en el servidor');
      }

      Alert.alert('Éxito', 'Material retirado correctamente.');
      setCart([]);
      setMotivoRetiro('');
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
      <View style={{ padding: Spacing.three, backgroundColor: themeColors.backgroundElement, borderBottomWidth: 1, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.searchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border, flex: 1 }]}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Buscar material o SKU..."
            placeholderTextColor={themeColors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={{ marginLeft: Spacing.three, position: 'relative' }}
          onPress={() => setCartModalVisible(true)}
        >
          <Ionicons name="cart-outline" size={28} color={themeColors.primary} />
          {totalItems > 0 && (
            <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: themeColors.danger, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{totalItems}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text, marginBottom: Spacing.two }}>Catálogo Disponible</Text>
          {filteredProductos.length === 0 ? (
            <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 40 }}>No se encontraron materiales en stock.</Text>
          ) : (
            filteredProductos.map(prod => {
              const cartItem = cart.find(c => c.producto.id === prod.id);
              const qtyInCart = cartItem && typeof cartItem.cantidad === 'number' ? cartItem.cantidad : (cartItem && cartItem.cantidad === '' ? '' : 0);
              const numericQtyInCart = typeof qtyInCart === 'number' ? qtyInCart : 0;
              const displayStock = Math.max(0, Math.round((prod.stock_actual - numericQtyInCart) * 100) / 100);
              const unit = getProductoUnidad(prod);
              const inCart = numericQtyInCart > 0 || qtyInCart === '';

              return (
                <View
                  key={prod.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: themeColors.backgroundElement,
                      borderColor: inCart ? themeColors.primary : themeColors.border,
                      borderWidth: inCart ? 1.5 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>{prod.nombre_oficial}</Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 3 }}>SKU: {prod.sku_interno}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 13, color: themeColors.primary, fontWeight: 'bold' }}>
                        Disponible: {displayStock} {unit}
                      </Text>
                      {numericQtyInCart > 0 && (
                        <View style={{ backgroundColor: themeColors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="cart" size={13} color={themeColors.primary} style={{ marginRight: 4 }} />
                          <Text style={{ fontSize: 12, color: themeColors.primary, fontWeight: '800' }}>
                            Llevas: {numericQtyInCart} {unit}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {inCart ? (
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
                {cart.length} {cart.length === 1 ? 'material en carrito' : 'materiales en carrito'}
              </Text>
            </View>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
              Ver y Confirmar →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL DE CARRITO */}
      <Modal statusBarTranslucent={true} visible={cartModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCartModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Tu Material Seleccionado</Text>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ padding: Spacing.three }}>
              {cart.length === 0 ? (
                <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20 }}>No has seleccionado ningún material.</Text>
              ) : (
                <>
                  {cart.map(item => {
                    const unit = getProductoUnidad(item.producto);
                    return (
                      <View key={item.producto.id} style={[styles.cartItem, { borderBottomColor: themeColors.border }]}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>{item.producto.nombre_oficial}</Text>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            SKU: {item.producto.sku_interno} (Máx: {item.producto.stock_actual} {unit})
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput
                            style={[styles.qtyInput, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                            value={item.cantidad.toString()}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            onChangeText={(val) => updateCartQty(item.producto.id, val)}
                          />
                          <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontWeight: '700', marginRight: 8 }}>{unit}</Text>
                          <TouchableOpacity onPress={() => removeFromCart(item.producto.id)} style={{ padding: 6 }}>
                            <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ marginTop: Spacing.four }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.text, marginBottom: Spacing.one }}>Motivo o Referencia del Retiro *</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="Ej. Proyecto Alpha, Uso general..."
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
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
    maxHeight: '90%',
    minHeight: '50%',
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
    padding: 12,
    fontSize: 14,
  }
});
