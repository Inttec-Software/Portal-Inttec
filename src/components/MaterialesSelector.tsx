import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, StyleSheet, Platform, KeyboardAvoidingView, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from './CustomButton';

interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  stock_actual: number;
  unidad?: string;
}

interface MaterialUsado {
  productoId: string;
  nombre: string;
  retirado: number;
  usado: number;
  sobrante: number;
  unidad?: string;
}

interface MaterialesSelectorProps {
  productos: Producto[];
  materiales: MaterialUsado[];
  usaMateriales?: boolean;
  onToggleUsaMateriales?: (val: boolean) => void;
  onChange: (materiales: MaterialUsado[]) => void;
}

export default function MaterialesSelector({
  productos,
  materiales,
  usaMateriales,
  onToggleUsaMateriales,
  onChange,
}: MaterialesSelectorProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const isEnabled = typeof usaMateriales === 'boolean' 
    ? usaMateriales 
    : (materiales.length > 0);

  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Variables locales para cuando seleccionan un producto
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [usado, setUsado] = useState('');

  const handleToggle = (val: boolean) => {
    if (onToggleUsaMateriales) {
      onToggleUsaMateriales(val);
    }
    if (!val && materiales.length > 0) {
      onChange([]);
    }
  };

  const filteredProductos = productos.filter(p => 
    p.nombre_oficial.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku_interno.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddMaterial = () => {
    if (!selectedProduct) return;
    
    const numRetirado = Number(selectedProduct.stock_actual) || 0;
    const numUsado = parseFloat(usado);

    if (isNaN(numUsado) || numUsado <= 0) {
      Alert.alert('Validación', 'Ingresa una cantidad válida de material usado mayor a 0.');
      return;
    }
    if (numUsado > numRetirado) {
      Alert.alert('Validación', `El material usado (${numUsado}) no puede ser mayor al retirado (${numRetirado}).`);
      return;
    }

    const calculatedSobrante = Math.max(0, Math.round((numRetirado - numUsado) * 100) / 100);

    const nuevoMaterial: MaterialUsado = {
      productoId: selectedProduct.id,
      nombre: selectedProduct.nombre_oficial,
      retirado: numRetirado,
      usado: numUsado,
      sobrante: calculatedSobrante,
      unidad: selectedProduct.unidad || 'pza'
    };

    // Validar si ya existe
    const existe = materiales.find(m => m.productoId === selectedProduct.id);
    if (existe) {
      Alert.alert('Aviso', 'Este material ya está en la lista. Si deseas modificarlo, elimínalo y vuelve a agregarlo.');
      return;
    }

    if (onToggleUsaMateriales && !isEnabled) {
      onToggleUsaMateriales(true);
    }

    onChange([...materiales, nuevoMaterial]);
    setSelectedProduct(null);
    setUsado('');
    setModalVisible(false);
  };

  const handleRemoveMaterial = (id: string) => {
    const updated = materiales.filter(m => m.productoId !== id);
    onChange(updated);
  };

  const parsedUsado = parseFloat(usado);
  const calculatedSobrante = selectedProduct 
    ? (!isNaN(parsedUsado) ? Math.max(0, Math.round((Number(selectedProduct.stock_actual) - parsedUsado) * 100) / 100) : selectedProduct.stock_actual)
    : 0;

  return (
    <View style={styles.container}>
      {/* Switch de activación de materiales */}
      <View style={[styles.switchCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10, marginRight: 8 }}>
          <View style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: isEnabled ? (themeColors.primary + '20') : (scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons
              name={isEnabled ? "cube" : "cube-outline"}
              size={18}
              color={isEnabled ? themeColors.primary : themeColors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
              ¿Se usó material en este trabajo?
            </Text>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
              {isEnabled ? 'Registra los materiales retirados y utilizados.' : 'No se utilizó material (Mano de obra / Revisión).'}
            </Text>
          </View>
        </View>

        <Switch
          value={isEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: scheme === 'dark' ? '#3e3e3e' : '#e0e0e0', true: themeColors.primary + '80' }}
          thumbColor={isEnabled ? themeColors.primary : '#f4f3f4'}
        />
      </View>

      {!isEnabled ? (
        <View style={[styles.noMaterialBadge, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: themeColors.border }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={themeColors.success} />
          <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '500' }}>
            Sin uso de materiales para este trabajo.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: Spacing.two }}>
          <Text style={[styles.label, { color: themeColors.text }]}>Materiales Retirados y Usados</Text>

          {materiales.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                No has agregado materiales a este trabajo.
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: Spacing.two }}>
              {materiales.map((m, idx) => (
                <View key={idx} style={[styles.materialItem, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 14 }}>{m.nombre}</Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Retirado: {m.retirado} {m.unidad || 'pza'}</Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Usado: {m.usado} {m.unidad || 'pza'}</Text>
                      <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '700' }}>Sobrante: {m.sobrante} {m.unidad || 'pza'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveMaterial(m.productoId)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <CustomButton
            title="Agregar Material del Inventario"
            variant="secondary"
            onPress={() => setModalVisible(true)}
            icon={<Ionicons name="add" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />}
          />
        </View>
      )}

      <Modal statusBarTranslucent={true} visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Seleccionar Material</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setSelectedProduct(null);
              }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {!selectedProduct ? (
              <View style={{ flex: 1, padding: Spacing.three }}>
                <View style={[styles.searchContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Ionicons name="search" size={20} color={themeColors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder="Buscar producto por nombre o SKU..."
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

                <ScrollView style={{ marginTop: Spacing.two }} keyboardShouldPersistTaps="handled">
                  {filteredProductos.length === 0 ? (
                    <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20 }}>No se encontraron productos.</Text>
                  ) : (
                    filteredProductos.slice(0, 50).map(prod => (
                      <TouchableOpacity
                        key={prod.id}
                        style={[styles.productItem, { borderBottomColor: themeColors.border }]}
                        onPress={() => setSelectedProduct(prod)}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>{prod.nombre_oficial}</Text>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>SKU: {prod.sku_interno} | Stock: {prod.stock_actual} {prod.unidad || 'pza'}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={{ padding: Spacing.three }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text, marginBottom: Spacing.two }}>
                  {selectedProduct.nombre_oficial}
                </Text>
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: Spacing.two }}>
                  Stock Disponible: <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>{selectedProduct.stock_actual} {selectedProduct.unidad || 'pza'}</Text>
                </Text>
                
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: themeColors.text }]}>Cantidad Usada ({selectedProduct.unidad || 'pza'}) *</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                      keyboardType="decimal-pad"
                      value={usado}
                      onChangeText={(val) => {
                        const cleanVal = val.replace(/[^0-9.]/g, '');
                        const num = parseFloat(cleanVal);
                        if (!isNaN(num) && num > selectedProduct.stock_actual) {
                          setUsado(selectedProduct.stock_actual.toString());
                        } else {
                          setUsado(cleanVal);
                        }
                      }}
                      placeholder="0"
                    />
                  </View>
                </View>

                <View style={{ backgroundColor: themeColors.primary + '10', padding: Spacing.three, borderRadius: BorderRadius.medium, marginBottom: Spacing.four }}>
                  <Text style={{ color: themeColors.text, fontSize: 14 }}>
                    Sobrante Calculado: <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>
                      {calculatedSobrante} {selectedProduct.unidad || 'pza'}
                    </Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <CustomButton
                    title="Atrás"
                    variant="secondary"
                    onPress={() => {
                      setSelectedProduct(null);
                      setUsado('');
                    }}
                    style={{ flex: 1 }}
                  />
                  <CustomButton
                    title="Confirmar"
                    variant="primary"
                    onPress={handleAddMaterial}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.three,
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  noMaterialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    marginTop: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  materialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.one,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
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
  productItem: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: 12,
    fontSize: 15,
  }
});

