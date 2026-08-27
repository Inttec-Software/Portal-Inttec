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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';

interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  stock_actual: number;
}

interface CartItem {
  producto: Producto;
  cantidad: number;
}

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

      const { data, error } = await supabase
        .from('productos')
        .select('id, sku_interno, nombre_oficial, stock_actual')
        .eq('activo', true)
        .gt('stock_actual', 0)
        .order('nombre_oficial');

      if (error) throw error;
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
    setCart(prev => {
      const existing = prev.find(item => item.producto.id === producto.id);
      if (existing) {
        if (existing.cantidad + qty > producto.stock_actual) {
          Alert.alert('Stock Insuficiente', `Solo hay ${producto.stock_actual} unidades disponibles.`);
          return prev;
        }
        return prev.map(item => item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + qty } : item);
      }
      return [...prev, { producto, cantidad: qty }];
    });
  };

  const removeFromCart = (productoId: string) => {
    setCart(prev => prev.filter(item => item.producto.id !== productoId));
  };

  const updateCartQty = (productoId: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty) || qty <= 0) {
      removeFromCart(productoId);
      return;
    }
    setCart(prev => prev.map(item => {
      if (item.producto.id === productoId) {
        if (qty > item.producto.stock_actual) {
          Alert.alert('Stock Insuficiente', `Solo hay ${item.producto.stock_actual} unidades disponibles.`);
          return { ...item, cantidad: item.producto.stock_actual };
        }
        return { ...item, cantidad: qty };
      }
      return item;
    }));
  };

  const handleConfirmarRetiro = async () => {
    if (cart.length === 0) return;
    if (!currentUser) return;
    if (!motivoRetiro.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un motivo o referencia para el retiro.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Registrar en movimientos_inventario y descontar stock
      for (const item of cart) {
        const prod = productos.find(p => p.id === item.producto.id);
        if (!prod) continue;
        
        const newStock = prod.stock_actual - item.cantidad;

        // 1. Descontar del inventario
        const { error: stockErr } = await supabase
          .from('productos')
          .update({ stock_actual: newStock })
          .eq('id', item.producto.id);

        if (stockErr) throw stockErr;

        // 2. Registrar movimiento de salida
        const { error: moveErr } = await supabase
          .from('movimientos_inventario')
          .insert([
            {
              producto_id: item.producto.id,
              tipo: 'SALIDA',
              cantidad: item.cantidad,
              folio_factura: `RETIRO: ${motivoRetiro.trim()}`,
              creado_por: currentUser.id,
            },
          ]);

        if (moveErr) {
          console.warn('No se pudo registrar histórico:', moveErr.message);
        }

        // 3. Agregar al inventario del empleado
        const { data: invEmp, error: invErr1 } = await supabase
          .from('inventario_empleados')
          .select('id, cantidad_disponible')
          .eq('empleado_id', currentUser.id)
          .eq('producto_id', item.producto.id)
          .maybeSingle();

        if (invEmp) {
          await supabase
            .from('inventario_empleados')
            .update({ cantidad_disponible: invEmp.cantidad_disponible + item.cantidad, updated_at: new Date().toISOString() })
            .eq('id', invEmp.id);
        } else {
          await supabase
            .from('inventario_empleados')
            .insert([{
              empleado_id: currentUser.id,
              producto_id: item.producto.id,
              cantidad_disponible: item.cantidad
            }]);
        }
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

  const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0);

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
            filteredProductos.map(prod => (
              <View key={prod.id} style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.text }}>{prod.nombre_oficial}</Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }}>SKU: {prod.sku_interno}</Text>
                  <Text style={{ fontSize: 14, color: themeColors.primary, fontWeight: 'bold', marginTop: 4 }}>Disponible: {prod.stock_actual}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => addToCart(prod)}
                >
                  <Ionicons name="add" size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
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
                  {cart.map(item => (
                    <View key={item.producto.id} style={[styles.cartItem, { borderBottomColor: themeColors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>{item.producto.nombre_oficial}</Text>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>SKU: {item.producto.sku_interno} (Máx: {item.producto.stock_actual})</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[styles.qtyInput, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                          value={item.cantidad.toString()}
                          keyboardType="numeric"
                          onChangeText={(val) => updateCartQty(item.producto.id, val)}
                        />
                        <TouchableOpacity onPress={() => removeFromCart(item.producto.id)} style={{ padding: 8 }}>
                          <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
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
    marginLeft: Spacing.two,
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
    width: 50,
    height: 36,
    textAlign: 'center',
    marginRight: 8,
    fontWeight: 'bold',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  }
});
