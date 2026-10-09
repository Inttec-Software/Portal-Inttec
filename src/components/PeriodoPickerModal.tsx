import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getWeekRange,
  getPreviousWeekMonday,
  formatDateToLocalYMD,
  parseLocalYMD,
} from '@/utils/asistenciaUtils';

interface PeriodoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMonday: Date;
  onSelectMonday: (mondayDate: Date) => void;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_HEADER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function PeriodoPickerModal({
  visible,
  onClose,
  selectedMonday,
  onSelectMonday,
}: PeriodoPickerModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // Mes y Año en visualización dentro del calendario
  const [viewYear, setViewYear] = useState<number>(() => selectedMonday.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => selectedMonday.getMonth()); // 0 - 11

  // Fecha temporal seleccionada
  const [tempMonday, setTempMonday] = useState<Date>(() => selectedMonday);

  // Al abrir el modal, sincronizar con selectedMonday
  React.useEffect(() => {
    if (visible) {
      setViewYear(selectedMonday.getFullYear());
      setViewMonth(selectedMonday.getMonth());
      setTempMonday(selectedMonday);
    }
  }, [visible, selectedMonday]);

  const currentWeekMonday = useMemo(() => getWeekRange().mondayDate, []);

  // Presets rápidos
  const presets = useMemo(() => {
    const p1 = currentWeekMonday;
    const p2 = getPreviousWeekMonday(p1);
    const p3 = getPreviousWeekMonday(p2);
    const p4 = getPreviousWeekMonday(p3);

    return [
      { label: 'Esta Semana (Actual)', date: p1, isCurrent: true },
      { label: 'Semana Pasada', date: p2 },
      { label: 'Hace 2 Semanas', date: p3 },
      { label: 'Hace 3 Semanas', date: p4 },
    ];
  }, [currentWeekMonday]);

  // Navegar meses
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Matriz de semanas para el mes en vista
  const calendarWeeks = useMemo(() => {
    // Primer día del mes
    const firstDay = new Date(viewYear, viewMonth, 1);
    // Último día del mes
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    // Ajustar para empezar en Lunes (0 = Lunes, 6 = Domingo)
    // En JS: Domingo=0, Lunes=1, ..., Sábado=6
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

    // Fecha de inicio en la grilla (primer lunes visible)
    const startDate = new Date(viewYear, viewMonth, 1 - firstDayOfWeek);

    const weeks: Array<Array<{
      date: Date;
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      mondayOfThisWeek: Date;
    }>> = [];

    const todayStr = formatDateToLocalYMD(new Date());

    let currentCursor = new Date(startDate);
    // Generar hasta 6 semanas si es necesario
    for (let w = 0; w < 6; w++) {
      const weekDays = [];
      const mondayOfThisWeek = new Date(currentCursor);
      mondayOfThisWeek.setHours(0, 0, 0, 0);

      for (let d = 0; d < 7; d++) {
        const dObj = new Date(currentCursor);
        const dateStr = formatDateToLocalYMD(dObj);
        weekDays.push({
          date: dObj,
          dateStr,
          dayNum: dObj.getDate(),
          isCurrentMonth: dObj.getMonth() === viewMonth,
          isToday: dateStr === todayStr,
          mondayOfThisWeek,
        });
        currentCursor.setDate(currentCursor.getDate() + 1);
      }
      weeks.push(weekDays);

      // Si ya nos pasamos del último día del mes y la semana está completa, detener
      if (currentCursor > lastDay && (currentCursor.getMonth() !== viewMonth)) {
        break;
      }
    }

    return weeks;
  }, [viewYear, viewMonth]);

  // Validar si una semana es la seleccionada
  const isWeekSelected = (mondayOfThisWeek: Date) => {
    return (
      tempMonday.getFullYear() === mondayOfThisWeek.getFullYear() &&
      tempMonday.getMonth() === mondayOfThisWeek.getMonth() &&
      tempMonday.getDate() === mondayOfThisWeek.getDate()
    );
  };

  const handleSelectDay = (mondayOfThisWeek: Date) => {
    setTempMonday(mondayOfThisWeek);
  };

  const handleApply = () => {
    onSelectMonday(tempMonday);
    onClose();
  };

  const tempWeekRange = useMemo(() => getWeekRange(tempMonday), [tempMonday]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.container,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconCircle, { backgroundColor: themeColors.accent + '20' }]}>
                <Ionicons name="calendar" size={18} color={themeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>
                  Seleccionar Período de Asistencia
                </Text>
                <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
                  Elige una semana en el calendario o selecciona un acceso directo
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
            {/* 1. Presets Rápidos */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                ACCESOS RÁPIDOS
              </Text>
              <View style={styles.presetsGrid}>
                {presets.map((p, idx) => {
                  const isSelected = isWeekSelected(p.date);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.presetChip,
                        isSelected
                          ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                          : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
                      ]}
                      onPress={() => {
                        setTempMonday(p.date);
                        setViewYear(p.date.getFullYear());
                        setViewMonth(p.date.getMonth());
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={p.isCurrent ? 'today-outline' : 'time-outline'}
                        size={14}
                        color={isSelected ? '#fff' : themeColors.textSecondary}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: isSelected ? '#fff' : themeColors.text },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Mini Calendario Interactivo */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                SELECCIONAR EN CALENDARIO
              </Text>

              <View style={[styles.calendarBox, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {/* Header del Calendario: Mes y Año + Flechas */}
                <View style={[styles.calMonthNav, { borderBottomColor: themeColors.border }]}>
                  <TouchableOpacity
                    onPress={handlePrevMonth}
                    style={[styles.calNavBtn, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color={themeColors.text} />
                  </TouchableOpacity>

                  <Text style={[styles.calMonthText, { color: themeColors.text }]}>
                    {MESES[viewMonth]} {viewYear}
                  </Text>

                  <TouchableOpacity
                    onPress={handleNextMonth}
                    style={[styles.calNavBtn, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-forward" size={16} color={themeColors.text} />
                  </TouchableOpacity>
                </View>

                {/* Días de la semana Header (L M M J V S D) */}
                <View style={styles.calDaysHeaderRow}>
                  {DIAS_HEADER.map((d, i) => (
                    <Text key={i} style={[styles.calDayHeaderCell, { color: themeColors.textSecondary }]}>
                      {d}
                    </Text>
                  ))}
                </View>

                {/* Grilla de semanas y días */}
                <View style={styles.calWeeksContainer}>
                  {calendarWeeks.map((week, wIdx) => {
                    const isWeekActive = isWeekSelected(week[0].mondayOfThisWeek);

                    return (
                      <TouchableOpacity
                        key={wIdx}
                        style={[
                          styles.calWeekRow,
                          isWeekActive && {
                            backgroundColor: themeColors.accent + '20',
                            borderColor: themeColors.accent,
                            borderWidth: 1,
                          },
                        ]}
                        onPress={() => handleSelectDay(week[0].mondayOfThisWeek)}
                        activeOpacity={0.75}
                      >
                        {week.map((cell, dIdx) => {
                          return (
                            <View key={dIdx} style={styles.calDayCell}>
                              <View
                                style={[
                                  styles.dayCircle,
                                  cell.isToday && !isWeekActive && {
                                    borderColor: themeColors.accent,
                                    borderWidth: 1.5,
                                  },
                                  isWeekActive && {
                                    backgroundColor: themeColors.accent,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.calDayNumber,
                                    {
                                      color: isWeekActive
                                        ? '#fff'
                                        : !cell.isCurrentMonth
                                        ? themeColors.textSecondary + '40'
                                        : cell.isToday
                                        ? themeColors.accent
                                        : themeColors.text,
                                      fontWeight: isWeekActive || cell.isToday ? '800' : '600',
                                    },
                                  ]}
                                >
                                  {cell.dayNum}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* 3. Resumen de la semana seleccionada */}
            <View style={[styles.selectedSummaryCard, { backgroundColor: themeColors.accent + '15', borderColor: themeColors.accent + '35' }]}>
              <View style={styles.summaryIconCol}>
                <Ionicons name="checkmark-circle" size={24} color={themeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: themeColors.accent }]}>
                  SEMANA SELECCIONADA
                </Text>
                <Text style={[styles.summaryValue, { color: themeColors.text }]}>
                  {tempWeekRange.label}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleApply}
              style={[styles.applyBtn, { backgroundColor: themeColors.accent }]}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.applyBtnText}>Ver este período</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    flexShrink: 1,
  },
  modalBodyContent: {
    padding: 16,
    gap: 16,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  calendarBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  calMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  calNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calMonthText: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  calDaysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 2,
  },
  calDayHeaderCell: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
  },
  calWeeksContainer: {
    gap: 4,
  },
  calWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 3,
    borderRadius: 8,
  },
  calDayCell: {
    width: 36,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayNumber: {
    fontSize: 12,
  },
  selectedSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  summaryIconCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
