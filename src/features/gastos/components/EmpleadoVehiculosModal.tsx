import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { styles } from './empleadoGastosStyles';
import { useEmpleadoGastos } from '../hooks/useEmpleadoGastos';

interface EmpleadoVehiculosModalProps {
  emp: ReturnType<typeof useEmpleadoGastos>;
  themeColors: any;
}

export default function EmpleadoVehiculosModal({ emp, themeColors }: EmpleadoVehiculosModalProps) {
  const {
    employeeVehiculosModalVisible,
    setEmployeeVehiculosModalVisible,
    vehiculos,
    misRegistrosGasolina,
    formatFriendlyDate,
    setActivePreviewUrl,
    setViewerVisible,
  } = emp;

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={employeeVehiculosModalVisible}
      onRequestClose={() => setEmployeeVehiculosModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '85%', paddingBottom: Spacing.four }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Vehículos y Gasolina</Text>
            <TouchableOpacity onPress={() => setEmployeeVehiculosModalVisible(false)}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} style={{ flex: 1 }}>
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
              marginHorizontal: Spacing.two,
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
                    const formattedDate = formatFriendlyDate(reg.fecha);
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
        </View>
      </View>
    </Modal>
  );
}
