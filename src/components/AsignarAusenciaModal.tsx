import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AsistenciaService, TipoAusencia } from '@/services/supabase';
import { calcularDiasHabilesPreview, formatDateToLocalYMD } from '@/utils/asistenciaUtils';

interface AsignarAusenciaModalProps {
  visible: boolean;
  onClose: () => void;
  empleadoId: string;
  empleadoNombre: string;
  defaultFecha?: string;
  onSaveSuccess: () => void;
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function parseYMDLocal(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default function AsignarAusenciaModal({
  visible,
  onClose,
  empleadoId,
  empleadoNombre,
  defaultFecha,
  onSaveSuccess,
}: AsignarAusenciaModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [tipo, setTipo] = useState<TipoAusencia>('VACACIONES');
  const [modoRango, setModoRango] = useState<'dias' | 'rango'>('dias');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [diasHabilesStr, setDiasHabilesStr] = useState<string>('1');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [pickingEnd, setPickingEnd] = useState<boolean>(false);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [motivo, setMotivo] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const baseDate = defaultFecha || formatDateToLocalYMD(new Date());
      const dt = parseYMDLocal(baseDate);
      setTipo('VACACIONES');
      setModoRango('dias');
      setFechaInicio(baseDate);
      setDiasHabilesStr('1');
      setFechaFin(baseDate);
      setPickingEnd(false);
      setCalendarYear(dt.getFullYear());
      setCalendarMonth(dt.getMonth());
      setMotivo('');
    }
  }, [visible, defaultFecha]);

  const previewDias = useMemo(() => {
    if (modoRango === 'dias') {
      const num = Number(diasHabilesStr);
      return calcularDiasHabilesPreview(fechaInicio, {
        diasHabiles: Number.isFinite(num) && num > 0 ? num : 0,
      });
    }
    return calcularDiasHabilesPreview(fechaInicio, { fechaFin });
  }, [modoRango, fechaInicio, diasHabilesStr, fechaFin]);

  const previewSet = useMemo(() => new Set(previewDias), [previewDias]);
  const firstSelected = previewDias[0] || fechaInicio;
  const lastSelected = previewDias[previewDias.length - 1] || fechaInicio;

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    // Monday = 0 ... Sunday = 6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const cells: Array<{ ymd: string; day: number; isWeekend: boolean } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(calendarYear, calendarMonth, d);
      const dow = dt.getDay();
      const ymd = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ ymd, day: d, isWeekend: dow === 0 || dow === 6 });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const changeMonth = (delta: number) => {
    const dt = new Date(calendarYear, calendarMonth + delta, 1);
    setCalendarYear(dt.getFullYear());
    setCalendarMonth(dt.getMonth());
  };

  const handleSelectDay = (ymd: string, isWeekend: boolean) => {
    if (isWeekend) return;
    if (modoRango === 'dias') {
      setFechaInicio(ymd);
      return;
    }
    // Modo 'rango': 1er clic fija inicio, 2do clic >= inicio fija fin
    if (!pickingEnd || ymd < fechaInicio) {
      setFechaInicio(ymd);
      setFechaFin(ymd);
      setPickingEnd(true);
    } else {
      setFechaFin(ymd);
      setPickingEnd(false);
    }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleSave = async () => {
    if (previewDias.length === 0) {
      showAlert('Fechas inválidas', 'Selecciona al menos 1 día hábil (lunes a viernes) en el calendario.');
      return;
    }

    try {
      setIsSaving(true);
      await AsistenciaService.asignarAusencias({
        empleado_id: empleadoId,
        tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: modoRango === 'rango' ? fechaFin : undefined,
        dias_habiles: modoRango === 'dias' ? Number(diasHabilesStr) : undefined,
        motivo: motivo.trim() || undefined,
      });
      onSaveSuccess();
      onClose();
    } catch (error: any) {
      showAlert('Error', error?.message || 'No se pudo guardar la ausencia');
    } finally {
      setIsSaving(false);
    }
  };

  const formatShortPreview = (ymd: string) => {
    if (!ymd) return '--';
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  };

  const activeColor = tipo === 'VACACIONES' ? '#0284c7' : '#d97706';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: themeColors.text }]}>Vacaciones / Permiso sin goce</Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {empleadoNombre}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Tipo de ausencia (0h sumadas)</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: tipo === 'VACACIONES' ? '#0284c718' : themeColors.backgroundElement,
                    borderColor: tipo === 'VACACIONES' ? '#0284c7' : themeColors.border,
                  },
                ]}
                onPress={() => setTipo('VACACIONES')}
              >
                <Ionicons
                  name="airplane-outline"
                  size={16}
                  color={tipo === 'VACACIONES' ? '#0284c7' : themeColors.textSecondary}
                />
                <Text style={[styles.segmentText, { color: tipo === 'VACACIONES' ? '#0284c7' : themeColors.text }]}>
                  Vacaciones
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: tipo === 'PERMISO_SIN_GOCE' ? '#d9770618' : themeColors.backgroundElement,
                    borderColor: tipo === 'PERMISO_SIN_GOCE' ? '#d97706' : themeColors.border,
                  },
                ]}
                onPress={() => setTipo('PERMISO_SIN_GOCE')}
              >
                <Ionicons
                  name="calendar-clear-outline"
                  size={16}
                  color={tipo === 'PERMISO_SIN_GOCE' ? '#d97706' : themeColors.textSecondary}
                />
                <Text style={[styles.segmentText, { color: tipo === 'PERMISO_SIN_GOCE' ? '#d97706' : themeColors.text }]}>
                  Permiso sin goce
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Modo de selección</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: modoRango === 'dias' ? themeColors.accent + '18' : themeColors.backgroundElement,
                    borderColor: modoRango === 'dias' ? themeColors.accent : themeColors.border,
                  },
                ]}
                onPress={() => {
                  setModoRango('dias');
                  setPickingEnd(false);
                }}
              >
                <Text style={[styles.segmentText, { color: modoRango === 'dias' ? themeColors.accent : themeColors.text }]}>
                  Inicio + Días hábiles
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: modoRango === 'rango' ? themeColors.accent + '18' : themeColors.backgroundElement,
                    borderColor: modoRango === 'rango' ? themeColors.accent : themeColors.border,
                  },
                ]}
                onPress={() => {
                  setModoRango('rango');
                  setFechaFin(lastSelected || fechaInicio);
                  setPickingEnd(false);
                }}
              >
                <Text style={[styles.segmentText, { color: modoRango === 'rango' ? themeColors.accent : themeColors.text }]}>
                  Rango en calendario
                </Text>
              </TouchableOpacity>
            </View>

            {modoRango === 'dias' ? (
              <View style={styles.diasRow}>
                <Text style={[styles.diasLabel, { color: themeColors.text }]}>
                  Inicio: <Text style={{ fontWeight: '700', color: activeColor }}>{formatShortPreview(fechaInicio)}</Text>
                </Text>
                <View style={styles.diasInputWrap}>
                  <Text style={[styles.diasLabel, { color: themeColors.textSecondary }]}>Días hábiles:</Text>
                  <TextInput
                    style={[styles.diasInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
                    value={diasHabilesStr}
                    onChangeText={(t) => setDiasHabilesStr(t.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    placeholder="7"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.rangePillsRow}>
                <View
                  style={[
                    styles.rangePill,
                    {
                      backgroundColor: !pickingEnd ? activeColor + '15' : themeColors.backgroundElement,
                      borderColor: !pickingEnd ? activeColor : themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.rangePillLabel, { color: themeColors.textSecondary }]}>Inicio</Text>
                  <Text style={[styles.rangePillValue, { color: themeColors.text }]}>{formatShortPreview(fechaInicio)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={themeColors.textSecondary} />
                <View
                  style={[
                    styles.rangePill,
                    {
                      backgroundColor: pickingEnd ? activeColor + '15' : themeColors.backgroundElement,
                      borderColor: pickingEnd ? activeColor : themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.rangePillLabel, { color: themeColors.textSecondary }]}>
                    {pickingEnd ? 'Toca fecha fin...' : 'Fin'}
                  </Text>
                  <Text style={[styles.rangePillValue, { color: themeColors.text }]}>{formatShortPreview(fechaFin)}</Text>
                </View>
              </View>
            )}

            {/* Calendario mensual inline */}
            <View style={[styles.calendarBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <View style={styles.calHeader}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                  <Ionicons name="chevron-back" size={18} color={themeColors.text} />
                </TouchableOpacity>
                <Text style={[styles.calMonthTitle, { color: themeColors.text }]}>
                  {MESES_ES[calendarMonth]} {calendarYear}
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.calWeekHeader}>
                {DIAS_SEMANA_HEADER.map((d, idx) => (
                  <Text
                    key={d}
                    style={[
                      styles.calWeekDayText,
                      { color: idx >= 5 ? themeColors.textSecondary + '80' : themeColors.textSecondary },
                    ]}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.calGrid}>
                {calendarCells.map((cell, idx) => {
                  if (!cell) {
                    return <View key={`empty-${idx}`} style={styles.calCell} />;
                  }
                  const isSelected = previewSet.has(cell.ymd);
                  const isEdge = isSelected && (cell.ymd === firstSelected || cell.ymd === lastSelected);
                  return (
                    <TouchableOpacity
                      key={cell.ymd}
                      style={[
                        styles.calCell,
                        cell.isWeekend && { opacity: 0.35 },
                        isSelected && {
                          backgroundColor: isEdge ? activeColor : activeColor + '25',
                          borderRadius: BorderRadius.small,
                        },
                      ]}
                      disabled={cell.isWeekend}
                      onPress={() => handleSelectDay(cell.ymd, cell.isWeekend)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.calCellText,
                          {
                            color: isEdge ? '#fff' : isSelected ? activeColor : themeColors.text,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.previewBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <Text style={[styles.previewTitle, { color: themeColors.text }]}>
                Seleccionados: {previewDias.length} día{previewDias.length === 1 ? '' : 's'} hábil{previewDias.length === 1 ? '' : 'es'} (sin fines de semana)
              </Text>
              {previewDias.length > 0 && (
                <Text style={[styles.previewDates, { color: themeColors.textSecondary }]}>
                  {previewDias.slice(0, 14).map(formatShortPreview).join(' • ')}
                  {previewDias.length > 14 ? ` ... (+${previewDias.length - 14} más)` : ''}
                </Text>
              )}
            </View>

            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Nota / Motivo (opcional)</Text>
            <TextInput
              style={[styles.input, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
              value={motivo}
              onChangeText={setMotivo}
              placeholder={tipo === 'VACACIONES' ? 'Ej. Periodo anual de vacaciones' : 'Ej. Asunto personal'}
              placeholderTextColor={themeColors.textSecondary}
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: themeColors.border }]} onPress={onClose} disabled={isSaving}>
              <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: activeColor, opacity: isSaving || previewDias.length === 0 ? 0.6 : 1 },
              ]}
              onPress={handleSave}
              disabled={isSaving || previewDias.length === 0}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Guardar ({previewDias.length}d)</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: Spacing.three,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  diasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  diasLabel: {
    fontSize: 13,
  },
  diasInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  diasInput: {
    width: 68,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '700',
  },
  rangePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  rangePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangePillLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  rangePillValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  calendarBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calNavBtn: {
    padding: 4,
  },
  calMonthTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  calWeekHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calWeekDayText: {
    width: '14.285%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: '14.285%',
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calCellText: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 8,
  },
  previewBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  previewDates: {
    fontSize: 11,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: BorderRadius.medium,
    minWidth: 120,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
