import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Asistencia } from '@/services/supabase';
import { useAuth } from '@/context/AuthContext';
import PeriodoPickerModal from '@/components/PeriodoPickerModal';
import EditarTurnoModal from '@/components/EditarTurnoModal';
import {
  WeekRange,
  TurnoAsistencia,
  DiaAsistencia,
  SemanaAsistencia,
  processAsistenciasSemana,
  getPreviousWeekMonday,
  getNextWeekMonday,
  getWeekRange,
} from '@/utils/asistenciaUtils';

interface AsistenciaSemanalCardProps {
  asistencias: Asistencia[];
  empleadoNombre?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  selectedMonday: Date;
  onChangeWeek: (newMonday: Date) => void;
  onViewFoto?: (info: {
    url: string;
    fecha: string;
    hora: string;
    direccion: string;
    lat: number;
    lng: number;
    empleadoNombre: string;
    tipo: 'Entrada' | 'Salida';
  }) => void;
}

export default function AsistenciaSemanalCard({
  asistencias,
  empleadoNombre = 'Empleado',
  isLoading = false,
  onRefresh,
  selectedMonday,
  onChangeWeek,
  onViewFoto,
}: AsistenciaSemanalCardProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useAuth();
  const canViewOvertime = user?.rol === 'ADMIN' || user?.rol === 'DEV';
  const isDev = user?.rol === 'DEV';

  // Estado del modal de selección de período manual
  const [periodoModalVisible, setPeriodoModalVisible] = useState(false);

  // Estado del modal de edición de horas de turno (DEV ONLY)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [turnoToEdit, setTurnoToEdit] = useState<TurnoAsistencia | null>(null);
  const [fechaToEdit, setFechaToEdit] = useState<string>('');

  // Estados de días expandidos (por defecto expandir días que tengan turnos)
  const [expandedDays, setExpandedDays] = useState<{ [dateStr: string]: boolean }>({});

  // Procesar asistencias para la semana seleccionada
  const semanaData: SemanaAsistencia = useMemo(() => {
    return processAsistenciasSemana(asistencias, selectedMonday);
  }, [asistencias, selectedMonday]);

  const currentWeekMonday = useMemo(() => {
    return getWeekRange().mondayDate;
  }, []);

  const isCurrentWeek = useMemo(() => {
    return (
      selectedMonday.getFullYear() === currentWeekMonday.getFullYear() &&
      selectedMonday.getMonth() === currentWeekMonday.getMonth() &&
      selectedMonday.getDate() === currentWeekMonday.getDate()
    );
  }, [selectedMonday, currentWeekMonday]);

  const toggleDay = (dateStr: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateStr]: prev[dateStr] === undefined ? false : !prev[dateStr],
    }));
  };

  const isDayExpanded = (day: DiaAsistencia) => {
    // Si el usuario lo cambió explícitamente, respetar su decisión
    if (expandedDays[day.dateStr] !== undefined) {
      return expandedDays[day.dateStr];
    }
    // Si tiene turnos, expandido por defecto; si no, colapsado
    return day.turnos.length > 0;
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
      {/* 1. Header con Navegador de Semana */}
      <View style={[styles.headerContainer, { borderBottomColor: themeColors.border }]}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: themeColors.backgroundSelected }]}
            onPress={() => onChangeWeek(getPreviousWeekMonday(selectedMonday))}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={themeColors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.weekLabelContainer, { cursor: 'pointer' } as any]}
            onPress={() => setPeriodoModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.weekTitleRow}>
              <Ionicons name="calendar" size={15} color={themeColors.accent} style={{ marginRight: 5 }} />
              <Text style={[styles.weekTitleText, { color: themeColors.text }]} numberOfLines={1}>
                Semana {semanaData.range.days[0].shortDate} - {semanaData.range.days[6].shortDate}
              </Text>
              <Ionicons name="chevron-down" size={13} color={themeColors.textSecondary} style={{ marginLeft: 3 }} />
            </View>
            <Text style={[styles.weekSubtitleText, { color: themeColors.textSecondary }]}>
              {semanaData.range.mondayDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).toUpperCase()}
            </Text>
            {isCurrentWeek && (
              <View style={[styles.currentWeekBadge, { backgroundColor: themeColors.accent + '20' }]}>
                <Text style={[styles.currentWeekBadgeText, { color: themeColors.accent }]}>Semana Actual</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: themeColors.backgroundSelected }]}
            onPress={() => onChangeWeek(getNextWeekMonday(selectedMonday))}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={20} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {!isCurrentWeek && (
          <TouchableOpacity
            style={[styles.backToCurrentBtn, { borderColor: themeColors.accent }]}
            onPress={() => onChangeWeek(currentWeekMonday)}
          >
            <Ionicons name="today-outline" size={14} color={themeColors.accent} style={{ marginRight: 4 }} />
            <Text style={[styles.backToCurrentText, { color: themeColors.accent }]}>Ir a semana actual</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal Selector de Período */}
      <PeriodoPickerModal
        visible={periodoModalVisible}
        onClose={() => setPeriodoModalVisible(false)}
        selectedMonday={selectedMonday}
        onSelectMonday={(newMonday) => onChangeWeek(newMonday)}
      />

      {/* 2. Tarjeta Resumen de Horas de la Semana */}
      <View style={[styles.summaryCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
        <View style={styles.summaryMetricCol}>
          <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>TOTAL HORAS</Text>
          <View style={styles.hoursValueRow}>
            <Ionicons name="time" size={16} color={themeColors.text} style={{ marginRight: 4 }} />
            <Text style={[styles.summaryHoursText, { color: themeColors.text }]}>
              {semanaData.totalHorasSemanaStr}
            </Text>
          </View>
        </View>

        {canViewOvertime && (
          <>
            <View style={[styles.summaryDivider, { backgroundColor: themeColors.border }]} />

            <View style={styles.summaryMetricCol}>
              <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>REGULARES (8-6)</Text>
              <View style={styles.hoursValueRow}>
                <Ionicons name="business-outline" size={14} color={themeColors.success} style={{ marginRight: 4 }} />
                <Text style={[styles.summarySecondaryText, { color: themeColors.success, fontWeight: '800' }]}>
                  {semanaData.totalHorasRegularesStr}
                </Text>
              </View>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: themeColors.border }]} />

            <View style={styles.summaryMetricCol}>
              <Text style={[styles.summaryMetricLabel, { color: semanaData.totalMinutosExtra > 0 ? '#ea580c' : themeColors.textSecondary }]}>HORAS EXTRAS</Text>
              <View style={styles.hoursValueRow}>
                <Ionicons name="flame" size={15} color={semanaData.totalMinutosExtra > 0 ? '#ea580c' : themeColors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.summaryHoursText, { color: semanaData.totalMinutosExtra > 0 ? '#ea580c' : themeColors.textSecondary }]}>
                  {semanaData.totalHorasExtraStr}
                </Text>
              </View>
            </View>
          </>
        )}

        <View style={[styles.summaryDivider, { backgroundColor: themeColors.border }]} />

        <View style={styles.summaryMetricCol}>
          <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>DÍAS LAB.</Text>
          <View style={styles.hoursValueRow}>
            <Ionicons name="briefcase-outline" size={14} color={themeColors.accent} style={{ marginRight: 4 }} />
            <Text style={[styles.summarySecondaryText, { color: themeColors.text }]}>
              {semanaData.diasLaborados} / 7
            </Text>
          </View>
        </View>

        {!canViewOvertime && (
          <>
            <View style={[styles.summaryDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.summaryMetricCol}>
              <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>TURNOS</Text>
              <View style={styles.hoursValueRow}>
                <Ionicons name="layers-outline" size={14} color={themeColors.warning} style={{ marginRight: 4 }} />
                <Text style={[styles.summarySecondaryText, { color: themeColors.text }]}>
                  {semanaData.turnosTotales}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={themeColors.accent} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Actualizando asistencias...</Text>
        </View>
      ) : null}

      {/* 3. Desglose Día por Día (Lunes a Domingo) */}
      <View style={styles.daysListContainer}>
        {semanaData.dias.map((dia) => {
          const expanded = isDayExpanded(dia);
          const hasTurnos = dia.turnos.length > 0;

          return (
            <View
              key={dia.dateStr}
              style={[
                styles.dayCard,
                {
                  backgroundColor: dia.isToday
                    ? themeColors.backgroundSelected
                    : themeColors.background,
                  borderColor: dia.isToday ? themeColors.accent : themeColors.border,
                },
              ]}
            >
              {/* Cabecera del Día */}
              <TouchableOpacity
                style={styles.dayCardHeader}
                onPress={() => toggleDay(dia.dateStr)}
                activeOpacity={0.7}
              >
                <View style={styles.dayInfoLeft}>
                  <View style={styles.dayNameRow}>
                    <Text
                      style={[
                        styles.dayNameText,
                        { color: dia.isToday ? themeColors.accent : themeColors.text },
                      ]}
                    >
                      {dia.dayName}
                    </Text>
                    <Text style={[styles.dayShortDateText, { color: themeColors.textSecondary }]}>
                      {dia.shortDate}
                    </Text>
                    {dia.isToday && (
                      <View style={[styles.todayBadge, { backgroundColor: themeColors.accent }]}>
                        <Text style={styles.todayBadgeText}>HOY</Text>
                      </View>
                    )}
                  </View>
                  {dia.tieneTurnoEnCurso && (
                    <View style={styles.enCursoBadge}>
                      <View style={styles.blinkingDot} />
                      <Text style={styles.enCursoText}>Turno en curso</Text>
                    </View>
                  )}
                </View>

                <View style={styles.dayInfoRight}>
                  {canViewOvertime && dia.minutosExtra > 0 && (
                    <View style={[styles.extraHoursBadge, { backgroundColor: '#ea580c18', borderColor: '#ea580c50' }]}>
                      <Ionicons name="flame" size={11} color="#ea580c" style={{ marginRight: 2 }} />
                      <Text style={[styles.extraHoursText, { color: '#ea580c' }]}>
                        +{dia.horasExtraStr} extra
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.dayHoursBadge,
                      {
                        backgroundColor:
                          dia.totalMinutos > 0
                            ? themeColors.success + '15'
                            : themeColors.backgroundSelected,
                        borderColor: dia.totalMinutos > 0 ? themeColors.success : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={dia.totalMinutos > 0 ? themeColors.success : themeColors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.dayHoursText,
                        {
                          color: dia.totalMinutos > 0 ? themeColors.success : themeColors.textSecondary,
                        },
                      ]}
                    >
                      {dia.totalHorasStr}
                    </Text>
                  </View>

                  {hasTurnos && (
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={themeColors.textSecondary}
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>
              </TouchableOpacity>

              {/* Subíndice de Turnos del Día */}
              {expanded && (
                <View style={[styles.turnosContainer, { borderTopColor: themeColors.border }]}>
                  {!hasTurnos ? (
                    <Text style={[styles.noTurnosText, { color: themeColors.textSecondary }]}>
                      Sin registros de asistencia
                    </Text>
                  ) : (
                    dia.turnos.map((turno) => (
                      <View
                        key={turno.id}
                        style={[
                          styles.turnoRow,
                          {
                            backgroundColor: turno.enCurso
                              ? themeColors.warning + '10'
                              : themeColors.backgroundElement,
                            borderColor: turno.enCurso ? themeColors.warning : themeColors.border,
                          },
                        ]}
                      >
                        {/* Indicador de Subíndice / Turno # */}
                        <View style={styles.turnoHeaderRow}>
                          <View style={styles.turnoIndexBadge}>
                            <Text style={styles.turnoIndexText}>Turno #{turno.index}</Text>
                          </View>
                          <View style={styles.turnoHeaderRight}>
                            {isDev && (
                              <TouchableOpacity
                                style={[styles.devEditBtn, { backgroundColor: '#6366f115', borderColor: '#6366f140' }]}
                                onPress={() => {
                                  setTurnoToEdit(turno);
                                  setFechaToEdit(dia.dateStr);
                                  setEditModalVisible(true);
                                }}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="pencil" size={11} color="#6366f1" style={{ marginRight: 3 }} />
                                <Text style={styles.devEditText}>Editar (DEV)</Text>
                              </TouchableOpacity>
                            )}

                            <View
                              style={[
                                styles.turnoDuracionBadge,
                                {
                                  backgroundColor: turno.enCurso
                                    ? themeColors.warning + '20'
                                    : themeColors.success + '20',
                                },
                              ]}
                            >
                              <Ionicons
                                name={turno.enCurso ? 'hourglass-outline' : 'stopwatch-outline'}
                                size={12}
                                color={turno.enCurso ? themeColors.warning : themeColors.success}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.turnoDuracionText,
                                  { color: turno.enCurso ? themeColors.warning : themeColors.success },
                                ]}
                              >
                                {turno.duracionStr}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Bloques de Entrada y Salida */}
                        <View style={styles.turnoTimesRow}>
                          {/* Entrada */}
                          <View style={styles.turnoBlock}>
                            <View style={styles.turnoBlockHeader}>
                              <Ionicons name="log-in-outline" size={14} color={themeColors.success} style={{ marginRight: 4 }} />
                              <Text style={[styles.turnoBlockTitle, { color: themeColors.success }]}>
                                Entrada
                              </Text>
                            </View>
                            <Text style={[styles.turnoTimeVal, { color: themeColors.text }]}>
                              {turno.hora_entrada}
                            </Text>

                            {/* Foto y Ubicación Entrada */}
                            <View style={styles.turnoMetaRow}>
                              {turno.foto_entrada_url ? (
                                <TouchableOpacity
                                  style={styles.thumbBtn}
                                  activeOpacity={0.8}
                                  onPress={() =>
                                    onViewFoto?.({
                                      url: turno.foto_entrada_url!,
                                      fecha: dia.dateStr,
                                      hora: turno.hora_entrada,
                                      direccion: turno.direccion_entrada || 'Ubicación registrada',
                                      lat: turno.latitud_entrada || 0,
                                      lng: turno.longitud_entrada || 0,
                                      empleadoNombre,
                                      tipo: 'Entrada',
                                    })
                                  }
                                >
                                  <Image
                                    source={{ uri: turno.foto_entrada_url }}
                                    style={styles.thumbImg}
                                    contentFit="cover"
                                  />
                                  <View style={styles.thumbOverlay}>
                                    <Ionicons name="eye" size={12} color="#fff" />
                                  </View>
                                </TouchableOpacity>
                              ) : null}

                              {turno.direccion_entrada ? (
                                <Text
                                  style={[styles.turnoAddressText, { color: themeColors.textSecondary }]}
                                  numberOfLines={2}
                                >
                                  📍 {turno.direccion_entrada}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          <View style={[styles.turnoColDivider, { backgroundColor: themeColors.border }]} />

                          {/* Salida */}
                          <View style={styles.turnoBlock}>
                            <View style={styles.turnoBlockHeader}>
                              <Ionicons
                                name="log-out-outline"
                                size={14}
                                color={turno.hora_salida ? themeColors.accent : themeColors.warning}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.turnoBlockTitle,
                                  { color: turno.hora_salida ? themeColors.accent : themeColors.warning },
                                ]}
                              >
                                Salida
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.turnoTimeVal,
                                { color: turno.hora_salida ? themeColors.text : themeColors.warning },
                              ]}
                            >
                              {turno.hora_salida || 'Pendiente'}
                            </Text>

                            {/* Foto y Ubicación Salida */}
                            <View style={styles.turnoMetaRow}>
                              {turno.foto_salida_url ? (
                                <TouchableOpacity
                                  style={styles.thumbBtn}
                                  activeOpacity={0.8}
                                  onPress={() =>
                                    onViewFoto?.({
                                      url: turno.foto_salida_url!,
                                      fecha: dia.dateStr,
                                      hora: turno.hora_salida || '--:--',
                                      direccion: turno.direccion_salida || 'Ubicación registrada',
                                      lat: turno.latitud_salida || 0,
                                      lng: turno.longitud_salida || 0,
                                      empleadoNombre,
                                      tipo: 'Salida',
                                    })
                                  }
                                >
                                  <Image
                                    source={{ uri: turno.foto_salida_url }}
                                    style={styles.thumbImg}
                                    contentFit="cover"
                                  />
                                  <View style={styles.thumbOverlay}>
                                    <Ionicons name="eye" size={12} color="#fff" />
                                  </View>
                                </TouchableOpacity>
                              ) : turno.enCurso ? (
                                <View style={[styles.turnoPendingBox, { backgroundColor: themeColors.warning + '18' }]}>
                                  <Text style={[styles.turnoPendingText, { color: themeColors.warning }]}>
                                    ⏳ En curso
                                  </Text>
                                </View>
                              ) : null}

                              {turno.direccion_salida ? (
                                <Text
                                  style={[styles.turnoAddressText, { color: themeColors.textSecondary }]}
                                  numberOfLines={2}
                                >
                                  📍 {turno.direccion_salida}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Modal de Edición de Turnos (Exclusivo DEV) */}
      <EditarTurnoModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setTurnoToEdit(null);
        }}
        turno={turnoToEdit}
        fecha={fechaToEdit}
        empleadoNombre={empleadoNombre}
        onSaveSuccess={() => {
          onRefresh?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.three,
    marginVertical: Spacing.two,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      },
    }),
  },
  headerContainer: {
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    marginBottom: Spacing.two,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekLabelContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  weekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekTitleText: {
    fontSize: 14,
    fontWeight: '800',
  },
  weekSubtitleText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  currentWeekBadge: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.small,
  },
  currentWeekBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backToCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: Spacing.one,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  backToCurrentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  summaryMetricCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  summaryMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  hoursValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHoursText: {
    fontSize: 16,
    fontWeight: '800',
  },
  summarySecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  loadingText: {
    fontSize: 11,
    marginLeft: 6,
  },
  daysListContainer: {
    gap: Spacing.two,
  },
  dayCard: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  dayInfoLeft: {
    flex: 1,
  },
  dayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayNameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dayShortDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  todayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  todayBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  enCursoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  blinkingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#f59e0b',
    marginRight: 5,
  },
  enCursoText: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600',
  },
  dayInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  dayHoursText: {
    fontSize: 12,
    fontWeight: '700',
  },
  turnosContainer: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    paddingTop: Spacing.one,
    borderTopWidth: 1,
    gap: Spacing.one,
  },
  noTurnosText: {
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: Spacing.one,
    textAlign: 'center',
  },
  turnoRow: {
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    padding: Spacing.two,
  },
  turnoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  turnoIndexBadge: {
    backgroundColor: '#64748b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  turnoIndexText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  turnoHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  devEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  devEditText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366f1',
  },
  turnoDuracionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  turnoDuracionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  turnoTimesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  turnoBlock: {
    flex: 1,
  },
  turnoBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  turnoBlockTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  turnoTimeVal: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  turnoColDivider: {
    width: 1,
    marginHorizontal: Spacing.two,
    alignSelf: 'stretch',
  },
  turnoMetaRow: {
    marginTop: Spacing.one,
  },
  thumbBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.small,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbOverlay: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnoAddressText: {
    fontSize: 9,
    lineHeight: 12,
  },
  turnoPendingBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  turnoPendingText: {
    fontSize: 9,
    fontWeight: '600',
  },
  extraHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    marginRight: 6,
  },
  extraHoursText: {
    fontSize: 10,
    fontWeight: '800',
  },
  turnoExtraBadge: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  turnoExtraText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
