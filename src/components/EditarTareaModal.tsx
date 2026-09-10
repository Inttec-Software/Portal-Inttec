import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import SelectDropdown from '@/components/SelectDropdown';
import VentaSelectModal from '@/components/VentaSelectModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TareasService } from '@/services/tareasService';

interface EditarTareaModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: any;
}

export default function EditarTareaModal({
  visible,
  onClose,
  onSuccess,
  task
}: EditarTareaModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  // Lookups data
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);

  // Form State
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [status, setStatus] = useState<'Pendiente' | 'En Proceso' | 'Completada' | 'Cancelada'>('Pendiente');

  const [fechaCompromiso, setFechaCompromiso] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [responsableId, setResponsableId] = useState<string>('');
  const [corresponsables, setCorresponsables] = useState<string[]>([]);

  const [vinculoTipo, setVinculoTipo] = useState<'Interno' | 'Cliente'>('Interno');
  const [relacionarVenta, setRelacionarVenta] = useState(false);

  const [clienteId, setClienteId] = useState<string>('');
  const [referenciaVentaId, setReferenciaVentaId] = useState<string>('');
  const [notaCambio, setNotaCambio] = useState('');

  const parseLocalDate = (dateString: string) => {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  useEffect(() => {
    if (visible && task) {
      loadFormDataAndTask();
    }
  }, [visible, task]);

  const loadFormDataAndTask = async () => {
    setFetchingData(true);
    try {
      const data = await TareasService.getFormLookups();

      let users = data.usuarios || [];
      if (user?.rol === 'EMPLEADO') {
        users = users.filter((u: any) => u.rol === 'EMPLEADO');
      }
      setUsuarios(users);
      const fetchedClientes = data.clientes || [];
      const fetchedVentas = data.ventas || [];
      setClientes(fetchedClientes);
      setVentas(fetchedVentas);

      // Pre-fill task values
      setTitulo(task.titulo || '');
      setDescripcion(task.descripcion || '');
      setStatus(task.status || 'Pendiente');
      setFechaCompromiso(task.fecha_compromiso ? parseLocalDate(task.fecha_compromiso) : new Date());
      setResponsableId(task.responsable_id || '');

      const initialCorr = task.corresponsables
        ? task.corresponsables.map((c: any) => c.usuario_id).filter(Boolean)
        : [];
      setCorresponsables(initialCorr);

      if (task.vinculo_tipo === 'Cliente') {
        setVinculoTipo('Cliente');
        setRelacionarVenta(false);
        setClienteId(task.vinculo_id || '');
        setReferenciaVentaId('');
      } else if (task.vinculo_tipo === 'Venta') {
        setVinculoTipo('Cliente');
        setRelacionarVenta(true);
        setReferenciaVentaId(task.vinculo_id || '');

        const targetVenta = fetchedVentas.find((v: any) => v.id === task.vinculo_id);
        if (targetVenta) {
          const matchingCliente = fetchedClientes.find((c: any) => c.nombre === targetVenta.cliente);
          if (matchingCliente) {
            setClienteId(matchingCliente.id);
          }
        }
      } else {
        setVinculoTipo('Interno');
        setRelacionarVenta(false);
        setClienteId('');
        setReferenciaVentaId('');
      }

      setNotaCambio('');
    } catch (error) {
      console.error('Error al cargar formulario de edición:', error);
    } finally {
      setFetchingData(false);
    }
  };

  // Corresponsables handlers
  const addCorresponsable = () => {
    setCorresponsables([...corresponsables, '']);
  };

  const updateCorresponsable = (index: number, value: string) => {
    const newArr = [...corresponsables];
    newArr[index] = value;
    setCorresponsables(newArr);
  };

  const removeCorresponsable = (index: number) => {
    const newArr = [...corresponsables];
    newArr.splice(index, 1);
    setCorresponsables(newArr);
  };

  // Toggle Venta handler
  const handleToggleVenta = (val: boolean) => {
    setRelacionarVenta(val);
    setReferenciaVentaId('');
  };

  const handleSave = async () => {
    if (!titulo.trim() || !descripcion.trim() || !responsableId || !fechaCompromiso) {
      const msg = 'Por favor completa todos los campos requeridos (*).';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (vinculoTipo === 'Cliente' && !clienteId) {
      const msg = 'Debes seleccionar un cliente.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (vinculoTipo === 'Cliente' && relacionarVenta && !referenciaVentaId) {
      const msg = 'Debes seleccionar una referencia de venta.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    setLoading(true);
    try {
      const formattedDateStr = fechaCompromiso.toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      const defaultNote = `✏️ Tarea actualizada (Estado: ${status}, Entrega: ${formattedDateStr})`;
      const finalNote = notaCambio.trim() ? `${notaCambio.trim()}` : defaultNote;

      const updates: any = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        status,
        fecha_compromiso: fechaCompromiso.toISOString(),
        responsable_id: responsableId,
        vinculo_tipo: vinculoTipo === 'Interno' ? 'Interna' : (vinculoTipo === 'Cliente' && relacionarVenta ? 'Venta' : 'Cliente'),
        vinculo_id: vinculoTipo === 'Cliente' ? (relacionarVenta ? referenciaVentaId : clienteId) : null,
        corresponsables: corresponsables.filter(c => c && c.trim() !== ''),
        nota_texto: finalNote
      };

      await TareasService.updateTarea(task.id, updates);

      const msg = 'Tarea actualizada correctamente';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Éxito', msg);

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al actualizar tarea:', error);
      const msg = error.message || 'Hubo un error al actualizar la tarea.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedClienteNombre = clientes.find(c => c.id === clienteId)?.nombre;
  const ventasDisponibles = ventas.filter(v => v.cliente === selectedClienteNombre);

  const statusOptions: ('Pendiente' | 'En Proceso' | 'Completada' | 'Cancelada')[] = [
    'Pendiente',
    'En Proceso',
    'Completada',
    'Cancelada'
  ];

  const getStatusBadgeStyle = (st: string) => {
    switch (st) {
      case 'Completada': return { bg: '#3498db20', border: '#3498db', text: '#3498db' };
      case 'En Proceso': return { bg: '#f1c40f20', border: '#f1c40f', text: '#d35400' };
      case 'Cancelada': return { bg: '#95a5a620', border: '#95a5a6', text: '#7f8c8d' };
      default: return { bg: '#f39c1220', border: '#f39c12', text: '#e67e22' };
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.modalOverlay} edges={['top', 'bottom']}>
        <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          
          {/* HEADER */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Editar Tarea</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={loading || fetchingData}
              style={[styles.saveBtn, { opacity: loading || fetchingData ? 0.5 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={themeColors.accent} />
              ) : (
                <Text style={[styles.saveBtnText, { color: themeColors.accent }]}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>

          {fetchingData ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Cargando datos de la tarea...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
              
              {/* ESTADO DE LA TAREA */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Estado de la Tarea</Text>
                <View style={styles.pillsContainer}>
                  {statusOptions.map((st) => {
                    const active = status === st;
                    const stStyle = getStatusBadgeStyle(st);
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor: active ? stStyle.border : stStyle.bg,
                            borderColor: stStyle.border
                          }
                        ]}
                        onPress={() => setStatus(st)}
                      >
                        <Text style={{ color: active ? '#fff' : stStyle.text, fontWeight: '700', fontSize: 13 }}>
                          {st}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* TÍTULO */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Título de la Tarea *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder="Título..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={titulo}
                  onChangeText={setTitulo}
                />
              </View>

              {/* DESCRIPCIÓN */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Descripción Detallada *</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder="Describe qué se necesita hacer..."
                  placeholderTextColor={themeColors.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={descripcion}
                  onChangeText={setDescripcion}
                />
              </View>

              {/* FECHA COMPROMISO */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Fecha de Compromiso (Entrega) *</Text>
                {Platform.OS === 'web' ? (
                  // @ts-ignore
                  <input
                    type="date"
                    value={fechaCompromiso ? fechaCompromiso.toISOString().split('T')[0] : ''}
                    onClick={(e: any) => {
                      try { e.target.showPicker(); } catch (err) {}
                    }}
                    onChange={(e: any) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        setFechaCompromiso(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
                      }
                    }}
                    style={{
                      height: 48,
                      borderRadius: 8,
                      border: `1px solid ${themeColors.border}`,
                      backgroundColor: themeColors.backgroundElement,
                      color: themeColors.text,
                      padding: '0 12px',
                      fontSize: 15,
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.dateBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={{ color: themeColors.text, fontSize: 15 }}>
                        {fechaCompromiso.toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </Text>
                      <Ionicons name="calendar-outline" size={20} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={fechaCompromiso}
                        mode="date"
                        display="default"
                        onValueChange={(event, selectedDate) => {
                          setShowDatePicker(Platform.OS === 'ios');
                          if (selectedDate) setFechaCompromiso(selectedDate);
                        }}
                        onDismiss={() => setShowDatePicker(false)}
                      />
                    )}
                  </>
                )}
              </View>

              {/* RESPONSABLE Y CORRESPONSABLES */}
              <SelectDropdown
                label="Responsable Principal *"
                data={usuarios}
                value={responsableId}
                onSelect={setResponsableId}
                searchable
                placeholder="Buscar responsable..."
              />

              {responsableId ? (
                <View style={styles.corresponsablesSection}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Corresponsables (Opcional)</Text>
                  {corresponsables.map((corrId, index) => (
                    <View key={`corr-${index}`} style={styles.corresponsableRow}>
                      <View style={{ flex: 1 }}>
                        <SelectDropdown
                          label=""
                          data={usuarios.filter(u => u.id !== responsableId)}
                          value={corrId}
                          onSelect={(val) => updateCorresponsable(index, val)}
                          searchable
                          placeholder="Seleccionar corresponsable..."
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.removeBtn, { backgroundColor: themeColors.danger + '20' }]}
                        onPress={() => removeCorresponsable(index)}
                      >
                        <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addCorrBtn}
                    onPress={addCorresponsable}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={themeColors.accent} />
                    <Text style={[styles.addCorrText, { color: themeColors.accent }]}>Agregar corresponsable</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* TIPO DE VÍNCULO */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Tipo de Vínculo</Text>
                <View style={styles.pillsContainer}>
                  {['Interno', 'Cliente'].map((tipo) => (
                    <TouchableOpacity
                      key={tipo}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: vinculoTipo === tipo ? themeColors.accent : 'transparent',
                          borderColor: vinculoTipo === tipo ? themeColors.accent : themeColors.border
                        }
                      ]}
                      onPress={() => {
                        setVinculoTipo(tipo as any);
                        if (tipo === 'Interno') {
                          setRelacionarVenta(false);
                          setClienteId('');
                          setReferenciaVentaId('');
                        }
                      }}
                    >
                      <Text style={{ color: vinculoTipo === tipo ? '#fff' : themeColors.text, fontWeight: '600' }}>
                        {tipo}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* CLIENTE Y VENTA */}
              {vinculoTipo === 'Cliente' && (
                <View style={[styles.clienteSection, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  
                  <View style={styles.toggleRow}>
                    <Text style={[styles.label, { color: themeColors.text, marginBottom: 0 }]}>Relacionar a una venta</Text>
                    <Switch
                      value={relacionarVenta}
                      onValueChange={handleToggleVenta}
                      trackColor={{ false: themeColors.border, true: themeColors.accent + '80' }}
                      thumbColor={relacionarVenta ? themeColors.accent : '#f4f3f4'}
                    />
                  </View>

                  <SelectDropdown
                    label="Cliente *"
                    data={clientes}
                    value={clienteId}
                    onSelect={(val) => {
                      setClienteId(val);
                      setReferenciaVentaId('');
                    }}
                    searchable
                    placeholder="Buscar cliente..."
                  />

                  {relacionarVenta && (
                    <VentaSelectModal
                      label="Referencia de Venta *"
                      data={ventasDisponibles}
                      value={referenciaVentaId}
                      onSelect={setReferenciaVentaId}
                      disabled={!clienteId}
                      placeholder={!clienteId ? "Primero selecciona un cliente" : "Buscar referencia..."}
                    />
                  )}
                </View>
              )}

              {/* NOTA DE CAMBIO O OBSERVACIÓN */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Nota de Avance o Comentario (Opcional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder="Ej. Se ajustó fecha y descripción a petición del cliente..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={notaCambio}
                  onChangeText={setNotaCambio}
                />
              </View>

            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    ...Platform.select({
      web: {
        maxHeight: '90%',
        maxWidth: 700,
        width: '100%',
        alignSelf: 'center',
        borderRadius: BorderRadius.large,
        overflow: 'hidden',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
      }
    })
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveBtnText: {
    fontWeight: '700',
    fontSize: 16,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: Spacing.five,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
  },
  dateBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.three,
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  corresponsablesSection: {
    marginBottom: Spacing.five,
  },
  corresponsableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  removeBtn: {
    height: 48,
    width: 48,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCorrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  addCorrText: {
    fontSize: 15,
    fontWeight: '600',
  },
  clienteSection: {
    padding: Spacing.four,
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    marginTop: Spacing.two,
    marginBottom: Spacing.five,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  }
});
