import React, { createElement } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Keyboard,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { isCombustibleExpense } from '@/utils/helpers';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import ImageViewerModal from '@/components/ImageViewerModal';
import {
  useGastoForm,
  BloqueProyectoCategoria,
  SubtipoTraslado,
} from '../hooks/useGastoForm';
import { GastoFormRole, GastoFormMode } from '../types';
import { styles } from './gastoFormStyles';
import GastoSplitModal from './GastoSplitModal';
import NuevoProveedorModal from './NuevoProveedorModal';

interface GastoFormViewProps {
  role: GastoFormRole;
  mode: GastoFormMode;
  gastoId?: string;
}

const BLOQUES_PROYECTO: {
  id: BloqueProyectoCategoria;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  desc: string;
}[] = [
  { id: 'ALIMENTOS', label: 'Alimentos', icon: 'restaurant-outline', desc: 'Comidas y propinas' },
  { id: 'HOSPEDAJE', label: 'Hospedaje', icon: 'bed-outline', desc: 'Hotel por rango de fechas' },
  { id: 'MATERIAL', label: 'Material', icon: 'construct-outline', desc: 'Eléctrico, ferretería...' },
  { id: 'EQUIPO', label: 'Equipo', icon: 'hardware-chip-outline', desc: 'Seguridad, paneles...' },
  { id: 'TRANSPORTE', label: 'Transporte', icon: 'car-sport-outline', desc: 'Combustible y traslados' },
];

const SUBTIPOS_TRASLADO: {
  id: SubtipoTraslado;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'CASETAS', label: 'Casetas', icon: 'trail-sign-outline' },
  { id: 'ESTACIONAMIENTOS', label: 'Estacionamientos', icon: 'ticket-outline' },
  { id: 'MULTAS', label: 'Multas', icon: 'document-text-outline' },
  { id: 'UBER', label: 'Uber / Taxis', icon: 'car-outline' },
  { id: 'VUELOS', label: 'Vuelos', icon: 'airplane-outline' },
  { id: 'OTRO', label: 'Otros', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function GastoFormView({ role, mode, gastoId }: GastoFormViewProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const form = useGastoForm({ role, mode, gastoId });

  const {
    currentUser,
    isSubmitting,
    isLoadingGasto,
    proyectos,
    selectedProyectoId,
    selectedProyectoObj,
    comentarioProyecto,
    setComentarioProyecto,
    proyectoSearch,
    setProyectoSearch,
    showProyectoDropdown,
    setShowProyectoDropdown,
    tipoGasto,
    bloqueProyecto,
    subtipoTransporte,
    subtipoTraslado,
    fechaHospedajeInicio,
    setFechaHospedajeInicio,
    fechaHospedajeFin,
    setFechaHospedajeFin,
    showHospedajeInicioPicker,
    setShowHospedajeInicioPicker,
    showHospedajeFinPicker,
    setShowHospedajeFinPicker,
    isHistoricoSinProyecto,
    hospedajeRecienteAviso,
    hospedajePreview,
    handleSelectTipoGasto,
    handleSelectProyecto,
    handleSelectBloqueProyecto,
    handleSelectSubtipoTransporte,
    handleSelectSubtipoTraslado,
    categorias,
    filteredSubcategorias,
    selectedCategoria,
    setSelectedCategoria,
    selectedSubcategoria,
    setSelectedSubcategoria,
    showCatDropdown,
    setShowCatDropdown,
    showSubDropdown,
    setShowSubDropdown,
    clientes,
    selectedCliente,
    setSelectedCliente,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    sucursalesCliente,
    sucursal,
    setSucursal,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    comentarioSucursal,
    setComentarioSucursal,
    proveedores,
    proveedor,
    setProveedor,
    proveedorSearch,
    setProveedorSearch,
    showProvDropdown,
    setShowProvDropdown,
    comentarioProveedor,
    setComentarioProveedor,
    setNuevoProvNombre,
    setNuevoProvRfc,
    setModalNuevoProveedorVisible,
    ticketFiles,
    activeTicketIndex,
    setActiveTicketIndex,
    imageUri,
    setImageUri,
    setImageBase64,
    imageExt,
    setImageExt,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    setViewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    allUsers,
    selectedEmpleados,
    setSelectedEmpleados,
    showEmpList,
    setShowEmpList,
    monto,
    setMonto,
    fechaComprobante,
    setFechaComprobante,
    showDatePicker,
    setShowDatePicker,
    dateValue,
    setDateValue,
    onChangeDate,
    alertaPolitica,
     setAlertaPolitica,
    alertaLocal,
    incluyePropina,
    setIncluyePropina,
    montoPropina,
    setMontoPropina,
    esComida,
    justificacion,
    setJustificacion,
    detalleServicioProyecto,
    setDetalleServicioProyecto,
    metodoPago,
    setMetodoPago,
    tipoTarjeta,
    setTipoTarjeta,
    facturado,
    setFacturado,
    facturaStatus,
    setFacturaStatus,
    comentarioPendiente,
    setComentarioPendiente,
    facturaPdf,
    setFacturaPdf,
    motivoSinFactura,
    setMotivoSinFactura,
    vehiculos,
    selectedVehiculoId,
    setSelectedVehiculoId,
    kilometrajeActual,
    setKilometrajeActual,
    litrosGasolina,
    setLitrosGasolina,
    showVehiculoDropdown,
    setShowVehiculoDropdown,
    isSplit,
    setIsSplit,
    splits,
    setSplits,
    setNewSplitClienteId,
    setNewSplitSucursalNombre,
    setNewSplitComentarioSucursal,
    setNewSplitMonto,
    setSplitClienteSearch,
    setSplitSucursalSearch,
    setShowNewSplitCliDropdown,
    setShowNewSplitSucDropdown,
    setShowSplitModal,
    handleCapturePhoto,
    handleSelectGallery,
    handleRemoveTicket,
    handleClearAllTickets,
    handleSelectDocument,
    handleSelectFacturaPdf,
    handlePreviewPdf,
    handleRemoveFacturaPdf,
    handleAddNewCliente,
    handleAddNewSucursal,
    handleSaveGasto,
    closeAllDropdowns,
  } = form;

  const esGasolina =
    (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'COMBUSTIBLE') ||
    isCombustibleExpense(selectedCategoria, selectedSubcategoria);

  const esHospedaje = tipoGasto === 'PROYECTO' && bloqueProyecto === 'HOSPEDAJE';
  const esAlimentos = (tipoGasto === 'PROYECTO' && bloqueProyecto === 'ALIMENTOS') || esComida;
  const esMaterialOEquipo =
    tipoGasto === 'PROYECTO' && (bloqueProyecto === 'MATERIAL' || bloqueProyecto === 'EQUIPO');
  const esTraslado =
    tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'TRASLADOS';

  const parseIsoToDate = (iso: string) => {
    const parts = (iso || '').split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  };

  if (isLoadingGasto) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, fontWeight: '600' }}>
          Cargando información del gasto...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {role === 'admin' && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {mode === 'edit' ? 'Editar Gasto' : 'Registrar Gasto'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
        >
          <Pressable onPress={closeAllDropdowns} style={{ flex: 1, gap: Spacing.three, marginTop: Spacing.two }}>
            {/* Banner de Gasto Histórico en modo edición */}
            {mode === 'edit' && isHistoricoSinProyecto && (
              <View
                style={[
                  styles.alertBanner,
                  {
                    backgroundColor: themeColors.warning + '15',
                    borderColor: themeColors.warning,
                  },
                ]}
              >
                <Ionicons name="time-outline" size={22} color={themeColors.warning} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: themeColors.warning }]}>
                    Gasto Histórico (Sin Proyecto Asignado)
                  </Text>
                  <Text style={[styles.alertText, { color: themeColors.text }]}>
                    Puedes asignarlo a un proyecto activo seleccionándolo abajo, clasificarlo como Gasto Operativo o conservar sus datos actuales.
                  </Text>
                </View>
              </View>
            )}

            {/* Alertas de Políticas / IA */}
            {!!(alertaPolitica || alertaLocal) && (
              <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
                <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
                  <Text style={[styles.alertText, { color: themeColors.text }]}>
                    {[alertaPolitica, alertaLocal].filter(Boolean).join('\n')}
                  </Text>
                </View>
              </View>
            )}

            {/* =========================================================
                SECCIÓN 1: DESTINO DEL GASTO (PROYECTO VS OPERATIVO)
               ========================================================= */}
            <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: Spacing.one }]}>
                1. ¿A dónde corresponde este gasto?
              </Text>

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <TouchableOpacity
                  onPress={() => handleSelectTipoGasto('PROYECTO')}
                  style={{
                    flex: 1,
                    padding: Spacing.two,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 2,
                    borderColor: tipoGasto === 'PROYECTO' ? themeColors.primary : themeColors.border,
                    backgroundColor: tipoGasto === 'PROYECTO' ? themeColors.primary + '15' : themeColors.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons
                    name="briefcase"
                    size={22}
                    color={tipoGasto === 'PROYECTO' ? themeColors.primary : themeColors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: tipoGasto === 'PROYECTO' ? themeColors.primary : themeColors.text }}>
                      Proyecto
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Obra o servicio activo
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSelectTipoGasto('OPERATIVO')}
                  style={{
                    flex: 1,
                    padding: Spacing.two,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 2,
                    borderColor: tipoGasto === 'OPERATIVO' ? themeColors.accent : themeColors.border,
                    backgroundColor: tipoGasto === 'OPERATIVO' ? themeColors.accent + '15' : themeColors.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons
                    name="business"
                    size={22}
                    color={tipoGasto === 'OPERATIVO' ? themeColors.accent : themeColors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: tipoGasto === 'OPERATIVO' ? themeColors.accent : themeColors.text }}>
                      Operativo / General
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Oficina, IMSS, servicios...
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Selector de Proyecto Activo */}
              {tipoGasto === 'PROYECTO' && (
                <View style={{ marginTop: Spacing.two, zIndex: 1200 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: themeColors.primary + '15',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: BorderRadius.medium,
                      borderWidth: 1,
                      borderColor: themeColors.primary + '30',
                      marginBottom: Spacing.one,
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={themeColors.primary} />
                    <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '500', flex: 1 }}>
                      Si no se encuentra tu proyecto en la lista, déjalo en blanco e indícalo abajo
                    </Text>
                  </View>

                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                    Proyecto Activo
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.dropdownTrigger,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: selectedProyectoObj ? themeColors.primary : themeColors.border,
                      },
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowProyectoDropdown(!showProyectoDropdown);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons
                        name="folder-open"
                        size={18}
                        color={selectedProyectoObj ? themeColors.primary : themeColors.textSecondary}
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          fontWeight: selectedProyectoObj ? '700' : '400',
                          color: selectedProyectoObj ? themeColors.text : themeColors.textSecondary,
                        }}
                      >
                        {selectedProyectoObj
                          ? selectedProyectoObj.nombre
                          : 'Seleccionar proyecto (o dejar en blanco)...'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {!!selectedProyectoObj && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            handleSelectProyecto(null);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      <Ionicons name={showProyectoDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </View>
                  </TouchableOpacity>

                  {selectedProyectoObj && (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginTop: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: BorderRadius.small,
                        backgroundColor: themeColors.primary + '10',
                      }}
                    >
                      {!!(selectedProyectoObj.cliente_nombre || selectedCliente) && (
                        <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600' }}>
                          👤 Cliente: {selectedProyectoObj.cliente_nombre || selectedCliente}
                        </Text>
                      )}
                      {!!(selectedProyectoObj.sucursal_nombre || sucursal) && (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>
                          📍 Sucursal: {selectedProyectoObj.sucursal_nombre || sucursal}
                        </Text>
                      )}
                    </View>
                  )}

                  {showProyectoDropdown && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1300, marginTop: 4 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <CustomInput
                          placeholder="Buscar proyecto por nombre, cliente o sucursal..."
                          value={proyectoSearch}
                          onChangeText={setProyectoSearch}
                          iconName="search-outline"
                          style={{ margin: Spacing.one, height: 40 }}
                        />
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 220, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {/* Opción Dejar en Blanco (igual que Proveedor) */}
                          <TouchableOpacity
                            style={[
                              styles.dropdownItem,
                              {
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: Spacing.one,
                                borderBottomWidth: 1,
                                borderBottomColor: themeColors.border,
                              },
                            ]}
                            onPress={() => handleSelectProyecto(null)}
                          >
                            <Ionicons name="remove-circle-outline" size={20} color={themeColors.textSecondary} />
                            <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>
                              Dejar en blanco (No encuentro mi proyecto / Proyecto nuevo)
                            </Text>
                          </TouchableOpacity>

                          {/* Atajo rápido si escribió un nombre que no existe en la lista */}
                          {proyectoSearch.trim().length > 0 &&
                            !proyectos.some((p) => (p.nombre || '').toLowerCase() === proyectoSearch.trim().toLowerCase()) && (
                              <TouchableOpacity
                                style={[
                                  styles.dropdownItem,
                                  {
                                    backgroundColor: themeColors.primary + '15',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: Spacing.one,
                                    borderBottomWidth: 1,
                                    borderBottomColor: themeColors.border,
                                  },
                                ]}
                                onPress={() => {
                                  const textoBuscado = proyectoSearch.trim();
                                  handleSelectProyecto(null);
                                  setComentarioProyecto(textoBuscado);
                                }}
                              >
                                <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} />
                                <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 13 }}>
                                  {`➕ Sugerir "${proyectoSearch.trim()}" en Proyecto a agregar`}
                                </Text>
                              </TouchableOpacity>
                            )}

                          {proyectos
                            .filter((p) => {
                              const q = proyectoSearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                (p.nombre || '').toLowerCase().includes(q) ||
                                (p.cliente_nombre || '').toLowerCase().includes(q) ||
                                (p.sucursal_nombre || '').toLowerCase().includes(q)
                              );
                            })
                            .map((proj, idx, arr) => (
                              <TouchableOpacity
                                key={proj.id}
                                style={[
                                  styles.dropdownItem,
                                  idx === arr.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
                                ]}
                                onPress={() => handleSelectProyecto(proj)}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>
                                    {proj.nombre}
                                  </Text>
                                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 2 }}>
                                    {[proj.cliente_nombre, proj.sucursal_nombre].filter(Boolean).join(' • ') || 'Proyecto Activo'}
                                  </Text>
                                </View>
                                {String(selectedProyectoId) === String(proj.id) && (
                                  <Ionicons name="checkmark-circle" size={20} color={themeColors.primary} />
                                )}
                              </TouchableOpacity>
                            ))}

                          {proyectos.length === 0 && (
                            <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                                No se encontraron proyectos activos. Puedes dejarlo en blanco e indicarlo abajo.
                              </Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}

                  {/* Campo obligatorio "Proyecto a agregar *" cuando se deja en blanco (misma lógica que Proveedor) */}
                  {!selectedProyectoId && (
                    <View style={{ marginTop: Spacing.two, gap: Spacing.two }}>
                      <View>
                        <CustomInput
                          label="Proyecto a agregar *"
                          placeholder="Escribe el nombre del proyecto u obra que no encontraste..."
                          value={comentarioProyecto}
                          onChangeText={setComentarioProyecto}
                          iconName="create-outline"
                        />
                        <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: -8, paddingLeft: 4 }}>
                          {role === 'admin'
                            ? 'Indica el nombre del proyecto para darlo de alta en el catálogo y vincular este gasto.'
                            : 'Indica el nombre del proyecto para que el administrador lo dé de alta y pueda aprobar tu gasto.'}
                        </Text>
                      </View>

                      <View style={styles.customDropdownContainer}>
                        <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
                        <TouchableOpacity
                          style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                          onPress={() => {
                            Keyboard.dismiss();
                            setShowCliDropdown(!showCliDropdown);
                          }}
                        >
                          <Text style={{ color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                            {selectedCliente || 'Selecciona un cliente'}
                          </Text>
                          <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                        </TouchableOpacity>
                        {showCliDropdown && (
                          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                            <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                              <CustomInput
                                placeholder="Buscar cliente..."
                                value={clienteSearch}
                                onChangeText={setClienteSearch}
                                iconName="search-outline"
                                style={{ margin: Spacing.one, height: 40 }}
                              />
                              <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                                {(role === 'admin' || mode === 'edit') &&
                                  clienteSearch.trim().length > 0 &&
                                  !clientes.some((c) => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                                    <TouchableOpacity
                                      style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                                      onPress={() => handleAddNewCliente(clienteSearch)}
                                    >
                                      <Ionicons name="add-circle-outline" size={20} color={themeColors.accent} />
                                      <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 13 }}>
                                        {`➕ Agregar "${clienteSearch.trim()}"`}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                {clientes
                                  .filter((cli) => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                                  .map((cli) => (
                                    <TouchableOpacity
                                      key={cli.id}
                                      style={styles.dropdownItem}
                                      onPress={() => {
                                        setSelectedCliente(cli.nombre);
                                        const cliSucs = sucursalesCliente.filter((s) => s.cliente_id === cli.id);
                                        setSucursal(cliSucs.length === 1 ? cliSucs[0].nombre : '');
                                        setClienteSearch('');
                                        setShowCliDropdown(false);
                                      }}
                                    >
                                      <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                                    </TouchableOpacity>
                                  ))}
                              </ScrollView>
                            </View>
                          </Pressable>
                        )}
                      </View>

                      {!!selectedCliente && (
                        <View style={styles.customDropdownContainer}>
                          <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal del Cliente *</Text>
                          <TouchableOpacity
                            style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                            onPress={() => {
                              Keyboard.dismiss();
                              setShowSucursalDropdown(!showSucursalDropdown);
                            }}
                          >
                            <Text style={{ color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                              {sucursal || 'Selecciona una sucursal'}
                            </Text>
                            <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                          </TouchableOpacity>
                          {showSucursalDropdown && (
                            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                              <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                                <CustomInput
                                  placeholder="Buscar sucursal..."
                                  value={sucursalSearch}
                                  onChangeText={setSucursalSearch}
                                  iconName="search-outline"
                                  style={{ margin: Spacing.one, height: 40 }}
                                />
                                <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                                  {(() => {
                                    const currentCliente = clientes.find(
                                      (c) => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase() || c.id === selectedCliente
                                    );
                                    const filteredSucs = currentCliente
                                      ? sucursalesCliente.filter(
                                          (s) => s.cliente_id === currentCliente.id && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())
                                        )
                                      : [];
                                    return (
                                      <>
                                        {(role === 'admin' || mode === 'edit') &&
                                          sucursalSearch.trim().length > 0 &&
                                          currentCliente &&
                                          !filteredSucs.some((s) => s.nombre.trim().toLowerCase() === sucursalSearch.trim().toLowerCase()) && (
                                            <TouchableOpacity
                                              style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15' }]}
                                              onPress={() => handleAddNewSucursal(sucursalSearch)}
                                            >
                                              <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                                                {`➕ Agregar "${sucursalSearch.trim().toUpperCase()}"`}
                                              </Text>
                                            </TouchableOpacity>
                                          )}
                                        {filteredSucs.map((suc) => (
                                          <TouchableOpacity
                                            key={suc.id}
                                            style={styles.dropdownItem}
                                            onPress={() => {
                                              setSucursal(suc.nombre);
                                              setSucursalSearch('');
                                              setShowSucursalDropdown(false);
                                            }}
                                          >
                                            <Text style={{ color: themeColors.text, fontSize: 14 }}>{suc.nombre}</Text>
                                          </TouchableOpacity>
                                        ))}
                                      </>
                                    );
                                  })()}
                                </ScrollView>
                              </View>
                            </Pressable>
                          )}
                          {role === 'empleado' && !sucursal && (
                            <View style={{ marginTop: Spacing.one }}>
                              <CustomInput
                                label="Sucursal a agregar (si no aparece en la lista)"
                                placeholder="Escribe el nombre de la sucursal..."
                                value={comentarioSucursal}
                                onChangeText={setComentarioSucursal}
                                iconName="business-outline"
                              />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* =========================================================
                SECCIÓN 2: CATEGORÍA DEL GASTO (5 BLOQUES U OPERATIVO)
               ========================================================= */}
            <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: Spacing.one }]}>
                2. ¿Qué tipo de gasto es?
              </Text>

              {tipoGasto === 'PROYECTO' ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {BLOQUES_PROYECTO.map((b) => {
                      const active = bloqueProyecto === b.id;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          onPress={() => handleSelectBloqueProyecto(b.id)}
                          style={{
                            minWidth: '30%',
                            flexGrow: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 10,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1.5,
                            borderColor: active ? themeColors.primary : themeColors.border,
                            backgroundColor: active ? themeColors.primary + '15' : themeColors.background,
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Ionicons
                            name={b.icon}
                            size={22}
                            color={active ? themeColors.primary : themeColors.textSecondary}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: active ? themeColors.primary : themeColors.text,
                            }}
                          >
                            {b.label}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 10, color: themeColors.textSecondary, textAlign: 'center' }}
                          >
                            {b.desc}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Subdivisión de Transporte: Combustible vs Traslados */}
                  {bloqueProyecto === 'TRANSPORTE' && (
                    <View style={{ marginTop: Spacing.two, paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                      <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 8 }]}>
                        Tipo de Transporte *
                      </Text>
                      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                        <TouchableOpacity
                          onPress={() => handleSelectSubtipoTransporte('COMBUSTIBLE')}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1.5,
                            borderColor: subtipoTransporte === 'COMBUSTIBLE' ? themeColors.accent : themeColors.border,
                            backgroundColor: subtipoTransporte === 'COMBUSTIBLE' ? themeColors.accent + '18' : themeColors.background,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                          }}
                        >
                          <Ionicons
                            name="speedometer-outline"
                            size={18}
                            color={subtipoTransporte === 'COMBUSTIBLE' ? themeColors.accent : themeColors.textSecondary}
                          />
                          <Text style={{ fontWeight: '700', fontSize: 13, color: subtipoTransporte === 'COMBUSTIBLE' ? themeColors.accent : themeColors.text }}>
                            Combustible
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleSelectSubtipoTransporte('TRASLADOS')}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1.5,
                            borderColor: subtipoTransporte === 'TRASLADOS' ? themeColors.accent : themeColors.border,
                            backgroundColor: subtipoTransporte === 'TRASLADOS' ? themeColors.accent + '18' : themeColors.background,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                          }}
                        >
                          <Ionicons
                            name="navigate-outline"
                            size={18}
                            color={subtipoTransporte === 'TRASLADOS' ? themeColors.accent : themeColors.textSecondary}
                          />
                          <Text style={{ fontWeight: '700', fontSize: 13, color: subtipoTransporte === 'TRASLADOS' ? themeColors.accent : themeColors.text }}>
                            Traslados
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {subtipoTransporte === 'TRASLADOS' && (
                        <View style={{ marginTop: Spacing.two }}>
                          <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 8 }]}>
                            Subtipo de Traslado *
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {SUBTIPOS_TRASLADO.map((st) => {
                              const isSel = subtipoTraslado === st.id;
                              return (
                                <TouchableOpacity
                                  key={st.id}
                                  onPress={() => handleSelectSubtipoTraslado(st.id)}
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: BorderRadius.small,
                                    borderWidth: 1,
                                    borderColor: isSel ? themeColors.primary : themeColors.border,
                                    backgroundColor: isSel ? themeColors.primary : themeColors.background,
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#ffffff' : themeColors.text }}>
                                    {st.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Selector de Subcategoría para Material o Equipo */}
                  {esMaterialOEquipo && filteredSubcategorias.length > 0 && (
                    <View style={{ marginTop: Spacing.two }}>
                      <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 8 }]}>
                        Subcategoría de {bloqueProyecto === 'MATERIAL' ? 'Material' : 'Equipo'} *
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {filteredSubcategorias.map((sub) => {
                          const isSel = selectedSubcategoria === sub.nombre;
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              onPress={() => setSelectedSubcategoria(sub.nombre)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: BorderRadius.small,
                                borderWidth: 1,
                                borderColor: isSel ? themeColors.primary : themeColors.border,
                                backgroundColor: isSel ? themeColors.primary : themeColors.background,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isSel ? '#ffffff' : themeColors.text }}>
                                {sub.nombre}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                /* Selector de Categoría y Subcategoría para Gasto Operativo */
                <View style={{ gap: Spacing.two }}>
                  <View style={styles.customDropdownContainer}>
                    <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría Operativa *</Text>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowCatDropdown(!showCatDropdown);
                        setShowSubDropdown(false);
                      }}
                    >
                      <Text style={{ color: selectedCategoria ? themeColors.text : themeColors.textSecondary }}>
                        {selectedCategoria || 'Selecciona una categoría'}
                      </Text>
                      <Ionicons name={showCatDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                    </TouchableOpacity>
                    {showCatDropdown && (
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                          {categorias.map((cat) => (
                            <TouchableOpacity
                              key={cat.id}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setSelectedCategoria(cat.nombre);
                                setSelectedSubcategoria('');
                                setShowCatDropdown(false);
                              }}
                            >
                              <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 14 }}>{cat.nombre}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {!!selectedCategoria && (
                    <View style={styles.customDropdownContainer}>
                      <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Subcategoría *</Text>
                      <TouchableOpacity
                        style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowSubDropdown(!showSubDropdown);
                          setShowCatDropdown(false);
                        }}
                      >
                        <Text style={{ color: selectedSubcategoria ? themeColors.text : themeColors.textSecondary }}>
                          {selectedSubcategoria || 'Selecciona una subcategoría'}
                        </Text>
                        <Ionicons name={showSubDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                      </TouchableOpacity>
                      {showSubDropdown && (
                        <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                            {filteredSubcategorias.map((sub) => (
                              <TouchableOpacity
                                key={sub.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setSelectedSubcategoria(sub.nombre);
                                  setShowSubDropdown(false);
                                }}
                              >
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{sub.nombre}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}

                  <CustomInput
                    label="Concepto Operativo *"
                    placeholder="Ej. Pago Telmex oficina, papelería, IMSS..."
                    value={detalleServicioProyecto}
                    onChangeText={setDetalleServicioProyecto}
                    iconName="business-outline"
                  />
                </View>
              )}
            </View>

            {/* =========================================================
                SECCIÓN 3: CAMPOS ESPECÍFICOS SEGÚN LA CATEGORÍA ELEGIDA
               ========================================================= */}

            {/* 3A. ESPECÍFICO DE HOSPEDAJE (Rango de fechas + Desglose diario en vivo) */}
            {esHospedaje && (
              <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.primary + '50' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.two }}>
                  <Ionicons name="calendar" size={20} color={themeColors.primary} />
                  <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Estancia de Hospedaje (Rango de Fechas)
                  </Text>
                </View>

                {!!hospedajeRecienteAviso && (
                  <View
                    style={{
                      padding: 10,
                      borderRadius: BorderRadius.small,
                      backgroundColor: themeColors.warning + '18',
                      borderWidth: 1,
                      borderColor: themeColors.warning,
                      marginBottom: Spacing.two,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: themeColors.text, fontWeight: '600' }}>
                      💡 {hospedajeRecienteAviso}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  {/* Fecha Entrada */}
                  <View style={{ flex: 1, position: 'relative' }}>
                    <CustomInput
                      label="Fecha Entrada *"
                      placeholder="AAAA-MM-DD"
                      value={fechaHospedajeInicio}
                      onChangeText={setFechaHospedajeInicio}
                      editable={Platform.OS === 'web'}
                      iconName="log-in-outline"
                    />
                    {Platform.OS === 'web' ? (
                      createElement('input', {
                        type: 'date',
                        value: fechaHospedajeInicio,
                        style: { position: 'absolute', top: 24, left: 0, width: '100%', height: 48, opacity: 0, cursor: 'pointer', zIndex: 50 },
                        onClick: (e: any) => { try { e.target.showPicker(); } catch (_) {} },
                        onChange: (e: any) => { if (e.target.value) setFechaHospedajeInicio(e.target.value); },
                      })
                    ) : (
                      <TouchableOpacity
                        style={{ position: 'absolute', top: 24, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                        onPress={() => setShowHospedajeInicioPicker(true)}
                      />
                    )}
                  </View>

                  {/* Fecha Salida */}
                  <View style={{ flex: 1, position: 'relative' }}>
                    <CustomInput
                      label="Fecha Salida *"
                      placeholder="AAAA-MM-DD"
                      value={fechaHospedajeFin}
                      onChangeText={setFechaHospedajeFin}
                      editable={Platform.OS === 'web'}
                      iconName="log-out-outline"
                    />
                    {Platform.OS === 'web' ? (
                      createElement('input', {
                        type: 'date',
                        value: fechaHospedajeFin,
                        style: { position: 'absolute', top: 24, left: 0, width: '100%', height: 48, opacity: 0, cursor: 'pointer', zIndex: 50 },
                        onClick: (e: any) => { try { e.target.showPicker(); } catch (_) {} },
                        onChange: (e: any) => { if (e.target.value) setFechaHospedajeFin(e.target.value); },
                      })
                    ) : (
                      <TouchableOpacity
                        style={{ position: 'absolute', top: 24, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                        onPress={() => setShowHospedajeFinPicker(true)}
                      />
                    )}
                  </View>
                </View>

                {showHospedajeInicioPicker && Platform.OS !== 'web' && (
                  <DateTimePicker
                    value={parseIsoToDate(fechaHospedajeInicio)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_ev, d) => {
                      setShowHospedajeInicioPicker(false);
                      if (d) {
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        setFechaHospedajeInicio(`${yyyy}-${mm}-${dd}`);
                      }
                    }}
                  />
                )}

                {showHospedajeFinPicker && Platform.OS !== 'web' && (
                  <DateTimePicker
                    value={parseIsoToDate(fechaHospedajeFin)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_ev, d) => {
                      setShowHospedajeFinPicker(false);
                      if (d) {
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        setFechaHospedajeFin(`${yyyy}-${mm}-${dd}`);
                      }
                    }}
                  />
                )}

                {/* Vista previa en vivo del costo por noche y desglose diario */}
                {hospedajePreview.error ? (
                  <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                    ⚠️ {hospedajePreview.error}
                  </Text>
                ) : (
                  <View
                    style={{
                      marginTop: Spacing.one,
                      padding: Spacing.two,
                      borderRadius: BorderRadius.small,
                      backgroundColor: themeColors.primary + '12',
                      borderWidth: 1,
                      borderColor: themeColors.primary + '30',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', fontSize: 13, color: themeColors.primary }}>
                        🏨 {hospedajePreview.diasCount} {hospedajePreview.diasCount === 1 ? 'noche / día' : 'noches / días'}
                      </Text>
                      <Text style={{ fontWeight: '800', fontSize: 14, color: themeColors.text }}>
                        ${hospedajePreview.costoPorDia.toFixed(2)} MXN / día
                      </Text>
                    </View>
                    {hospedajePreview.dias.length > 0 && Number(monto) > 0 && (
                      <View style={{ marginTop: 8, gap: 4, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>
                          Desglose diario automático ({hospedajePreview.dias.length} días):
                        </Text>
                        {hospedajePreview.dias.slice(0, 7).map((d, idx) => (
                          <View key={d.fecha} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                              Día {idx + 1} • {d.fechaFriendly}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                              ${d.monto_diario.toFixed(2)} MXN
                            </Text>
                          </View>
                        ))}
                        {hospedajePreview.dias.length > 7 && (
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontStyle: 'italic' }}>
                            + {hospedajePreview.dias.length - 7} día(s) adicionales...
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 3B. ESPECÍFICO DE ALIMENTOS (Consumo compartido y Propina) */}
            {esAlimentos && (
              <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.two }}>
                  <Ionicons name="restaurant" size={20} color={themeColors.primary} />
                  <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Detalles de Alimentos y Propina
                  </Text>
                </View>

                <View style={[styles.customDropdownContainer, { zIndex: 500 }]}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
                    ¿Con cuántos empleados compartiste este consumo?
                  </Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowEmpList(!showEmpList);
                    }}
                  >
                    <Text style={{ color: selectedEmpleados.length > 0 ? themeColors.text : themeColors.textSecondary }}>
                      {selectedEmpleados.length === 0
                        ? 'Solo yo (1 persona)'
                        : `Yo + ${selectedEmpleados.length} empleado(s) (${1 + selectedEmpleados.length} personas)`}
                    </Text>
                    <Ionicons name={showEmpList ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>

                  {showEmpList && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                          {allUsers
                            .filter((u) => u.id !== currentUser?.id)
                            .map((u) => {
                              const isSelected = selectedEmpleados.some((e) => e.id === u.id);
                              return (
                                <TouchableOpacity
                                  key={u.id}
                                  style={[styles.dropdownItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                  onPress={() => {
                                    if (isSelected) {
                                      setSelectedEmpleados((prev) => prev.filter((e) => e.id !== u.id));
                                    } else {
                                      setSelectedEmpleados((prev) => [...prev, u]);
                                    }
                                  }}
                                >
                                  <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{u.nombre}</Text>
                                  <Ionicons
                                    name={isSelected ? 'checkbox-outline' : 'square-outline'}
                                    size={22}
                                    color={isSelected ? themeColors.accent : themeColors.textSecondary}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13 }]}>
                  ¿Dejaste propina adicional fuera del ticket? *
                </Text>
                <View style={styles.paymentSelector}>
                  <TouchableOpacity
                    onPress={() => {
                      setIncluyePropina(true);
                      setMontoPropina('');
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: incluyePropina === true ? themeColors.accent : themeColors.background,
                        borderColor: incluyePropina === true ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: incluyePropina === true ? '#ffffff' : themeColors.text }]}>
                      No (Sin propina aparte)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIncluyePropina(false)}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: incluyePropina === false ? themeColors.accent : themeColors.background,
                        borderColor: incluyePropina === false ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: incluyePropina === false ? '#ffffff' : themeColors.text }]}>
                      Sí, propina aparte
                    </Text>
                  </TouchableOpacity>
                </View>

                {incluyePropina === false && (
                  <View style={{ marginTop: Spacing.two }}>
                    <CustomInput
                      label="Monto de propina adicional ($ MXN)"
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      value={montoPropina}
                      onChangeText={(val) => setMontoPropina(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
                      iconName="cash-outline"
                    />
                  </View>
                )}
              </View>
            )}

            {/* 3C. ESPECÍFICO DE COMBUSTIBLE (Vehículo, Kilometraje, Litros) */}
            {esGasolina && (
              <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.primary + '50' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.two }}>
                  <Ionicons name="car-sport" size={20} color={themeColors.primary} />
                  <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Bitácora de Combustible y Vehículo
                  </Text>
                </View>

                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Vehículo *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowVehiculoDropdown(!showVehiculoDropdown);
                    }}
                  >
                    <Text style={{ color: selectedVehiculoId ? themeColors.text : themeColors.textSecondary }}>
                      {vehiculos.find((v) => v.id === selectedVehiculoId)
                        ? `${vehiculos.find((v) => v.id === selectedVehiculoId)?.marca} ${vehiculos.find((v) => v.id === selectedVehiculoId)?.modelo} (${vehiculos.find((v) => v.id === selectedVehiculoId)?.placas})`
                        : 'Selecciona un vehículo'}
                    </Text>
                    <Ionicons name={showVehiculoDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                  </TouchableOpacity>
                  {showVehiculoDropdown && (
                    <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1001 }}>
                      <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                          {vehiculos.map((veh) => (
                            <TouchableOpacity
                              key={veh.id}
                              style={[styles.dropdownItem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                              onPress={() => {
                                setSelectedVehiculoId(veh.id);
                                setShowVehiculoDropdown(false);
                              }}
                            >
                              <Ionicons name="car-outline" size={20} color={themeColors.primary} />
                              <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }}>
                                {veh.marca} {veh.modelo} • {veh.placas}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="Kilometraje (Odómetro) *"
                      placeholder="Ej. 142500"
                      value={kilometrajeActual}
                      onChangeText={setKilometrajeActual}
                      keyboardType="numeric"
                      iconName="speedometer-outline"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomInput
                      label="Litros Cargados *"
                      placeholder="Ej. 45.5"
                      value={litrosGasolina}
                      onChangeText={(val) => setLitrosGasolina(val.replace(',', '.'))}
                      keyboardType="decimal-pad"
                      iconName="water-outline"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* =========================================================
                SECCIÓN 4: MONTO, PROVEEDOR, PAGO Y FACTURACIÓN
               ========================================================= */}
            <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                3. Datos del Gasto y Pago
              </Text>

              <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <CustomInput
                    label={esHospedaje ? 'Monto Total Hotel ($ MXN) *' : 'Monto ($ MXN) *'}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={monto}
                    onChangeText={(val) => setMonto(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
                    iconName="logo-usd"
                  />
                </View>

                <View style={{ flex: 1, position: 'relative' }}>
                  <CustomInput
                    label="Fecha del Comprobante *"
                    placeholder="DD/MM/AAAA"
                    value={fechaComprobante}
                    editable={false}
                    iconName="calendar-outline"
                  />
                  {Platform.OS === 'web' ? (
                    createElement('input', {
                      type: 'date',
                      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 100 },
                      onClick: (e: any) => { try { e.target.showPicker(); } catch (_) {} },
                      onChange: (e: any) => {
                        if (e.target.value) {
                          const parts = e.target.value.split('-');
                          if (parts.length === 3) {
                            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                            setDateValue(d);
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const yyyy = d.getFullYear();
                            setFechaComprobante(`${dd}/${mm}/${yyyy}`);
                          }
                        }
                      },
                    })
                  ) : (
                    <TouchableOpacity
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                      onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
                    />
                  )}
                </View>
              </View>

              {esAlimentos && incluyePropina === false && !!montoPropina && (
                <Text style={{ fontSize: 12, color: themeColors.primary, fontWeight: '700', marginTop: -8, marginBottom: Spacing.two }}>
                  Total con propina: ${(Number(monto || 0) + Number(montoPropina || 0)).toFixed(2)} MXN
                </Text>
              )}

              {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={dateValue}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onChangeDate}
                  maximumDate={new Date()}
                />
              )}

              {/* Selector de Proveedor / Hotel / Comercio */}
              <View style={[styles.customDropdownContainer, { zIndex: 900 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.half }}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 0 }]}>
                    {esHospedaje ? 'Hotel / Proveedor' : 'Proveedor / Comercio'}
                  </Text>
                  {role === 'admin' && (
                    <TouchableOpacity
                      onPress={() => {
                        setNuevoProvNombre(proveedorSearch.trim());
                        setNuevoProvRfc('');
                        setModalNuevoProveedorVisible(true);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: themeColors.primary + '15',
                        paddingHorizontal: Spacing.one,
                        paddingVertical: 4,
                        borderRadius: BorderRadius.medium,
                      }}
                    >
                      <Ionicons name="add-circle" size={16} color={themeColors.primary} />
                      <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12 }}>+ Nuevo Proveedor</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowProvDropdown(!showProvDropdown);
                  }}
                >
                  <Text style={{ color: proveedor ? themeColors.text : themeColors.textSecondary, flex: 1 }} numberOfLines={1}>
                    {proveedor || 'Seleccionar del catálogo (o dejar en blanco)...'}
                  </Text>
                  <Ionicons name={showProvDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>

                {showProvDropdown && (
                  <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000, marginTop: 4 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <CustomInput
                        placeholder="Buscar proveedor por nombre o RFC..."
                        value={proveedorSearch}
                        onChangeText={setProveedorSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={styles.dropdownItem}
                          onPress={() => {
                            setProveedor('');
                            setProveedorSearch('');
                            setShowProvDropdown(false);
                          }}
                        >
                          <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>
                            Dejar en blanco (Escribir nombre manualmente abajo)
                          </Text>
                        </TouchableOpacity>
                        {proveedores
                          .filter(
                            (p) =>
                              !!p.nombre &&
                              (p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                                (p.rfc && p.rfc.toLowerCase().includes(proveedorSearch.toLowerCase())))
                          )
                          .map((prov) => (
                            <TouchableOpacity
                              key={prov.id}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setProveedor(prov.nombre);
                                setProveedorSearch('');
                                setShowProvDropdown(false);
                              }}
                            >
                              <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 14 }}>{prov.nombre}</Text>
                              {!!prov.rfc && <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>RFC: {prov.rfc}</Text>}
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>

              {!proveedor && (
                <CustomInput
                  label={esHospedaje ? 'Nombre del Hotel / Proveedor *' : 'Nombre del Proveedor o Comercio *'}
                  placeholder="Escribe el nombre del establecimiento..."
                  value={comentarioProveedor}
                  onChangeText={setComentarioProveedor}
                  iconName="storefront-outline"
                />
              )}

              <CustomInput
                label={
                  esMaterialOEquipo || esTraslado || tipoGasto === 'OPERATIVO'
                    ? 'Descripción / Justificación del Gasto *'
                    : 'Descripción / Comentarios (Opcional)'
                }
                placeholder={
                  esMaterialOEquipo
                    ? 'Detalla el material o equipo adquirido...'
                    : esTraslado
                    ? 'Ej. Caseta tramo Chihuahua - Delicias...'
                    : 'Comentarios adicionales del gasto...'
                }
                value={justificacion}
                onChangeText={setJustificacion}
                iconName="chatbox-ellipses-outline"
                multiline
                numberOfLines={2}
                style={{ height: 64 }}
              />

              {/* Método de Pago */}
              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Método de Pago *</Text>
                <View style={styles.paymentSelector}>
                  {(
                    [
                      { key: 'efectivo', label: 'Efectivo' },
                      { key: 'transferencia', label: 'Transferencia' },
                      { key: 'tarjeta', label: 'Tarjeta' },
                      { key: 'monedero_electronico', label: 'Monedero' },
                    ] as const
                  ).map((item) => {
                    const isCard =
                      item.key === 'tarjeta' &&
                      (metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta');
                    const isSelected = item.key === 'tarjeta' ? isCard : metodoPago === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        onPress={() => {
                          if (item.key === 'tarjeta') {
                            if (metodoPago !== 'tarjeta_credito' && metodoPago !== 'tarjeta_debito') {
                              setMetodoPago('tarjeta_debito');
                            }
                            if (!tipoTarjeta) setTipoTarjeta('BBVA');
                          } else {
                            setMetodoPago(item.key);
                            setTipoTarjeta(null);
                          }
                        }}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: isSelected ? themeColors.accent : themeColors.background,
                            borderColor: isSelected ? 'transparent' : themeColors.border,
                            flex: 1,
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: isSelected ? '#ffffff' : themeColors.text }]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {(metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta') && (
                <View style={{ paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: themeColors.accent, gap: Spacing.two, marginBottom: Spacing.two }}>
                  <View style={styles.paymentSelector}>
                    <TouchableOpacity
                      onPress={() => setMetodoPago('tarjeta_debito')}
                      style={[
                        styles.paymentOption,
                        {
                          backgroundColor: metodoPago === 'tarjeta_debito' ? themeColors.accent : themeColors.background,
                          borderColor: metodoPago === 'tarjeta_debito' ? 'transparent' : themeColors.border,
                          flex: 1,
                          alignItems: 'center',
                        },
                      ]}
                    >
                      <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_debito' ? '#ffffff' : themeColors.text }]}>
                        Débito
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setMetodoPago('tarjeta_credito')}
                      style={[
                        styles.paymentOption,
                        {
                          backgroundColor: metodoPago === 'tarjeta_credito' ? themeColors.accent : themeColors.background,
                          borderColor: metodoPago === 'tarjeta_credito' ? 'transparent' : themeColors.border,
                          flex: 1,
                          alignItems: 'center',
                        },
                      ]}
                    >
                      <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_credito' ? '#ffffff' : themeColors.text }]}>
                        Crédito
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.paymentSelector}>
                    {(['BBVA', 'AMEX', 'MARRIOT', 'BANORTE', 'INVEX', 'MERCADO PAGO', 'HILTON'] as const).map((card) => (
                      <TouchableOpacity
                        key={card}
                        onPress={() => setTipoTarjeta(card)}
                        style={[
                          styles.paymentOption,
                          {
                            backgroundColor: tipoTarjeta === card ? themeColors.accent : themeColors.background,
                            borderColor: tipoTarjeta === card ? 'transparent' : themeColors.border,
                            minWidth: '30%',
                            flexGrow: 1,
                            alignItems: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.paymentOptionText, { color: tipoTarjeta === card ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                          {card}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* ¿Está facturado? */}
              <View style={styles.selectorGroup}>
                <Text style={[styles.selectorLabel, { color: themeColors.text }]}>¿Estado de Facturación? *</Text>
                <View style={[styles.paymentSelector, { flexDirection: 'row', gap: 6 }]}>
                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(true);
                      setFacturaStatus('SI');
                      setMotivoSinFactura('');
                      if (mode === 'create') setComentarioPendiente('');
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: facturado === true ? themeColors.accent : themeColors.background,
                        borderColor: facturado === true ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: facturado === true ? '#ffffff' : themeColors.text }]}>
                      Sí, Facturado
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(false);
                      setFacturaStatus('PENDIENTE');
                      if (mode === 'create') setMotivoSinFactura('PENDIENTE_ENTREGA');
                      setFacturaPdf(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: facturado === false && facturaStatus === 'PENDIENTE' ? themeColors.warning : themeColors.background,
                        borderColor: facturado === false && facturaStatus === 'PENDIENTE' ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: facturado === false && facturaStatus === 'PENDIENTE' ? '#ffffff' : themeColors.text }]}>
                      Pendiente
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setFacturado(false);
                      setFacturaStatus('NO');
                      setFacturaPdf(null);
                    }}
                    style={[
                      styles.paymentOption,
                      {
                        backgroundColor: facturado === false && facturaStatus === 'NO' ? themeColors.accent : themeColors.background,
                        borderColor: facturado === false && facturaStatus === 'NO' ? 'transparent' : themeColors.border,
                        flex: 1,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={[styles.paymentOptionText, { color: facturado === false && facturaStatus === 'NO' ? '#ffffff' : themeColors.text }]}>
                      No Facturado
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {facturado === true && (
                <View style={{ marginBottom: Spacing.one }}>
                  {facturaPdf ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: themeColors.background,
                        padding: 10,
                        borderRadius: BorderRadius.medium,
                        borderWidth: 1,
                        borderColor: themeColors.accent + '60',
                      }}
                    >
                      <TouchableOpacity onPress={handlePreviewPdf} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="document-text" size={20} color={themeColors.danger} />
                        <Text numberOfLines={1} style={{ color: themeColors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
                          {facturaPdf.name}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleRemoveFacturaPdf} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleSelectFacturaPdf}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        borderWidth: 1.5,
                        borderColor: themeColors.border,
                        borderStyle: 'dashed',
                        borderRadius: BorderRadius.medium,
                        paddingVertical: 12,
                      }}
                    >
                      <Ionicons name="cloud-upload-outline" size={18} color={themeColors.accent} />
                      <Text style={{ color: themeColors.accent, fontSize: 13, fontWeight: '700' }}>
                        Adjuntar Factura PDF (Opcional)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {facturado === false && facturaStatus === 'PENDIENTE' && (
                <CustomInput
                  label="Explicación de Factura Pendiente *"
                  placeholder="Ej. El proveedor enviará la factura mañana..."
                  value={comentarioPendiente}
                  onChangeText={setComentarioPendiente}
                  iconName="time-outline"
                />
              )}

              {facturado === false && facturaStatus === 'NO' && (
                <CustomInput
                  label="Motivo por el cual no hay factura *"
                  placeholder="Ej. Caseta / comercio sin facturación..."
                  value={motivoSinFactura}
                  onChangeText={setMotivoSinFactura}
                  iconName="alert-circle-outline"
                />
              )}

              {/* Opción opcional de dividir gasto entre clientes */}
              {mode === 'create' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one }}>
                  <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '600' }}>
                    ¿Dividir este ticket en varios clientes?
                  </Text>
                  <Switch
                    value={isSplit}
                    onValueChange={setIsSplit}
                    trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
                    thumbColor={isSplit ? themeColors.primary : themeColors.textSecondary}
                  />
                </View>
              )}

              {mode === 'create' && isSplit && (
                <View style={{ marginTop: Spacing.two }}>
                  {splits.map((s) => (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 8,
                        borderRadius: BorderRadius.small,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ color: themeColors.text, fontSize: 12, fontWeight: '600', flex: 1 }}>
                        {s.clienteId} ({s.sucursalNombre || s.comentarioSucursal || 'Sin sucursal'})
                      </Text>
                      <Text style={{ color: themeColors.primary, fontWeight: '700', marginRight: 8 }}>
                        ${Number(s.monto).toFixed(2)}
                      </Text>
                      <TouchableOpacity onPress={() => setSplits(splits.filter((item) => item.id !== s.id))}>
                        <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      const currentTotalGasto = Number(monto || 0) + (esAlimentos && incluyePropina === false ? Number(montoPropina || 0) : 0);
                      const sumDividido = splits.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
                      const remainder = Math.max(0, currentTotalGasto - sumDividido);
                      setNewSplitClienteId('');
                      setNewSplitSucursalNombre('');
                      setNewSplitComentarioSucursal('');
                      setNewSplitMonto(remainder > 0 ? remainder.toFixed(2) : '');
                      setSplitClienteSearch('');
                      setSplitSucursalSearch('');
                      setShowNewSplitCliDropdown(false);
                      setShowNewSplitSucDropdown(false);
                      setShowSplitModal(true);
                    }}
                    style={{
                      padding: 10,
                      borderRadius: BorderRadius.small,
                      borderWidth: 1,
                      borderColor: themeColors.primary,
                      borderStyle: 'dashed',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12 }}>
                      ➕ Agregar División de Gasto
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* =========================================================
                SECCIÓN 5: COMPROBANTE / EVIDENCIA FOTOGRÁFICA
               ========================================================= */}
            <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                4. Comprobante / Ticket *
              </Text>

              <View style={[styles.imageCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                {ticketFiles.length > 0 || imageUri ? (
                  <View style={styles.previewContainer}>
                    <TouchableOpacity
                      style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => {
                        const currentFile = ticketFiles[activeTicketIndex] || ticketFiles[0];
                        const curExt = currentFile ? currentFile.ext : imageExt;
                        const curUri = currentFile ? currentFile.uri : imageUri;
                        if (curExt !== 'pdf' && curUri) {
                          setActivePreviewUrl(curUri);
                          setViewerInitialIndex(ticketFiles.length > 0 ? activeTicketIndex : 0);
                          setViewerVisible(true);
                        }
                      }}
                    >
                      {(ticketFiles[activeTicketIndex]?.ext || imageExt) === 'pdf' ? (
                        <View style={[styles.previewImage, { justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="document-text" size={56} color={themeColors.danger} />
                          <Text style={{ color: themeColors.text, marginTop: 4, fontWeight: '600' }}>Documento PDF</Text>
                        </View>
                      ) : (
                        <Image
                          source={{ uri: ticketFiles[activeTicketIndex]?.uri || ticketFiles[0]?.uri || imageUri! }}
                          style={[styles.previewImage, { width: '100%', height: '100%' }]}
                          resizeMode="contain"
                        />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => {
                        if (ticketFiles.length > 0) {
                          handleRemoveTicket(activeTicketIndex);
                        } else {
                          setImageUri(null);
                          setImageBase64(null);
                          setAlertaPolitica(null);
                        }
                      }}
                    >
                      <Ionicons name="trash" size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="receipt-outline" size={48} color={themeColors.textSecondary} />
                    <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                      Captura o selecciona la foto del comprobante
                    </Text>
                  </View>
                )}
              </View>

              {ticketFiles.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                  {ticketFiles.map((file, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => {
                        setActiveTicketIndex(idx);
                        setImageUri(file.uri);
                        setImageBase64(file.base64 || null);
                        setImageExt(file.ext);
                      }}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: idx === activeTicketIndex ? themeColors.accent : themeColors.border,
                        overflow: 'hidden',
                      }}
                    >
                      <Image source={{ uri: file.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: themeColors.primary,
                    borderRadius: 12,
                    height: 54,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleCapturePhoto}
                >
                  <Ionicons name="camera" size={22} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    {ticketFiles.length > 0 ? '+ Otra Foto' : 'Cámara'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                    borderWidth: 1,
                    borderRadius: 12,
                    height: 54,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleSelectGallery}
                >
                  <Ionicons name="images" size={22} color={themeColors.text} />
                  <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>
                    {ticketFiles.length > 0 ? '+ De Galería' : 'Galería'}
                  </Text>
                </TouchableOpacity>
              </View>

              {mode === 'edit' && (
                <TouchableOpacity
                  style={{
                    marginTop: Spacing.one,
                    borderColor: themeColors.primary,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderRadius: 12,
                    height: 44,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleSelectDocument}
                >
                  <Ionicons name="document-text-outline" size={18} color={themeColors.primary} />
                  <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 13 }}>
                    Subir Documento (PDF o Imagen)
                  </Text>
                </TouchableOpacity>
              )}

              {ticketFiles.length > 1 && (
                <TouchableOpacity style={{ alignSelf: 'center', marginTop: 6 }} onPress={handleClearAllTickets}>
                  <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '600' }}>
                    Eliminar todas las fotos ({ticketFiles.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Botón Principal Guardar */}
            <CustomButton
              title={
                isSubmitting
                  ? 'Guardando...'
                  : mode === 'edit'
                  ? 'Guardar Cambios y Enviar a Revisión'
                  : 'Registrar Gasto'
              }
              onPress={handleSaveGasto}
              disabled={isSubmitting}
              loading={isSubmitting}
              style={{ marginTop: Spacing.one }}
            />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        imageUrls={
          ticketFiles.length > 0
            ? ticketFiles.filter((f) => f.ext !== 'pdf').map((f) => f.uri)
            : activePreviewUrl
            ? [activePreviewUrl]
            : []
        }
        initialIndex={viewerInitialIndex}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />

      {mode === 'create' && <GastoSplitModal form={form} themeColors={themeColors} />}

      {role === 'admin' && <NuevoProveedorModal form={form} themeColors={themeColors} />}
    </View>
  );
}
