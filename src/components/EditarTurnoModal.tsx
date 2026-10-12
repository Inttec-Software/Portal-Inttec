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
import { AsistenciaService } from '@/services/supabase';
import { TurnoAsistencia } from '@/utils/asistenciaUtils';

interface EditarTurnoModalProps {
  visible: boolean;
  onClose: () => void;
  turno: TurnoAsistencia | null;
  fecha: string;
  empleadoNombre: string;
  onSaveSuccess: () => void;
}

export default function EditarTurnoModal({
  visible,
  onClose,
  turno,
  fecha,
  empleadoNombre,
  onSaveSuccess,
}: EditarTurnoModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [sinSalida, setSinSalida] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (turno && visible) {
      // Limpiar formatos "+00" si los tuviera
      const cleanIn = (turno.hora_entrada || '').split('+')[0].trim();
      const cleanOut = (turno.hora_salida || '').split('+')[0].trim();
      
      setHoraEntrada(cleanIn || '08:00:00');
      setHoraSalida(cleanOut || '');
      setSinSalida(!cleanOut || cleanOut === '');
      setObservaciones('');
      setErrorMsg(null);
    }
  }, [turno, visible]);

  if (!turno) return null;

  const handlePresetEntrada = (time: string) => {
    setHoraEntrada(time.length === 5 ? `${time}:00` : time);
  };

  const handlePresetSalida = (time: string) => {
    setSinSalida(false);
    setHoraSalida(time.length === 5 ? `${time}:00` : time);
  };

  const executeDelete = async () => {
    try {
      setIsDeleting(true);
      await AsistenciaService.eliminarAsistencia(turno.id);

      if (Platform.OS === 'web') {
        alert('Registro de asistencia eliminado correctamente.');
      } else {
        Alert.alert('Éxito', 'Registro de asistencia eliminado correctamente.');
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al eliminar el registro.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      const confirmDelete = window.confirm(
        `¿Estás seguro de que deseas eliminar este turno de ${empleadoNombre} del ${fecha}?\n\nEsta acción es irreversible y eliminará el registro de Inttec y Daravisa.`
      );
      if (confirmDelete) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Registro',
        `¿Estás seguro de que deseas eliminar este turno de ${empleadoNombre} del ${fecha}? Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  const handleSave = async () => {
    setErrorMsg(null);

    // Validar hora de entrada
    const trimmedEntrada = horaEntrada.trim();
    if (!trimmedEntrada) {
      setErrorMsg('La hora de entrada es obligatoria.');
      return;
    }

    // Validar formato HH:MM o HH:MM:SS
    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    if (!timeRegex.test(trimmedEntrada)) {
      setErrorMsg('Formato de hora de entrada inválido (use HH:MM o HH:MM:SS, ej: 08:00:00).');
      return;
    }

    let trimmedSalida: string | null = null;
    if (!sinSalida && horaSalida.trim()) {
      trimmedSalida = horaSalida.trim();
      if (!timeRegex.test(trimmedSalida)) {
        setErrorMsg('Formato de hora de salida inválido (use HH:MM o HH:MM:SS, ej: 18:00:00).');
        return;
      }
    }

    try {
      setIsSaving(true);
      await AsistenciaService.editarHorasAsistencia(
        turno.id,
        trimmedEntrada,
        trimmedSalida,
        observaciones.trim() || undefined,
        fecha
      );

      if (Platform.OS === 'web') {
        alert('Horas de asistencia actualizadas correctamente.');
      } else {
        Alert.alert('Éxito', 'Horas de asistencia actualizadas correctamente.');
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#6366f118' }]}>
                <Ionicons name="construct-outline" size={20} color="#6366f1" />
              </View>
              <View>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: themeColors.text }]}>
                    Editar Horas
                  </Text>
                  <View style={styles.devBadge}>
                    <Text style={styles.devBadgeText}>DEV ONLY</Text>
                  </View>
                </View>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                  {empleadoNombre} • {fecha}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: themeColors.backgroundElement }]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Ionicons name="close" size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {errorMsg ? (
              <View style={[styles.errorBanner, { backgroundColor: '#ef444415', borderColor: '#ef444450' }]}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={[styles.errorText, { color: '#ef4444' }]}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* SECCIÓN HORA DE ENTRADA */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="log-in-outline" size={16} color={themeColors.success} style={{ marginRight: 6 }} />
                <Text style={[styles.label, { color: themeColors.text }]}>Hora de Entrada</Text>
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                    color: themeColors.text,
                  },
                ]}
                value={horaEntrada}
                onChangeText={setHoraEntrada}
                placeholder="08:00:00"
                placeholderTextColor={themeColors.textSecondary}
                autoCapitalize="none"
              />
              {/* Presets rápidos */}
              <View style={styles.presetsRow}>
                {['07:30', '08:00', '08:30', '09:00'].map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.presetBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => handlePresetEntrada(p)}
                  >
                    <Text style={[styles.presetBtnText, { color: themeColors.textSecondary }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* SECCIÓN HORA DE SALIDA */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRowBetween}>
                <View style={styles.labelRow}>
                  <Ionicons name="log-out-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
                  <Text style={[styles.label, { color: themeColors.text }]}>Hora de Salida</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggleSalidaBtn,
                    sinSalida
                      ? { backgroundColor: themeColors.warning + '20', borderColor: themeColors.warning }
                      : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                  ]}
                  onPress={() => {
                    const next = !sinSalida;
                    setSinSalida(next);
                    if (next) setHoraSalida('');
                    else setHoraSalida('18:00:00');
                  }}
                >
                  <Text
                    style={[
                      styles.toggleSalidaText,
                      { color: sinSalida ? themeColors.warning : themeColors.textSecondary },
                    ]}
                  >
                    {sinSalida ? '⏳ Turno abierto' : 'Turno cerrado'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!sinSalida ? (
                <>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: themeColors.backgroundElement,
                        borderColor: themeColors.border,
                        color: themeColors.text,
                      },
                    ]}
                    value={horaSalida}
                    onChangeText={setHoraSalida}
                    placeholder="18:00:00"
                    placeholderTextColor={themeColors.textSecondary}
                    autoCapitalize="none"
                  />
                  {/* Presets rápidos */}
                  <View style={styles.presetsRow}>
                    {['17:00', '18:00', '18:30', '19:00'].map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.presetBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                        onPress={() => handlePresetSalida(p)}
                      >
                        <Text style={[styles.presetBtnText, { color: themeColors.textSecondary }]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <View style={[styles.openShiftNotice, { backgroundColor: themeColors.warning + '12', borderColor: themeColors.warning + '30' }]}>
                  <Ionicons name="time-outline" size={16} color={themeColors.warning} style={{ marginRight: 6 }} />
                  <Text style={[styles.openShiftNoticeText, { color: themeColors.warning }]}>
                    Este turno se guardará sin hora de salida (en curso).
                  </Text>
                </View>
              )}
            </View>

            {/* SECCIÓN OBSERVACIONES / MOTIVO */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="document-text-outline" size={16} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Motivo / Justificación (Opcional)
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                    color: themeColors.text,
                  },
                ]}
                value={observaciones}
                onChangeText={setObservaciones}
                placeholder="Ej. Olvido de checada al salir, ajuste por falla de red..."
                placeholderTextColor={themeColors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: '#ef444415', borderColor: '#ef444440' }]}
              onPress={handleDelete}
              disabled={isSaving || isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" style={{ marginRight: 5 }} />
                  <Text style={styles.deleteBtnText}>Eliminar Turno</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footerRight}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                onPress={onClose}
                disabled={isSaving || isDeleting}
              >
                <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: '#6366f1' },
                  (isSaving || isDeleting) && { opacity: 0.7 },
                ]}
                onPress={handleSave}
                disabled={isSaving || isDeleting}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  devBadge: {
    backgroundColor: '#6366f120',
    borderColor: '#6366f150',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  devBadgeText: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: Spacing.three,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  textArea: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  toggleSalidaBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  toggleSalidaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  openShiftNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginTop: 4,
  },
  openShiftNoticeText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderTopWidth: 1,
    flexWrap: 'wrap',
    gap: 10,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: BorderRadius.medium,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
