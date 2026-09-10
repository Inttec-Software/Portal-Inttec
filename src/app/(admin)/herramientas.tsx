import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import {
  Herramienta,
  HerramientaEmpleado,
  HerramientaVehiculo,
  ChecklistVehiculoHerramientas,
  HerramientasService,
  Vehiculo,
  VehiculoService,
  Usuario,
  TrazabilidadHerramienta,
} from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

const CATEGORIAS_HERRAMIENTAS = [
  'Todas',
  'Manual',
  'Eléctrica',
  'Medición',
  'Seguridad',
  'Corte',
  'Fijación',
  'General',
];

const ESTADOS_HERRAMIENTA = [
  { value: 'NUEVO', label: 'Nuevo', color: '#0984e3' },
  { value: 'BUENO', label: 'Bueno', color: '#10ac84' },
  { value: 'REGULAR', label: 'Regular', color: '#f39c12' },
  { value: 'DANADO', label: 'Dañado', color: '#e74c3c' },
  { value: 'EN_REPARACION', label: 'En Reparación', color: '#9b59b6' },
  { value: 'BAJA', label: 'Baja', color: '#7f8c8d' },
  { value: 'FALTANTE', label: 'Faltante', color: '#d63031' },
];

export default function AdminHerramientasScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Tabs: 'catalogo' | 'empleados' | 'vehiculos' | 'checklists'
  const [activeTab, setActiveTab] = useState<'catalogo' | 'empleados' | 'vehiculos' | 'checklists'>('catalogo');
  const [isLoading, setIsLoading] = useState(true);

  // Catálogo Maestro
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [searchCatalogo, setSearchCatalogo] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  
  // Modal Crear/Editar Herramienta
  const [toolModalVisible, setToolModalVisible] = useState(false);
  const [editingTool, setEditingTool] = useState<Herramienta | null>(null);
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCategoria, setFormCategoria] = useState('Manual');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formNumeroSerie, setFormNumeroSerie] = useState('');
  const [formEstado, setFormEstado] = useState<'NUEVO' | 'BUENO' | 'REGULAR' | 'DANADO' | 'EN_REPARACION' | 'BAJA' | 'FALTANTE'>('NUEVO');
  const [isSavingTool, setIsSavingTool] = useState(false);

  // Empleados y Kits
  const [empleadosList, setEmpleadosList] = useState<Usuario[]>([]);
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string>('');
  const [kitsEmpleado, setKitsEmpleado] = useState<HerramientaEmpleado[]>([]);
  const [assignEmpModalVisible, setAssignEmpModalVisible] = useState(false);
  const [selectedToolToAssignEmp, setSelectedToolToAssignEmp] = useState<string>('');
  const [assignEmpQty, setAssignEmpQty] = useState('1');
  const [assignEmpCondicion, setAssignEmpCondicion] = useState<'NUEVO' | 'BUENO' | 'REGULAR' | 'DANADO'>('NUEVO');
  const [assignEmpNotas, setAssignEmpNotas] = useState('');
  const [isSavingAssignEmp, setIsSavingAssignEmp] = useState(false);

  // Vehículos y Kits
  const [vehiculosList, setVehiculosList] = useState<Vehiculo[]>([]);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [kitsVehiculo, setKitsVehiculo] = useState<HerramientaVehiculo[]>([]);
  const [assignVehModalVisible, setAssignVehModalVisible] = useState(false);
  const [selectedToolsToAssignVeh, setSelectedToolsToAssignVeh] = useState<string[]>([]);
  const [searchVehAssignTool, setSearchVehAssignTool] = useState('');
  const [assignVehQty, setAssignVehQty] = useState('1');
  const [assignVehCondicion, setAssignVehCondicion] = useState<'NUEVO' | 'BUENO' | 'REGULAR' | 'DANADO'>('NUEVO');
  const [assignVehNotas, setAssignVehNotas] = useState('');
  const [isSavingAssignVeh, setIsSavingAssignVeh] = useState(false);

  // Checklists
  const [checklists, setChecklists] = useState<ChecklistVehiculoHerramientas[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistVehiculoHerramientas | null>(null);
  const [checklistDetailVisible, setChecklistDetailVisible] = useState(false);
  const [filterChecklistVehiculo, setFilterChecklistVehiculo] = useState<string>('TODOS');

  // Modal de Trazabilidad e Historial de Uso
  const [trazabilidadModalVisible, setTrazabilidadModalVisible] = useState(false);
  const [selectedToolTrazabilidad, setSelectedToolTrazabilidad] = useState<TrazabilidadHerramienta | null>(null);
  const [isLoadingTrazabilidad, setIsLoadingTrazabilidad] = useState(false);

  const handleOpenTrazabilidad = async (tool: Herramienta) => {
    setIsLoadingTrazabilidad(true);
    setTrazabilidadModalVisible(true);
    setSelectedToolTrazabilidad(null);
    try {
      const data = await HerramientasService.getTrazabilidadHerramienta(tool.id);
      setSelectedToolTrazabilidad(data);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo cargar la trazabilidad de la herramienta.');
    } finally {
      setIsLoadingTrazabilidad(false);
    }
  };

  // Carga inicial
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tools, vehs] = await Promise.all([
        HerramientasService.getHerramientas(false),
        VehiculoService.getVehiculos(true),
      ]);
      setHerramientas(tools);
      setVehiculosList(vehs);
      if (vehs.length > 0 && !selectedVehiculoId) {
        setSelectedVehiculoId(vehs[0].id);
      }

      // Cargar lista de empleados técnicos
      const headers = await getApiHeaders();
      const resUsers = await fetch(`${getApiUrl()}/api/usuarios`, { headers });
      if (resUsers.ok) {
        const usersData = await resUsers.json();
        const emps = (usersData || []).filter((u: any) => u.rol === 'EMPLEADO' || u.rol === 'DEV');
        setEmpleadosList(emps);
        if (emps.length > 0 && !selectedEmpleadoId) {
          setSelectedEmpleadoId(emps[0].id);
        }
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudieron cargar los datos de herramientas');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmpleadoId, selectedVehiculoId]);

  useEffect(() => {
    if (user && (user.rol === 'ADMIN' || user.rol === 'DEV')) {
      loadData();
    } else {
      router.replace('/');
    }
  }, [user, loadData, router]);

  // Cargar kit del empleado seleccionado
  useEffect(() => {
    if (selectedEmpleadoId) {
      HerramientasService.getKitsEmpleados(selectedEmpleadoId)
        .then(setKitsEmpleado)
        .catch(console.error);
    }
  }, [selectedEmpleadoId]);

  // Cargar kit del vehículo seleccionado
  useEffect(() => {
    if (selectedVehiculoId) {
      HerramientasService.getKitsVehiculos(selectedVehiculoId)
        .then(setKitsVehiculo)
        .catch(console.error);
    }
  }, [selectedVehiculoId]);

  // Cargar checklists cuando se abre la tab
  useEffect(() => {
    if (activeTab === 'checklists') {
      HerramientasService.getChecklists({ limit: 60 })
        .then(setChecklists)
        .catch(console.error);
    }
  }, [activeTab]);

  // Calcular siguiente código H-1, H-2, H-3...
  const getNextToolCode = () => {
    let maxNum = 0;
    herramientas.forEach((t) => {
      if (!t.codigo) return;
      const match = t.codigo.trim().match(/^H-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    return `H-${maxNum + 1}`;
  };

  // CRUD Herramienta Maestro
  const handleOpenToolModal = (tool?: Herramienta) => {
    if (tool) {
      setEditingTool(tool);
      setFormCodigo(tool.codigo);
      setFormNombre(tool.nombre);
      setFormCategoria(tool.categoria || 'Manual');
      setFormDescripcion(tool.descripcion || '');
      setFormNumeroSerie(tool.numero_serie || '');
      setFormEstado(tool.estado || 'BUENO');
    } else {
      setEditingTool(null);
      setFormCodigo(getNextToolCode());
      setFormNombre('');
      setFormCategoria('Manual');
      setFormDescripcion('');
      setFormNumeroSerie('');
      setFormEstado('NUEVO');
    }
    setToolModalVisible(true);
  };

  const handleSaveTool = async () => {
    if (!formCodigo.trim() || !formNombre.trim()) {
      showAlert('Validación', 'El código y nombre son obligatorios.');
      return;
    }

    setIsSavingTool(true);
    try {
      const payload = {
        codigo: formCodigo.trim().toUpperCase(),
        nombre: formNombre.trim(),
        categoria: formCategoria,
        descripcion: formDescripcion.trim() || null,
        numero_serie: formNumeroSerie.trim() || null,
        estado: formEstado,
        activo: true,
      };

      if (editingTool) {
        await HerramientasService.actualizarHerramienta(editingTool.id, payload);
        showAlert('Éxito', 'Herramienta actualizada correctamente.');
      } else {
        await HerramientasService.crearHerramienta(payload);
        showAlert('Éxito', 'Herramienta registrada en el catálogo maestro.');
      }

      setToolModalVisible(false);
      const updated = await HerramientasService.getHerramientas(false);
      setHerramientas(updated);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar la herramienta.');
    } finally {
      setIsSavingTool(false);
    }
  };

  const handleDeleteTool = async (id: string, nombre: string) => {
    const doDelete = async () => {
      try {
        await HerramientasService.eliminarHerramienta(id);
        showAlert('Eliminada', `La herramienta ${nombre} ha sido eliminada.`);
        const updated = await HerramientasService.getHerramientas(false);
        setHerramientas(updated);
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar la herramienta.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Estás seguro de eliminar "${nombre}" del catálogo?`)) {
        await doDelete();
      }
    } else {
      Alert.alert('Confirmar Eliminación', `¿Deseas eliminar "${nombre}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Asignar Herramienta a Empleado
  const handleAssignToEmployee = async () => {
    if (!selectedEmpleadoId || !selectedToolToAssignEmp) {
      showAlert('Validación', 'Selecciona una herramienta para asignar.');
      return;
    }

    setIsSavingAssignEmp(true);
    try {
      await HerramientasService.asignarHerramientaEmpleado({
        empleado_id: selectedEmpleadoId,
        herramienta_id: selectedToolToAssignEmp,
        cantidad: parseInt(assignEmpQty, 10) || 1,
        condicion: assignEmpCondicion,
        notas: assignEmpNotas.trim(),
      });
      showAlert('Asignación Exitosa', 'La herramienta fue añadida al kit personal del empleado.');
      setAssignEmpModalVisible(false);
      setSelectedToolToAssignEmp('');
      setAssignEmpNotas('');
      const updated = await HerramientasService.getKitsEmpleados(selectedEmpleadoId);
      setKitsEmpleado(updated);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo asignar la herramienta.');
    } finally {
      setIsSavingAssignEmp(false);
    }
  };

  const handleUnassignFromEmployee = async (assignId: string, toolName: string) => {
    const doUnassign = async () => {
      try {
        await HerramientasService.desasignarHerramientaEmpleado(assignId);
        const updated = await HerramientasService.getKitsEmpleados(selectedEmpleadoId);
        setKitsEmpleado(updated);
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo desasignar.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Remover "${toolName}" del kit de este empleado?`)) {
        await doUnassign();
      }
    } else {
      Alert.alert('Remover Herramienta', `¿Remover "${toolName}" del kit personal?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: doUnassign },
      ]);
    }
  };

  // Toggle selección de herramienta para vehículo
  const toggleSelectToolForVeh = (toolId: string) => {
    setSelectedToolsToAssignVeh((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const handleSelectAllToolsForVeh = (toolList: Herramienta[]) => {
    if (selectedToolsToAssignVeh.length === toolList.length) {
      setSelectedToolsToAssignVeh([]);
    } else {
      setSelectedToolsToAssignVeh(toolList.map((t) => t.id));
    }
  };

  // Asignar Herramientas a Vehículo (Multi-Selección)
  const handleAssignToVehiculo = async () => {
    if (!selectedVehiculoId || selectedToolsToAssignVeh.length === 0) {
      showAlert('Validación', 'Selecciona al menos una herramienta para asignar al vehículo.');
      return;
    }

    setIsSavingAssignVeh(true);
    try {
      const qty = parseInt(assignVehQty, 10) || 1;
      const promises = selectedToolsToAssignVeh.map((toolId) =>
        HerramientasService.asignarHerramientaVehiculo({
          vehiculo_id: selectedVehiculoId,
          herramienta_id: toolId,
          cantidad: qty,
          condicion: assignVehCondicion,
          notas: assignVehNotas.trim(),
        })
      );

      await Promise.all(promises);
      showAlert(
        'Kit Actualizado',
        `Se ${selectedToolsToAssignVeh.length === 1 ? 'asignó 1 herramienta' : `asignaron ${selectedToolsToAssignVeh.length} herramientas`} al kit oficial del vehículo.`
      );
      setAssignVehModalVisible(false);
      setSelectedToolsToAssignVeh([]);
      setAssignVehNotas('');
      setSearchVehAssignTool('');
      const updated = await HerramientasService.getKitsVehiculos(selectedVehiculoId);
      setKitsVehiculo(updated);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudieron asignar las herramientas.');
    } finally {
      setIsSavingAssignVeh(false);
    }
  };

  const handleUnassignFromVehiculo = async (assignId: string, toolName: string) => {
    const doUnassign = async () => {
      try {
        await HerramientasService.desasignarHerramientaVehiculo(assignId);
        const updated = await HerramientasService.getKitsVehiculos(selectedVehiculoId);
        setKitsVehiculo(updated);
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo remover del vehículo.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Remover "${toolName}" del kit de este vehículo?`)) {
        await doUnassign();
      }
    } else {
      Alert.alert('Remover del Vehículo', `¿Remover "${toolName}" del kit de la camioneta?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: doUnassign },
      ]);
    }
  };

  // Filtros del Catálogo
  const filteredHerramientas = herramientas.filter((h) => {
    const matchesCat = selectedCategoria === 'Todas' || h.categoria === selectedCategoria;
    const q = searchCatalogo.toLowerCase();
    const matchesSearch =
      !q ||
      h.nombre.toLowerCase().includes(q) ||
      h.codigo.toLowerCase().includes(q) ||
      (h.numero_serie && h.numero_serie.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  // Filtros de Checklists
  const filteredChecklists = checklists.filter((chk) => {
    if (filterChecklistVehiculo === 'TODOS') return true;
    return chk.vehiculo_id === filterChecklistVehiculo;
  });

  const getStatusBadge = (estado: string) => {
    const item = ESTADOS_HERRAMIENTA.find((e) => e.value === estado) || {
      label: estado,
      color: '#7f8c8d',
    };
    return (
      <View style={[styles.badge, { backgroundColor: item.color + '20', borderColor: item.color }]}>
        <Text style={[styles.badgeText, { color: item.color }]}>{item.label}</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two }}>
            Cargando módulo de herramientas...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerContainer, { borderBottomColor: themeColors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Gestión de Herramientas</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Catálogo maestro, Kits personales, Kits de Vehículos y Checklists diarios
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
          onPress={() => loadData()}
        >
          <Ionicons name="refresh" size={20} color={themeColors.text} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'catalogo' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('catalogo')}
        >
          <Ionicons name="build-outline" size={18} color={activeTab === 'catalogo' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'catalogo' ? themeColors.primary : themeColors.textSecondary }]}>
            Catálogo ({herramientas.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'empleados' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('empleados')}
        >
          <Ionicons name="person-outline" size={18} color={activeTab === 'empleados' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'empleados' ? themeColors.primary : themeColors.textSecondary }]}>
            Kits Empleados
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'vehiculos' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('vehiculos')}
        >
          <Ionicons name="car-outline" size={18} color={activeTab === 'vehiculos' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'vehiculos' ? themeColors.primary : themeColors.textSecondary }]}>
            Kits Vehículos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'checklists' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('checklists')}
        >
          <Ionicons name="checkbox-outline" size={18} color={activeTab === 'checklists' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'checklists' ? themeColors.primary : themeColors.textSecondary }]}>
            Checklists
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido según Tab */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ========================================================================= */}
        {/* TAB 1: CATÁLOGO MAESTRO */}
        {/* ========================================================================= */}
        {activeTab === 'catalogo' && (
          <View>
            {/* Barra de Acciones y Búsqueda */}
            <View style={[styles.actionsBar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={[styles.searchBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <Ionicons name="search-outline" size={18} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text }]}
                  placeholder="Buscar por código, nombre o serie..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={searchCatalogo}
                  onChangeText={setSearchCatalogo}
                />
                {searchCatalogo ? (
                  <TouchableOpacity onPress={() => setSearchCatalogo('')}>
                    <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: themeColors.primary }]}
                onPress={() => handleOpenToolModal()}
              >
                <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnPrimaryText}>Nueva Herramienta</Text>
              </TouchableOpacity>
            </View>

            {/* Categorías Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
              {CATEGORIAS_HERRAMIENTAS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: selectedCategoria === cat ? themeColors.primary : themeColors.backgroundElement,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => setSelectedCategoria(cat)}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      { color: selectedCategoria === cat ? '#fff' : themeColors.text },
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Lista de Herramientas */}
            {filteredHerramientas.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                <Ionicons name="construct-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  No se encontraron herramientas registradas en esta categoría.
                </Text>
              </View>
            ) : (
              <View style={styles.gridContainer}>
                {filteredHerramientas.map((tool) => (
                  <View
                    key={tool.id}
                    style={[
                      styles.toolCard,
                      { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                      !isMobile && { width: '48.5%' },
                    ]}
                  >
                    <View style={styles.toolCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={[styles.toolCode, { color: themeColors.primary }]}>{tool.codigo}</Text>
                          <Text style={[styles.toolCat, { color: themeColors.textSecondary }]}>• {tool.categoria}</Text>
                        </View>
                        <Text style={[styles.toolName, { color: themeColors.text }]}>{tool.nombre}</Text>
                      </View>
                      {getStatusBadge(tool.estado)}
                    </View>

                    {tool.descripcion ? (
                      <Text style={[styles.toolDesc, { color: themeColors.textSecondary }]} numberOfLines={2}>
                        {tool.descripcion}
                      </Text>
                    ) : null}

                    {tool.numero_serie ? (
                      <Text style={[styles.toolSerial, { color: themeColors.textSecondary }]}>
                        N/S: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{tool.numero_serie}</Text>
                      </Text>
                    ) : null}

                    {/* Ubicación / Custodia Actual y Último Usuario */}
                    <View style={{ backgroundColor: themeColors.background, padding: 8, borderRadius: 8, marginTop: 8, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons
                          name={
                            tool.custodia_actual?.tipo === 'EMPLEADO'
                              ? 'person-circle-outline'
                              : tool.custodia_actual?.tipo === 'VEHICULO'
                              ? 'car-outline'
                              : 'business-outline'
                          }
                          size={14}
                          color={
                            tool.custodia_actual?.tipo === 'EMPLEADO'
                              ? '#0984e3'
                              : tool.custodia_actual?.tipo === 'VEHICULO'
                              ? '#e67e22'
                              : '#10ac84'
                          }
                        />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                          {tool.custodia_actual?.descripcion || 'En Almacén Central (Disponible)'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="time-outline" size={13} color={themeColors.textSecondary} />
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary }} numberOfLines={1}>
                          Último usuario:{' '}
                          <Text style={{ fontWeight: '700', color: themeColors.text }}>
                            {tool.ultimo_usuario?.nombre || 'Sin uso registrado'}
                          </Text>
                          {tool.ultimo_usuario?.fecha ? ` • ${tool.ultimo_usuario.fecha.split('T')[0]}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.toolCardFooter, { borderTopColor: themeColors.border }]}>
                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: themeColors.primary + '15' }]}
                        onPress={() => handleOpenTrazabilidad(tool)}
                      >
                        <Ionicons name="git-network-outline" size={15} color={themeColors.primary} />
                        <Text style={[styles.actionBtnText, { color: themeColors.primary, fontWeight: '700' }]}>Historial</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: themeColors.background }]}
                        onPress={() => handleOpenToolModal(tool)}
                      >
                        <Ionicons name="pencil" size={15} color={themeColors.text} />
                        <Text style={[styles.actionBtnText, { color: themeColors.text }]}>Editar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: themeColors.background }]}
                        onPress={() => handleDeleteTool(tool.id, tool.nombre)}
                      >
                        <Ionicons name="trash-outline" size={15} color={Colors.light.danger} />
                        <Text style={[styles.actionBtnText, { color: Colors.light.danger }]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: KITS DE EMPLEADOS */}
        {/* ========================================================================= */}
        {activeTab === 'empleados' && (
          <View>
            {/* Selector de Empleado */}
            <View style={[styles.selectionCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Seleccionar Empleado Técnico</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.two }}>
                {empleadosList.map((emp) => (
                  <TouchableOpacity
                    key={emp.id}
                    style={[
                      styles.selectorPill,
                      {
                        backgroundColor: selectedEmpleadoId === emp.id ? themeColors.primary : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedEmpleadoId(emp.id)}
                  >
                    <Ionicons
                      name="person-circle-outline"
                      size={20}
                      color={selectedEmpleadoId === emp.id ? '#fff' : themeColors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.selectorPillText,
                        { color: selectedEmpleadoId === emp.id ? '#fff' : themeColors.text },
                      ]}
                    >
                      {emp.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Encabezado del Kit del Empleado */}
            <View style={[styles.kitHeaderRow, { marginTop: Spacing.three }]}>
              <View>
                <Text style={[styles.kitTitle, { color: themeColors.text }]}>
                  Kit Personal:{' '}
                  <Text style={{ color: themeColors.primary }}>
                    {empleadosList.find((e) => e.id === selectedEmpleadoId)?.nombre || 'Empleado'}
                  </Text>
                </Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                  Total de herramientas asignadas: {kitsEmpleado.reduce((acc, k) => acc + (k.cantidad || 1), 0)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  if (herramientas.length === 0) {
                    showAlert('Aviso', 'Primero registra herramientas en el Catálogo Maestro.');
                    return;
                  }
                  setSelectedToolToAssignEmp(herramientas[0]?.id || '');
                  setAssignEmpModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnPrimaryText}>Asignar Herramienta</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de Herramientas Asignadas */}
            {kitsEmpleado.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, marginTop: Spacing.three }]}>
                <Ionicons name="briefcase-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  Este empleado no tiene herramientas asignadas en su kit personal actualmente.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                {kitsEmpleado.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.assignedRow,
                      { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={[styles.toolCode, { color: themeColors.primary }]}>
                          {item.herramienta?.codigo || 'HER'}
                        </Text>
                        <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 15 }}>
                          {item.herramienta?.nombre}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                        Categoría: {item.herramienta?.categoria} • Cantidad: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{item.cantidad}</Text>
                        {item.herramienta?.numero_serie ? ` • Serie: ${item.herramienta.numero_serie}` : ''}
                      </Text>
                      {item.notas ? (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>
                          Nota: {item.notas}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 8 }}>
                      {getStatusBadge(item.condicion)}
                      <TouchableOpacity
                        onPress={() => handleUnassignFromEmployee(item.id, item.herramienta?.nombre || 'Herramienta')}
                        style={[styles.unassignBtn, { backgroundColor: Colors.light.danger + '15' }]}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.light.danger} />
                        <Text style={{ color: Colors.light.danger, fontSize: 11, fontWeight: '700' }}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: KITS DE VEHÍCULOS */}
        {/* ========================================================================= */}
        {activeTab === 'vehiculos' && (
          <View>
            {/* Selector de Vehículo */}
            <View style={[styles.selectionCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Seleccionar Vehículo / Camioneta</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.two }}>
                {vehiculosList.map((veh) => (
                  <TouchableOpacity
                    key={veh.id}
                    style={[
                      styles.selectorPill,
                      {
                        backgroundColor: selectedVehiculoId === veh.id ? themeColors.primary : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedVehiculoId(veh.id)}
                  >
                    <Ionicons
                      name="car-sport-outline"
                      size={20}
                      color={selectedVehiculoId === veh.id ? '#fff' : themeColors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.selectorPillText,
                        { color: selectedVehiculoId === veh.id ? '#fff' : themeColors.text },
                      ]}
                    >
                      {veh.marca} {veh.modelo} ({veh.placas})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Encabezado del Kit del Vehículo */}
            <View style={[styles.kitHeaderRow, { marginTop: Spacing.three }]}>
              <View>
                <Text style={[styles.kitTitle, { color: themeColors.text }]}>
                  Kit Oficial de la Camioneta:{' '}
                  <Text style={{ color: themeColors.primary }}>
                    {vehiculosList.find((v) => v.id === selectedVehiculoId)?.placas || 'Vehículo'}
                  </Text>
                </Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                  Herramientas obligatorias en unidad: {kitsVehiculo.reduce((acc, k) => acc + (k.cantidad || 1), 0)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  if (herramientas.length === 0) {
                    showAlert('Aviso', 'Primero registra herramientas en el Catálogo Maestro.');
                    return;
                  }
                  setSelectedToolsToAssignVeh([]);
                  setSearchVehAssignTool('');
                  setAssignVehQty('1');
                  setAssignVehCondicion('NUEVO');
                  setAssignVehNotas('');
                  setAssignVehModalVisible(true);
                }}
              >
                <Ionicons name="add-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnPrimaryText}>Asignar a Vehículo</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de Herramientas del Vehículo */}
            {kitsVehiculo.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, marginTop: Spacing.three }]}>
                <Ionicons name="car-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  No se han configurado herramientas fijas para este vehículo.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                {kitsVehiculo.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.assignedRow,
                      { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={[styles.toolCode, { color: themeColors.primary }]}>
                          {item.herramienta?.codigo || 'HER'}
                        </Text>
                        <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 15 }}>
                          {item.herramienta?.nombre}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                        Categoría: {item.herramienta?.categoria} • Cantidad Requerida: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{item.cantidad}</Text>
                      </Text>
                      {item.notas ? (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>
                          Nota: {item.notas}
                        </Text>
                      ) : null}
                      {item.notas && item.notas.includes('[FALTANTE]') ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e74c3c20', borderColor: '#e74c3c', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4, gap: 4 }}>
                          <Ionicons name="alert-circle" size={12} color="#e74c3c" />
                          <Text style={{ color: '#e74c3c', fontSize: 11, fontWeight: 'bold' }}>FALTANTE EN CAMIONETA</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 8 }}>
                      {getStatusBadge(item.notas && item.notas.includes('[FALTANTE]') ? 'BAJA' : item.condicion)}
                      <TouchableOpacity
                        onPress={() => handleUnassignFromVehiculo(item.id, item.herramienta?.nombre || 'Herramienta')}
                        style={[styles.unassignBtn, { backgroundColor: Colors.light.danger + '15' }]}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.light.danger} />
                        <Text style={{ color: Colors.light.danger, fontSize: 11, fontWeight: '700' }}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CHECKLISTS DE VEHÍCULOS (AUDITORÍA) */}
        {/* ========================================================================= */}
        {activeTab === 'checklists' && (
          <View>
            <View style={[styles.filterBar, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={{ fontWeight: '700', color: themeColors.text, marginRight: 10 }}>Filtrar por Vehículo:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[
                    styles.miniFilterPill,
                    {
                      backgroundColor: filterChecklistVehiculo === 'TODOS' ? themeColors.primary : themeColors.background,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => setFilterChecklistVehiculo('TODOS')}
                >
                  <Text style={{ color: filterChecklistVehiculo === 'TODOS' ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                    Todos
                  </Text>
                </TouchableOpacity>

                {vehiculosList.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.miniFilterPill,
                      {
                        backgroundColor: filterChecklistVehiculo === v.id ? themeColors.primary : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setFilterChecklistVehiculo(v.id)}
                  >
                    <Text style={{ color: filterChecklistVehiculo === v.id ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                      {v.placas}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {filteredChecklists.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, marginTop: Spacing.three }]}>
                <Ionicons name="clipboard-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  No hay registros de checklists completados aún.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                {filteredChecklists.map((chk) => {
                  const hasIncidents = chk.total_faltantes > 0 || chk.total_danadas > 0;
                  return (
                    <TouchableOpacity
                      key={chk.id}
                      style={[
                        styles.checklistCard,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: hasIncidents ? '#e74c3c' : themeColors.border,
                          borderLeftWidth: 5,
                          borderLeftColor: hasIncidents ? '#e74c3c' : '#10ac84',
                        },
                      ]}
                      onPress={() => {
                        setSelectedChecklist(chk);
                        setChecklistDetailVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 16, color: themeColors.text }}>
                            {chk.vehiculo?.marca} {chk.vehiculo?.modelo} ({chk.vehiculo?.placas})
                          </Text>
                          <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: 2 }}>
                            Revisado por: <Text style={{ fontWeight: '600', color: themeColors.text }}>{chk.empleado?.nombre || 'Empleado'}</Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            Fecha: {chk.fecha} {chk.hora ? `• ${chk.hora.substring(0, 5)}` : ''}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          {hasIncidents ? (
                            <View style={[styles.badge, { backgroundColor: '#e74c3c20', borderColor: '#e74c3c' }]}>
                              <Text style={[styles.badgeText, { color: '#e74c3c' }]}>⚠️ Con Faltantes / Daños</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, { backgroundColor: '#10ac8420', borderColor: '#10ac84' }]}>
                              <Text style={[styles.badgeText, { color: '#10ac84' }]}>✅ Todo Completo</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={[styles.checklistStatsRow, { borderTopColor: themeColors.border }]}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Herramientas: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{chk.total_herramientas}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: '#10ac84' }}>
                          Presentes: <Text style={{ fontWeight: 'bold' }}>{chk.total_presentes}</Text>
                        </Text>
                        {chk.total_faltantes > 0 ? (
                          <Text style={{ fontSize: 12, color: '#e74c3c' }}>
                            Faltantes: <Text style={{ fontWeight: 'bold' }}>{chk.total_faltantes}</Text>
                          </Text>
                        ) : null}
                        {chk.total_danadas > 0 ? (
                          <Text style={{ fontSize: 12, color: '#f39c12' }}>
                            Dañadas: <Text style={{ fontWeight: 'bold' }}>{chk.total_danadas}</Text>
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL: CREAR / EDITAR HERRAMIENTA MAESTRA */}
      {/* ========================================================================= */}
      <Modal visible={toolModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {editingTool ? 'Editar Herramienta' : 'Nueva Herramienta'}
              </Text>
              <TouchableOpacity onPress={() => setToolModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 450 }}>
              <CustomInput
                label="Código / Identificador *"
                value={formCodigo}
                onChangeText={setFormCodigo}
                placeholder="Ej. H-1"
              />

              <CustomInput
                label="Nombre de la Herramienta *"
                value={formNombre}
                onChangeText={setFormNombre}
                placeholder="Ej. Taladro Percutor Inalámbrico 18V"
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.two }}>
                {CATEGORIAS_HERRAMIENTAS.filter((c) => c !== 'Todas').map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: formCategoria === cat ? themeColors.primary : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setFormCategoria(cat)}
                  >
                    <Text style={{ color: formCategoria === cat ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <CustomInput
                label="Número de Serie (Opcional)"
                value={formNumeroSerie}
                onChangeText={setFormNumeroSerie}
                placeholder="Ej. SN-8839201"
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Estado Inicial</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.two }}>
                {ESTADOS_HERRAMIENTA.map((st) => (
                  <TouchableOpacity
                    key={st.value}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: formEstado === st.value ? st.color : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setFormEstado(st.value as any)}
                  >
                    <Text style={{ color: formEstado === st.value ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <CustomInput
                label="Descripción / Especificaciones"
                value={formDescripcion}
                onChangeText={setFormDescripcion}
                placeholder="Marca, modelo, accesorios incluidos..."
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setToolModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <CustomButton
                title={editingTool ? 'Actualizar' : 'Guardar'}
                variant="primary"
                onPress={handleSaveTool}
                loading={isSavingTool}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ASIGNAR HERRAMIENTA A EMPLEADO */}
      {/* ========================================================================= */}
      <Modal visible={assignEmpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Asignar al Kit de {empleadosList.find((e) => e.id === selectedEmpleadoId)?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setAssignEmpModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Seleccionar Herramienta del Catálogo</Text>
              <View style={{ gap: 6, marginBottom: Spacing.two }}>
                {herramientas.map((tool) => (
                  <TouchableOpacity
                    key={tool.id}
                    style={[
                      styles.toolSelectOption,
                      {
                        backgroundColor: selectedToolToAssignEmp === tool.id ? themeColors.primary + '20' : themeColors.background,
                        borderColor: selectedToolToAssignEmp === tool.id ? themeColors.primary : themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedToolToAssignEmp(tool.id)}
                  >
                    <Ionicons
                      name={selectedToolToAssignEmp === tool.id ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selectedToolToAssignEmp === tool.id ? themeColors.primary : themeColors.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>
                        [{tool.codigo}] {tool.nombre}
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        {tool.categoria} {tool.numero_serie ? `• N/S: ${tool.numero_serie}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <CustomInput
                label="Cantidad"
                value={assignEmpQty}
                onChangeText={setAssignEmpQty}
                keyboardType="numeric"
                placeholder="1"
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Condición de Entrega</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.two }}>
                {[
                  { value: 'NUEVO' as const, label: 'Nuevo', color: '#0984e3' },
                  { value: 'BUENO' as const, label: 'Bueno', color: '#10ac84' },
                  { value: 'REGULAR' as const, label: 'Regular', color: '#f39c12' },
                  { value: 'DANADO' as const, label: 'Dañado', color: '#e74c3c' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: assignEmpCondicion === c.value ? c.color : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setAssignEmpCondicion(c.value)}
                  >
                    <Text style={{ color: assignEmpCondicion === c.value ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <CustomInput
                label="Observaciones / Notas"
                value={assignEmpNotas}
                onChangeText={setAssignEmpNotas}
                placeholder="Ej. Se entrega con maletín y 2 baterías..."
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setAssignEmpModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <CustomButton
                title="Confirmar Asignación"
                variant="primary"
                onPress={handleAssignToEmployee}
                loading={isSavingAssignEmp}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ASIGNAR HERRAMIENTAS A VEHÍCULO (MULTI-SELECCIÓN) */}
      {/* ========================================================================= */}
      <Modal visible={assignVehModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Asignar Herramientas al Vehículo
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.primary, fontWeight: '600', marginTop: 2 }}>
                  Camioneta: {vehiculosList.find((v) => v.id === selectedVehiculoId)?.marca} {vehiculosList.find((v) => v.id === selectedVehiculoId)?.modelo} ({vehiculosList.find((v) => v.id === selectedVehiculoId)?.placas})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAssignVehModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {/* Sección de Selección Múltiple */}
              <View style={{ marginBottom: Spacing.two }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.text, marginBottom: 0 }]}>
                    Seleccionar Herramientas ({selectedToolsToAssignVeh.length} seleccionadas)
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const filtered = herramientas.filter((t) =>
                        t.nombre.toLowerCase().includes(searchVehAssignTool.toLowerCase()) ||
                        t.codigo.toLowerCase().includes(searchVehAssignTool.toLowerCase()) ||
                        (t.categoria && t.categoria.toLowerCase().includes(searchVehAssignTool.toLowerCase()))
                      );
                      handleSelectAllToolsForVeh(filtered);
                    }}
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: themeColors.primary + '15' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>
                      {selectedToolsToAssignVeh.length > 0 ? 'Desmarcar Todas' : 'Marcar Todas'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Filtro rápido dentro del modal */}
                <View style={[styles.searchBox, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: 8, paddingHorizontal: 8, height: 38 }]}>
                  <Ionicons name="search" size={16} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text, paddingVertical: 4, fontSize: 12 }]}
                    placeholder="Buscar por código, nombre o categoría..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={searchVehAssignTool}
                    onChangeText={setSearchVehAssignTool}
                  />
                  {searchVehAssignTool.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchVehAssignTool('')}>
                      <Ionicons name="close-circle" size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Lista de Herramientas con Checkboxes */}
                <View style={{ gap: 6, maxHeight: 220 }}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                    {herramientas
                      .filter((t) =>
                        t.nombre.toLowerCase().includes(searchVehAssignTool.toLowerCase()) ||
                        t.codigo.toLowerCase().includes(searchVehAssignTool.toLowerCase()) ||
                        (t.categoria && t.categoria.toLowerCase().includes(searchVehAssignTool.toLowerCase()))
                      )
                      .map((tool) => {
                        const isSelected = selectedToolsToAssignVeh.includes(tool.id);
                        return (
                          <TouchableOpacity
                            key={tool.id}
                            style={[
                              styles.toolSelectOption,
                              {
                                backgroundColor: isSelected ? themeColors.primary + '20' : themeColors.background,
                                borderColor: isSelected ? themeColors.primary : themeColors.border,
                                marginBottom: 6,
                              },
                            ]}
                            onPress={() => toggleSelectToolForVeh(tool.id)}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={20}
                              color={isSelected ? themeColors.primary : themeColors.textSecondary}
                            />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>
                                [{tool.codigo}] {tool.nombre}
                              </Text>
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                {tool.categoria} {tool.numero_serie ? `• N/S: ${tool.numero_serie}` : ''}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={{ backgroundColor: themeColors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>SELECCIONADA</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              </View>

              <CustomInput
                label="Cantidad por cada Herramienta"
                value={assignVehQty}
                onChangeText={setAssignVehQty}
                keyboardType="numeric"
                placeholder="1"
              />

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Condición de Entrega</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.two }}>
                {[
                  { value: 'NUEVO' as const, label: 'Nuevo', color: '#0984e3' },
                  { value: 'BUENO' as const, label: 'Bueno', color: '#10ac84' },
                  { value: 'REGULAR' as const, label: 'Regular', color: '#f39c12' },
                  { value: 'DANADO' as const, label: 'Dañado', color: '#e74c3c' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: assignVehCondicion === c.value ? c.color : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setAssignVehCondicion(c.value)}
                  >
                    <Text style={{ color: assignVehCondicion === c.value ? '#fff' : themeColors.text, fontSize: 12, fontWeight: '600' }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <CustomInput
                label="Observaciones / Posición en Camioneta"
                value={assignVehNotas}
                onChangeText={setAssignVehNotas}
                placeholder="Ej. Ubicadas en la caja de herramientas trasera..."
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <CustomButton
                title="Cancelar"
                variant="secondary"
                onPress={() => setAssignVehModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <CustomButton
                title={
                  selectedToolsToAssignVeh.length > 1
                    ? `Asignar (${selectedToolsToAssignVeh.length}) al Vehículo`
                    : 'Asignar al Vehículo'
                }
                variant="primary"
                onPress={handleAssignToVehiculo}
                loading={isSavingAssignVeh}
                disabled={selectedToolsToAssignVeh.length === 0}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: DETALLE DE CHECKLIST */}
      {/* ========================================================================= */}
      <Modal visible={checklistDetailVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Detalle de Checklist</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  {selectedChecklist?.vehiculo?.marca} {selectedChecklist?.vehiculo?.modelo} ({selectedChecklist?.vehiculo?.placas})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setChecklistDetailVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 450 }}>
              <View style={[styles.detailSummaryBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Text style={{ color: themeColors.text, fontSize: 13, marginBottom: 4 }}>
                  Técnico: <Text style={{ fontWeight: 'bold' }}>{selectedChecklist?.empleado?.nombre}</Text>
                </Text>
                <Text style={{ color: themeColors.text, fontSize: 13, marginBottom: 4 }}>
                  Fecha y Hora: <Text style={{ fontWeight: 'bold' }}>{selectedChecklist?.fecha} {selectedChecklist?.hora}</Text>
                </Text>
                {selectedChecklist?.observaciones_generales ? (
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
                    Comentarios: {selectedChecklist.observaciones_generales}
                  </Text>
                ) : null}
              </View>

              <Text style={[styles.sectionTitle, { color: themeColors.text, marginTop: Spacing.two, marginBottom: Spacing.one }]}>
                Herramientas Revisadas ({selectedChecklist?.items?.length || 0})
              </Text>

              <View style={{ gap: 6 }}>
                {(selectedChecklist?.items || []).map((it, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.checkItemRow,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: !it.presente ? '#e74c3c' : it.estado === 'DANADO' ? '#f39c12' : themeColors.border,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons
                        name={it.presente ? 'checkmark-circle' : 'close-circle'}
                        size={22}
                        color={it.presente ? '#10ac84' : '#e74c3c'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>
                          [{it.codigo}] {it.nombre}
                        </Text>
                        {it.observaciones ? (
                          <Text style={{ fontSize: 11, color: '#e74c3c', marginTop: 2 }}>{it.observaciones}</Text>
                        ) : null}
                      </View>
                    </View>

                    <View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 'bold',
                          color: !it.presente ? '#e74c3c' : it.estado === 'DANADO' ? '#e74c3c' : '#10ac84',
                        }}
                      >
                        {!it.presente ? 'FALTANTE' : it.estado}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <CustomButton
                title="Cerrar"
                variant="primary"
                onPress={() => setChecklistDetailVisible(false)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: TRAZABILIDAD E HISTORIAL DE USO DE LA HERRAMIENTA */}
      {/* ========================================================================= */}
      <Modal visible={trazabilidadModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Historial y Trazabilidad de Uso</Text>
                {selectedToolTrazabilidad ? (
                  <Text style={{ fontSize: 13, color: themeColors.primary, fontWeight: '700', marginTop: 2 }}>
                    [{selectedToolTrazabilidad.herramienta.codigo}] {selectedToolTrazabilidad.herramienta.nombre}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setTrazabilidadModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {isLoadingTrazabilidad ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: 12 }}>Consultando historial de uso...</Text>
              </View>
            ) : !selectedToolTrazabilidad ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ color: themeColors.textSecondary }}>No se pudo cargar la información de la herramienta.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
                {/* 1. Tarjeta de Resguardo / Custodia Actual */}
                <View
                  style={[
                    styles.detailSummaryBox,
                    {
                      backgroundColor:
                        selectedToolTrazabilidad.custodia_actual.tipo === 'EMPLEADO'
                          ? '#0984e315'
                          : selectedToolTrazabilidad.custodia_actual.tipo === 'VEHICULO'
                          ? '#e67e2215'
                          : '#10ac8415',
                      borderColor:
                        selectedToolTrazabilidad.custodia_actual.tipo === 'EMPLEADO'
                          ? '#0984e3'
                          : selectedToolTrazabilidad.custodia_actual.tipo === 'VEHICULO'
                          ? '#e67e22'
                          : '#10ac84',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Ionicons
                      name={
                        selectedToolTrazabilidad.custodia_actual.tipo === 'EMPLEADO'
                          ? 'person-circle'
                          : selectedToolTrazabilidad.custodia_actual.tipo === 'VEHICULO'
                          ? 'car'
                          : 'business'
                      }
                      size={20}
                      color={
                        selectedToolTrazabilidad.custodia_actual.tipo === 'EMPLEADO'
                          ? '#0984e3'
                          : selectedToolTrazabilidad.custodia_actual.tipo === 'VEHICULO'
                          ? '#e67e22'
                          : '#10ac84'
                      }
                    />
                    <Text style={{ fontWeight: '800', fontSize: 13, color: themeColors.text, textTransform: 'uppercase' }}>
                      Custodia y Ubicación Actual
                    </Text>
                  </View>

                  {selectedToolTrazabilidad.custodia_actual.tipo === 'EMPLEADO' ? (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: themeColors.text, fontSize: 13 }}>
                        Responsable Actual: <Text style={{ fontWeight: 'bold' }}>{selectedToolTrazabilidad.custodia_actual.nombre}</Text>
                      </Text>
                      {selectedToolTrazabilidad.custodia_actual.email ? (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                          Contacto: {selectedToolTrazabilidad.custodia_actual.email}
                        </Text>
                      ) : null}
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                        Fecha de Asignación: {selectedToolTrazabilidad.custodia_actual.fecha_asignacion?.split('T')[0]}
                      </Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                        Condición Asignada: <Text style={{ fontWeight: '600' }}>{selectedToolTrazabilidad.custodia_actual.condicion}</Text>
                      </Text>
                      {selectedToolTrazabilidad.custodia_actual.notas ? (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 }}>
                          Nota: {selectedToolTrazabilidad.custodia_actual.notas}
                        </Text>
                      ) : null}
                    </View>
                  ) : selectedToolTrazabilidad.custodia_actual.tipo === 'VEHICULO' ? (
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: themeColors.text, fontSize: 13 }}>
                        Asignada a Vehículo:{' '}
                        <Text style={{ fontWeight: 'bold' }}>
                          {selectedToolTrazabilidad.custodia_actual.vehiculo?.marca} {selectedToolTrazabilidad.custodia_actual.vehiculo?.modelo} ({selectedToolTrazabilidad.custodia_actual.vehiculo?.placas})
                        </Text>
                      </Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                        Fecha de Asignación: {selectedToolTrazabilidad.custodia_actual.fecha_asignacion?.split('T')[0]}
                      </Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                        Condición en Kit: <Text style={{ fontWeight: '600' }}>{selectedToolTrazabilidad.custodia_actual.condicion}</Text>
                      </Text>
                      {selectedToolTrazabilidad.custodia_actual.notas ? (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 }}>
                          Ubicación en vehículo: {selectedToolTrazabilidad.custodia_actual.notas}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View>
                      <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '600' }}>
                        Disponible en Almacén Central
                      </Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        La herramienta no se encuentra asignada actualmente a ningún kit personal o vehículo.
                      </Text>
                    </View>
                  )}
                </View>

                {/* 2. Línea de Tiempo de Revisiones y Checklists */}
                <View style={{ marginTop: Spacing.two }}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 8 }]}>
                    Últimas Revisiones y Checklists Realizados ({selectedToolTrazabilidad.historial_checklists.length})
                  </Text>

                  {selectedToolTrazabilidad.historial_checklists.length === 0 ? (
                    <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.background, padding: 20 }]}>
                      <Ionicons name="time-outline" size={36} color={themeColors.textSecondary} />
                      <Text style={{ color: themeColors.textSecondary, marginTop: 8, textAlign: 'center', fontSize: 12 }}>
                        No hay registros de checklists recientes asociados a esta herramienta.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {selectedToolTrazabilidad.historial_checklists.map((ev, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.checkItemRow,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: !ev.presente ? '#e74c3c' : ev.estado_reportado === 'DANADO' ? '#f39c12' : themeColors.border,
                              borderLeftWidth: 4,
                              borderLeftColor: !ev.presente ? '#e74c3c' : ev.estado_reportado === 'DANADO' ? '#f39c12' : '#10ac84',
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <Ionicons name="person" size={14} color={themeColors.primary} />
                              <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>
                                {ev.usuario}
                              </Text>
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                • {ev.fecha} {ev.hora ? ev.hora.slice(0, 5) : ''}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                              Vehículo inspeccionado: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{ev.vehiculo}</Text>
                            </Text>

                            {ev.observaciones ? (
                              <Text style={{ fontSize: 11, color: '#e74c3c', fontStyle: 'italic', marginTop: 2 }}>
                                Nota: {ev.observaciones}
                              </Text>
                            ) : null}
                          </View>

                          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                            <View
                              style={[
                                styles.badge,
                                {
                                  backgroundColor:
                                    !ev.presente
                                      ? '#e74c3c20'
                                      : ev.estado_reportado === 'NUEVO'
                                      ? '#0984e320'
                                      : ev.estado_reportado === 'BUENO'
                                      ? '#10ac8420'
                                      : ev.estado_reportado === 'REGULAR'
                                      ? '#f39c1220'
                                      : '#e74c3c20',
                                  borderColor:
                                    !ev.presente
                                      ? '#e74c3c'
                                      : ev.estado_reportado === 'NUEVO'
                                      ? '#0984e3'
                                      : ev.estado_reportado === 'BUENO'
                                      ? '#10ac84'
                                      : ev.estado_reportado === 'REGULAR'
                                      ? '#f39c12'
                                      : '#e74c3c',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgeText,
                                  {
                                    color:
                                      !ev.presente
                                        ? '#e74c3c'
                                        : ev.estado_reportado === 'NUEVO'
                                        ? '#0984e3'
                                        : ev.estado_reportado === 'BUENO'
                                        ? '#10ac84'
                                        : ev.estado_reportado === 'REGULAR'
                                        ? '#f39c12'
                                        : '#e74c3c',
                                  },
                                ]}
                              >
                                {!ev.presente ? 'FALTANTE' : ev.estado_reportado}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <CustomButton
                title="Cerrar"
                variant="primary"
                onPress={() => setTrazabilidadModalVisible(false)}
                style={{ flex: 1 }}
              />
            </View>
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
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    gap: 6,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.two,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.small,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  categoriesScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.three,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolCard: {
    width: '100%',
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.three,
  },
  toolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  toolCode: {
    fontSize: 12,
    fontWeight: '800',
  },
  toolCat: {
    fontSize: 12,
  },
  toolName: {
    fontSize: 15,
    fontWeight: '700',
  },
  toolDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  toolSerial: {
    fontSize: 11,
    marginBottom: 8,
  },
  toolCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 10,
  },
  actionIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    gap: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  emptyBox: {
    padding: Spacing.five,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  selectorPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  kitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  kitTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  assignedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  unassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    gap: 2,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  miniFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  checklistCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  checklistStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 550,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
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
  modalFooter: {
    flexDirection: 'row',
    marginTop: Spacing.three,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  toolSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  detailSummaryBox: {
    padding: Spacing.three,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  checkItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
});
