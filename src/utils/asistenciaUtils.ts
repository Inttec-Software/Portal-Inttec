import { Asistencia } from '@/services/supabase';

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
}

export interface SemanaAsistencia {
  range: WeekRange;
  dias: DiaAsistencia[];
  totalMinutosSemana: number;
  totalHorasSemanaStr: string;
  totalMinutosRegulares: number;
  totalHorasRegularesStr: string;
  totalMinutosExtra: number;
  totalHorasExtraStr: string;
  diasLaborados: number;
  turnosTotales: number;
}

/**
 * Horario laboral regular estándar de la empresa:
 * 08:00 AM (480 mins) a 06:00 PM (1080 mins) -> 10 horas regulares por jornada
 */
export const HORARIO_LABORAL_REGULAR = {
  horaInicio: '08:00',
  horaFin: '18:00',
  minutosInicio: 8 * 60,        // 480
  minutosFin: 18 * 60,          // 1080
  minutosJornadaMax: 10 * 60,   // 600 minutos
};

/**
 * Desglosa los minutos trabajados de un turno entre horas regulares (08:00 a 18:00) y horas extras (antes de 08:00 o después de 18:00)
 */
export function calculateTurnoHorasDesglose(
  horaEntrada?: string | null,
  horaSalida?: string | null
): { totalMins: number; regularesMins: number; extrasMins: number } {
  if (!horaEntrada || !horaSalida) {
    return { totalMins: 0, regularesMins: 0, extrasMins: 0 };
  }

  const partsEntrada = horaEntrada.split(':').map(Number);
  const partsSalida = horaSalida.split(':').map(Number);

  const h1 = partsEntrada[0] || 0;
  const m1 = partsEntrada[1] || 0;
  const h2 = partsSalida[0] || 0;
  const m2 = partsSalida[1] || 0;

  const startMins = h1 * 60 + m1;
  let endMins = h2 * 60 + m2;

  if (endMins < startMins) {
    endMins += 24 * 60; // Cruce de medianoche
  }

  const totalMins = Math.max(0, endMins - startMins);
  if (totalMins === 0) {
    return { totalMins: 0, regularesMins: 0, extrasMins: 0 };
  }

  // Traslape con la ventana regular de 08:00 a 18:00 (480 a 1080)
  const regWindowStart = HORARIO_LABORAL_REGULAR.minutosInicio;
  const regWindowEnd = HORARIO_LABORAL_REGULAR.minutosFin;

  const overlapStart = Math.max(startMins, regWindowStart);
  const overlapEnd = Math.min(endMins, regWindowEnd);

  const regularesMins = Math.max(0, overlapEnd - overlapStart);
  const extrasMins = Math.max(0, totalMins - regularesMins);

  return {
    totalMins,
    regularesMins,
    extrasMins,
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
  const parts = hora.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return hora;
}

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

/**
 * Procesa una lista de asistencias y las organiza en la semana solicitada con cálculo de horas regulares (8 a 6) y horas extras
 */
export function processAsistenciasSemana(
  asistencias: Asistencia[],
  weekDateInput?: Date | string
): SemanaAsistencia {
  const range = getWeekRange(weekDateInput);

  // Filtrar registros que caigan dentro del rango de lunes a domingo
  const asistenciasSemana = (asistencias || []).filter((a) => {
    return a.fecha >= range.mondayStr && a.fecha <= range.sundayStr;
  });

  // Agrupar por fecha
  const porFecha = new Map<string, Asistencia[]>();
  for (const a of asistenciasSemana) {
    const list = porFecha.get(a.fecha) || [];
    list.push(a);
    porFecha.set(a.fecha, list);
  }

  let totalMinutosSemana = 0;
  let totalMinutosRegulares = 0;
  let totalMinutosExtra = 0;
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

    let minutosDia = 0;
    let tieneTurnoEnCurso = false;

    const turnos: TurnoAsistencia[] = items.map((item, idx) => {
      // REGLA: Si el empleado olvidó checar salida y es de un día pasado,
      // automáticamente la salida se marca a las 6:00 PM (18:00:00) para no generar horas extra indebidas.
      const esDiaPasado = dayInfo.dateStr < hoyStr;
      const sinSalida = !item.hora_salida;
      const autoCerrado = sinSalida && esDiaPasado;
      const enCurso = sinSalida && !esDiaPasado;

      if (enCurso) {
        tieneTurnoEnCurso = true;
      }

      const horaSalidaEfectiva = item.hora_salida || (autoCerrado ? '18:00:00' : null);

      // Desglose de horas regulares y extras del turno
      let mins = 0;
      let regMins = 0;
      let extMins = 0;

      if (horaSalidaEfectiva) {
        const desglose = calculateTurnoHorasDesglose(item.hora_entrada, horaSalidaEfectiva);
        mins = desglose.totalMins;
        regMins = desglose.regularesMins;
        extMins = desglose.extrasMins;
      }

      minutosDia += mins;
      turnosTotales++;

      return {
        id: item.id,
        index: idx + 1,
        hora_entrada: formatHoraDisplay(item.hora_entrada),
        hora_salida: autoCerrado
          ? '18:00 (Auto)'
          : item.hora_salida
          ? formatHoraDisplay(item.hora_salida)
          : null,
        foto_entrada_url: item.foto_entrada_url,
        foto_salida_url: item.foto_salida_url,
        direccion_entrada: item.direccion_entrada,
        direccion_salida: autoCerrado
          ? 'Cierre automático 6:00 PM (olvido de checada)'
          : item.direccion_salida,
        latitud_entrada: item.latitud_entrada,
        longitud_entrada: item.longitud_entrada,
        latitud_salida: item.latitud_salida,
        longitud_salida: item.longitud_salida,
        minutos: mins,
        duracionStr: enCurso ? 'En curso' : formatMinutesToHours(mins),
        minutosRegulares: regMins,
        horasRegularesStr: formatMinutesToHours(regMins),
        minutosExtra: extMins,
        horasExtraStr: formatMinutesToHours(extMins),
        enCurso,
        autoCerrado,
      };
    });

    if (minutosDia > 0 || turnos.length > 0) {
      diasLaborados++;
    }

    // Cálculo diario de horas regulares (máximo 10h = 600m en horario 8 a 6) y extras
    const rawRegularesDia = turnos.reduce((acc, t) => acc + t.minutosRegulares, 0);
    const minutosRegularesDia = Math.min(rawRegularesDia, HORARIO_LABORAL_REGULAR.minutosJornadaMax);
    const minutosExtraDia = Math.max(0, minutosDia - minutosRegularesDia);

    totalMinutosSemana += minutosDia;
    totalMinutosRegulares += minutosRegularesDia;
    totalMinutosExtra += minutosExtraDia;

    return {
      dateStr: dayInfo.dateStr,
      dayName: dayInfo.dayName,
      shortDate: dayInfo.shortDate,
      isToday: dayInfo.isToday,
      totalMinutos: minutosDia,
      totalHorasStr: formatMinutesToHours(minutosDia),
      minutosRegulares: minutosRegularesDia,
      horasRegularesStr: formatMinutesToHours(minutosRegularesDia),
      minutosExtra: minutosExtraDia,
      horasExtraStr: formatMinutesToHours(minutosExtraDia),
      turnos,
      tieneTurnoEnCurso,
    };
  });

  return {
    range,
    dias,
    totalMinutosSemana,
    totalHorasSemanaStr: formatMinutesToHours(totalMinutosSemana),
    totalMinutosRegulares,
    totalHorasRegularesStr: formatMinutesToHours(totalMinutosRegulares),
    totalMinutosExtra,
    totalHorasExtraStr: formatMinutesToHours(totalMinutosExtra),
    diasLaborados,
    turnosTotales,
  };
}
