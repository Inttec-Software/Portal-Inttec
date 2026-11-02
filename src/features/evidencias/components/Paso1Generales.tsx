import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import TrabajoCard from './TrabajoCard';
import { TrabajoRealizado, ColaboradorItem, MaterialUsadoItem } from '../types';
import { ProductoInventario } from '@/components/MaterialesSelector';

interface Paso1GeneralesProps {
  clientes: any[];
  selectedCliente: string;
  setSelectedCliente: (id: string) => void;
  clienteSearch: string;
  setClienteSearch: (text: string) => void;
  showCliDropdown: boolean;
  setShowCliDropdown: (show: boolean) => void;
  sucursalesCliente: any[];
  selectedSucursal: string;
  setSelectedSucursal: (id: string) => void;
  sucursalSearch: string;
  setSucursalSearch: (text: string) => void;
  showSucursalDropdown: boolean;
  setShowSucursalDropdown: (show: boolean) => void;
  formErrors: Record<string, string>;
  fieldPositions: React.MutableRefObject<Record<string, number>>;
  stepContainerY: React.MutableRefObject<number>;
  // Colaboradores
  empleadosDisponibles: any[];
  selectedColaboradores: ColaboradorItem[];
  showColaboradorModal: boolean;
  setShowColaboradorModal: (show: boolean) => void;
  colaboradorSearch: string;
  setColaboradorSearch: (text: string) => void;
  onAddColaborador: (emp: any) => void;
  onRemoveColaborador: (empId: string, empNombre: string) => void;
  // Trabajos
  trabajos: TrabajoRealizado[];
  onAddTrabajo: () => void;
  onRemoveTrabajo: (index: number) => void;
  onCloneTrabajo: (index: number) => void;
  onUpdateTrabajoField: (index: number, field: keyof TrabajoRealizado, value: any) => void;
  onUpdateMateriales: (index: number, mats: MaterialUsadoItem[]) => void;
  onMejorarRedaccion: (texto: string, field: 'descripcion' | 'solucion', index: number) => void;
  getProductosDisponiblesParaTrabajo: (index: number) => ProductoInventario[];
  // Fotos
  processingPhotoTarget: string | null;
  onCapturePhoto: (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => void;
  onSelectGallery: (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => void;
  onRemovePhoto: (type: 'antes' | 'despues' | 'adicional', jobIndex: number, photoIndex?: number) => void;
  onOpenPhoto: (uri: string | null) => void;
  // Navegación
  onNext: () => void;
}

export default function Paso1Generales({
  clientes,
  selectedCliente,
  setSelectedCliente,
  clienteSearch,
  setClienteSearch,
  showCliDropdown,
  setShowCliDropdown,
  sucursalesCliente,
  selectedSucursal,
  setSelectedSucursal,
  sucursalSearch,
  setSucursalSearch,
  showSucursalDropdown,
  setShowSucursalDropdown,
  formErrors,
  fieldPositions,
  stepContainerY,
  empleadosDisponibles,
  selectedColaboradores,
  showColaboradorModal,
  setShowColaboradorModal,
  colaboradorSearch,
  setColaboradorSearch,
  onAddColaborador,
  onRemoveColaborador,
  trabajos,
  onAddTrabajo,
  onRemoveTrabajo,
  onCloneTrabajo,
  onUpdateTrabajoField,
  onUpdateMateriales,
  onMejorarRedaccion,
  getProductosDisponiblesParaTrabajo,
  processingPhotoTarget,
  onCapturePhoto,
  onSelectGallery,
  onRemovePhoto,
  onOpenPhoto,
  onNext,
}: Paso1GeneralesProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const filteredClientes = clientes.filter(
    (cli) => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase())
  );

  const availableSucursales = sucursalesCliente.filter(
    (s) => s.cliente_id === selectedCliente
  );

  const filteredSucursales = availableSucursales.filter(
    (s) => s.nombre && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        stepContainerY.current = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[styles.title, { color: themeColors.text }]}>
        1. Detalles de la Intervención
      </Text>
      <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
        Proporciona los datos del cliente, describe los trabajos realizados y añade las fotografías correspondientes.
      </Text>

      {/* Selector de Cliente */}
      <View
        onLayout={(e) => {
          fieldPositions.current['cliente'] = e.nativeEvent.layout.y;
        }}
        style={[styles.dropdownContainer, { zIndex: 100 }]}
      >
        <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
        <TouchableOpacity
          style={[
            styles.dropdownTrigger,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: formErrors['cliente'] ? themeColors.danger : themeColors.border,
            },
          ]}
          onPress={() => {
            setShowCliDropdown(!showCliDropdown);
            setShowSucursalDropdown(false);
          }}
        >
          <Text style={{ color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
            {clientes.find((c) => c.id === selectedCliente)?.nombre || selectedCliente || 'Selecciona un cliente'}
          </Text>
          <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
        </TouchableOpacity>

        {!!formErrors['cliente'] && (
          <Text style={{ color: themeColors.danger, fontSize: 12, marginTop: 4, fontWeight: '500' }}>
            {formErrors['cliente']}
          </Text>
        )}

        {showCliDropdown && (
          <View
            style={[
              styles.dropdownList,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <CustomInput
              placeholder="Buscar cliente..."
              value={clienteSearch}
              onChangeText={setClienteSearch}
              iconName="search-outline"
              style={{ margin: Spacing.one, height: 40 }}
            />
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
              {filteredClientes.map((cli, index) => (
                <TouchableOpacity
                  key={cli.id}
                  style={[
                    styles.dropdownItem,
                    index === filteredClientes.length - 1 && { borderBottomWidth: 0 },
                    { borderBottomColor: themeColors.border },
                  ]}
                  onPress={() => {
                    setSelectedCliente(cli.id);
                    setSelectedSucursal('');
                    setShowCliDropdown(false);
                    setClienteSearch('');
                  }}
                >
                  <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                  <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Selector de Sucursal */}
      {selectedCliente !== '' && (
        <View
          onLayout={(e) => {
            fieldPositions.current['sucursal'] = e.nativeEvent.layout.y;
          }}
          style={[styles.dropdownContainer, { zIndex: 90 }]}
        >
          <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Sucursal *</Text>
          <TouchableOpacity
            style={[
              styles.dropdownTrigger,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: formErrors['sucursal'] ? themeColors.danger : themeColors.border,
              },
            ]}
            onPress={() => {
              setShowSucursalDropdown(!showSucursalDropdown);
              setShowCliDropdown(false);
            }}
          >
            <Text style={{ color: selectedSucursal ? themeColors.text : themeColors.textSecondary }}>
              {availableSucursales.find((s) => s.id === selectedSucursal)?.nombre ||
                selectedSucursal ||
                'Selecciona una sucursal'}
            </Text>
            <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
          </TouchableOpacity>

          {!!formErrors['sucursal'] && (
            <Text style={{ color: themeColors.danger, fontSize: 12, marginTop: 4, fontWeight: '500' }}>
              {formErrors['sucursal']}
            </Text>
          )}

          {showSucursalDropdown && (
            <View
              style={[
                styles.dropdownList,
                { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
              ]}
            >
              <CustomInput
                placeholder="Buscar sucursal..."
                value={sucursalSearch}
                onChangeText={setSucursalSearch}
                iconName="search-outline"
                style={{ margin: Spacing.one, height: 40 }}
              />
              <ScrollView nestedScrollEnabled style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                {filteredSucursales.map((suc, index) => (
                  <TouchableOpacity
                    key={suc.id}
                    style={[
                      styles.dropdownItem,
                      index === filteredSucursales.length - 1 && { borderBottomWidth: 0 },
                      { borderBottomColor: themeColors.border },
                    ]}
                    onPress={() => {
                      setSelectedSucursal(suc.id);
                      setShowSucursalDropdown(false);
                      setSucursalSearch('');
                    }}
                  >
                    <Ionicons name="location-outline" size={20} color={themeColors.accent} />
                    <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Sección de Colaboradores de Cuadrilla */}
      <View
        style={[
          styles.colabBox,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={styles.colabHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="people" size={16} color={themeColors.primary} />
            <Text style={[styles.colabTitle, { color: themeColors.text }]}>
              Colaboradores de Cuadrilla
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowColaboradorModal(true)}
            style={[
              styles.addColabBtn,
              { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary + '40' },
            ]}
          >
            <Ionicons name="person-add-outline" size={13} color={themeColors.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginBottom: 8 }}>
          Si andan trabajando en equipo, agrega a tus compañeros para compartir y descontar de sus inventarios.
        </Text>

        {selectedColaboradores.length === 0 ? (
          <View
            style={[
              styles.emptyColabBox,
              { borderColor: themeColors.border, backgroundColor: themeColors.background },
            ]}
          >
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, textAlign: 'center' }}>
              👤 Reporte individual (solo tu inventario cargado).
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {selectedColaboradores.map((colab) => (
              <View
                key={colab.id}
                style={[
                  styles.colabChip,
                  { borderColor: themeColors.primary + '40', backgroundColor: themeColors.background },
                ]}
              >
                <Ionicons name="person" size={12} color={themeColors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>{colab.nombre}</Text>
                <TouchableOpacity
                  onPress={() => onRemoveColaborador(colab.id, colab.nombre)}
                  style={styles.removeChipBtn}
                >
                  <Ionicons name="close" size={13} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Lista de Trabajos */}
      {trabajos.map((trabajo, index) => (
        <TrabajoCard
          key={trabajo.id || `job_${index}`}
          trabajo={trabajo}
          index={index}
          totalTrabajos={trabajos.length}
          formErrors={formErrors}
          productosDisponibles={getProductosDisponiblesParaTrabajo(index)}
          processingPhotoTarget={processingPhotoTarget}
          onUpdateField={(field, val) => onUpdateTrabajoField(index, field, val)}
          onUpdateMateriales={(mats) => onUpdateMateriales(index, mats)}
          onRemove={() => onRemoveTrabajo(index)}
          onClone={() => onCloneTrabajo(index)}
          onMejorarRedaccion={(texto, field) => onMejorarRedaccion(texto, field, index)}
          onCapturePhoto={(type) => onCapturePhoto(type, index)}
          onSelectGallery={(type) => onSelectGallery(type, index)}
          onRemovePhoto={(type, pIdx) => onRemovePhoto(type, index, pIdx)}
          onOpenPhoto={onOpenPhoto}
          onLayout={(e) => {
            fieldPositions.current['trabajo_' + index] = e.nativeEvent.layout.y;
          }}
        />
      ))}

      {/* Botón Agregar Trabajo */}
      <CustomButton
        title="+ Agregar Otro Trabajo / Arreglo"
        variant="secondary"
        onPress={onAddTrabajo}
        style={{ marginVertical: Spacing.two }}
        icon={<Ionicons name="add-circle-outline" size={20} color={themeColors.primary} style={{ marginRight: 6 }} />}
      />

      {/* Navegación al paso 2 */}
      <CustomButton
        title="Continuar a Revisión"
        variant="primary"
        onPress={onNext}
        style={{ marginTop: Spacing.two, marginBottom: Spacing.four }}
        icon={<Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />}
      />

      {/* Modal Seleccionar Colaborador */}
      <Modal
        visible={showColaboradorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColaboradorModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                Agregar Colaborador de Cuadrilla
              </Text>
              <TouchableOpacity onPress={() => setShowColaboradorModal(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <CustomInput
              placeholder="Buscar por nombre o correo..."
              value={colaboradorSearch}
              onChangeText={setColaboradorSearch}
              iconName="search-outline"
              style={{ margin: Spacing.two }}
            />

            <ScrollView style={{ maxHeight: 300, paddingHorizontal: Spacing.two }} keyboardShouldPersistTaps="handled">
              {empleadosDisponibles
                .filter(
                  (emp) =>
                    !selectedColaboradores.some((c) => c.id === emp.id) &&
                    (emp.nombre?.toLowerCase().includes(colaboradorSearch.toLowerCase()) ||
                      emp.email?.toLowerCase().includes(colaboradorSearch.toLowerCase()))
                )
                .map((emp) => (
                  <TouchableOpacity
                    key={emp.id}
                    onPress={() => onAddColaborador(emp)}
                    style={[styles.colabItem, { borderBottomColor: themeColors.border }]}
                  >
                    <Ionicons name="person-circle-outline" size={28} color={themeColors.primary} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.text }}>{emp.nombre}</Text>
                      {emp.email && (
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>{emp.email}</Text>
                      )}
                    </View>
                    <Ionicons name="add-circle" size={22} color={themeColors.primary} />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: Spacing.three,
    lineHeight: 18,
  },
  dropdownContainer: {
    marginBottom: Spacing.three,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  dropdownTrigger: {
    padding: 12,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  colabBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  colabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  colabTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  addColabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyColabBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.small,
    padding: 10,
  },
  colabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 6,
    borderRadius: 16,
  },
  removeChipBtn: {
    padding: 2,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  colabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
