import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import { adminInventarioStyles as styles } from './adminInventarioStyles';
import { AdminInventarioHook } from '../hooks/useAdminInventario';

export function AdminRetribucionesTab({ inv }: { inv: AdminInventarioHook }) {
  const {
    themeColors,
    empleados,
    selectedEmpleadoRetribucion,
    setSelectedEmpleadoRetribucion,
    setSelectorTitle,
    setSelectorSearch,
    setSelectorOptions,
    setOnSelectOption,
    setSelectorVisible,
    loadRetribuciones,
    loadDevolucionesPendientes,
    fetchEmployeeInventory,
    handleOpenAsignarModal,
    isLoadingRetribuciones,
    devolucionesData,
    isApprovingDevolucion,
    handleAprobarDevolucion,
    retribucionesData,
    handleOpenVerifyModal,
    verifyModalVisible,
    setVerifyModalVisible,
    isVerifying,
    handleConfirmVerification,
    employeeInventoryModalVisible,
    setEmployeeInventoryModalVisible,
    isLoadingEmployeeInventory,
    employeeInventoryData,
  } = inv;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View style={{ backgroundColor: themeColors.backgroundElement, borderRadius: 12, padding: 16, marginBottom: 16, borderColor: themeColors.border, borderWidth: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text, marginBottom: 8 }}>Dashboard de Retribuciones y Devoluciones</Text>
        <Text style={{ color: themeColors.textSecondary, marginBottom: 16 }}>Selecciona un empleado para revisar sus evidencias reportadas y aprobar sus devoluciones de material al almacén.</Text>
        <Text style={{ color: themeColors.text, fontWeight: '600', marginBottom: 4 }}>Empleado</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: themeColors.background, borderColor: themeColors.border, borderWidth: 1, padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between' }}
            onPress={() => {
              setSelectorTitle('Seleccionar Empleado');
              setSelectorSearch('');
              setSelectorOptions(empleados.map(e => ({ id: e.id, label: e.nombre })));
              setOnSelectOption(() => (id: string) => {
                setSelectedEmpleadoRetribucion(id);
                loadRetribuciones(id);
                loadDevolucionesPendientes(id);
              });
              setSelectorVisible(true);
            }}
          >
            <Text style={{ color: selectedEmpleadoRetribucion ? themeColors.text : themeColors.textSecondary }}>
              {empleados.find(e => e.id === selectedEmpleadoRetribucion)?.nombre || 'Seleccionar un empleado...'}
            </Text>
          </TouchableOpacity>
          {!!selectedEmpleadoRetribucion && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => fetchEmployeeInventory(selectedEmpleadoRetribucion)}
                style={{ backgroundColor: themeColors.primary, padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                {...(Platform.OS === 'web' ? { title: "Ver Inventario en Camioneta" } as any : {})}
              >
                <Ionicons name="cube-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenAsignarModal(selectedEmpleadoRetribucion)}
                style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 }}
                {...(Platform.OS === 'web' ? { title: "Asignar Material a este Empleado" } as any : {})}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Asignar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {isLoadingRetribuciones ? (
        <ActivityIndicator size="large" color={themeColors.primary} style={{ marginTop: 40 }} />
      ) : !!selectedEmpleadoRetribucion && (
        <View style={{ flex: 1 }}>
          {/* SECCIÓN DE DEVOLUCIONES PENDIENTES */}
          {devolucionesData.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.primary, marginBottom: 12 }}>Solicitudes de Devolución Pendientes</Text>
              {devolucionesData.map(dev => {
                let mats: any[] = [];
                try {
                  if (Array.isArray(dev.materiales)) {
                    mats = dev.materiales;
                  } else if (typeof dev.materiales === 'string') {
                    mats = JSON.parse(dev.materiales || '[]');
                  } else if (dev.materiales && typeof dev.materiales === 'object') {
                    mats = [dev.materiales];
                  }
                } catch {
                  mats = [];
                }
                if (!Array.isArray(mats)) mats = [];
                return (
                  <View key={dev.id} style={{ backgroundColor: themeColors.backgroundElement, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: themeColors.primary }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>Solicitud del: {new Date(dev.creado_en).toLocaleDateString()}</Text>
                    </View>
                    {dev.observaciones ? <Text style={{ color: themeColors.textSecondary, marginBottom: 8 }}>Obs: {dev.observaciones}</Text> : null}

                    <View style={{ backgroundColor: themeColors.background, padding: 12, borderRadius: 8, marginBottom: 12, gap: 8 }}>
                      {mats.map((m: any, idx: number) => {
                        const qNuevo = Number(m.devolver_nuevo) || 0;
                        const qUsado = Number(m.devolver_usado) || 0;
                        const qPorRev = Number(m.devolver_por_revisar) || 0;
                        const hasBreakdown = qNuevo > 0 || qUsado > 0 || qPorRev > 0;

                        return (
                          <View key={idx} style={{ borderBottomWidth: idx < mats.length - 1 ? 1 : 0, borderBottomColor: themeColors.border, paddingBottom: 6 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13, flex: 1, paddingRight: 8 }}>{m.nombre}</Text>
                              <View style={{ alignItems: 'flex-end' }}>
                                {Number(m.devolver) > 0 && (
                                  <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 13 }}>+ {m.devolver} {m.unidad || 'un.'} (Devuelto)</Text>
                                )}
                                {Number(m.gastar) > 0 && (
                                  <Text style={{ color: themeColors.danger || '#EF4444', fontWeight: 'bold', fontSize: 13 }}>- {m.gastar} {m.unidad || 'un.'} (Gastado)</Text>
                                )}
                              </View>
                            </View>
                            {hasBreakdown && (
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {qNuevo > 0 && (
                                  <View style={{ backgroundColor: '#10B98118', borderColor: '#10B981', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>🟢 Nuevas: {qNuevo}</Text>
                                  </View>
                                )}
                                {qUsado > 0 && (
                                  <View style={{ backgroundColor: '#D9770618', borderColor: '#D97706', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>🟡 Usadas: {qUsado}</Text>
                                  </View>
                                )}
                                {qPorRev > 0 && (
                                  <View style={{ backgroundColor: '#DC262618', borderColor: '#DC2626', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>🔴 Dañado/Incompleto: {qPorRev}</Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <CustomButton
                      title="Aprobar Devolución (Ingresar al Almacén)"
                      variant="primary"
                      onPress={() => handleAprobarDevolucion(dev)}
                      loading={isApprovingDevolucion}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {/* SECCIÓN DE EVIDENCIAS */}
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text, marginBottom: 12 }}>Historial de Evidencias</Text>

          {retribucionesData.length === 0 ? (
            <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20 }}>No hay evidencias reportadas.</Text>
          ) : (
            retribucionesData.map(evidencia => (
              <View key={evidencia.id} style={{ backgroundColor: themeColors.backgroundElement, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: themeColors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>{evidencia.cliente || 'Sin Cliente'}</Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>{evidencia.fecha}</Text>
                </View>

                {evidencia.materiales.length === 0 && (
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 8 }}>
                    No se reportó uso de materiales del inventario de la camioneta.
                  </Text>
                )}

                {evidencia.materiales.map((m: any, idx: number) => (
                  <View key={idx} style={{ backgroundColor: themeColors.background, padding: 10, borderRadius: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.text, marginBottom: 4 }}>{m.nombre}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Usado: <Text style={{ color: themeColors.text, fontWeight: 'bold' }}>{m.usado}</Text></Text>
                      <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Queda en Camioneta: <Text style={{ color: m.sobrante > 0 ? themeColors.warning : themeColors.success, fontWeight: 'bold' }}>{m.sobrante}</Text></Text>
                    </View>
                  </View>
                ))}

                {evidencia.sobrantes_verificados ? (
                  <View style={{ marginTop: 8, padding: 8, backgroundColor: themeColors.success + '20', borderRadius: 8, alignItems: 'center' }}>
                    <Text style={{ color: themeColors.success, fontWeight: 'bold' }}>✓ Evidencia Revisada</Text>
                  </View>
                ) : (
                  <CustomButton
                    title="Marcar Evidencia como Revisada"
                    variant="secondary"
                    onPress={() => handleOpenVerifyModal(evidencia)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </View>
            ))
          )}
          {retribucionesData.length > 0 && <View style={{ height: 100 }} />}
        </View>
      )}

      {/* Modal de Verificación Simple */}
      <Modal statusBarTranslucent={true} visible={verifyModalVisible} animationType="fade" transparent={true} onRequestClose={() => setVerifyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Confirmar Revisión</Text>
              <TouchableOpacity onPress={() => setVerifyModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: Spacing.three }}>
              <Text style={{ color: themeColors.textSecondary }}>
                ¿Confirmas que has revisado esta evidencia y las cantidades reportadas como &quot;Usadas&quot; tienen sentido con el trabajo realizado?
              </Text>
            </View>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <CustomButton title="Cancelar" variant="secondary" onPress={() => setVerifyModalVisible(false)} style={{ flex: 1, marginRight: Spacing.one }} />
              <CustomButton title="Confirmar Revisión" variant="primary" onPress={handleConfirmVerification} loading={isVerifying} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Inventario del Empleado */}
      <Modal statusBarTranslucent={true} visible={employeeInventoryModalVisible} animationType="fade" transparent={true} onRequestClose={() => setEmployeeInventoryModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.backgroundElement, maxHeight: '80%', width: '90%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Inventario en Camioneta</Text>
              <TouchableOpacity onPress={() => setEmployeeInventoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {isLoadingEmployeeInventory ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={themeColors.primary} />
              </View>
            ) : (
              <ScrollView style={{ padding: Spacing.three }}>
                {employeeInventoryData.length === 0 ? (
                  <Text style={{ color: themeColors.textSecondary, textAlign: 'center', marginTop: 20, marginBottom: 20 }}>El empleado no tiene material registrado en su inventario.</Text>
                ) : (
                  employeeInventoryData.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 14 }}>{item.productos?.nombre_oficial || 'Producto desconocido'}</Text>
                        <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>SKU: {item.productos?.sku_interno || '-'}</Text>
                      </View>
                      <View style={{ backgroundColor: themeColors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                        <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 14 }}>{item.cantidad_disponible} {item.productos?.unidad || 'pzas'}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border, gap: 10 }]}>
              <CustomButton title="Cerrar" variant="secondary" onPress={() => setEmployeeInventoryModalVisible(false)} style={{ flex: 1 }} />
              <CustomButton
                title="➕ Cargar Más Material"
                onPress={() => {
                  setEmployeeInventoryModalVisible(false);
                  handleOpenAsignarModal(selectedEmpleadoRetribucion);
                }}
                style={{ flex: 1.4, backgroundColor: '#2563EB' }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
