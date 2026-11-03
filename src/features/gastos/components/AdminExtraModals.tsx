import React from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { GastoHelper } from '@/services/supabase';
import { ReportGenerator } from '@/utils/reportGenerator';
import AsistenciaSemanalCard from '@/components/AsistenciaSemanalCard';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import ImageViewerModal from '@/components/ImageViewerModal';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';

interface AdminExtraModalsProps {
  vm: ReturnType<typeof useAdminGastos>;
}

export function AdminExtraModals({ vm }: AdminExtraModalsProps) {
  const {
    router,
    scheme,
    themeColors,
    company,
    showAlert,
    adminUser,
    personal,
    selectedGasto,
    vehiculos,
    registrosGasolina,
    newVehiculoMarca,
    setNewVehiculoMarca,
    newVehiculoModelo,
    setNewVehiculoModelo,
    newVehiculoAnio,
    setNewVehiculoAnio,
    newVehiculoPlacas,
    setNewVehiculoPlacas,
    newVehiculoNumEcon,
    setNewVehiculoNumEcon,
    vehiculoModalVisible,
    setVehiculoModalVisible,
    editingVehiculo,
    setEditingVehiculo,
    isSavingVehiculo,
    vehiculosManagerModalVisible,
    setVehiculosManagerModalVisible,
    personalModalVisible,
    setPersonalModalVisible,
    reportsModalVisible,
    setReportsModalVisible,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    addUserModalVisible,
    setAddUserModalVisible,
    newUserName,
    setNewUserName,
    newUserEmail,
    setNewUserEmail,
    newUserPassword,
    setNewUserPassword,
    newUserPhone,
    setNewUserPhone,
    newUserRole,
    setNewUserRole,
    isAddingUser,
    editUserModalVisible,
    setEditUserModalVisible,
    setEditingUser,
    editUserName,
    setEditUserName,
    editUserEmail,
    setEditUserEmail,
    editUserPassword,
    setEditUserPassword,
    editUserPhone,
    setEditUserPhone,
    editUserRole,
    setEditUserRole,
    isUpdatingUser,
    profileModalVisible,
    setProfileModalVisible,
    profilePhone,
    setProfilePhone,
    profilePassword,
    setProfilePassword,
    isSavingProfile,
    asistenciaModalVisible,
    setAsistenciaModalVisible,
    asistenciaEmpleado,
    setAsistenciaEmpleado,
    asistencias,
    setAsistencias,
    isLoadingAsistencias,
    asistenciaSelectedMonday,
    setAsistenciaSelectedMonday,
    isExportingAsistencia,
    asistenciaPreviewUrl,
    setAsistenciaPreviewUrl,
    asistenciaViewerVisible,
    setAsistenciaViewerVisible,
    selectedAsistenciaInfo,
    setSelectedAsistenciaInfo,
    isFetchingAsistencias,
    isFetchingInventario,
    isFetchingConsumos,
    isFetchingVentas,
    handleSaveProfile,
    handleAddUser,
    handleOpenEditUser,
    handleUpdateUser,
    handleDeleteUser,
    handleSaveVehiculo,
    handleEditVehiculo,
    handleDeleteVehiculo,
    handleToggleVehiculoActivo,
    handleOpenAsistencia,
    handleExportIndividualPDF,
    handleExportIndividualXLSX,
    handleExportPDF,
    handleExportCSV,
    handleExportAsistenciasPDF,
    handleExportAsistenciasCSV,
    handleExportInventarioPDF,
    handleExportInventarioCSV,
    handleExportConsumosPDF,
    handleExportConsumosCSV,
    handleExportVentasPDF,
    handleExportVentasCSV,
    formatFriendlyDate,
  } = vm;

  return (
    <>
      {/* MODAL 1.5 EXTRA: GESTIÓN DE VEHÍCULOS Y BITÁCORA */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={vehiculosManagerModalVisible}
        onRequestClose={() => setVehiculosManagerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '90%', paddingBottom: Spacing.four }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Módulo de Vehículos y Gasolina</Text>
              <TouchableOpacity onPress={() => setVehiculosManagerModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

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
                                await ReportGenerator.exportGasolinaToXLSX(
                                  registrosGasolina,
                                  `reporte_gasolina_${companyLabel}_${new Date().toISOString().split('T')[0]}.xlsx`
                                );
                              } catch (err: any) {
                                showAlert('Error Excel', err.message);
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
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Excel</Text>
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
          </View>
        </View>
      </Modal>

      {/* MODAL 1 EXTRA: PERSONAL MANAGER */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={personalModalVisible}
        onRequestClose={() => setPersonalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Administración de Personal</Text>
              <TouchableOpacity onPress={() => setPersonalModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              data={personal}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: Spacing.seven }}
              renderItem={({ item }) => (
                <View style={[styles.userCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <View style={styles.userIconContainer}>
                    <Ionicons name="person" size={20} color={themeColors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: themeColors.text }]}>{item.nombre}</Text>
                    <Text style={[styles.userEmail, { color: themeColors.textSecondary }]}>{item.email}</Text>
                    {!!item.telefono && <Text style={[styles.userEmail, { color: themeColors.textSecondary }]}>{item.telefono}</Text>}
                  </View>
                  <View style={styles.userMetaActions}>
                    <View style={[
                      styles.roleBadge,
                      {
                        backgroundColor: item.rol === 'ADMIN'
                          ? themeColors.danger + '18'
                          : item.rol === 'DEV'
                            ? '#8b5cf6' + '20'
                            : themeColors.accent + '18'
                      }
                    ]}>
                      <Text style={[
                        styles.roleText,
                        {
                          color: item.rol === 'ADMIN'
                            ? themeColors.danger
                            : item.rol === 'DEV'
                              ? '#8b5cf6'
                              : themeColors.accent
                        }
                      ]}>
                        {item.rol}
                      </Text>
                    </View>
                    <View style={styles.userCardButtons}>
                      <TouchableOpacity onPress={() => handleOpenAsistencia(item)} style={styles.userRowBtn}>
                        <Ionicons name="time-outline" size={18} color={themeColors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleOpenEditUser(item)} style={styles.userRowBtn}>
                        <Ionicons name="create-outline" size={18} color={themeColors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteUser(item.id, item.nombre)} style={styles.userRowBtn}>
                        <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: themeColors.textSecondary, textAlign: 'center', margin: Spacing.four }}>
                  Cargando personal...
                </Text>
              }
            />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAddUserModalVisible(true)}
              style={[styles.fab, { backgroundColor: themeColors.accent }]}
            >
              <Ionicons name="person-add" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2 EXTRA: REPORTES */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={reportsModalVisible}
        onRequestClose={() => setReportsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxHeight: '85%', paddingBottom: Spacing.four }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Exportar Reportes</Text>
              <TouchableOpacity onPress={() => setReportsModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportContent}>
              {/* Tarjeta 1: Reporte de Gastos */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="cash-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Gastos</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Consolidado de gastos registrados, estados y montos.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportPDF} style={{ flex: 1, height: 36 }} />
                  <CustomButton title="Excel" onPress={handleExportCSV} variant="success" style={{ flex: 1, height: 36 }} />
                </View>
              </View>

              {/* Tarjeta 2: Reporte de Asistencia */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="time-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Asistencia</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Entradas, salidas y ubicaciones de checado del personal.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportAsistenciasPDF} style={{ flex: 1, height: 36 }} loading={isFetchingAsistencias} />
                  <CustomButton title="Excel" onPress={handleExportAsistenciasCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingAsistencias} />
                </View>
              </View>

              {/* Tarjeta 3: Reporte de Inventario */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="cube-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Inventario</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Catálogo de productos, categorías y existencias en stock.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportInventarioPDF} style={{ flex: 1, height: 36 }} loading={isFetchingInventario} />
                  <CustomButton title="Excel" onPress={handleExportInventarioCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingInventario} />
                </View>
              </View>

              {/* Tarjeta 4: Reporte de Consumos */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one, marginTop: Spacing.two }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="receipt-outline" size={28} color={themeColors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Consumos</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Historial detallado de salidas y consumos de materiales.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportConsumosPDF} style={{ flex: 1, height: 36 }} loading={isFetchingConsumos} />
                  <CustomButton title="Excel" onPress={handleExportConsumosCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingConsumos} />
                </View>
              </View>

              {/* Tarjeta 5: Reporte de Ventas */}
              <View style={[styles.configCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, flexDirection: 'column', alignItems: 'stretch', gap: Spacing.one, marginTop: Spacing.two }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="bar-chart-outline" size={28} color={themeColors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.configCardTitle, { color: themeColors.text }]}>Reporte de Ventas</Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                      Resumen financiero de facturación, costos, utilidades y márgenes.
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: 4 }}>
                  <CustomButton title="PDF" onPress={handleExportVentasPDF} style={{ flex: 1, height: 36 }} loading={isFetchingVentas} />
                  <CustomButton title="Excel" onPress={handleExportVentasCSV} variant="success" style={{ flex: 1, height: 36 }} loading={isFetchingVentas} />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 1.1: Registro de Nuevo Usuario */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={addUserModalVisible}
        onRequestClose={() => setAddUserModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Registrar Personal</Text>
              <TouchableOpacity onPress={() => setAddUserModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre Completo *"
                placeholder="Nombre y Apellidos"
                value={newUserName}
                onChangeText={setNewUserName}
                iconName="person-outline"
              />

              <CustomInput
                label="Correo Electrónico *"
                placeholder={`correo@${company === 'daravisa' ? 'daravisa' : 'inttec'}.com`}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                iconName="mail-outline"
              />

              <CustomInput
                label="Contraseña *"
                placeholder="Ingresar contraseña inicial"
                secureTextEntry
                isPassword
                value={newUserPassword}
                onChangeText={setNewUserPassword}
                iconName="lock-closed-outline"
              />

              <CustomInput
                label="Teléfono"
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                value={newUserPhone}
                onChangeText={setNewUserPhone}
                iconName="call-outline"
              />

              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Rol Organizacional *</Text>
                <View style={styles.paymentSelector}>
                  {(['EMPLEADO', 'ADMIN', 'DEV'] as const).map((role) => {
                    const isActive = newUserRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => setNewUserRole(role)}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: isActive ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: isActive ? 'transparent' : themeColors.border,
                            flex: 1,
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: isActive ? '#ffffff' : themeColors.text }]}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <CustomButton
                title="Registrar"
                onPress={handleAddUser}
                loading={isAddingUser}
                style={{ marginTop: Spacing.three }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 1.2: Edición de Usuario Existente */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={editUserModalVisible}
        onRequestClose={() => {
          setEditUserModalVisible(false);
          setEditingUser(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Editar Personal</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditUserModalVisible(false);
                  setEditingUser(null);
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre Completo *"
                placeholder="Nombre y Apellidos"
                value={editUserName}
                onChangeText={setEditUserName}
                iconName="person-outline"
              />

              <CustomInput
                label="Correo Electrónico *"
                placeholder={`correo@${company === 'daravisa' ? 'daravisa' : 'inttec'}.com`}
                keyboardType="email-address"
                autoCapitalize="none"
                value={editUserEmail}
                onChangeText={setEditUserEmail}
                iconName="mail-outline"
              />

              <CustomInput
                label="Nueva Contraseña (Opcional)"
                placeholder="Dejar en blanco para conservar actual"
                secureTextEntry
                isPassword
                value={editUserPassword}
                onChangeText={setEditUserPassword}
                iconName="lock-closed-outline"
              />

              <CustomInput
                label="Teléfono"
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                value={editUserPhone}
                onChangeText={setEditUserPhone}
                iconName="call-outline"
              />

              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Rol Organizacional *</Text>
                <View style={styles.paymentSelector}>
                  {(['EMPLEADO', 'ADMIN', 'DEV'] as const).map((role) => {
                    const isActive = editUserRole === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => setEditUserRole(role)}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: isActive ? themeColors.accent : themeColors.backgroundElement,
                            borderColor: isActive ? 'transparent' : themeColors.border,
                            flex: 1,
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: isActive ? '#ffffff' : themeColors.text }]}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <CustomButton
                title="Guardar Cambios"
                onPress={handleUpdateUser}
                loading={isUpdatingUser}
                style={{ marginTop: Spacing.three }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de Mi Perfil (Admin) */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Mi Perfil</Text>
              <TouchableOpacity
                onPress={() => {
                  setProfileModalVisible(false);
                  setProfilePassword('');
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalDetails}>
                <CustomInput
                  label="Nombre Completo"
                  value={adminUser?.nombre || ''}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Correo Electrónico"
                  value={adminUser?.email || ''}
                  editable={false}
                  autoCapitalize="none"
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Rol"
                  value={adminUser?.rol || ''}
                  editable={false}
                  style={{ opacity: 0.7 }}
                />

                <CustomInput
                  label="Teléfono"
                  placeholder="Ej. 5512345678"
                  value={profilePhone}
                  onChangeText={setProfilePhone}
                  keyboardType="phone-pad"
                />

                <CustomInput
                  label="Nueva Contraseña (Opcional)"
                  placeholder="Dejar en blanco para no cambiar"
                  value={profilePassword}
                  onChangeText={setProfilePassword}
                  isPassword
                  autoCapitalize="none"
                />

                <View style={{ marginTop: Spacing.two }}>
                  <CustomButton
                    title="Guardar Cambios"
                    onPress={handleSaveProfile}
                    loading={isSavingProfile}
                    variant="primary"
                  />
                </View>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 1,
                    borderColor: scheme === 'dark' ? '#0284c7' : '#bae6fd',
                    marginTop: Spacing.two,
                  }}
                  onPress={() => {
                    setProfileModalVisible(false);
                    router.push('/(admin)/documentos?tab=mis_documentos' as any);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="pencil" size={16} color="#0284c7" />
                    <Text style={{ color: '#0284c7', fontWeight: 'bold', fontSize: 13 }}>
                      Mis Documentos por Firmar
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#0284c7" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        imageUrls={selectedGasto ? GastoHelper.getFotoUrls(selectedGasto) : (activePreviewUrl ? (activePreviewUrl.includes(',') ? activePreviewUrl.split(',').map(u => u.trim()) : [activePreviewUrl]) : [])}
        initialIndex={viewerInitialIndex}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />

      {/* ========== MODAL: Historial de Asistencia ========== */}
      <Modal statusBarTranslucent={true}
        animationType="slide"
        transparent={true}
        visible={asistenciaModalVisible}
        onRequestClose={() => {
          setAsistenciaModalVisible(false);
          setAsistenciaEmpleado(null);
          setAsistencias([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '88%', padding: 0 }]}>
            <View style={[styles.modalHeader, { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Historial de Asistencia Semanal</Text>
                {asistenciaEmpleado && (
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    👤 {asistenciaEmpleado.nombre}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => {
                setAsistenciaModalVisible(false);
                setAsistenciaEmpleado(null);
                setAsistencias([]);
              }}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Quick Export Actions */}
            {asistenciaEmpleado && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.four, paddingBottom: Spacing.two }}>
                <TouchableOpacity
                  onPress={handleExportIndividualPDF}
                  disabled={isExportingAsistencia}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    borderRadius: BorderRadius.medium,
                    backgroundColor: '#EF4444',
                    opacity: isExportingAsistencia ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="document-text" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Descargar PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleExportIndividualXLSX}
                  disabled={isExportingAsistencia}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    borderRadius: BorderRadius.medium,
                    backgroundColor: '#10B981',
                    opacity: isExportingAsistencia ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="grid" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Descargar Excel</Text>
                </TouchableOpacity>
              </View>
            )}

            {isLoadingAsistencias ? (
              <View style={[styles.loaderContainer, { flex: 1 }]}>
                <ActivityIndicator size="large" color={themeColors.accent} />
                <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando semana...</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1, paddingHorizontal: Spacing.four }}
                contentContainerStyle={{ paddingBottom: Spacing.seven }}
                showsVerticalScrollIndicator={false}
              >
                <AsistenciaSemanalCard
                  asistencias={asistencias}
                  empleadoId={asistenciaEmpleado?.id}
                  empleadoNombre={asistenciaEmpleado?.nombre || 'Empleado'}
                  empleadoRol={asistenciaEmpleado?.rol}
                  isLoading={isLoadingAsistencias}
                  onRefresh={() => {
                    if (asistenciaEmpleado) {
                      handleOpenAsistencia(asistenciaEmpleado, asistenciaSelectedMonday);
                    }
                  }}
                  selectedMonday={asistenciaSelectedMonday}
                  onChangeWeek={(newMonday) => {
                    setAsistenciaSelectedMonday(newMonday);
                    if (asistenciaEmpleado) {
                      handleOpenAsistencia(asistenciaEmpleado, newMonday);
                    }
                  }}
                  onViewFoto={(info) => {
                    setAsistenciaPreviewUrl(info.url);
                    setSelectedAsistenciaInfo({
                      fecha: info.fecha,
                      hora: info.hora,
                      direccion: info.direccion,
                      lat: info.lat,
                      lng: info.lng,
                      empleadoNombre: info.empleadoNombre,
                      tipo: info.tipo,
                    });
                    setAsistenciaViewerVisible(true);
                  }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Image Viewer for Attendance Photos */}
      <ImageViewerModal
        visible={asistenciaViewerVisible}
        imageUrl={asistenciaPreviewUrl}
        asistenciaInfo={selectedAsistenciaInfo}
        onClose={() => {
          setAsistenciaViewerVisible(false);
          setAsistenciaPreviewUrl(null);
          setSelectedAsistenciaInfo(null);
        }}
      />
    </>
  );
}
