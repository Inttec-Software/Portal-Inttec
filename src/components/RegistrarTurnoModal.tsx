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

interface RegistrarTurnoModalProps {
  visible: boolean;
  onClose: () => void;
  empleadoId: string;
  empleadoNombre: string;
  defaultFecha?: string; // YYYY-MM-DD
  onSaveSuccess: () => void;
}

export default function RegistrarTurnoModal({
  visible,
  onClose,
  empleadoId,
  empleadoNombre,
  defaultFecha,
  onSaveSuccess,
}: RegistrarTurnoModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const getTodayStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [fecha, setFecha] = useState(defaultFecha || getTodayStr());
  const [horaEntrada, setHoraEntrada] = useState('08:00:00');
  const [horaSalida, setHoraSalida] = useState('18:00:00');
  const [sinSalida, setSinSalida] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setFecha(defaultFecha || getTodayStr());
      setHoraEntrada('08:00:00');
      setHoraSalida('18:00:00');
      setSinSalida(false);
      setObservaciones('');
      setErrorMsg(null);
    }
  }, [visible, defaultFecha]);

  const handlePresetEntrada = (time: string) => {
    setHoraEntrada(time.length === 5 ? `${time}:00` : time);
  };

  const handlePresetSalida = (time: string) => {
    setSinSalida(false);
    setHoraSalida(time.length === 5 ? `${time}:00` : time);
  };

  const handleSave = async () => {
    setErrorMsg(null);

    if (!empleadoId) {
      setErrorMsg('No se especificó el ID del empleado.');
      return;
    }

    const trimmedFecha = fecha.trim();
    if (!trimmedFecha || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedFecha)) {
      setErrorMsg('La fecha debe tener el formato YYYY-MM-DD (ej: 2026-10-29).');
      return;
    }

    const trimmedEntrada = horaEntrada.trim();
    if (!trimmedEntrada) {
      setErrorMsg('La hora de entrada es obligatoria.');
      return;
    }

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
      await AsistenciaService.registrarTurnoManual({
        empleado_id: empleadoId,
        fecha: trimmedFecha,
        hora_entrada: trimmedEntrada,
        hora_salida: trimmedSalida,
        observaciones: observaciones.trim() || undefined,
      });

      if (Platform.OS === 'web') {
        alert(`Registro de asistencia guardado correctamente para ${empleadoNombre} el ${trimmedFecha}.`);
      } else {
        Alert.alert('Éxito', `Registro de asistencia guardado correctamente para ${empleadoNombre} el ${trimmedFecha}.`);
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el nuevo turno.');
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
              <View style={[styles.iconBox, { backgroundColor: '#10b98118' }]}>
                <Ionicons name="add-circle-outline" size={22} color="#10b981" />
              </View>
              <View>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: themeColors.text }]}>
                    Registro de Asistencia
                  </Text>
                  <View style={[styles.badge, { backgroundColor: '#10b98120', borderColor: '#10b98150' }]}>
                    <Text style={[styles.badgeText, { color: '#10b981' }]}>NUEVA ASISTENCIA</Text>
                  </View>
                </View>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                  {empleadoNombre}
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

            {/* SECCIÓN FECHA */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRowBetween}>
                <View style={styles.labelRow}>
                  <Ionicons name="calendar-outline" size={16} color={themeColors.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.label, { color: themeColors.text }]}>Fecha de Asistencia</Text>
                </View>
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetDateBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => setFecha(getTodayStr())}
                  >
                    <Text style={[styles.presetDateBtnText, { color: themeColors.textSecondary }]}>Hoy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetDateBtn, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                    onPress={() => setFecha(getYesterdayStr())}
                  >
                    <Text style={[styles.presetDateBtnText, { color: themeColors.textSecondary }]}>Ayer</Text>
                  </TouchableOpacity>
                </View>
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
                value={fecha}
                onChangeText={setFecha}
                placeholder="YYYY-MM-DD (ej: 2026-10-29)"
                placeholderTextColor={themeColors.textSecondary}
                autoCapitalize="none"
              />
            </View>

            {/* SECCIÓN HORA DE ENTRADA */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="log-in-outline" size={16} color="#10b981" style={{ marginRight: 6 }} />
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
                {['07:00', '07:30', '08:00', '08:30', '09:00', '14:00'].map((p) => (
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
                    {['13:00', '14:00', '17:00', '18:00', '18:30', '19:00'].map((p) => (
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
                    Este turno se guardará en curso (sin hora de salida registrada).
                  </Text>
                </View>
              )}
            </View>

            {/* SECCIÓN OBSERVACIONES / MOTIVO */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="document-text-outline" size={16} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Motivo / Observaciones (Opcional)
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
                placeholder="Ej. Olvido de checador, guardia especial, tiempo extra autorizado..."
                placeholderTextColor={themeColors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: themeColors.border }]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#10b981' }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Guardar Registro de Asistencia</Text>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
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
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: Spacing.four,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.four,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  presetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  presetDateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  presetDateBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    height: 42,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 70,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 13,
    textAlignVertical: 'top',
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
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  openShiftNoticeText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: 9,
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
    paddingHorizontal: Spacing.four,
    paddingVertical: 9,
    borderRadius: BorderRadius.medium,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

