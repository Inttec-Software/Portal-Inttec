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
  HerramientaEmpleado,
  HerramientaVehiculo,
  ChecklistVehiculoHerramientas,
  ChecklistItem,
  HerramientasService,
  Vehiculo,
  VehiculoService,
  AuthService,
  Usuario,
} from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import * as Location from 'expo-location';

export default function EmpleadoHerramientasScreen() {
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

  // Tabs: 'personal' | 'checklist' | 'historial'
  const [activeTab, setActiveTab] = useState<'personal' | 'checklist' | 'historial'>('personal');
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  // Mi Kit Personal
  const [miKit, setMiKit] = useState<HerramientaEmpleado[]>([]);

  // Vehículos de la Flota & Checklist
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [vehiculoKitExpected, setVehiculoKitExpected] = useState<HerramientaVehiculo[]>([]);
  const [isLoadingKitVehiculo, setIsLoadingKitVehiculo] = useState(false);
  
  // Estado local del formulario de Checklist
  const [checklistItemsState, setChecklistItemsState] = useState<ChecklistItem[]>([]);
  const [observacionesGenerales, setObservacionesGenerales] = useState('');
  const [isSubmittingChecklist, setIsSubmittingChecklist] = useState(false);

  // Mis Checklists
  const [misChecklists, setMisChecklists] = useState<ChecklistVehiculoHerramientas[]>([]);
  const [selectedChecklistDetail, setSelectedChecklistDetail] = useState<ChecklistVehiculoHerramientas | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Inicialización
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const u = await AuthService.getCurrentUser();
      if (!u) {
        router.replace('/');
        return;
      }
      setCurrentUser(u);

      const [kitPersonal, vehsList] = await Promise.all([
        HerramientasService.getKitsEmpleados(u.id),
        VehiculoService.getVehiculos(true),
      ]);

      setMiKit(kitPersonal);
      setVehiculos(vehsList || []);
      if (vehsList && vehsList.length > 0 && !selectedVehiculoId) {
        setSelectedVehiculoId(vehsList[0].id);
      }
    } catch (err: any) {
      console.error('Error loading initial data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router, selectedVehiculoId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Cargar kit esperado del vehículo seleccionado y armar el checklist inicial
  const loadVehiculoKit = useCallback(async (vehId: string) => {
    if (!vehId) return;
    setIsLoadingKitVehiculo(true);
    try {
      const kit = await HerramientasService.getKitsVehiculos(vehId);
      setVehiculoKitExpected(kit);

      // Mapear al estado interactivo del checklist
      const initialChecklist: ChecklistItem[] = kit.map((item) => {
        const isPreviouslyMissing = item.notas && item.notas.includes('[FALTANTE]');
        return {
          herramienta_id: item.herramienta_id,
          nombre: item.herramienta?.nombre || 'Herramienta',
          codigo: item.herramienta?.codigo || 'HER',
          presente: !isPreviouslyMissing,
          estado: (item.condicion === 'DANADO' && isPreviouslyMissing) ? 'DANADO' : (item.condicion || 'BUENO'),
          observaciones: isPreviouslyMissing ? 'Reportada como faltante en revisión anterior' : '',
        };
      });
      setChecklistItemsState(initialChecklist);
    } catch (err) {
      console.error('Error loading vehiculo kit:', err);
    } finally {
      setIsLoadingKitVehiculo(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVehiculoId) {
      loadVehiculoKit(selectedVehiculoId);
    }
  }, [selectedVehiculoId, loadVehiculoKit]);

  // Cargar historial de checklists del empleado
  const loadHistorial = useCallback(async () => {
    if (!currentUser) return;
    try {
      const hist = await HerramientasService.getChecklists({ empleado_id: currentUser.id, limit: 30 });
      setMisChecklists(hist);
    } catch (err) {
      console.error('Error loading historial checklists:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'historial') {
      loadHistorial();
    }
  }, [activeTab, loadHistorial]);

  // Checklist Helpers
  const handleTogglePresente = (idx: number) => {
    setChecklistItemsState((prev) => {
      const next = [...prev];
      const curr = next[idx];
      const newPresente = !curr.presente;
      next[idx] = {
        ...curr,
        presente: newPresente,
        estado: newPresente ? 'BUENO' : 'DANADO',
      };
      return next;
    });
  };

  const handleSetEstado = (idx: number, estado: 'NUEVO' | 'BUENO' | 'REGULAR' | 'DANADO') => {
    setChecklistItemsState((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        estado,
      };
      return next;
    });
  };

  const handleSetItemObservacion = (idx: number, obs: string) => {
    setChecklistItemsState((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        observaciones: obs,
      };
      return next;
    });
  };

  const handleMarcarTodoPresente = () => {
    setChecklistItemsState((prev) =>
      prev.map((item) => ({
        ...item,
        presente: true,
        estado: 'BUENO',
        observaciones: '',
      }))
    );
    showAlert('Todo Completo', 'Se marcaron todas las herramientas del vehículo como presentes y en buen estado.');
  };

  // Enviar Checklist al Backend
  const handleSubmitChecklist = async () => {
    if (!selectedVehiculoId) {
      showAlert('Validación', 'Por favor selecciona el vehículo que vas a utilizar.');
      return;
    }

    if (checklistItemsState.length === 0) {
      showAlert('Aviso', 'Este vehículo no tiene un kit de herramientas registrado para verificar.');
      return;
    }

    setIsSubmittingChecklist(true);
    try {
      let gpsLocation: string | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          gpsLocation = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        }
      } catch (e) {
        console.warn('GPS not available', e);
      }

      await HerramientasService.crearChecklist({
        vehiculo_id: selectedVehiculoId,
        empleado_id: currentUser?.id,
        items: checklistItemsState,
        observaciones_generales: observacionesGenerales.trim() || undefined,
        ubicacion_gps: gpsLocation,
      });

      showAlert('Checklist Registrado ✅', 'La revisión de herramientas del vehículo se ha guardado correctamente.');
      setObservacionesGenerales('');
      setActiveTab('historial');
      loadHistorial();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar el checklist.');
    } finally {
      setIsSubmittingChecklist(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two }}>
            Cargando mis herramientas...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedVeh = vehiculos.find((v) => v.id === selectedVehiculoId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.headerContainer, { borderBottomColor: themeColors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Mis Herramientas</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Kit personal, herramientas de camioneta y checklist de inicio de ruta
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.backgroundElement, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'personal' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('personal')}
        >
          <Ionicons name="person-outline" size={18} color={activeTab === 'personal' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'personal' ? themeColors.primary : themeColors.textSecondary }]}>
            Mi Kit Personal ({miKit.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'checklist' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('checklist')}
        >
          <Ionicons name="checkbox-outline" size={18} color={activeTab === 'checklist' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'checklist' ? themeColors.primary : themeColors.textSecondary }]}>
            Checklist Vehículo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'historial' && { borderBottomColor: themeColors.primary, borderBottomWidth: 3 }]}
          onPress={() => setActiveTab('historial')}
        >
          <Ionicons name="time-outline" size={18} color={activeTab === 'historial' ? themeColors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'historial' ? themeColors.primary : themeColors.textSecondary }]}>
            Mis Revisiones
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ========================================================================= */}
        {/* TAB 1: MI KIT PERSONAL */}
        {/* ========================================================================= */}
        {activeTab === 'personal' && (
          <View>
            <View style={[styles.infoBanner, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}>
              <Ionicons name="information-circle-outline" size={24} color={themeColors.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>
                  Herramientas a tu Resguardo
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                  Estas herramientas fueron asignadas a tu inventario personal por administración. Eres responsable de su custodia y buen uso.
                </Text>
              </View>
            </View>

            {miKit.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, marginTop: Spacing.three }]}>
                <Ionicons name="briefcase-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  Actualmente no tienes herramientas registradas en tu kit personal.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                {miKit.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.card,
                      { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={[styles.toolCode, { color: themeColors.primary }]}>
                            {item.herramienta?.codigo}
                          </Text>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                            • {item.herramienta?.categoria}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '700', fontSize: 15, color: themeColors.text }}>
                          {item.herramienta?.nombre}
                        </Text>
                        {item.herramienta?.numero_serie ? (
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            N/S: <Text style={{ color: themeColors.text, fontWeight: '600' }}>{item.herramienta.numero_serie}</Text>
                          </Text>
                        ) : null}
                        {item.notas ? (
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                            Nota: {item.notas}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor:
                                item.condicion === 'NUEVO'
                                  ? '#0984e320'
                                  : item.condicion === 'BUENO'
                                  ? '#10ac8420'
                                  : item.condicion === 'REGULAR'
                                  ? '#f39c1220'
                                  : '#e74c3c20',
                              borderColor:
                                item.condicion === 'NUEVO'
                                  ? '#0984e3'
                                  : item.condicion === 'BUENO'
                                  ? '#10ac84'
                                  : item.condicion === 'REGULAR'
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
                                  item.condicion === 'NUEVO'
                                    ? '#0984e3'
                                    : item.condicion === 'BUENO'
                                    ? '#10ac84'
                                    : item.condicion === 'REGULAR'
                                    ? '#f39c12'
                                    : '#e74c3c',
                              },
                            ]}
                          >
                            {item.condicion}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Cant: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{item.cantidad}</Text>
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CHECKLIST DE VEHÍCULO AL INICIAR TRABAJO */}
        {/* ========================================================================= */}
        {activeTab === 'checklist' && (
          <View>
            {/* Selector de Vehículo */}
            <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: themeColors.text, marginBottom: 8 }}>
                1. ¿Qué vehículo / camioneta vas a utilizar hoy?
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {vehiculos.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehiculoPill,
                      {
                        backgroundColor: selectedVehiculoId === v.id ? themeColors.primary : themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => setSelectedVehiculoId(v.id)}
                  >
                    <Ionicons
                      name="car"
                      size={18}
                      color={selectedVehiculoId === v.id ? '#fff' : themeColors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 13,
                        color: selectedVehiculoId === v.id ? '#fff' : themeColors.text,
                      }}
                    >
                      {v.marca} {v.modelo} ({v.placas})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Banner de Acción Rápida */}
            <View style={[styles.quickActionBar, { marginTop: Spacing.two }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 14, color: themeColors.text }}>
                  Revisión de Herramientas del Vehículo
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  Camioneta: {selectedVeh?.placas} • {checklistItemsState.length} herramientas en kit
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.btnQuickAll, { backgroundColor: '#10ac84' }]}
                onPress={handleMarcarTodoPresente}
              >
                <Ionicons name="checkmark-done" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>Todo Completo</Text>
              </TouchableOpacity>
            </View>

            {/* Listado de Ítems del Checklist */}
            {isLoadingKitVehiculo ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <ActivityIndicator color={themeColors.primary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: 8 }}>Cargando herramientas del vehículo...</Text>
              </View>
            ) : checklistItemsState.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement, marginTop: Spacing.two }]}>
                <Ionicons name="alert-circle-outline" size={40} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  Este vehículo no tiene un kit de herramientas configurado por administración.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                {checklistItemsState.map((it, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.checkItemCard,
                      {
                        backgroundColor: themeColors.backgroundElement,
                        borderColor: !it.presente ? '#e74c3c' : it.estado === 'DANADO' ? '#f39c12' : themeColors.border,
                        borderLeftWidth: 4,
                        borderLeftColor: !it.presente ? '#e74c3c' : it.estado === 'DANADO' ? '#f39c12' : '#10ac84',
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.toolCode, { color: themeColors.primary }]}>{it.codigo}</Text>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: themeColors.text }}>{it.nombre}</Text>
                      </View>

                      {/* Botón de Presente / Faltante */}
                      <TouchableOpacity
                        style={[
                          styles.togglePresentBtn,
                          {
                            backgroundColor: it.presente ? '#10ac8420' : '#e74c3c20',
                            borderColor: it.presente ? '#10ac84' : '#e74c3c',
                          },
                        ]}
                        onPress={() => handleTogglePresente(idx)}
                      >
                        <Ionicons
                          name={it.presente ? 'checkmark-circle' : 'close-circle'}
                          size={18}
                          color={it.presente ? '#10ac84' : '#e74c3c'}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={{ fontWeight: '800', fontSize: 11, color: it.presente ? '#10ac84' : '#e74c3c' }}>
                          {it.presente ? 'PRESENTE' : 'FALTANTE'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {it.presente ? (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginRight: 4 }}>Estado:</Text>
                        {(['NUEVO', 'BUENO', 'REGULAR', 'DANADO'] as const).map((st) => (
                          <TouchableOpacity
                            key={st}
                            style={[
                              styles.miniStatePill,
                              {
                                backgroundColor:
                                  it.estado === st
                                    ? st === 'NUEVO'
                                      ? '#0984e3'
                                      : st === 'BUENO'
                                      ? '#10ac84'
                                      : st === 'REGULAR'
                                      ? '#f39c12'
                                      : '#e74c3c'
                                    : themeColors.background,
                                borderColor: themeColors.border,
                              },
                            ]}
                            onPress={() => handleSetEstado(idx, st)}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: it.estado === st ? '#fff' : themeColors.text }}>
                              {st === 'NUEVO' ? 'Nuevo' : st === 'BUENO' ? 'Bueno' : st === 'REGULAR' ? 'Regular' : 'Dañado'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {/* Campo de notas específicas si falta o está dañada */}
                    {(!it.presente || it.estado === 'DANADO') && (
                      <TextInput
                        style={[styles.itemNoteInput, { borderColor: '#e74c3c50', color: themeColors.text, backgroundColor: themeColors.background }]}
                        placeholder="Describe el motivo de falta o detalle del daño..."
                        placeholderTextColor={themeColors.textSecondary}
                        value={it.observaciones}
                        onChangeText={(t) => handleSetItemObservacion(idx, t)}
                      />
                    )}
                  </View>
                ))}

                {/* Observaciones Generales */}
                <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: Spacing.two }]}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: themeColors.text, marginBottom: 6 }}>
                    Observaciones Generales de la Camioneta
                  </Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.background }]}
                    placeholder="Ej. La unidad se encuentra limpia, nivel de aceite verificado..."
                    placeholderTextColor={themeColors.textSecondary}
                    multiline
                    numberOfLines={3}
                    value={observacionesGenerales}
                    onChangeText={setObservacionesGenerales}
                  />

                  <CustomButton
                    title="Enviar y Comenzar Trabajo"
                    variant="primary"
                    onPress={handleSubmitChecklist}
                    loading={isSubmittingChecklist}
                    style={{ marginTop: Spacing.three }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MIS REVISIONES / HISTORIAL */}
        {/* ========================================================================= */}
        {activeTab === 'historial' && (
          <View>
            {misChecklists.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                <Ionicons name="time-outline" size={48} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
                  Aún no has registrado revisiones de vehículos.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.two }}>
                {misChecklists.map((chk) => {
                  const hasIncidents = chk.total_faltantes > 0 || chk.total_danadas > 0;
                  return (
                    <TouchableOpacity
                      key={chk.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: hasIncidents ? '#e74c3c' : themeColors.border,
                          borderLeftWidth: 4,
                          borderLeftColor: hasIncidents ? '#e74c3c' : '#10ac84',
                        },
                      ]}
                      onPress={() => {
                        setSelectedChecklistDetail(chk);
                        setDetailModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 15, color: themeColors.text }}>
                            {chk.vehiculo?.marca} {chk.vehiculo?.modelo} ({chk.vehiculo?.placas})
                          </Text>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            {chk.fecha} {chk.hora ? `• ${chk.hora.substring(0, 5)}` : ''}
                          </Text>
                        </View>

                        <View>
                          {hasIncidents ? (
                            <View style={[styles.badge, { backgroundColor: '#e74c3c20', borderColor: '#e74c3c' }]}>
                              <Text style={[styles.badgeText, { color: '#e74c3c' }]}>Con Faltantes</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, { backgroundColor: '#10ac8420', borderColor: '#10ac84' }]}>
                              <Text style={[styles.badgeText, { color: '#10ac84' }]}>Completo</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                        <Text style={{ fontSize: 11, color: '#10ac84' }}>
                          Presentes: <Text style={{ fontWeight: 'bold' }}>{chk.total_presentes}</Text>
                        </Text>
                        {chk.total_faltantes > 0 ? (
                          <Text style={{ fontSize: 11, color: '#e74c3c' }}>
                            Faltantes: <Text style={{ fontWeight: 'bold' }}>{chk.total_faltantes}</Text>
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
      {/* MODAL DETALLE DE REVISIÓN */}
      {/* ========================================================================= */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Resumen del Checklist</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: themeColors.text }}>
                  {selectedChecklistDetail?.vehiculo?.marca} {selectedChecklistDetail?.vehiculo?.modelo} ({selectedChecklistDetail?.vehiculo?.placas})
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  Fecha: {selectedChecklistDetail?.fecha} {selectedChecklistDetail?.hora}
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                {(selectedChecklistDetail?.items || []).map((it, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.checkItemCard,
                      { backgroundColor: themeColors.background, borderColor: themeColors.border },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: themeColors.text }}>
                        [{it.codigo}] {it.nombre}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 'bold',
                          color: !it.presente ? '#e74c3c' : it.estado === 'DANADO' ? '#f39c12' : '#10ac84',
                        }}
                      >
                        {!it.presente ? 'FALTANTE' : it.estado}
                      </Text>
                    </View>
                    {it.observaciones ? (
                      <Text style={{ fontSize: 11, color: '#e74c3c', marginTop: 4 }}>Nota: {it.observaciones}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>

            <CustomButton
              title="Cerrar"
              variant="primary"
              onPress={() => setDetailModalVisible(false)}
              style={{ marginTop: Spacing.three }}
            />
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
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  card: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  toolCode: {
    fontSize: 12,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
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
  vehiculoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  quickActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  btnQuickAll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.small,
  },
  checkItemCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  togglePresentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  miniStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemNoteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    marginTop: 6,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    minHeight: 70,
    textAlignVertical: 'top',
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
    maxWidth: 500,
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
});
