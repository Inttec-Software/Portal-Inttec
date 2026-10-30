import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Usuario } from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';

interface EditarHorarioModalProps {
  visible: boolean;
  onClose: () => void;
  empleado: Usuario | null;
  onSaveSuccess: (updatedEmployee: Usuario) => void;
}

const PRESET_JORNADAS = [
  { horas: 48, label: '48h (Estándar LFT)' },
  { horas: 40, label: '40h (Reducida)' },
  { horas: 30, label: '30h (Contabilidad)' },
  { horas: 25, label: '25h (Devs)' },
  { horas: 20, label: '20h (Medio tiempo)' },
];
const PRESET_ENTRADAS = ['07:00', '08:00', '08:30', '09:00'];
const PRESET_SALIDAS = ['16:00', '17:00', '18:00', '19:00'];

export default function EditarHorarioModal({
  visible,
  onClose,
  empleado,
  onSaveSuccess,
}: EditarHorarioModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [horasSemanales, setHorasSemanales] = useState('48');
  const [horaEntrada, setHoraEntrada] = useState('08:00');
  const [horaSalida, setHoraSalida] = useState('18:00');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (empleado && visible) {
      setHorasSemanales(
        empleado.horas_semanales !== undefined && empleado.horas_semanales !== null
          ? String(empleado.horas_semanales)
          : '48'
      );
      setHoraEntrada(empleado.hora_entrada_estandar || '08:00');
      setHoraSalida(empleado.hora_salida_estandar || '18:00');
      setErrorMsg(null);
    }
  }, [empleado, visible]);

  if (!empleado) return null;

  const numHoras = parseFloat(horasSemanales) || 0;

  const handleSave = async () => {
    setErrorMsg(null);

    const parsedHoras = parseFloat(horasSemanales.trim());
    if (isNaN(parsedHoras) || parsedHoras <= 0 || parsedHoras > 168) {
      setErrorMsg('Ingresa un número válido de horas semanales (entre 1 y 168 hrs).');
      return;
    }

    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    const cleanEntrada = horaEntrada.trim();
    const cleanSalida = horaSalida.trim();

    if (cleanEntrada && !timeRegex.test(cleanEntrada)) {
      setErrorMsg('Formato de hora de entrada inválido (use HH:MM, ej: 08:00).');
      return;
    }
    if (cleanSalida && !timeRegex.test(cleanSalida)) {
      setErrorMsg('Formato de hora de salida inválido (use HH:MM, ej: 18:00).');
      return;
    }

    try {
      setIsSaving(true);
      const updates = {
        horas_semanales: parsedHoras,
        hora_entrada_estandar: cleanEntrada || '08:00',
        hora_salida_estandar: cleanSalida || '18:00',
      };

      await CatalogService.actualizarUsuario(empleado.id, updates);

      const updatedObj: Usuario = {
        ...empleado,
        ...updates,
      };

      if (Platform.OS === 'web') {
        window.alert(`Horario laboral de ${empleado.nombre} actualizado a ${parsedHoras} hrs semanales.`);
      } else {
        Alert.alert('Éxito', `Horario laboral de ${empleado.nombre} actualizado a ${parsedHoras} hrs semanales.`);
      }

      onSaveSuccess(updatedObj);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar el horario del empleado.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.iconBadge, { backgroundColor: '#0284c718' }]}>
                  <Ionicons name="time" size={20} color="#0284c7" />
                </View>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Editar Horario y Jornada
                </Text>
              </View>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                {empleado.nombre} • {empleado.rol || 'EMPLEADO'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* SECCIÓN 1: Jornada Semanal (Horas) */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="calendar-outline" size={16} color="#0284c7" />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Jornada Semanal (Meta de Horas)
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: themeColors.textSecondary }]}>
                Define el número de horas regulares por semana. Todo tiempo laborado que supere esta meta contará automáticamente como Horas Extras.
              </Text>

              {/* Input numérico */}
              <View style={[styles.inputRow, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                <TextInput
                  style={[styles.numericInput, { color: themeColors.text }]}
                  value={horasSemanales}
                  onChangeText={(val) => setHorasSemanales(val.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="48"
                  placeholderTextColor={themeColors.textSecondary}
                />
                <Text style={[styles.inputUnit, { color: themeColors.textSecondary }]}>hrs / semana</Text>
              </View>

              {/* Botones Preset de Jornada */}
              <View style={styles.presetsWrap}>
                {PRESET_JORNADAS.map((preset) => {
                  const isSelected = numHoras === preset.horas;
                  return (
                    <TouchableOpacity
                      key={preset.horas}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: isSelected ? '#0284c7' : themeColors.backgroundElement,
                          borderColor: isSelected ? '#0284c7' : themeColors.border,
                        },
                      ]}
                      onPress={() => setHorasSemanales(String(preset.horas))}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: isSelected ? '#ffffff' : themeColors.text },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* SECCIÓN 2: Horario Estándar de Entrada y Salida */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="alarm-outline" size={16} color="#0284c7" />
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Horario Laboral Estándar Diario
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: themeColors.textSecondary }]}>
                Horas estándar de entrada y salida para referencia y generación de reportes.
              </Text>

              <View style={styles.timeInputsGrid}>
                {/* Entrada */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                    Hora Entrada:
                  </Text>
                  <View style={[styles.inputRow, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                    <Ionicons name="log-in-outline" size={16} color="#16a34a" style={{ marginRight: 6 }} />
                    <TextInput
                      style={[styles.timeInput, { color: themeColors.text }]}
                      value={horaEntrada}
                      onChangeText={setHoraEntrada}
                      placeholder="08:00"
                      placeholderTextColor={themeColors.textSecondary}
                    />
                  </View>
                  <View style={styles.miniPresetsRow}>
                    {PRESET_ENTRADAS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setHoraEntrada(t)}
                        style={[
                          styles.miniChip,
                          {
                            backgroundColor: horaEntrada === t ? '#16a34a20' : themeColors.backgroundElement,
                            borderColor: horaEntrada === t ? '#16a34a' : themeColors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.miniChipText, { color: horaEntrada === t ? '#16a34a' : themeColors.textSecondary }]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Salida */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>
                    Hora Salida:
                  </Text>
                  <View style={[styles.inputRow, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                    <Ionicons name="log-out-outline" size={16} color="#ef4444" style={{ marginRight: 6 }} />
                    <TextInput
                      style={[styles.timeInput, { color: themeColors.text }]}
                      value={horaSalida}
                      onChangeText={setHoraSalida}
                      placeholder="18:00"
                      placeholderTextColor={themeColors.textSecondary}
                    />
                  </View>
                  <View style={styles.miniPresetsRow}>
                    {PRESET_SALIDAS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setHoraSalida(t)}
                        style={[
                          styles.miniChip,
                          {
                            backgroundColor: horaSalida === t ? '#ef444420' : themeColors.backgroundElement,
                            borderColor: horaSalida === t ? '#ef4444' : themeColors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.miniChipText, { color: horaSalida === t ? '#ef4444' : themeColors.textSecondary }]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* SECCIÓN 3: Tarjeta de Vista Previa y Regla de Cálculo */}
            <View style={[styles.previewBox, { backgroundColor: '#0284c712', borderColor: '#0284c740' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="information-circle" size={18} color="#0284c7" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0284c7' }}>
                  Impacto en Cálculo de Asistencia
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: themeColors.text, lineHeight: 18 }}>
                La jornada semanal de <Text style={{ fontWeight: 'bold' }}>{empleado.nombre}</Text> será de{' '}
                <Text style={{ fontWeight: 'bold', color: '#0284c7' }}>{numHoras || 48} hrs</Text> ({Math.round((numHoras || 48) * 60)} min semanales).
                {numHoras !== 48 ? (
                  `\n\n🎯 En lugar de 48 hrs, se computarán hasta ${numHoras} horas regulares a la semana (ej. devs 25 hrs, contabilidad 30 hrs). Al exceder esas ${numHoras} horas en la semana, todo el tiempo adicional se contabilizará automáticamente como Horas Extras.`
                ) : (
                  '\n\n📌 Aplica la jornada regular estándar de 48 horas semanales según ley.'
                )}
              </Text>
            </View>
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: themeColors.border }]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={[styles.btnCancelText, { color: themeColors.text }]}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSave, { opacity: isSaving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-sharp" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.btnSaveText}>Guardar Horario</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#b91c1c',
    flex: 1,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  numericInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  inputUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  presetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeInputsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  miniPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  miniChip: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  miniChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  previewBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSaveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

