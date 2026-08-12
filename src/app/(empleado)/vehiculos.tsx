import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Vehiculo, RegistroGasolina, VehiculoService } from '@/services/supabase';
import ImageViewerModal from '@/components/ImageViewerModal';

export default function EmpleadoVehiculosScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const { user } = useAuth();
  
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [misRegistrosGasolina, setMisRegistrosGasolina] = useState<RegistroGasolina[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  useEffect(() => {
    if (user) {
      loadData(user.id);
    }
  }, [user]);

  const loadData = async (userId: string) => {
    setIsLoading(true);
    try {
      const activeVehicles = await VehiculoService.getVehiculos(true);
      setVehiculos(activeVehicles || []);

      const allGasLogs = await VehiculoService.getRegistrosGasolina();
      const myGasLogs = allGasLogs.filter(reg => reg.empleado_id === userId);
      setMisRegistrosGasolina(myGasLogs);
    } catch (error) {
      console.error('Error al cargar vehículos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: Spacing.three, padding: Spacing.one }}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Gestión</Text>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Vehículos y Gasolina</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando vehículos...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} style={{ flex: 1 }}>
          {/* Sección: Parque Vehicular */}
          <View style={{
            marginHorizontal: Spacing.four,
            marginTop: Spacing.two,
            padding: Spacing.three,
            backgroundColor: themeColors.backgroundElement,
            borderRadius: BorderRadius.medium,
            borderWidth: 1,
            borderColor: themeColors.border,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
              Vehículos de la Empresa
            </Text>

            {vehiculos.length === 0 ? (
              <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                No hay vehículos registrados para esta empresa.
              </Text>
            ) : (
              <View style={{ gap: Spacing.one }}>
                {vehiculos.map((veh) => (
                  <View
                    key={veh.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: Spacing.two,
                      backgroundColor: themeColors.background,
                      borderRadius: BorderRadius.small,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      gap: 10,
                    }}
                  >
                    <Ionicons name="car" size={22} color={themeColors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 13 }}>
                        {veh.marca} {veh.modelo} ({veh.anio})
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        Placas: <Text style={{ fontWeight: 'bold' }}>{veh.placas}</Text>
                        {veh.numero_economico ? ` • Eco: ${veh.numero_economico}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Sección: Mis Cargas de Gasolina */}
          <View style={{
            marginHorizontal: Spacing.four,
            marginTop: Spacing.three,
            padding: Spacing.three,
            backgroundColor: themeColors.backgroundElement,
            borderRadius: BorderRadius.medium,
            borderWidth: 1,
            borderColor: themeColors.border,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text, marginBottom: Spacing.two }}>
              Mis Consumos de Gasolina
            </Text>

            {misRegistrosGasolina.length === 0 ? (
              <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginVertical: Spacing.two }}>
                No has registrado cargas de combustible.
              </Text>
            ) : (
              <View style={{ gap: Spacing.two }}>
                {misRegistrosGasolina.map((reg) => {
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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                            Vehículo: <Text style={{ color: themeColors.text, fontWeight: '500' }}>{reg.vehiculo_marca} {reg.vehiculo_modelo}</Text>
                          </Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                            Carga: <Text style={{ color: themeColors.text }}>{reg.litros} Lts</Text> • Odómetro: <Text style={{ color: themeColors.text }}>{reg.kilometraje_actual} km</Text>
                          </Text>
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
                            <Ionicons name="image-outline" size={12} color={themeColors.primary} />
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: themeColors.primary }}>Ver Ticket</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
