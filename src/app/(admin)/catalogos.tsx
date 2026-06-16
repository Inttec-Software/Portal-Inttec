import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, CatalogoItem, SubcategoriaItem } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CatalogosManager() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [categorias, setCategorias] = useState<CatalogoItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaItem[]>([]);
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCatalog, setActiveCatalog] = useState<'categorias' | 'subcategorias' | 'clientes'>('categorias');

  // Modales de Inserción
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [selectedParentCatId, setSelectedParentCatId] = useState('');
  const [showParentCatDropdown, setShowParentCatDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modales de Edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editParentCatId, setEditParentCatId] = useState('');
  const [showEditParentCatDropdown, setShowEditParentCatDropdown] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [catRes, subRes, cliRes] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre'),
        supabase.from('subcategorias').select('*').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
      ]);

      if (catRes.error) throw catRes.error;
      if (subRes.error) throw subRes.error;
      if (cliRes.error) throw cliRes.error;

      setCategorias(catRes.data || []);
      setSubcategorias(subRes.data || []);
      setClientes(cliRes.data || []);
    } catch (err: any) {
      console.error('Error loading catalogs data:', err);
      Alert.alert('Error', err.message || 'No se pudieron recuperar los catálogos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un nombre.');
      return;
    }

    if (activeCatalog === 'subcategorias' && !selectedParentCatId) {
      Alert.alert('Validación', 'Por favor selecciona la Categoría Padre.');
      return;
    }

    setIsSaving(true);
    try {
      if (activeCatalog === 'categorias') {
        const { error } = await supabase.from('categorias').insert([{ nombre: newItemName.trim() }]);
        if (error) throw error;
      } else if (activeCatalog === 'clientes') {
        const { error } = await supabase.from('clientes').insert([{ nombre: newItemName.trim() }]);
        if (error) throw error;
      } else if (activeCatalog === 'subcategorias') {
        const { error } = await supabase.from('subcategorias').insert([
          {
            nombre: newItemName.trim(),
            categoria_id: selectedParentCatId,
          },
        ]);
        if (error) throw error;
      }

      Alert.alert('Éxito', 'Elemento añadido al catálogo correctamente.');
      setAddModalVisible(false);
      setNewItemName('');
      setSelectedParentCatId('');
      setShowParentCatDropdown(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el nuevo elemento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string, table: 'categorias' | 'subcategorias' | 'clientes') => {
    Alert.alert(
      'Confirmar Eliminación',
      '¿Estás seguro de que deseas eliminar este elemento? Esto podría afectar a los gastos ya registrados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const { error } = await supabase.from(table).delete().eq('id', id);
              if (error) throw error;
              Alert.alert('Éxito', 'Elemento eliminado.');
              await loadData();
            } catch (err: any) {
              Alert.alert('Error al eliminar', err.message || 'No se pudo realizar la operación.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenEditItem = (item: any) => {
    setEditingItem(item);
    setEditItemName(item.nombre);
    if (activeCatalog === 'subcategorias') {
      setEditParentCatId(item.categoria_id || '');
    } else {
      setEditParentCatId('');
    }
    setShowEditParentCatDropdown(false);
    setEditModalVisible(true);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    if (!editItemName.trim()) {
      Alert.alert('Validación', 'Por favor ingresa un nombre.');
      return;
    }

    if (activeCatalog === 'subcategorias' && !editParentCatId) {
      Alert.alert('Validación', 'Por favor selecciona la Categoría Padre.');
      return;
    }

    setIsUpdating(true);
    try {
      if (activeCatalog === 'categorias') {
        const { error } = await supabase
          .from('categorias')
          .update({ nombre: editItemName.trim() })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else if (activeCatalog === 'clientes') {
        const { error } = await supabase
          .from('clientes')
          .update({ nombre: editItemName.trim() })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else if (activeCatalog === 'subcategorias') {
        const { error } = await supabase
          .from('subcategorias')
          .update({
            nombre: editItemName.trim(),
            categoria_id: editParentCatId,
          })
          .eq('id', editingItem.id);
        if (error) throw error;
      }

      Alert.alert('Éxito', 'Elemento actualizado correctamente.');
      setEditModalVisible(false);
      setEditingItem(null);
      setEditItemName('');
      setEditParentCatId('');
      setShowEditParentCatDropdown(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el elemento.');
    } finally {
      setIsUpdating(false);
    }
  };

  const parentCatName = categorias.find((c) => c.id === selectedParentCatId)?.nombre;
  const editParentCatName = categorias.find((c) => c.id === editParentCatId)?.nombre;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Catálogos</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Catalog Selectors */}
      <View style={styles.selectorsContainer}>
        <TouchableOpacity
          onPress={() => setActiveCatalog('categorias')}
          style={[
            styles.selectorBtn,
            activeCatalog === 'categorias'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.selectorText, { color: activeCatalog === 'categorias' ? '#ffffff' : themeColors.textSecondary }]}>
            Categorías
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveCatalog('subcategorias')}
          style={[
            styles.selectorBtn,
            activeCatalog === 'subcategorias'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.selectorText, { color: activeCatalog === 'subcategorias' ? '#ffffff' : themeColors.textSecondary }]}>
            Subcategorías
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveCatalog('clientes')}
          style={[
            styles.selectorBtn,
            activeCatalog === 'clientes'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.selectorText, { color: activeCatalog === 'clientes' ? '#ffffff' : themeColors.textSecondary }]}>
            Clientes
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando catálogo...</Text>
        </View>
      ) : (
        <FlatList
          data={
            activeCatalog === 'categorias'
              ? categorias
              : activeCatalog === 'clientes'
              ? clientes
              : (subcategorias as any[])
          }
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            let subtext = '';
            if (activeCatalog === 'subcategorias') {
              const cat = categorias.find((c) => c.id === item.categoria_id);
              subtext = cat ? `Categoría: ${cat.nombre}` : 'Categoría huérfana';
            }

            return (
              <View style={[styles.listItem, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemText, { color: themeColors.text }]}>{item.nombre}</Text>
                  {subtext ? <Text style={[styles.itemSubtext, { color: themeColors.textSecondary }]}>{subtext}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => handleOpenEditItem(item)}>
                    <Ionicons name="create-outline" size={20} color={themeColors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteItem(item.id, activeCatalog)}>
                    <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="albums-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No hay elementos en este catálogo.
              </Text>
            </View>
          }
          refreshing={isLoading}
          onRefresh={loadData}
        />
      )}

      {/* FAB - Agregar elemento */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setAddModalVisible(true)}
        style={[styles.fab, { backgroundColor: themeColors.accent }]}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Modal para Agregar Elemento */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Agregar a {activeCatalog === 'categorias' ? 'Categorías' : activeCatalog === 'clientes' ? 'Clientes' : 'Subcategorías'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setAddModalVisible(false);
                  setNewItemName('');
                  setSelectedParentCatId('');
                  setShowParentCatDropdown(false);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.three }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre del Elemento *"
                placeholder="Ej. Papelería, Walmart, etc."
                value={newItemName}
                onChangeText={setNewItemName}
                iconName="bookmark-outline"
              />

              {/* Lógica condicional para Subcategoría (pedir Categoría Padre) */}
              {activeCatalog === 'subcategorias' && (
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría Padre *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => setShowParentCatDropdown(!showParentCatDropdown)}
                  >
                    <Text style={{ color: selectedParentCatId ? themeColors.text : themeColors.textSecondary }}>
                      {parentCatName || 'Selecciona categoría padre'}
                    </Text>
                    <Ionicons name={showParentCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showParentCatDropdown && (
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {categorias.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setSelectedParentCatId(cat.id);
                              setShowParentCatDropdown(false);
                            }}
                          >
                            <Text style={{ color: themeColors.text }}>{cat.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <CustomButton
                title="Guardar Elemento"
                onPress={handleAddItem}
                loading={isSaving}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal para Editar Elemento */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingItem(null);
          setEditItemName('');
          setEditParentCatId('');
          setShowEditParentCatDropdown(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Editar en {activeCatalog === 'categorias' ? 'Categorías' : activeCatalog === 'clientes' ? 'Clientes' : 'Subcategorías'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingItem(null);
                  setEditItemName('');
                  setEditParentCatId('');
                  setShowEditParentCatDropdown(false);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.three }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre del Elemento *"
                placeholder="Ej. Papelería, Walmart, etc."
                value={editItemName}
                onChangeText={setEditItemName}
                iconName="bookmark-outline"
              />

              {/* Lógica condicional para Subcategoría (pedir Categoría Padre) */}
              {activeCatalog === 'subcategorias' && (
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría Padre *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => setShowEditParentCatDropdown(!showEditParentCatDropdown)}
                  >
                    <Text style={{ color: editParentCatId ? themeColors.text : themeColors.textSecondary }}>
                      {editParentCatName || 'Selecciona categoría padre'}
                    </Text>
                    <Ionicons name={showEditParentCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showEditParentCatDropdown && (
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {categorias.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setEditParentCatId(cat.id);
                              setShowEditParentCatDropdown(false);
                            }}
                          >
                            <Text style={{ color: themeColors.text }}>{cat.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <CustomButton
                title="Guardar Cambios"
                onPress={handleUpdateItem}
                loading={isUpdating}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  backBtn: {
    padding: Spacing.one,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  selectorsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  selectorBtn: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    borderColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorActive: {
    backgroundColor: '#0d1b2a',
    borderColor: '#0d1b2a',
  },
  selectorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.seven,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  itemSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.seven,
    gap: Spacing.two,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    padding: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  customDropdownContainer: {
    marginBottom: Spacing.two,
    position: 'relative',
    zIndex: 10,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.half,
  },
  dropdownTrigger: {
    height: 50,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  dropdownList: {
    marginTop: Spacing.one,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    maxHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownItem: {
    padding: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
});
