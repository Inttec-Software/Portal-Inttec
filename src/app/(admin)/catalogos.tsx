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
  Pressable,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, CatalogoItem, SubcategoriaItem, ClienteItem, ProveedorItem } from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export default function CatalogosManager() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;

  const [categorias, setCategorias] = useState<CatalogoItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaItem[]>([]);
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCatalog, setActiveCatalog] = useState<'categorias' | 'subcategorias' | 'clientes' | 'proveedores'>('categorias');

  // Modales de Inserción
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [selectedParentCatId, setSelectedParentCatId] = useState('');
  const [showParentCatDropdown, setShowParentCatDropdown] = useState(false);
  const [newClientRfc, setNewClientRfc] = useState('');
  const [newClientCorreo, setNewClientCorreo] = useState('');
  const [newClientDireccion, setNewClientDireccion] = useState('');
  const [newClientCp, setNewClientCp] = useState('');
  const [newProveedorRfc, setNewProveedorRfc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modales de Edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editParentCatId, setEditParentCatId] = useState('');
  const [showEditParentCatDropdown, setShowEditParentCatDropdown] = useState(false);
  const [editClientRfc, setEditClientRfc] = useState('');
  const [editClientCorreo, setEditClientCorreo] = useState('');
  const [editClientDireccion, setEditClientDireccion] = useState('');
  const [editClientCp, setEditClientCp] = useState('');
  const [editProveedorRfc, setEditProveedorRfc] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Search and Sucursales
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [proveedorSearchQuery, setProveedorSearchQuery] = useState('');
  const [subcatSearchQuery, setSubcatSearchQuery] = useState('');
  const [subcatFilterParentCatId, setSubcatFilterParentCatId] = useState('');
  const [sucursalesModalVisible, setSucursalesModalVisible] = useState(false);
  const [selectedClientForSucursales, setSelectedClientForSucursales] = useState<ClienteItem | null>(null);
  const [clientSucursales, setClientSucursales] = useState<any[]>([]);
  const [newSucursalName, setNewSucursalName] = useState('');
  const [isSavingSucursal, setIsSavingSucursal] = useState(false);
  const [isLoadingSucursales, setIsLoadingSucursales] = useState(false);

  // Summary Modal
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [selectedClientForSummary, setSelectedClientForSummary] = useState<ClienteItem | null>(null);
  const [clientStats, setClientStats] = useState({ totalGastos: 0, montoGastos: 0, totalVentas: 0, montoVentas: 0, rentabilidad: 0, margen: 0 });
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [catRes, subRes, cliRes, provRes] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre'),
        supabase.from('subcategorias').select('*').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
      ]);

      if (catRes.error) throw catRes.error;
      if (subRes.error) throw subRes.error;
      if (cliRes.error) throw cliRes.error;
      if (provRes.error) throw provRes.error;

      setCategorias(catRes.data || []);
      setSubcategorias(subRes.data || []);
      setClientes(cliRes.data || []);
      setProveedores(provRes.data || []);
    } catch (err: any) {
      console.error('Error loading catalogs data:', err);
      Alert.alert('Error', err.message || 'No se pudieron recuperar los catálogos.');
    } finally {
      setIsLoading(false);
    }
  }

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
        await CatalogService.crearCategoria({ nombre: newItemName.trim() });
      } else if (activeCatalog === 'clientes') {
        await CatalogService.crearCliente({
          nombre: newItemName.trim(),
          rfc: newClientRfc.trim().toUpperCase() || null,
          correo_electronico: newClientCorreo.trim().toLowerCase() || null,
          direccion: newClientDireccion.trim() || null,
          codigo_postal: newClientCp.trim() || null,
        });
      } else if (activeCatalog === 'proveedores') {
        await CatalogService.crearProveedor({
          nombre: newItemName.trim(),
          rfc: newProveedorRfc.trim().toUpperCase() || null,
        });
      } else if (activeCatalog === 'subcategorias') {
        await CatalogService.crearSubcategoria({
          nombre: newItemName.trim(),
          categoria_id: selectedParentCatId,
        });
      }

      Alert.alert('Éxito', 'Elemento añadido al catálogo correctamente.');
      setAddModalVisible(false);
      setNewItemName('');
      setSelectedParentCatId('');
      setShowParentCatDropdown(false);
      setNewClientRfc('');
      setNewClientCorreo('');
      setNewClientDireccion('');
      setNewClientCp('');
      setNewProveedorRfc('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el nuevo elemento.');
    } finally {
      setIsSaving(false);
    }
  };

  const ejecutarEliminacionItem = async (id: string, table: 'categorias' | 'subcategorias' | 'clientes' | 'proveedores') => {
    setIsLoading(true);
    try {
      if (table === 'categorias') await CatalogService.eliminarCategoria(id);
      else if (table === 'subcategorias') await CatalogService.eliminarSubcategoria(id);
      else if (table === 'clientes') await CatalogService.eliminarCliente(id);
      else if (table === 'proveedores') await CatalogService.eliminarProveedor(id);
      Alert.alert('Éxito', 'Elemento eliminado.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error al eliminar', err.message || 'No se pudo realizar la operación.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (id: string, table: 'categorias' | 'subcategorias' | 'clientes' | 'proveedores') => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Estás seguro de que deseas eliminar este elemento? Esto podría afectar a los gastos ya registrados.');
      if (confirmed) {
        ejecutarEliminacionItem(id, table);
      }
    } else {
      Alert.alert(
        'Confirmar Eliminación',
        '¿Estás seguro de que deseas eliminar este elemento? Esto podría afectar a los gastos ya registrados.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => ejecutarEliminacionItem(id, table),
          },
        ]
      );
    }
  };

  const handleOpenEditItem = (item: any) => {
    setEditingItem(item);
    setEditItemName(item.nombre);
    if (activeCatalog === 'subcategorias') {
      setEditParentCatId(item.categoria_id || '');
    } else if (activeCatalog === 'clientes') {
      setEditClientRfc(item.rfc || '');
      setEditClientCorreo(item.correo_electronico || '');
      setEditClientDireccion(item.direccion || '');
      setEditClientCp(item.codigo_postal || '');
    } else if (activeCatalog === 'proveedores') {
      setEditProveedorRfc(item.rfc || '');
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
        await CatalogService.actualizarCategoria(editingItem.id, { nombre: editItemName.trim() });
      } else if (activeCatalog === 'clientes') {
        await CatalogService.actualizarCliente(editingItem.id, {
          nombre: editItemName.trim(),
          rfc: editClientRfc.trim().toUpperCase() || null,
          correo_electronico: editClientCorreo.trim().toLowerCase() || null,
          direccion: editClientDireccion.trim() || null,
          codigo_postal: editClientCp.trim() || null,
        });
      } else if (activeCatalog === 'proveedores') {
        await CatalogService.actualizarProveedor(editingItem.id, {
          nombre: editItemName.trim(),
          rfc: editProveedorRfc.trim().toUpperCase() || null,
        });
      } else if (activeCatalog === 'subcategorias') {
        await CatalogService.actualizarSubcategoria(editingItem.id, {
          nombre: editItemName.trim(),
          categoria_id: editParentCatId,
        });
      }

      Alert.alert('Éxito', 'Elemento actualizado correctamente.');
      setEditModalVisible(false);
      setEditingItem(null);
      setEditItemName('');
      setEditParentCatId('');
      setEditProveedorRfc('');
      setShowEditParentCatDropdown(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el elemento.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenSummary = async (cliente: ClienteItem) => {
    setSelectedClientForSummary(cliente);
    setSummaryModalVisible(true);
    setIsLoadingSummary(true);
    setClientStats({ totalGastos: 0, montoGastos: 0, totalVentas: 0, montoVentas: 0, rentabilidad: 0, margen: 0 });

    try {
      const [gastosRes, ventasRes] = await Promise.all([
        supabase.from('gastos').select('monto').eq('cliente_id', cliente.id).neq('status', 'REJECTED'),
        supabase.from('ventas').select('precio_total_facturado, costo_total').eq('cliente', cliente.nombre)
      ]);

      const gastosData = gastosRes.data || [];
      const ventasData = ventasRes.data || [];

      const totalGastos = gastosData.length;
      const montoGastos = gastosData.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);

      const totalVentas = ventasData.length;
      const montoVentas = ventasData.reduce((sum, v) => sum + (Number(v.precio_total_facturado) || Number(v.costo_total) || 0), 0);
      const rentabilidad = montoVentas - montoGastos;
      const margen = montoVentas > 0 ? (rentabilidad / montoVentas) * 100 : 0;

      setClientStats({
        totalGastos,
        montoGastos,
        totalVentas,
        montoVentas,
        rentabilidad,
        margen
      });
    } catch (err: any) {
      console.error('Error fetching client stats', err);
      Alert.alert('Error', 'No se pudieron cargar las estadísticas del cliente.');
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleOpenSucursales = async (cliente: ClienteItem) => {
    setSelectedClientForSucursales(cliente);
    setSucursalesModalVisible(true);
    await loadClientSucursales(cliente.id);
  };

  const loadClientSucursales = async (clienteId: string) => {
    setIsLoadingSucursales(true);
    try {
      const { data, error } = await supabase
        .from('sucursales_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('nombre');
      if (error) throw error;
      setClientSucursales(data || []);
    } catch (err: any) {
      console.error('Error fetching sucursales:', err);
      Alert.alert('Error', err.message || 'No se pudieron cargar las sucursales.');
    } finally {
      setIsLoadingSucursales(false);
    }
  };

  const handleAddSucursal = async () => {
    if (!newSucursalName.trim() || !selectedClientForSucursales) return;
    setIsSavingSucursal(true);
    try {
      await CatalogService.crearSucursal({
        cliente_id: selectedClientForSucursales.id,
        nombre: newSucursalName.trim(),
      });
      setNewSucursalName('');
      await loadClientSucursales(selectedClientForSucursales.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar la sucursal.');
    } finally {
      setIsSavingSucursal(false);
    }
  };

  const handleDeleteSucursal = async (id: string) => {
    try {
      await CatalogService.eliminarSucursal(id);
      if (selectedClientForSucursales) {
        await loadClientSucursales(selectedClientForSucursales.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo eliminar la sucursal.');
    }
  };

  const parentCatName = categorias.find((c) => c.id === selectedParentCatId)?.nombre;
  const editParentCatName = categorias.find((c) => c.id === editParentCatId)?.nombre;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
      <View style={isDesktop ? { maxWidth: 800, width: '100%', alignSelf: 'center', flex: 1, paddingHorizontal: Spacing.two } : { flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Catálogos de Empresa</Text>
          <TouchableOpacity
            onPress={() => {
              if (activeCatalog === 'subcategorias' && subcatFilterParentCatId) {
                setSelectedParentCatId(subcatFilterParentCatId);
              }
              setAddModalVisible(true);
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: themeColors.accent,
              borderRadius: 15,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="add" size={16} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>Agregar</Text>
          </TouchableOpacity>
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
        <TouchableOpacity
          onPress={() => setActiveCatalog('proveedores')}
          style={[
            styles.selectorBtn,
            activeCatalog === 'proveedores'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text style={[styles.selectorText, { color: activeCatalog === 'proveedores' ? '#ffffff' : themeColors.textSecondary }]}>
            Proveedores
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Clientes */}
      {activeCatalog === 'clientes' && (
        <View style={{ paddingHorizontal: Spacing.four, paddingBottom: Spacing.two }}>
          <CustomInput
            placeholder="Buscar cliente por nombre..."
            value={clientSearchQuery}
            onChangeText={setClientSearchQuery}
            iconName="search-outline"
          />
        </View>
      )}

      {/* Search Proveedores */}
      {activeCatalog === 'proveedores' && (
        <View style={{ paddingHorizontal: Spacing.four, paddingBottom: Spacing.two }}>
          <CustomInput
            placeholder="Buscar proveedor por nombre o RFC..."
            value={proveedorSearchQuery}
            onChangeText={setProveedorSearchQuery}
            iconName="search-outline"
          />
        </View>
      )}

      {/* Filter and Search for Subcategorías */}
      {activeCatalog === 'subcategorias' && (
        <View style={{ gap: Spacing.one, paddingBottom: Spacing.two }}>
          {/* Buscador de subcategorías */}
          <View style={{ paddingHorizontal: Spacing.four }}>
            <CustomInput
              placeholder="Buscar subcategoría por nombre..."
              value={subcatSearchQuery}
              onChangeText={setSubcatSearchQuery}
              iconName="search-outline"
            />
          </View>

          {/* Filtro de Categoría Padre (Chips horizontales) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.four, gap: Spacing.one, alignItems: 'center', paddingVertical: 4 }}
          >
            <TouchableOpacity
              onPress={() => setSubcatFilterParentCatId('')}
              style={[
                styles.filterChip,
                !subcatFilterParentCatId
                  ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                  : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <Ionicons
                name="layers-outline"
                size={14}
                color={!subcatFilterParentCatId ? '#ffffff' : themeColors.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: !subcatFilterParentCatId ? '#ffffff' : themeColors.text },
                ]}
              >
                Todas ({subcategorias.length})
              </Text>
            </TouchableOpacity>

            {categorias.map((cat) => {
              const count = subcategorias.filter((s) => s.categoria_id === cat.id).length;
              const isSelected = subcatFilterParentCatId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSubcatFilterParentCatId(isSelected ? '' : cat.id)}
                  style={[
                    styles.filterChip,
                    isSelected
                      ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                      : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                  ]}
                >
                  <Ionicons
                    name="folder-outline"
                    size={14}
                    color={isSelected ? '#ffffff' : themeColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isSelected ? '#ffffff' : themeColors.text },
                    ]}
                  >
                    {cat.nombre} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando catálogo...</Text>
        </View>
      ) : (
        <FlatList scrollEnabled={false}
          data={
            activeCatalog === 'categorias'
              ? categorias
              : activeCatalog === 'clientes'
              ? clientes.filter(c => c.nombre.toLowerCase().includes(clientSearchQuery.toLowerCase()))
              : activeCatalog === 'proveedores'
              ? proveedores.filter(p => 
                  p.nombre.toLowerCase().includes(proveedorSearchQuery.toLowerCase()) || 
                  (p.rfc && p.rfc.toLowerCase().includes(proveedorSearchQuery.toLowerCase()))
                )
              : subcategorias.filter(s => {
                  const matchesCat = !subcatFilterParentCatId || s.categoria_id === subcatFilterParentCatId;
                  const matchesSearch = !subcatSearchQuery.trim() || s.nombre.toLowerCase().includes(subcatSearchQuery.toLowerCase());
                  return matchesCat && matchesSearch;
                })
          }
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            let subtext = '';
            let catObj: CatalogoItem | undefined;
            if (activeCatalog === 'subcategorias') {
              const subItem = item as SubcategoriaItem;
              catObj = categorias.find((c) => c.id === subItem.categoria_id);
              subtext = catObj ? catObj.nombre : 'Categoría huérfana';
            } else if (activeCatalog === 'clientes') {
              const cli = item as ClienteItem;
              const parts: string[] = [];
              if (cli.rfc) parts.push(`RFC: ${cli.rfc}`);
              if (cli.correo_electronico) parts.push(`Email: ${cli.correo_electronico}`);
              if (cli.direccion) parts.push(`Dir: ${cli.direccion}`);
              if (cli.codigo_postal) parts.push(`CP: ${cli.codigo_postal}`);
              subtext = parts.join(' • ');
            } else if (activeCatalog === 'proveedores') {
              const prov = item as ProveedorItem;
              subtext = prov.rfc ? `RFC: ${prov.rfc}` : 'Sin RFC';
            }

            return (
              <View style={[styles.listItem, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemText, { color: themeColors.text }]}>{item.nombre}</Text>
                  {activeCatalog === 'subcategorias' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="folder-outline" size={13} color={themeColors.accent} />
                      <Text style={[styles.itemSubtext, { color: themeColors.textSecondary, marginTop: 0 }]}>
                        {subtext}
                      </Text>
                    </View>
                  ) : subtext ? (
                    <Text style={[styles.itemSubtext, { color: themeColors.textSecondary }]}>{subtext}</Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
                  {activeCatalog === 'clientes' && (
                    <>
                      <TouchableOpacity onPress={() => handleOpenSummary(item as ClienteItem)}>
                        <Ionicons name="stats-chart-outline" size={20} color={themeColors.success || '#28a745'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleOpenSucursales(item as ClienteItem)}>
                        <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                      </TouchableOpacity>
                    </>
                  )}
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
      {!isDesktop && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (activeCatalog === 'subcategorias' && subcatFilterParentCatId) {
              setSelectedParentCatId(subcatFilterParentCatId);
            }
            setAddModalVisible(true);
          }}
          style={[styles.fab, { backgroundColor: themeColors.accent }]}
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      </View>

      {/* Modal para Agregar Elemento */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={[styles.modalOverlay, isDesktop && { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }, isDesktop ? { width: 480, borderRadius: BorderRadius.large, height: 'auto', maxHeight: '90%', padding: Spacing.four } : { height: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Agregar a {activeCatalog === 'categorias' ? 'Categorías' : activeCatalog === 'clientes' ? 'Clientes' : activeCatalog === 'proveedores' ? 'Proveedores' : 'Subcategorías'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setAddModalVisible(false);
                  setNewItemName('');
                  setSelectedParentCatId('');
                  setShowParentCatDropdown(false);
                  setNewClientRfc('');
                  setNewClientCorreo('');
                  setNewClientDireccion('');
                  setNewClientCp('');
                  setNewProveedorRfc('');
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.three }} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => setShowParentCatDropdown(false)}
                style={{ flex: 1, gap: Spacing.three }}
              >
                <CustomInput
                  label={activeCatalog === 'clientes' ? "Nombre / Razón Social *" : activeCatalog === 'proveedores' ? "Nombre del Proveedor *" : "Nombre del Elemento *"}
                  placeholder={activeCatalog === 'clientes' ? "Ej. Empresa S.A. de C.V." : activeCatalog === 'proveedores' ? "Ej. Papelería Lumen, OXXO, etc." : "Ej. Papelería, Walmart, etc."}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  iconName={activeCatalog === 'proveedores' ? "business-outline" : "bookmark-outline"}
                />

                {activeCatalog === 'proveedores' && (
                  <CustomInput
                    label="RFC (Opcional)"
                    placeholder="Ej. LUM951010AB1"
                    value={newProveedorRfc}
                    onChangeText={setNewProveedorRfc}
                    autoCapitalize="characters"
                    iconName="card-outline"
                  />
                )}

                {activeCatalog === 'clientes' && (
                  <>
                    <CustomInput
                      label="RFC"
                      placeholder="Ej. ABC123456T10"
                      value={newClientRfc}
                      onChangeText={setNewClientRfc}
                      autoCapitalize="characters"
                      iconName="card-outline"
                    />
                    <CustomInput
                      label="Correo Electrónico"
                      placeholder="ejemplo@cliente.com"
                      value={newClientCorreo}
                      onChangeText={setNewClientCorreo}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      iconName="mail-outline"
                    />
                    <CustomInput
                      label="Dirección / Domicilio Fiscal"
                      placeholder="Calle, Número, Colonia, Ciudad"
                      value={newClientDireccion}
                      onChangeText={setNewClientDireccion}
                      iconName="location-outline"
                    />
                    <CustomInput
                      label="Código Postal"
                      placeholder="Ej. 31000"
                      value={newClientCp}
                      onChangeText={setNewClientCp}
                      keyboardType="numeric"
                      iconName="navigate-outline"
                    />
                  </>
                )}

                {/* Lógica condicional para Subcategoría (pedir Categoría Padre) */}
                {activeCatalog === 'subcategorias' && (
                  <View style={styles.customDropdownContainer}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría Padre *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowParentCatDropdown(!showParentCatDropdown);
                      }}
                    >
                      <Text style={{ color: selectedParentCatId ? themeColors.text : themeColors.textSecondary }}>
                        {parentCatName || 'Selecciona categoría padre'}
                      </Text>
                      <Ionicons name={showParentCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showParentCatDropdown && (
                      <View style={{ width: '100%', zIndex: 1000 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                            {categorias.map((cat, index, array) => (
                              <TouchableOpacity
                                key={cat.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setSelectedParentCatId(cat.id);
                                  setShowParentCatDropdown(false);
                                }}
                              >
                                <Ionicons name="folder-open-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cat.nombre}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
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
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal para Editar Elemento */}
      <Modal
        animationType="fade"
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
        <View style={[styles.modalOverlay, isDesktop && { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }, isDesktop ? { width: 480, borderRadius: BorderRadius.large, height: 'auto', maxHeight: '90%', padding: Spacing.four } : { height: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Editar en {activeCatalog === 'categorias' ? 'Categorías' : activeCatalog === 'clientes' ? 'Clientes' : activeCatalog === 'proveedores' ? 'Proveedores' : 'Subcategorías'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingItem(null);
                  setEditItemName('');
                  setEditParentCatId('');
                  setEditProveedorRfc('');
                  setShowEditParentCatDropdown(false);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.three }} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => setShowEditParentCatDropdown(false)}
                style={{ flex: 1, gap: Spacing.three }}
              >
                <CustomInput
                  label={activeCatalog === 'clientes' ? "Nombre / Razón Social *" : activeCatalog === 'proveedores' ? "Nombre del Proveedor *" : "Nombre del Elemento *"}
                  placeholder={activeCatalog === 'clientes' ? "Ej. Empresa S.A. de C.V." : activeCatalog === 'proveedores' ? "Ej. Papelería Lumen, OXXO, etc." : "Ej. Papelería, Walmart, etc."}
                  value={editItemName}
                  onChangeText={setEditItemName}
                  iconName={activeCatalog === 'proveedores' ? "business-outline" : "bookmark-outline"}
                />

                {activeCatalog === 'proveedores' && (
                  <CustomInput
                    label="RFC (Opcional)"
                    placeholder="Ej. LUM951010AB1"
                    value={editProveedorRfc}
                    onChangeText={setEditProveedorRfc}
                    autoCapitalize="characters"
                    iconName="card-outline"
                  />
                )}

                {activeCatalog === 'clientes' && (
                  <>
                    <CustomInput
                      label="RFC"
                      placeholder="Ej. ABC123456T10"
                      value={editClientRfc}
                      onChangeText={setEditClientRfc}
                      autoCapitalize="characters"
                      iconName="card-outline"
                    />
                    <CustomInput
                      label="Correo Electrónico"
                      placeholder="ejemplo@cliente.com"
                      value={editClientCorreo}
                      onChangeText={setEditClientCorreo}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      iconName="mail-outline"
                    />
                    <CustomInput
                      label="Dirección / Domicilio Fiscal"
                      placeholder="Calle, Número, Colonia, Ciudad"
                      value={editClientDireccion}
                      onChangeText={setEditClientDireccion}
                      iconName="location-outline"
                    />
                    <CustomInput
                      label="Código Postal"
                      placeholder="Ej. 31000"
                      value={editClientCp}
                      onChangeText={setEditClientCp}
                      keyboardType="numeric"
                      iconName="navigate-outline"
                    />
                  </>
                )}

                {/* Lógica condicional para Subcategoría (pedir Categoría Padre) */}
                {activeCatalog === 'subcategorias' && (
                  <View style={styles.customDropdownContainer}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría Padre *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowEditParentCatDropdown(!showEditParentCatDropdown);
                      }}
                    >
                      <Text style={{ color: editParentCatId ? themeColors.text : themeColors.textSecondary }}>
                        {editParentCatName || 'Selecciona categoría padre'}
                      </Text>
                      <Ionicons name={showEditParentCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showEditParentCatDropdown && (
                      <View style={{ width: '100%', zIndex: 1000 }}>
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                            {categorias.map((cat, index, array) => (
                              <TouchableOpacity
                                key={cat.id}
                                style={[
                                  styles.dropdownItem,
                                  index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                                ]}
                                onPress={() => {
                                  setEditParentCatId(cat.id);
                                  setShowEditParentCatDropdown(false);
                                }}
                              >
                                <Ionicons name="folder-open-outline" size={24} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cat.nombre}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
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
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal para Gestionar Sucursales */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={sucursalesModalVisible}
        onRequestClose={() => setSucursalesModalVisible(false)}
      >
        <View style={[styles.modalOverlay, isDesktop && { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }, isDesktop ? { width: 500, borderRadius: BorderRadius.large, height: 'auto', maxHeight: '90%', padding: Spacing.four } : { height: '70%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Sucursales</Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Cliente: {selectedClientForSucursales?.nombre}</Text>
              </View>
              <TouchableOpacity onPress={() => setSucursalesModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three }}>
              <View style={{ flex: 1 }}>
                <CustomInput
                  placeholder="Nueva sucursal..."
                  value={newSucursalName}
                  onChangeText={setNewSucursalName}
                  iconName="business-outline"
                />
              </View>
              <TouchableOpacity
                onPress={handleAddSucursal}
                disabled={isSavingSucursal || !newSucursalName.trim()}
                style={{
                  backgroundColor: themeColors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: Spacing.three,
                  borderRadius: BorderRadius.medium,
                  opacity: (!newSucursalName.trim() || isSavingSucursal) ? 0.5 : 1
                }}
              >
                {isSavingSucursal ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="add" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {isLoadingSucursales ? (
              <View style={{ padding: Spacing.four, alignItems: 'center' }}>
                <ActivityIndicator color={themeColors.primary} />
              </View>
            ) : (
              <FlatList scrollEnabled={false}
                data={clientSucursales}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: Spacing.four }}
                ListEmptyComponent={
                  <Text style={{ textAlign: 'center', color: themeColors.textSecondary, marginTop: Spacing.three }}>
                    No hay sucursales registradas para este cliente.
                  </Text>
                }
                renderItem={({ item }) => (
                  <View style={[styles.listItem, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.one, padding: Spacing.two }]}>
                    <Text style={{ color: themeColors.text, flex: 1 }}>{item.nombre}</Text>
                    <TouchableOpacity onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm('¿Seguro que deseas eliminar esta sucursal?')) {
                          handleDeleteSucursal(item.id);
                        }
                      } else {
                        Alert.alert('Confirmar', '¿Eliminar esta sucursal?', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Eliminar', style: 'destructive', onPress: () => handleDeleteSucursal(item.id) }
                        ]);
                      }
                    }}>
                      <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Resumen de Cliente (Super Premium UI) */}
      <Modal visible={summaryModalVisible} animationType="fade" transparent={true}>
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.modalContent, { 
            backgroundColor: themeColors.background, 
            width: '90%', 
            maxWidth: 420,
            padding: 0,
            borderRadius: 24,
            overflow: 'hidden',
            shadowColor: '#000', 
            shadowOffset: {width: 0, height: 20}, 
            shadowOpacity: 0.4, 
            shadowRadius: 30, 
            elevation: 20
          }]}>
            <LinearGradient
              colors={['#1e3c72', '#2a5298']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: Spacing.five, alignItems: 'center', position: 'relative' }}
            >
              <TouchableOpacity 
                onPress={() => setSummaryModalVisible(false)} 
                style={{ position: 'absolute', top: 16, right: 16, padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.three, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }}>
                <Ionicons name="business" size={36} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 }}>
                {selectedClientForSummary?.nombre}
              </Text>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Resumen de Actividad Global
                </Text>
              </View>
            </LinearGradient>

            <View style={{ padding: Spacing.five, backgroundColor: themeColors.background }}>
              {isLoadingSummary ? (
                <View style={{ paddingVertical: Spacing.five }}>
                  <ActivityIndicator size="large" color="#2a5298" />
                  <Text style={{ textAlign: 'center', color: themeColors.textSecondary, marginTop: Spacing.three, fontWeight: '500' }}>Calculando inteligencia financiera...</Text>
                </View>
              ) : (
                <View style={{ gap: Spacing.four }}>
                  
                  {/* Tarjeta de Ventas */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.backgroundElement, padding: Spacing.three, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(40,167,69,0.2)' }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(40,167,69,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.three }}>
                      <Ionicons name="trending-up" size={28} color={themeColors.success || '#28a745'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Ventas Facturadas ({clientStats.totalVentas})</Text>
                      <Text style={{ color: themeColors.text, fontSize: 24, fontWeight: '900', marginTop: 2 }}>
                        ${clientStats.montoVentas.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>

                  {/* Tarjeta de Gastos */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.backgroundElement, padding: Spacing.three, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(239,68,68,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.three }}>
                      <Ionicons name="trending-down" size={28} color={themeColors.danger || '#ef4444'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Gastos Registrados ({clientStats.totalGastos})</Text>
                      <Text style={{ color: themeColors.text, fontSize: 24, fontWeight: '900', marginTop: 2 }}>
                        ${clientStats.montoGastos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>

                  {/* Divisor */}
                  <View style={{ height: 1, backgroundColor: themeColors.border, marginVertical: Spacing.one }} />

                  {/* Rentabilidad */}
                  <View style={{ backgroundColor: clientStats.rentabilidad >= 0 ? 'rgba(40,167,69,0.05)' : 'rgba(239,68,68,0.05)', padding: Spacing.four, borderRadius: 16, borderWidth: 1, borderColor: clientStats.rentabilidad >= 0 ? 'rgba(40,167,69,0.2)' : 'rgba(239,68,68,0.2)' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 14, fontWeight: '700', textTransform: 'uppercase' }}>Rentabilidad</Text>
                      <View style={{ backgroundColor: clientStats.rentabilidad >= 0 ? '#28a745' : '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                          {clientStats.rentabilidad >= 0 ? '+' : ''}{(clientStats.margen || 0).toFixed(1)}% Margen
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: clientStats.rentabilidad >= 0 ? '#28a745' : '#ef4444', fontSize: 32, fontWeight: '900', marginTop: 8 }}>
                      ${clientStats.rentabilidad.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
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
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
