import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, StyleSheet, Platform, KeyboardAvoidingView, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from './CustomButton';
import { normalizeText } from '@/utils/helpers';

export interface ProductoInventario {
  id: string; // producto_id
  sku_interno: string;
  nombre_oficial: string;
  stock_actual: number;
  unidad?: string;
  empleadoId?: string;
  empleadoNombre?: string;
  esMio?: boolean;
}

export interface MaterialUsado {
  productoId: string;
  nombre: string;
  retirado: number;
  usado: number;
  sobrante: number;
  unidad?: string;
  empleadoId?: string;
  empleadoNombre?: string;
}

interface MaterialesSelectorProps {
  productos: ProductoInventario[];
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
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('TODOS');
  
  // Variables locales para cuando seleccionan un producto
  const [selectedProduct, setSelectedProduct] = useState<ProductoInventario | null>(null);
  const [usado, setUsado] = useState('');

  const handleToggle = (val: boolean) => {
    if (onToggleUsaMateriales) {
      onToggleUsaMateriales(val);
    }
    if (!val && materiales.length > 0) {
      onChange([]);
    }
  };

  // Extraer lista única de propietarios para las pestañas de filtro
  const ownerFilters = useMemo(() => {
    const owners = new Map<string, string>();
    productos.forEach(p => {
      const id = p.empleadoId || 'propio';
      const name = p.esMio ? 'Mi Inventario' : (p.empleadoNombre || 'Colaborador');
      owners.set(id, name);
    });
    return Array.from(owners.entries());
  }, [productos]);

  const normQuery = normalizeText(searchQuery);
  const filteredProductos = useMemo(() => {
    return productos.filter(p => {
      // Filtro por propietario si hay varios
      if (selectedOwnerFilter !== 'TODOS') {
        const pOwnerId = p.empleadoId || 'propio';
        if (pOwnerId !== selectedOwnerFilter) return false;
      }
      if (!normQuery) return true;
      return (
        normalizeText(p.nombre_oficial).includes(normQuery) ||
        normalizeText(p.sku_interno).includes(normQuery) ||
        (p.empleadoNombre && normalizeText(p.empleadoNombre).includes(normQuery))
      );
    });
  }, [productos, selectedOwnerFilter, normQuery]);

  const handleIncrement = () => {
    if (!selectedProduct) return;
    const current = parseFloat(usado) || 0;
    const maxStock = Number(selectedProduct.stock_actual) || 0;
    const nextVal = Math.min(maxStock, Math.round((current + 1) * 100) / 100);
    setUsado(nextVal.toString());
  };

  const handleDecrement = () => {
    if (!selectedProduct) return;
    const current = parseFloat(usado) || 0;
    const nextVal = Math.max(1, Math.round((current - 1) * 100) / 100);
    setUsado(nextVal.toString());
  };

  const handleSetMax = () => {
    if (!selectedProduct) return;
    setUsado(selectedProduct.stock_actual.toString());
  };

  const handleAddMaterial = () => {
    if (!selectedProduct) return;
    
    const numRetirado = Number(selectedProduct.stock_actual) || 0;
    const numUsado = parseFloat(usado);

    if (isNaN(numUsado) || numUsado <= 0) {
      Alert.alert('Validación', 'Ingresa una cantidad válida de material usado mayor a 0.');
      return;
    }
    if (numUsado > numRetirado) {
      Alert.alert('Validación', `El material usado (${numUsado}) no puede ser mayor al stock disponible (${numRetirado}).`);
      return;
    }

    const calculatedSobrante = Math.max(0, Math.round((numRetirado - numUsado) * 100) / 100);

    const nuevoMaterial: MaterialUsado = {
      productoId: selectedProduct.id,
      nombre: selectedProduct.nombre_oficial,
      retirado: numRetirado,
      usado: numUsado,
      sobrante: calculatedSobrante,
      unidad: selectedProduct.unidad || 'pza',
      empleadoId: selectedProduct.empleadoId,
      empleadoNombre: selectedProduct.empleadoNombre,
    };

    // Validar si ya existe el mismo producto para el mismo propietario
    const existe = materiales.find(
      m => m.productoId === selectedProduct.id && (m.empleadoId || '') === (selectedProduct.empleadoId || '')
    );
    if (existe) {
      Alert.alert('Aviso', 'Este material de este inventario ya está en la lista. Si deseas modificarlo, elimínalo y vuelve a agregarlo.');
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

  const handleRemoveMaterial = (index: number) => {
    const updated = materiales.filter((_, i) => i !== index);
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                      <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 14, flex: 1 }}>{m.nombre}</Text>
                      {m.empleadoNombre ? (
                        <View style={[styles.ownerTag, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary + '30' }]}>
                          <Ionicons name="person-outline" size={11} color={themeColors.primary} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.primary }}>{m.empleadoNombre}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Stock: {m.retirado} {m.unidad || 'pza'}</Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Usado: {m.usado} {m.unidad || 'pza'}</Text>
                      <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '700' }}>Sobrante: {m.sobrante} {m.unidad || 'pza'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveMaterial(idx)} style={{ padding: 4, marginLeft: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <CustomButton
            title="Agregar Material del Inventario"
            variant="secondary"
            onPress={() => {
              setSelectedOwnerFilter('TODOS');
              setSearchQuery('');
              setModalVisible(true);
            }}
            icon={<Ionicons name="add" size={18} color={themeColors.primary} style={{ marginRight: 8 }} />}
          />
        </View>
      )}

      <Modal 
        statusBarTranslucent={true} 
        visible={modalVisible} 
        animationType="fade" 
        transparent={true} 
        onRequestClose={() => {
          setModalVisible(false);
          setSelectedProduct(null);
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, borderWidth: 1, borderColor: themeColors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Seleccionar Material</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setSelectedProduct(null);
              }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {!selectedProduct ? (
              <View style={{ flex: 1, padding: Spacing.three }}>
                {/* Filtro por propietario si hay colaboradores */}
                {ownerFilters.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.two, maxHeight: 36 }}>
                    <TouchableOpacity
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: selectedOwnerFilter === 'TODOS' ? themeColors.primary : themeColors.background,
                          borderColor: selectedOwnerFilter === 'TODOS' ? themeColors.primary : themeColors.border,
                        },
                      ]}
                      onPress={() => setSelectedOwnerFilter('TODOS')}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selectedOwnerFilter === 'TODOS' ? '#fff' : themeColors.text },
                        ]}
                      >
                        Todos ({productos.length})
                      </Text>
                    </TouchableOpacity>

                    {ownerFilters.map(([id, name]) => {
                      const count = productos.filter(p => (p.empleadoId || 'propio') === id).length;
                      const isSelected = selectedOwnerFilter === id;
                      return (
                        <TouchableOpacity
                          key={id}
                          style={[
                            styles.filterChip,
                            {
                              backgroundColor: isSelected ? themeColors.primary : themeColors.background,
                              borderColor: isSelected ? themeColors.primary : themeColors.border,
                            },
                          ]}
                          onPress={() => setSelectedOwnerFilter(id)}
                        >
                          <Ionicons
                            name={id === 'propio' ? 'person' : 'people'}
                            size={12}
                            color={isSelected ? '#fff' : themeColors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              { color: isSelected ? '#fff' : themeColors.text },
                            ]}
                          >
                            {name} ({count})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

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
                    <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                      No se encontraron productos disponibles.
                    </Text>
                  ) : (
                    filteredProductos.slice(0, 60).map((prod, pIdx) => {
                      const stockNum = Number(prod.stock_actual) || 0;
                      const isOutOfStock = stockNum <= 0;
                      return (
                        <TouchableOpacity
                          key={`${prod.id}_${prod.empleadoId || 'propio'}_${pIdx}`}
                          style={[
                            styles.productItem, 
                            { 
                              borderBottomColor: themeColors.border,
                              opacity: isOutOfStock ? 0.45 : 1,
                            }
                          ]}
                          onPress={() => {
                            if (isOutOfStock) {
                              Alert.alert('Material Agotado', 'No queda stock disponible de este material en este reporte (ya fue utilizado en otros trabajos).');
                              return;
                            }
                            setSelectedProduct(prod);
                            const initialQty = Math.min(1, Number(prod.stock_actual) || 1);
                            setUsado(initialQty.toString());
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text, flex: 1 }}>
                              {prod.nombre_oficial}
                            </Text>
                            {prod.empleadoNombre && (
                              <View style={[styles.ownerTag, { backgroundColor: prod.esMio ? themeColors.primary + '15' : '#e67e2215', borderColor: prod.esMio ? themeColors.primary + '30' : '#e67e2240' }]}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: prod.esMio ? themeColors.primary : '#e67e22' }}>
                                  {prod.esMio ? '👤 Mío' : `👥 ${prod.empleadoNombre}`}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            SKU: {prod.sku_interno} | Stock Disponible: <Text style={{ fontWeight: '700', color: isOutOfStock ? '#ef4444' : themeColors.primary }}>{prod.stock_actual} {prod.unidad || 'pza'} {isOutOfStock ? '(Agotado en reporte)' : ''}</Text>
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={{ padding: Spacing.three }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 17, fontWeight: 'bold', color: themeColors.text, marginBottom: 4 }}>
                  {selectedProduct.nombre_oficial}
                </Text>
                
                {selectedProduct.empleadoNombre && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.two }}>
                    <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                    <Text style={{ fontSize: 13, color: themeColors.primary, fontWeight: '600' }}>
                      Inventario de: {selectedProduct.esMio ? 'Mi stock personal' : selectedProduct.empleadoNombre}
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: Spacing.three }}>
                  Stock Disponible: <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>{selectedProduct.stock_actual} {selectedProduct.unidad || 'pza'}</Text>
                </Text>
                
                {/* Control Stepper Moderno */}
                <View style={{ marginBottom: Spacing.three }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one }}>
                    <Text style={[styles.label, { color: themeColors.text, marginBottom: 0 }]}>
                      Cantidad Usada ({selectedProduct.unidad || 'pza'}) *
                    </Text>
                    <TouchableOpacity 
                      onPress={handleSetMax}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: BorderRadius.small,
                        backgroundColor: themeColors.primary + '18',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                        Usar Todo ({selectedProduct.stock_actual})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Stepper: [-] [ Input ] [+] */}
                  <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleDecrement}
                      disabled={(parseFloat(usado) || 0) <= 1}
                      style={[
                        styles.stepperBtn,
                        {
                          backgroundColor: (parseFloat(usado) || 0) <= 1 ? themeColors.border + '25' : '#ef444415',
                        }
                      ]}
                    >
                      <Ionicons 
                        name="remove" 
                        size={24} 
                        color={(parseFloat(usado) || 0) <= 1 ? themeColors.textSecondary : '#ef4444'} 
                      />
                    </TouchableOpacity>

                    <TextInput
                      style={[styles.stepperInput, { color: themeColors.text }]}
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
                      placeholder="1"
                      placeholderTextColor={themeColors.textSecondary}
                      textAlign="center"
                    />

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleIncrement}
                      disabled={(parseFloat(usado) || 0) >= selectedProduct.stock_actual}
                      style={[
                        styles.stepperBtn,
                        {
                          backgroundColor: (parseFloat(usado) || 0) >= selectedProduct.stock_actual ? themeColors.border + '25' : themeColors.primary + '20',
                        }
                      ]}
                    >
                      <Ionicons 
                        name="add" 
                        size={24} 
                        color={(parseFloat(usado) || 0) >= selectedProduct.stock_actual ? themeColors.textSecondary : themeColors.primary} 
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Botones de selección rápida (Presets) */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.two, flexWrap: 'wrap' }}>
                    {[1, 2, 5, 10, 20].map(val => {
                      if (val > selectedProduct.stock_actual) return null;
                      const isSelected = usado === val.toString();
                      return (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setUsado(val.toString())}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: BorderRadius.small,
                            backgroundColor: isSelected ? themeColors.primary : themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: isSelected ? themeColors.primary : themeColors.border,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : themeColors.text }}>
                            {val} {selectedProduct.unidad || 'pza'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
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
  ownerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalContent: {
    width: '100%',
    maxWidth: 540,
    borderRadius: BorderRadius.large,
    maxHeight: '82%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
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
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: BorderRadius.medium,
    padding: 4,
    height: 54,
  },
  stepperBtn: {
    width: 46,
    height: 44,
    borderRadius: BorderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 4,
  },
});

