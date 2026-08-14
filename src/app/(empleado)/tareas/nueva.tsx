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
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import SelectDropdown from '@/components/SelectDropdown';
import VentaSelectModal from '@/components/VentaSelectModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/services/supabase';

export default function NuevaTareaScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  
  // Data lists
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);

  // Form state
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  
  const [fechaCompromiso, setFechaCompromiso] = useState(new Date(Date.now() + 86400000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [responsableId, setResponsableId] = useState<string>('');
  const [corresponsables, setCorresponsables] = useState<string[]>([]);
  
  const [vinculoTipo, setVinculoTipo] = useState<'Interno' | 'Cliente'>('Interno');
  const [relacionarVenta, setRelacionarVenta] = useState(false);
  
  const [clienteId, setClienteId] = useState<string>('');
  const [referenciaVentaId, setReferenciaVentaId] = useState<string>('');

  useEffect(() => {
    fetchFormularyData();
  }, [user]);

  const fetchFormularyData = async () => {
    setFetchingData(true);
    try {
      let userQuery = supabase.from('usuarios').select('id, nombre');
      if (user?.rol === 'EMPLEADO') {
        userQuery = userQuery.eq('rol', 'EMPLEADO');
      }
      const { data: userData } = await userQuery;
      setUsuarios(userData || []);

      const { data: clientsData } = await supabase.from('clientes').select('id, nombre');
      setClientes((clientsData || []).map((c: any) => ({ id: c.id, nombre: c.nombre })));

      const { data: ventasData } = await supabase.from('ventas').select('id, cliente, factura_referencia, fecha, sucursal');
      setVentas(ventasData || []);
      
      if (user?.id) {
        setResponsableId(user.id);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setFetchingData(false);
    }
  };

  // Handlers for Corresponsables
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

  // Handlers for Vínculos
  const handleToggleVenta = (val: boolean) => {
    setRelacionarVenta(val);
    setClienteId('');
    setReferenciaVentaId('');
  };

  const handleSave = async () => {
    if (!titulo.trim() || !descripcion.trim() || !responsableId || !fechaCompromiso) {
      if (Platform.OS === 'web') window.alert('Por favor completa todos los campos requeridos.');
      else Alert.alert('Error', 'Por favor completa todos los campos requeridos.');
      return;
    }

    if (vinculoTipo === 'Cliente' && !clienteId) {
      if (Platform.OS === 'web') window.alert('Debes seleccionar un cliente.');
      else Alert.alert('Error', 'Debes seleccionar un cliente.');
      return;
    }

    if (vinculoTipo === 'Cliente' && relacionarVenta && !referenciaVentaId) {
      if (Platform.OS === 'web') window.alert('Debes seleccionar una referencia de venta.');
      else Alert.alert('Error', 'Debes seleccionar una referencia de venta.');
      return;
    }

    setLoading(true);
    try {
      const nuevaTarea = {
        titulo,
        descripcion,
        fecha_compromiso: fechaCompromiso.toISOString(),
        creado_por: user?.id,
        responsable_id: responsableId,
        vinculo_tipo: vinculoTipo === 'Interno' ? 'Interna' : (vinculoTipo === 'Cliente' && relacionarVenta ? 'Venta' : 'Cliente'),
        vinculo_id: vinculoTipo === 'Cliente' ? (relacionarVenta ? referenciaVentaId : clienteId) : null
      };

      const { data: tarea, error } = await supabase.from('tareas').insert(nuevaTarea).select().single();
      if (error) throw error;

      if (corresponsables.length > 0) {
        const corrInserts = corresponsables.filter(c => c).map(cId => ({
          tarea_id: tarea.id,
          usuario_id: cId
        }));
        if (corrInserts.length > 0) {
          await supabase.from('tarea_corresponsables').insert(corrInserts);
        }
      }

      if (Platform.OS === 'web') window.alert('Tarea creada exitosamente');
      else Alert.alert('Éxito', 'Tarea creada exitosamente');
      
      router.back();
    } catch (error) {
      console.error(error);
      if (Platform.OS === 'web') window.alert('Hubo un error al guardar la tarea.');
      else Alert.alert('Error', 'Hubo un error al guardar la tarea.');
    } finally {
      setLoading(false);
    }
  };

  const selectedClienteNombre = clientes.find(c => c.id === clienteId)?.nombre;
  const ventasDisponibles = ventas.filter(v => v.cliente === selectedClienteNombre);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom', 'left', 'right']}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.backBtn} />
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Nueva Tarea</Text>
        <TouchableOpacity 
          onPress={handleSave} 
          disabled={loading || fetchingData}
          style={[styles.saveBtn, { opacity: loading || fetchingData ? 0.5 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={themeColors.primary} />
          ) : (
            <Text style={[styles.saveBtnText, { color: themeColors.primary }]}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        
        {/* TÍTULO Y DESCRIPCIÓN */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.text }]}>Título de la Tarea *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.backgroundElement, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="Ej. Revisar expediente de cliente..."
            placeholderTextColor={themeColors.textSecondary}
            value={titulo}
            onChangeText={setTitulo}
          />
        </View>

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
          <Text style={[styles.label, { color: themeColors.text }]}>Fecha de Compromiso *</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input 
              type="date"
              value={fechaCompromiso.toISOString().split('T')[0]}
              onChange={(e: any) => {
                if(e.target.value) setFechaCompromiso(new Date(e.target.value + 'T12:00:00Z'));
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
                boxSizing: 'border-box'
              }}
            />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.dateBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={{ color: themeColors.text, fontSize: 15 }}>
                  {fechaCompromiso.toLocaleDateString()}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={fechaCompromiso}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) setFechaCompromiso(selectedDate);
                  }}
                />
              )}
            </>
          )}
        </View>

        {/* RESPONSABLE Y CORRESPONSABLES */}
        {fetchingData ? (
          <ActivityIndicator size="large" color={themeColors.accent} style={{ marginVertical: 20 }} />
        ) : (
          <>
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
                        data={usuarios.filter(u => u.id !== responsableId)} // Exclude main responsible
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
                  <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} />
                  <Text style={[styles.addCorrText, { color: themeColors.primary }]}>Agregar corresponsable</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}

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
                <Text style={{ color: vinculoTipo === tipo ? '#fff' : themeColors.text }}>
                  {tipo}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* LÓGICA DE CLIENTE Y VENTA */}
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
                setReferenciaVentaId(''); // Reset reference when client changes
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

      </ScrollView>
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
    borderBottomWidth: 1,
  },
  backBtn: {
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
    fontWeight: '600',
    fontSize: 16,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 60,
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
  corresponsablesSection: {
    marginBottom: Spacing.five,
  },
  corresponsableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Top align because SelectDropdown has a label wrapper usually, but we pass empty string
    gap: Spacing.three,
  },
  removeBtn: {
    height: 48, // Match dropdown height
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
  pillsContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
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
