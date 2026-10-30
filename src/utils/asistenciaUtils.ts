import { Asistencia } from '@/services/supabase';
import {
  extractTimezoneFromRecord,
  cleanAddressForDisplay,
  getTimezoneBadgeInfo,
  TimezoneBadgeInfo,
  COMPANY_BASE_TIMEZONE,
} from './timezoneUtils';

export interface WeekDayInfo {
  dateStr: string; // YYYY-MM-DD
  dayName: string; // "Lunes", "Martes", etc.
  shortDate: string; // "05/10"
  date: Date;
  isToday: boolean;
}

export interface WeekRange {
  mondayDate: Date;
  sundayDate: Date;
  mondayStr: string; // YYYY-MM-DD
  sundayStr: string; // YYYY-MM-DD
  label: string; // "Lunes 05/10/2026 al Domingo 11/10/2026"
  days: WeekDayInfo[];
}

export interface TurnoAsistencia {
  id: string;
  index: number; // 1, 2, ...
  hora_entrada: string;
  hora_salida?: string | null;
  foto_entrada_url?: string | null;
  foto_salida_url?: string | null;
  direccion_entrada?: string | null;
  direccion_salida?: string | null;
  latitud_entrada?: number | null;
  longitud_entrada?: number | null;
  latitud_salida?: number | null;
  longitud_salida?: number | null;
  minutos: number;
  duracionStr: string;
  minutosRegulares: number;
  horasRegularesStr: string;
  minutosExtra: number;
  horasExtraStr: string;
  enCurso: boolean;
  autoCerrado?: boolean;
  timezone?: string | null;
  timezoneBadge?: TimezoneBadgeInfo | null;
  minutosBrutos?: number;
  comidaDescontada?: boolean;
}

export interface DiaAsistencia {
  dateStr: string;
  dayName: string;
  shortDate: string;
  isToday: boolean;
  totalMinutos: number;
  totalHorasStr: string;
  minutosRegulares: number;
  horasRegularesStr: string;
  minutosExtra: number;
  horasExtraStr: string;
  turnos: TurnoAsistencia[];
  tieneTurnoEnCurso: boolean;
  comidaDescontada?: boolean;
  minutosComidaDescontados?: number;
  minutosBrutos?: number;
}

export interface SemanaAsistencia {
  range: WeekRange;
  dias: DiaAsistencia[];
  totalMinutosSemana: number;
  totalHorasSemanaStr: string;
  totalMinutosPeriodo: number;
  totalHorasPeriodoStr: string;
  totalMinutosRegulares: number;
  totalHorasRegularesStr: string;
  totalMinutosExtra: number;
  totalHorasExtraStr: string;
  diasLaborados: number;
  turnosTotales: number;
  jornadaHoras?: number;
  jornadaMinutos?: number;
}

/**
 * Jornada laboral semanal estándar de la empresa:
 * 48 horas semanales (2880 minutos).
 * El tiempo trabajado cuenta íntegramente desde la hora de checada de entrada hasta la salida.
 * Las horas extras se calculan sobre la sumatoria semanal cuando excede las 48 horas.
 */
export const JORNADA_SEMANAL_HORAS = 48;
export const JORNADA_SEMANAL_MINUTOS = 48 * 60; // 2880 minutos

/**
 * Deducción de comida diaria: 1 hora (60 minutos) por jornada laborada.
 * Aplica exclusivamente a los roles ADMIN y EMPLEADO.
 * Los usuarios con rol DEV conservan sus horas íntegras registradas tal cual.
 */
export const MINUTOS_COMIDA_DIARIA = 60;

export function shouldDeductLunchHour(role?: string | null): boolean {
  if (!role) return true; // Por defecto aplica a personal general (ADMIN / EMPLEADO)
  const r = role.toUpperCase().trim();
  if (r === 'DEV') return false;
  return r === 'ADMIN' || r === 'EMPLEADO' || r === 'USER';
}

export const HORARIO_LABORAL_REGULAR = {
  horaInicio: '08:00',
  horaFin: '18:00',
  minutosInicio: 8 * 60,        // 480
  minutosFin: 18 * 60,          // 1080
  minutosJornadaMax: 48 * 60,   // 2880 minutos
  jornadaSemanalHoras: 48,
  jornadaSemanalMinutos: 48 * 60,
};

/**
 * Desglosa los minutos trabajados de un turno.
 * El tiempo cuenta completo desde que checan entrada hasta salida.
 * Las horas extras no se calculan por día ni por salir después de las 18:00,
 * sino sobre la sumatoria total semanal acumulada cuando excede las 48 horas.
 */
export function calculateTurnoHorasDesglose(
  horaEntrada?: string | null,
  horaSalida?: string | null
): { totalMins: number; regularesMins: number; extrasMins: number } {
  if (!horaEntrada || !horaSalida) {
    return { totalMins: 0, regularesMins: 0, extrasMins: 0 };
  }

  const totalMins = calculateDurationMinutes(horaEntrada, horaSalida);
  return {
    totalMins,
    regularesMins: totalMins,
    extrasMins: 0,
  };
}

/**
 * Convierte un objeto Date a string YYYY-MM-DD local
 */
export function formatDateToLocalYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte string YYYY-MM-DD a objeto Date a medianoche local
 */
export function parseLocalYMD(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Calcula la duración en minutos entre dos horas (HH:MM:SS o HH:MM)
 * Soporta turnos que cruzan la medianoche
 */
export function calculateDurationMinutes(horaEntrada?: string | null, horaSalida?: string | null): number {
  if (!horaEntrada || !horaSalida) return 0;

  const partsEntrada = horaEntrada.split(':').map(Number);
  const partsSalida = horaSalida.split(':').map(Number);

  const h1 = partsEntrada[0] || 0;
  const m1 = partsEntrada[1] || 0;
  const h2 = partsSalida[0] || 0;
  const m2 = partsSalida[1] || 0;

  let mins1 = h1 * 60 + m1;
  let mins2 = h2 * 60 + m2;

  // Turno que finaliza después de medianoche
  if (mins2 < mins1) {
    mins2 += 24 * 60;
  }

  return Math.max(0, mins2 - mins1);
}

/**
 * Formatea minutos en formato estricto de horas y minutos (ej. "8h 30m" o "0h 0m")
 */
export function formatMinutesToHours(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

/**
 * Limpia y normaliza una hora a HH:MM para mostrar en pantallas y reportes
 */
export function formatHoraDisplay(hora?: string | null): string {
  if (!hora) return '--:--';
  if (hora.includes('(Auto)')) return hora;
  const parts = hora.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return hora;
}

/**
 * Determina si un registro de asistencia fue cerrado automáticamente a las 6:00 PM
 * por olvido de checada del empleado.
 */
export function isAutoCerradoAsistencia(
  item?: {
    fecha?: string;
    hora_entrada?: string | null;
    hora_salida?: string | null;
    foto_salida_url?: string | null;
    direccion_salida?: string | null;
    descripcion?: string | null;
    autoCerrado?: boolean;
  } | null,
  hoyStr?: string
): boolean {
  if (!item) return false;
  if (item.autoCerrado) return true;

  const today = hoyStr || formatDateToLocalYMD(new Date());
  const itemFecha = item.fecha ? String(item.fecha).split('T')[0] : '';
  const esDiaPasado = !!(itemFecha && itemFecha < today);

  // 1. Turno de un día pasado que quedó abierto sin salida en BD -> se auto-cierra a las 18:00
  if (!item.hora_salida && esDiaPasado) {
    return true;
  }

  // 2. Si la dirección o descripción indican explícitamente cierre automático
  const dir = (item.direccion_salida || '').toLowerCase();
  const desc = (item.descripcion || '').toLowerCase();
  if (
    dir.includes('automático') ||
    dir.includes('automatico') ||
    desc.includes('automático') ||
    desc.includes('automatico')
  ) {
    return true;
  }

  // 3. Si la hora de salida ya dice "(Auto)"
  if (item.hora_salida && item.hora_salida.includes('(Auto)')) {
    return true;
  }

  // 4. Si la hora de salida es a las 18:00:00 o 18:00, NO tiene foto de salida y es de un día pasado
  if (
    item.hora_salida &&
    (item.hora_salida.startsWith('18:00') || item.hora_salida.startsWith('18:00:00')) &&
    !item.foto_salida_url &&
    esDiaPasado
  ) {
    return true;
  }

  return false;
}

/**
 * Formatea el contador de jornada laboral semanal sobre la base de horas configuradas (por defecto 48 horas).
 * Ejemplo: "0/48 hrs", "8/48 hrs", "24h 30m / 40 hrs", "40/40 hrs".
 */
export function formatContadorJornada48(minutosRegulares: number = 0, jornadaHoras: number = 48): string {
  const meta = (jornadaHoras && Number(jornadaHoras) > 0) ? Number(jornadaHoras) : 48;
  if (!minutosRegulares || minutosRegulares <= 0) {
    return `0/${meta} hrs`;
  }
  const h = Math.floor(minutosRegulares / 60);
  const m = Math.round(minutosRegulares % 60);
  if (m === 0) {
    return `${h}/${meta} hrs`;
  }
  return `${h}h ${m}m / ${meta} hrs`;
}

export const formatContadorJornada = formatContadorJornada48;

const NOMBRES_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Obtiene el rango de la semana (Lunes a Domingo) para una fecha dada (o hoy por defecto)
 */
export function getWeekRange(dateInput?: Date | string): WeekRange {
  const baseDate = dateInput
    ? typeof dateInput === 'string'
      ? parseLocalYMD(dateInput)
      : new Date(dateInput)
    : new Date();

  // En JS: Domingo = 0, Lunes = 1, ..., Sábado = 6
  const currentDay = baseDate.getDay();
  // Diferencia para retroceder hasta el Lunes
  // Si es Domingo (0), restamos 6 días. Si es Lunes (1), 0. Martes (2), -1, etc.
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const todayStr = formatDateToLocalYMD(new Date());

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateStr = formatDateToLocalYMD(d);
    const dayMonth = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    days.push({
      dateStr,
      dayName: NOMBRES_DIAS[i],
      shortDate: dayMonth,
      date: d,
      isToday: dateStr === todayStr,
    });
  }

  const formatFullDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const label = `Lunes ${formatFullDate(monday)} al Domingo ${formatFullDate(sunday)}`;

  return {
    mondayDate: monday,
    sundayDate: sunday,
    mondayStr: formatDateToLocalYMD(monday),
    sundayStr: formatDateToLocalYMD(sunday),
    label,
    days,
  };
}

/**
 * Obtiene la fecha del Lunes de la semana anterior
 */
export function getPreviousWeekMonday(currentMondayDate: Date): Date {
  const prev = new Date(currentMondayDate);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

/**
 * Obtiene la fecha del Lunes de la semana siguiente
 */
export function getNextWeekMonday(currentMondayDate: Date): Date {
  const next = new Date(currentMondayDate);
  next.setDate(next.getDate() + 7);
  return next;
}

export const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export interface MonthRange {
  startDate: Date;
  endDate: Date;
  startStr: string; // YYYY-MM-DD
  endStr: string;   // YYYY-MM-DD
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  label: string;    // "Octubre 2026"
  days: WeekDayInfo[];
  year: number;
  month: number;    // 0 - 11
  totalDays: number;
}

/**
 * Obtiene el rango completo de un mes dado (primer día al último día)
 */
export function getMonthRange(dateInput?: Date | string | { year: number; month: number }): MonthRange {
  let year: number;
  let month: number;

  if (dateInput && typeof dateInput === 'object' && 'year' in dateInput && 'month' in dateInput) {
    year = dateInput.year;
    month = dateInput.month;
  } else if (typeof dateInput === 'string') {
    const parsed = parseLocalYMD(dateInput);
    year = parsed.getFullYear();
    month = parsed.getMonth();
  } else if (dateInput instanceof Date) {
    year = dateInput.getFullYear();
    month = dateInput.getMonth();
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  const startDate = new Date(year, month, 1);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(year, month + 1, 0);
  endDate.setHours(23, 59, 59, 999);

  const startStr = formatDateToLocalYMD(startDate);
  const endStr = formatDateToLocalYMD(endDate);
  const todayStr = formatDateToLocalYMD(new Date());

  const daysCount = endDate.getDate();
  const days: WeekDayInfo[] = [];

  for (let i = 1; i <= daysCount; i++) {
    const d = new Date(year, month, i);
    const dateStr = formatDateToLocalYMD(d);
    const dayOfWeek = d.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const dayMonth = `${String(i).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`;

    days.push({
      dateStr,
      dayName: NOMBRES_DIAS[dayIndex],
      shortDate: dayMonth,
      date: d,
      isToday: dateStr === todayStr,
    });
  }

  const label = `${NOMBRES_MESES[month]} ${year}`;

  return {
    startDate,
    endDate,
    startStr,
    endStr,
    startDateStr: startStr,
    endDateStr: endStr,
    label,
    days,
    year,
    month,
    totalDays: daysCount,
  };
}

export function getPreviousMonthDate(currentDate: Date): Date {
  return new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
}

export function getNextMonthDate(currentDate: Date): Date {
  return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
}

/**
 * Procesa una lista de asistencias y las organiza en la semana solicitada.
 * La jornada laboral estándar es de 48 horas semanales.
 * El tiempo trabajado cuenta íntegramente desde la checada de entrada hasta la salida.
 * Las horas extras se calculan sobre la sumatoria semanal cuando excede las 48 horas.
 */
export function processAsistenciasSemana(
  asistencias: Asistencia[],
  weekDateInput?: Date | string,
  userRole?: string | null,
  jornadaHoras: number = JORNADA_SEMANAL_HORAS
): SemanaAsistencia {
  const range = getWeekRange(weekDateInput);

  const cleanFecha = (f?: string | null) => (f ? String(f).split('T')[0] : '');

  // Determinar rol efectivo para aplicar o no la deducción de 1 hora de comida diaria
  const effectiveRole = userRole || (asistencias && asistencias.length > 0
    ? ((asistencias[0] as any).empleado?.rol || (asistencias[0] as any).usuario?.rol || (asistencias[0] as any).rol)
    : null);
  const aplicaDescuentoComida = shouldDeductLunchHour(effectiveRole);

  // Filtrar registros que caigan dentro del rango de lunes a domingo
  const asistenciasSemana = (asistencias || []).filter((a) => {
    const f = cleanFecha(a.fecha);
    return f >= range.mondayStr && f <= range.sundayStr;
  });

  // Agrupar por fecha normalizada
  const porFecha = new Map<string, Asistencia[]>();
  for (const a of asistenciasSemana) {
    const f = cleanFecha(a.fecha);
    const list = porFecha.get(f) || [];
    list.push({ ...a, fecha: f });
    porFecha.set(f, list);
  }

  let totalMinutosSemana = 0;
  let diasLaborados = 0;
  let turnosTotales = 0;

  const hoyStr = formatDateToLocalYMD(new Date());

  const dias: DiaAsistencia[] = range.days.map((dayInfo) => {
    const items = porFecha.get(dayInfo.dateStr) || [];

    // Ordenar turnos cronológicamente por hora_entrada o creado_en
    items.sort((a, b) => {
      const hA = a.hora_entrada || '';
      const hB = b.hora_entrada || '';
      return hA.localeCompare(hB);
    });

    let minutosDiaBruto = 0;
    let tieneTurnoEnCurso = false;

    // 1. Calcular duración bruta de cada turno
    const turnosData = items.map((item, idx) => {
      const esDiaPasado = dayInfo.dateStr < hoyStr;
      const sinSalida = !item.hora_salida;
      const autoCerrado = isAutoCerradoAsistencia({
        ...item,
        fecha: dayInfo.dateStr,
      }, hoyStr);
      const enCurso = sinSalida && !esDiaPasado && !autoCerrado;

      if (enCurso) {
        tieneTurnoEnCurso = true;
      }

      const horaSalidaEfectiva = autoCerrado ? '18:00:00' : (item.hora_salida || null);

      let minsBrutos = 0;
      if (horaSalidaEfectiva) {
        minsBrutos = calculateDurationMinutes(item.hora_entrada, horaSalidaEfectiva);
      }

      minutosDiaBruto += minsBrutos;
      turnosTotales++;

      const tz = extractTimezoneFromRecord(item);
      const badge = getTimezoneBadgeInfo(tz);

      return {
        item,
        idx,
        autoCerrado,
        enCurso,
        minsBrutos,
        horaSalidaEfectiva,
        tz,
        badge,
      };
    });

    // REGLA: A roles ADMIN y EMPLEADO se les resta 1 hora (60 min) de comida por jornada
    // A rol DEV se les deja con las horas que registren tal cual
    const minutosADescontar = (aplicaDescuentoComida && minutosDiaBruto > 0)
      ? Math.min(MINUTOS_COMIDA_DIARIA, minutosDiaBruto)
      : 0;

    const minutosDiaNetos = Math.max(0, minutosDiaBruto - minutosADescontar);

    // Distribuir el descuento entre los turnos del día para mantener sincronía matemática exacta
    let remDescuento = minutosADescontar;
    const turnos: TurnoAsistencia[] = turnosData.map((t) => {
      let descuentoEsteTurno = 0;
      if (remDescuento > 0 && t.minsBrutos > 0) {
        descuentoEsteTurno = Math.min(remDescuento, t.minsBrutos);
        remDescuento -= descuentoEsteTurno;
      }
      const minsNetos = Math.max(0, t.minsBrutos - descuentoEsteTurno);

      return {
        id: t.item.id,
        index: t.idx + 1,
        hora_entrada: formatHoraDisplay(t.item.hora_entrada),
        hora_salida: t.autoCerrado
          ? '18:00 (Auto)'
          : t.item.hora_salida
          ? formatHoraDisplay(t.item.hora_salida)
          : null,
        foto_entrada_url: t.item.foto_entrada_url,
        foto_salida_url: (t.enCurso || t.autoCerrado) ? null : t.item.foto_salida_url,
        direccion_entrada: cleanAddressForDisplay(t.item.direccion_entrada),
        direccion_salida: t.autoCerrado
          ? 'Cierre automático 6:00 PM (olvido de checada)'
          : t.enCurso
          ? null
          : cleanAddressForDisplay(t.item.direccion_salida),
        latitud_entrada: t.item.latitud_entrada,
        longitud_entrada: t.item.longitud_entrada,
        latitud_salida: (t.enCurso || t.autoCerrado) ? null : t.item.latitud_salida,
        longitud_salida: (t.enCurso || t.autoCerrado) ? null : t.item.longitud_salida,
        minutos: minsNetos,
        minutosBrutos: t.minsBrutos,
        duracionStr: t.enCurso ? 'En curso' : formatMinutesToHours(minsNetos),
        minutosRegulares: minsNetos,
        horasRegularesStr: formatMinutesToHours(minsNetos),
        minutosExtra: 0,
        horasExtraStr: '0h 0m',
        enCurso: t.enCurso,
        autoCerrado: t.autoCerrado,
        timezone: t.tz,
        timezoneBadge: t.badge,
        comidaDescontada: descuentoEsteTurno > 0,
      };
    });

    if (minutosDiaBruto > 0 || turnos.length > 0) {
      diasLaborados++;
    }

    totalMinutosSemana += minutosDiaNetos;

    return {
      dateStr: dayInfo.dateStr,
      dayName: dayInfo.dayName,
      shortDate: dayInfo.shortDate,
      isToday: dayInfo.isToday,
      totalMinutos: minutosDiaNetos,
      totalHorasStr: formatMinutesToHours(minutosDiaNetos),
      minutosRegulares: minutosDiaNetos,
      horasRegularesStr: formatMinutesToHours(minutosDiaNetos),
      minutosExtra: 0,
      horasExtraStr: '0h 0m',
      turnos,
      tieneTurnoEnCurso,
      comidaDescontada: minutosADescontar > 0,
      minutosComidaDescontados: minutosADescontar,
      minutosBrutos: minutosDiaBruto,
    };
  });

  // Jornada laboral semanal configurada para el empleado (por defecto 48 horas / 2880 minutos).
  // Si en la semana sumó 60 hrs trabajadas y su jornada es de 40h: 40 son regulares y 20 son extras.
  const metaHoras = (jornadaHoras && Number(jornadaHoras) > 0) ? Number(jornadaHoras) : JORNADA_SEMANAL_HORAS;
  const metaMinutos = Math.round(metaHoras * 60);

  const totalMinutosRegulares = Math.min(totalMinutosSemana, metaMinutos);
  const totalMinutosExtra = Math.max(0, totalMinutosSemana - metaMinutos);

  return {
    range,
    dias,
    totalMinutosSemana,
    totalHorasSemanaStr: formatMinutesToHours(totalMinutosSemana),
    totalMinutosPeriodo: totalMinutosSemana,
    totalHorasPeriodoStr: formatMinutesToHours(totalMinutosSemana),
    totalMinutosRegulares,
    totalHorasRegularesStr: formatMinutesToHours(totalMinutosRegulares),
    totalMinutosExtra,
    totalHorasExtraStr: formatMinutesToHours(totalMinutosExtra),
    diasLaborados,
    turnosTotales,
    jornadaHoras: metaHoras,
    jornadaMinutos: metaMinutos,
  };
}

export interface PeriodoAsistencia {
  rangeLabel: string;
  startStr: string;
  endStr: string;
  dias: DiaAsistencia[];
  totalMinutosPeriodo: number;
  totalHorasPeriodoStr: string;
  totalMinutosSemana: number;
  totalHorasSemanaStr: string;
  totalMinutosRegulares: number;
  totalHorasRegularesStr: string;
  totalMinutosExtra: number;
  totalHorasExtraStr: string;
  diasLaborados: number;
  turnosTotales: number;
  jornadaHoras?: number;
  jornadaMinutos?: number;
}

/**
 * Procesa una lista de asistencias para un rango genérico (mes, semana o personalizado)
 */
export function processAsistenciasPeriodo(
  asistencias: Asistencia[],
  range: { startStr: string; endStr: string; days: WeekDayInfo[]; label: string },
  userRole?: string | null
): PeriodoAsistencia {
  const cleanFecha = (f?: string | null) => (f ? String(f).split('T')[0] : '');

  const effectiveRole = userRole || (asistencias && asistencias.length > 0
    ? ((asistencias[0] as any).empleado?.rol || (asistencias[0] as any).usuario?.rol || (asistencias[0] as any).rol)
    : null);
  const aplicaDescuentoComida = shouldDeductLunchHour(effectiveRole);

  // Filtrar registros que caigan dentro del rango
  const asistenciasPeriodo = (asistencias || []).filter((a) => {
    return a.fecha >= range.startStr && a.fecha <= range.endStr;
  });

  const porFecha = new Map<string, Asistencia[]>();
  for (const a of asistenciasPeriodo) {
    const list = porFecha.get(a.fecha) || [];
    list.push(a);
    porFecha.set(a.fecha, list);
  }

  let totalMinutosPeriodo = 0;
  let diasLaborados = 0;
  let turnosTotales = 0;

  const hoyStr = formatDateToLocalYMD(new Date());

  const dias: DiaAsistencia[] = range.days.map((dayInfo) => {
    const items = porFecha.get(dayInfo.dateStr) || [];

    items.sort((a, b) => {
      const hA = a.hora_entrada || '';
      const hB = b.hora_entrada || '';
      return hA.localeCompare(hB);
    });

    let minutosDiaBruto = 0;
    let tieneTurnoEnCurso = false;

    const turnosData = items.map((item, idx) => {
      const esDiaPasado = dayInfo.dateStr < hoyStr;
      const sinSalida = !item.hora_salida;
      const autoCerrado = isAutoCerradoAsistencia({
        ...item,
        fecha: dayInfo.dateStr,
      }, hoyStr);
      const enCurso = sinSalida && !esDiaPasado && !autoCerrado;

      if (enCurso) {
        tieneTurnoEnCurso = true;
      }

      const horaSalidaEfectiva = autoCerrado ? '18:00:00' : (item.hora_salida || null);

      let minsBrutos = 0;
      if (horaSalidaEfectiva) {
        minsBrutos = calculateDurationMinutes(item.hora_entrada, horaSalidaEfectiva);
      }

      minutosDiaBruto += minsBrutos;
      turnosTotales++;

      const tz = extractTimezoneFromRecord(item);
      const badge = getTimezoneBadgeInfo(tz);

      return {
        item,
        idx,
        autoCerrado,
        enCurso,
        horaSalidaEfectiva,
        minsBrutos,
        tz,
        badge,
      };
    });

    // Deducción de comida de 1 hora por jornada para ADMIN y EMPLEADO
    const minutosADescontar = (aplicaDescuentoComida && minutosDiaBruto > 0)
      ? Math.min(MINUTOS_COMIDA_DIARIA, minutosDiaBruto)
      : 0;

    const minutosDiaNetos = Math.max(0, minutosDiaBruto - minutosADescontar);

    let remDescuento = minutosADescontar;
    const turnos: TurnoAsistencia[] = turnosData.map((t) => {
      let descuentoEsteTurno = 0;
      if (remDescuento > 0 && t.minsBrutos > 0) {
        descuentoEsteTurno = Math.min(remDescuento, t.minsBrutos);
        remDescuento -= descuentoEsteTurno;
      }
      const minsNetos = Math.max(0, t.minsBrutos - descuentoEsteTurno);

      return {
        id: t.item.id,
        index: t.idx + 1,
        hora_entrada: formatHoraDisplay(t.item.hora_entrada),
        hora_salida: t.autoCerrado
          ? '18:00 (Auto)'
          : t.item.hora_salida
          ? formatHoraDisplay(t.item.hora_salida)
          : null,
        foto_entrada_url: t.item.foto_entrada_url,
        foto_salida_url: (t.enCurso || t.autoCerrado) ? null : t.item.foto_salida_url,
        direccion_entrada: cleanAddressForDisplay(t.item.direccion_entrada),
        direccion_salida: t.autoCerrado
          ? 'Cierre automático 6:00 PM (olvido de checada)'
          : t.enCurso
          ? null
          : cleanAddressForDisplay(t.item.direccion_salida),
        latitud_entrada: t.item.latitud_entrada,
        longitud_entrada: t.item.longitud_entrada,
        latitud_salida: (t.enCurso || t.autoCerrado) ? null : t.item.latitud_salida,
        longitud_salida: (t.enCurso || t.autoCerrado) ? null : t.item.longitud_salida,
        minutos: minsNetos,
        minutosBrutos: t.minsBrutos,
        duracionStr: t.enCurso ? 'En curso' : formatMinutesToHours(minsNetos),
        minutosRegulares: minsNetos,
        horasRegularesStr: formatMinutesToHours(minsNetos),
        minutosExtra: 0,
        horasExtraStr: '0h 0m',
        enCurso: t.enCurso,
        autoCerrado: t.autoCerrado,
        timezone: t.tz,
        timezoneBadge: t.badge,
        comidaDescontada: descuentoEsteTurno > 0,
      };
    });

    if (minutosDiaBruto > 0 || turnos.length > 0) {
      diasLaborados++;
    }

    totalMinutosPeriodo += minutosDiaNetos;

    return {
      dateStr: dayInfo.dateStr,
      dayName: dayInfo.dayName,
      shortDate: dayInfo.shortDate,
      isToday: dayInfo.isToday,
      totalMinutos: minutosDiaNetos,
      totalHorasStr: formatMinutesToHours(minutosDiaNetos),
      minutosRegulares: minutosDiaNetos,
      horasRegularesStr: formatMinutesToHours(minutosDiaNetos),
      minutosExtra: 0,
      horasExtraStr: '0h 0m',
      turnos,
      tieneTurnoEnCurso,
      comidaDescontada: minutosADescontar > 0,
      minutosComidaDescontados: minutosADescontar,
      minutosBrutos: minutosDiaBruto,
    };
  });

  return {
    rangeLabel: range.label,
    startStr: range.startStr,
    endStr: range.endStr,
    dias,
    totalMinutosPeriodo,
    totalHorasPeriodoStr: formatMinutesToHours(totalMinutosPeriodo),
    totalMinutosSemana: totalMinutosPeriodo,
    totalHorasSemanaStr: formatMinutesToHours(totalMinutosPeriodo),
    totalMinutosRegulares: totalMinutosPeriodo,
    totalHorasRegularesStr: formatMinutesToHours(totalMinutosPeriodo),
    totalMinutosExtra: 0,
    totalHorasExtraStr: '0h 0m',
    diasLaborados,
    turnosTotales,
  };
}

/**
 * Procesa una lista de asistencias agrupadas por el mes solicitado
 */
export function processAsistenciasMes(
  asistencias: Asistencia[],
  monthDateInput?: Date | string | { year: number; month: number },
  userRole?: string | null
): PeriodoAsistencia {
  const range = getMonthRange(monthDateInput);
  return processAsistenciasPeriodo(asistencias, {
    startStr: range.startStr,
    endStr: range.endStr,
    days: range.days,
    label: range.label,
  }, userRole);
}
