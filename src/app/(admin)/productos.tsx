import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, TextInput, Alert, useWindowDimensions, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import CustomInput from '@/components/CustomInput';

export default function ProductosScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  
  const [productos, setProductos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [nombre, setNombre] = useState('');
  const [sku, setSku] = useState('');
  const [precio, setPrecio] = useState('');
  const [satCode, setSatCode] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: catData } = await supabase.from('categorias_productos').select('*');
      if (catData) setCategorias(catData);

      const { data: prodData, error } = await supabase
        .from('productos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProductos(prodData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const filteredProductos = productos.filter(p => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (p.nombre_oficial && p.nombre_oficial.toLowerCase().includes(query)) ||
      (p.sku_interno && p.sku_interno.toLowerCase().includes(query)) ||
      (p.clave_facturacion && p.clave_facturacion.toLowerCase().includes(query))
    );
  });

  const formatearMoneda = (cantidad: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(cantidad || 0);
  };

  const openModal = (product: any = null) => {
    setEditingProduct(product);
    if (product) {
      setNombre(product.nombre_oficial);
      setSku(product.sku_interno);
      setPrecio(product.precio_unitario?.toString() || '0');
      setSatCode(product.clave_facturacion || '');
      setCategoriaId(product.categoria_id || (categorias.length > 0 ? categorias[0].id : ''));
    } else {
      setNombre('');
      setSku(`SKU-${Date.now().toString().slice(-6)}`);
      setPrecio('');
      setSatCode('');
      setCategoriaId(categorias.length > 0 ? categorias[0].id : '');
    }
    setModalVisible(true);
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    if (!nombre.trim() || !sku.trim()) {
      showAlert('Error', 'El nombre y SKU son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      let finalCatId = categoriaId;
      // Crear categoria genérica si no existe
      if (!finalCatId) {
        const { data: newCat, error: errCat } = await supabase.from('categorias_productos').insert({ nombre: 'General' }).select('id').single();
        if (errCat) throw errCat;
        finalCatId = newCat.id;
      }

      const payload = {
        nombre_oficial: nombre.trim(),
        sku_interno: sku.trim(),
        precio_unitario: parseFloat(precio) || 0,
        clave_facturacion: satCode.trim() || null,
        categoria_id: finalCatId,
        activo: true
      };

      if (editingProduct) {
        const { error } = await supabase.from('productos').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
        showAlert('Éxito', 'Producto actualizado.');
      } else {
        const { error } = await supabase.from('productos').insert([payload]);
        if (error) throw error;
        showAlert('Éxito', 'Producto creado.');
      }
      
      setModalVisible(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving product:', error);
      showAlert('Error', error.message || 'No se pudo guardar el producto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que deseas eliminar este producto?')) {
        executeDelete(id);
      }
    } else {
      Alert.alert(
        'Eliminar Producto',
        '¿Estás seguro de que deseas eliminar este producto?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => executeDelete(id) }
        ]
      );
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('productos').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      console.error('Error delete prod:', err);
      showAlert('Error', err.message || 'No se pudo eliminar.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* HEADER */}
        <View style={[styles.header, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: Spacing.two }}>
              <Ionicons name="arrow-back" size={24} color={themeColors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Catálogo de Productos</Text>
          </View>
          <TouchableOpacity onPress={() => openModal()} style={[styles.newBtn, { backgroundColor: themeColors.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
            {isDesktop && <Text style={styles.newBtnText}>Nuevo Producto</Text>}
          </TouchableOpacity>
        </View>

        {/* BUSCADOR */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="search" size={20} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Buscar por nombre, SKU o código SAT..."
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
        </View>

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: Spacing.three, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {filteredProductos.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  {searchQuery ? 'No se encontraron productos.' : 'No hay productos registrados.'}
                </Text>
              </View>
            ) : (
              filteredProductos.map((prod) => (
                <View key={prod.id} style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prodName, { color: themeColors.text }]}>{prod.nombre_oficial}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <View style={[styles.badge, { backgroundColor: themeColors.background }]}>
                          <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>SKU: {prod.sku_interno}</Text>
                        </View>
                        {prod.clave_facturacion && (
                          <View style={[styles.badge, { backgroundColor: themeColors.primary + '20' }]}>
                            <Text style={{ fontSize: 10, color: themeColors.primary, fontWeight: 'bold' }}>SAT: {prod.clave_facturacion}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.priceText, { color: themeColors.text }]}>{formatearMoneda(prod.precio_unitario)}</Text>
                    </View>
                  </View>

                  <View style={[styles.actionsRow, { borderTopColor: themeColors.border + '50' }]}>
                    <TouchableOpacity onPress={() => openModal(prod)} style={styles.actionBtn}>
                      <Ionicons name="pencil-outline" size={16} color={themeColors.primary} />
                      <Text style={[styles.actionText, { color: themeColors.primary }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(prod.id)} style={styles.actionBtn}>
                      <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                      <Text style={[styles.actionText, { color: themeColors.danger }]}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* MODAL CREAR/EDITAR PRODUCTO */}
        <Modal statusBarTranslucent={true}
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, width: isDesktop ? 500 : '90%' }]}>
              <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: Spacing.three }} contentContainerStyle={{ gap: Spacing.two }}>
                <CustomInput
                  label="Nombre del Producto"
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Ej. Cilindro Hidráulico"
                />
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="SKU Interno"
                      value={sku}
                      onChangeText={setSku}
                      placeholder="SKU-XXXX"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="Precio Unitario"
                      value={precio}
                      onChangeText={setPrecio}
                      keyboardType="numeric"
                      placeholder="0.00"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="Código SAT (Clave Facturación)"
                      value={satCode}
                      onChangeText={setSatCode}
                      placeholder="Ej. 43211500"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="Precio con IVA (16%)"
                      value={formatearMoneda((parseFloat(precio) || 0) * 1.16)}
                      editable={false}
                      style={{ backgroundColor: themeColors.background }}
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
                <TouchableOpacity 
                  style={[styles.modalBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border, borderWidth: 1 }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalBtn, { backgroundColor: themeColors.primary }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.medium,
  },
  newBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  searchWrapper: {
    padding: Spacing.three,
  },
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
    padding: Spacing.three,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  prodName: { fontSize: 16, fontWeight: 'bold' },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceText: { fontSize: 16, fontWeight: 'bold' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: Spacing.three,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  }
});
