import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Vehiculo, RegistroGasolina, VehiculoService } from '@/services/supabase';
import { ReportGenerator } from '@/utils/reportGenerator';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import ImageViewerModal from '@/components/ImageViewerModal';

export default function AdminVehiculosScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user, company, env } = useAuth();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const [isLoading, setIsLoading] = useState(true);
  
  // Vehículos y Gasolina
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [registrosGasolina, setRegistrosGasolina] = useState<RegistroGasolina[]>([]);
  
  const [newVehiculoMarca, setNewVehiculoMarca] = useState('');
  const [newVehiculoModelo, setNewVehiculoModelo] = useState('');
  const [newVehiculoAnio, setNewVehiculoAnio] = useState('');
  const [newVehiculoPlacas, setNewVehiculoPlacas] = useState('');
  const [newVehiculoNumEcon, setNewVehiculoNumEcon] = useState('');
  
  const [vehiculoModalVisible, setVehiculoModalVisible] = useState(false);
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null);
  const [isSavingVehiculo, setIsSavingVehiculo] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [vehList, gasLogs] = await Promise.all([
        VehiculoService.getVehiculos(false),
        VehiculoService.getRegistrosGasolina(),
      ]);
      setVehiculos(vehList);
      setRegistrosGasolina(gasLogs);
    } catch (err: any) {
      if (!silent) {
        Alert.alert('Error', err.message || 'No se pudieron cargar los datos de vehículos.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && (user.rol === 'ADMIN' || user.rol === 'DEV')) {
      refreshData();
    } else {
      router.replace('/');
    }
  }, [user, company, env, refreshData, router]);

  const handleSaveVehiculo = async () => {
    if (!newVehiculoMarca.trim() || !newVehiculoModelo.trim() || !newVehiculoAnio.trim() || !newVehiculoPlacas.trim()) {
      showAlert('Error', 'Por favor, llena los campos obligatorios (*).');
      return;
    }
    const anioNum = Number(newVehiculoAnio);
    if (isNaN(anioNum) || anioNum < 1900 || anioNum > 2100) {
      showAlert('Error', 'El año no es válido.');
      return;
    }

    setIsSavingVehiculo(true);
    try {
      const payload = {
        marca: newVehiculoMarca.trim(),
        modelo: newVehiculoModelo.trim(),
        anio: anioNum,
        placas: newVehiculoPlacas.trim().toUpperCase(),
        numero_economico: newVehiculoNumEcon.trim() || null,
        activo: editingVehiculo ? editingVehiculo.activo : true,
      };

      if (editingVehiculo) {
        await VehiculoService.actualizarVehiculo(editingVehiculo.id, payload);
        showAlert('Éxito', 'Vehículo actualizado.');
      } else {
        await VehiculoService.crearVehiculo(payload);
        showAlert('Éxito', 'Vehículo registrado.');
      }

      setNewVehiculoMarca('');
      setNewVehiculoModelo('');
      setNewVehiculoAnio('');
      setNewVehiculoPlacas('');
      setNewVehiculoNumEcon('');
      setEditingVehiculo(null);
      setVehiculoModalVisible(false);
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar el vehículo.');
    } finally {
      setIsSavingVehiculo(false);
    }
  };

  const handleEditVehiculo = (veh: Vehiculo) => {
    setEditingVehiculo(veh);
    setNewVehiculoMarca(veh.marca);
    setNewVehiculoModelo(veh.modelo);
    setNewVehiculoAnio(String(veh.anio));
    setNewVehiculoPlacas(veh.placas);
    setNewVehiculoNumEcon(veh.numero_economico || '');
    setVehiculoModalVisible(true);
  };

  const handleDeleteVehiculo = async (id: string, plates: string) => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm(`¿Estás seguro de eliminar el vehículo ${plates}?`) 
      : await new Promise((resolve) => {
          Alert.alert('Eliminar Vehículo', `¿Eliminar vehículo ${plates}?`, [
            { text: 'Cancelar', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Eliminar', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (confirm) {
      try {
        await VehiculoService.eliminarVehiculo(id);
        showAlert('Éxito', 'Vehículo eliminado.');
        await refreshData();
      } catch (err: any) {
        showAlert('Error', err.message || 'No se pudo eliminar el vehículo.');
      }
    }
  };

  const handleToggleVehiculoActivo = async (veh: Vehiculo) => {
    try {
      await VehiculoService.actualizarVehiculo(veh.id, { activo: !veh.activo });
      await refreshData();
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo actualizar el estado.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: Spacing.three, padding: Spacing.one }}>
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Administración</Text>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Módulo de Flota</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando datos...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} style={{ flex: 1 }}>
          {vehiculoModalVisible ? (
            /* FORMULARIO CRUD INLINE */
            <View style={{
              marginHorizontal: Spacing.two,
              marginTop: Spacing.two,
              padding: Spacing.three,
              backgroundColor: themeColors.backgroundElement,
              borderRadius: BorderRadius.medium,
              borderWidth: 1,
              borderColor: themeColors.border,
            }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
                {editingVehiculo ? 'Editar Vehículo' : 'Registrar Vehículo'}
              </Text>
              
              <CustomInput
                label="Marca *"
                placeholder="Ej. Nissan"
                value={newVehiculoMarca}
                onChangeText={setNewVehiculoMarca}
              />
              <CustomInput
                label="Modelo *"
                placeholder="Ej. NP300"
                value={newVehiculoModelo}
                onChangeText={setNewVehiculoModelo}
              />
              <CustomInput
                label="Año *"
                placeholder="Ej. 2021"
                value={newVehiculoAnio}
                onChangeText={setNewVehiculoAnio}
                keyboardType="numeric"
              />
              <CustomInput
                label="Placas *"
                placeholder="Ej. AB-123-CD"
                value={newVehiculoPlacas}
                onChangeText={setNewVehiculoPlacas}
                autoCapitalize="characters"
              />
              <CustomInput
                label="Número Económico (Opcional)"
                placeholder="Ej. Eco-04"
                value={newVehiculoNumEcon}
                onChangeText={setNewVehiculoNumEcon}
              />

              <View style={{ marginTop: Spacing.two, flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title="Cancelar"
                    onPress={() => {
                      setEditingVehiculo(null);
                      setVehiculoModalVisible(false);
                    }}
                    variant="secondary"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomButton
                    title={editingVehiculo ? 'Guardar Cambios' : 'Registrar Vehículo'}
                    onPress={handleSaveVehiculo}
                    loading={isSavingVehiculo}
                    variant="primary"
                  />
                </View>
              </View>
            </View>
          ) : (
            /* VISTAS DE LISTADO Y BITÁCORA */
            <>
              {/* Sección: Parque Vehicular */}
              <View style={{
                marginHorizontal: Spacing.two,
                marginTop: Spacing.two,
                padding: Spacing.three,
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.border,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two, gap: 8 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>Parque Vehicular</Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }} numberOfLines={1}>Gestión de vehículos de la empresa</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingVehiculo(null);
                      setNewVehiculoMarca('');
                      setNewVehiculoModelo('');
                      setNewVehiculoAnio('');
                      setNewVehiculoPlacas('');
                      setNewVehiculoNumEcon('');
                      setVehiculoModalVisible(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: themeColors.accent,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 18,
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons name="add" size={16} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold' }}>Agregar Auto</Text>
                  </TouchableOpacity>
                </View>

                {vehiculos.length === 0 ? (
                  <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                    No hay vehículos registrados.
                  </Text>
                ) : (
                  <View style={{ gap: Spacing.one }}>
                    {vehiculos.map((veh) => (
                      <View
                        key={veh.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: Spacing.two,
                          backgroundColor: themeColors.background,
                          borderRadius: BorderRadius.small,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          gap: 8,
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Ionicons name="car" size={18} color={veh.activo ? themeColors.primary : themeColors.textSecondary} />
                            <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 14, flexShrink: 1 }}>
                              {veh.marca} {veh.modelo} ({veh.anio})
                            </Text>
                            {!veh.activo && (
                              <View style={{ backgroundColor: themeColors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                <Text style={{ fontSize: 9, color: themeColors.danger, fontWeight: 'bold' }}>INACTIVO</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                            Placas: <Text style={{ fontWeight: 'bold' }}>{veh.placas}</Text> 
                            {veh.numero_economico ? ` • Eco: ${veh.numero_economico}` : ''}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                          <TouchableOpacity onPress={() => handleToggleVehiculoActivo(veh)} style={{ padding: 4 }} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                            <Ionicons name={veh.activo ? "eye-outline" : "eye-off-outline"} size={18} color={veh.activo ? themeColors.success : themeColors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleEditVehiculo(veh)} style={{ padding: 4 }} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                            <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteVehiculo(veh.id, veh.placas)} style={{ padding: 4 }} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                            <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Sección: Bitácora de Combustible */}
              <View style={{
                marginHorizontal: Spacing.two,
                marginTop: Spacing.three,
                padding: Spacing.three,
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.border,
              }}>
                <View style={{ marginBottom: Spacing.two }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }}>Bitácora de Gasolina</Text>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Consumo e historial detallado de cargas</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const companyLabel = company === 'daravisa' ? 'daravisa' : 'inttec';
                            await ReportGenerator.exportGasolinaToCSV(
                              registrosGasolina,
                              `reporte_gasolina_${companyLabel}_${new Date().toISOString().split('T')[0]}.csv`
                            );
                          } catch (err: any) {
                            showAlert('Error CSV', err.message);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 6,
                          backgroundColor: '#d1fae5',
                          borderRadius: 8, borderWidth: 1, borderColor: '#6ee7b7',
                        }}
                      >
                        <Ionicons name="document-text-outline" size={14} color="#059669" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>CSV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const companyLabel = company === 'daravisa' ? 'Daravisa' : 'Inttec';
                            await ReportGenerator.exportGasolinaToPDF(
                              registrosGasolina,
                              `Reporte de Gasolina ${companyLabel}`
                            );
                          } catch (err: any) {
                            showAlert('Error PDF', err.message);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 6,
                          backgroundColor: '#fee2e2',
                          borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5',
                        }}
                      >
                        <Ionicons name="print-outline" size={14} color="#dc2626" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {registrosGasolina.length === 0 ? (
                  <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                    No se han registrado consumos de gasolina.
                  </Text>
                ) : (
                  <View style={{ gap: Spacing.two }}>
                    {registrosGasolina.map((reg) => {
                      const dateParts = reg.fecha.split('-');
                      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : reg.fecha;
                      return (
                        <View
                          key={reg.id}
                          style={{
                            padding: Spacing.two,
                            backgroundColor: themeColors.background,
                            borderRadius: BorderRadius.small,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: themeColors.border, paddingBottom: 6, marginBottom: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: themeColors.textSecondary }}>
                              {formattedDate}
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.success }}>
                              ${Number(reg.costo_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                                Conductor: <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{reg.empleado_nombre || 'N/A'}</Text>
                              </Text>
                              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                                Vehículo: <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{reg.vehiculo_marca} {reg.vehiculo_modelo} ({reg.vehiculo_placas})</Text>
                              </Text>
                              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                                Carga: <Text style={{ color: themeColors.text }}>{reg.litros} Lts</Text> • Odómetro: <Text style={{ color: themeColors.text }}>{reg.kilometraje_actual} km</Text>
                              </Text>
                              {reg.observaciones ? (
                                <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                                  Obs: {reg.observaciones}
                                </Text>
                              ) : null}
                            </View>
                            {reg.ticket_foto_url ? (
                              <TouchableOpacity
                                onPress={() => {
                                  setActivePreviewUrl(reg.ticket_foto_url || null);
                                  setViewerVisible(true);
                                }}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  backgroundColor: themeColors.primary + '15',
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexDirection: 'row',
                                  gap: 2,
                                }}
                              >
                                <Ionicons name="image-outline" size={14} color={themeColors.primary} />
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: themeColors.primary }}>Ver Ticket</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Visor de Ticket */}
      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerSubtitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
