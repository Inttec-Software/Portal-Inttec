import cron from 'node-cron';
import { getDbPool } from './config/database';

function extractTimezone(addr?: string | null, lat?: number | null, lng?: number | null): string {
  if (addr) {
    const match = addr.match(/\[tz:([^\]]+)\]/);
    if (match) return match[1].trim();
    const norm = addr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes('tijuana') || (norm.includes('baja california') && !norm.includes('sur'))) return 'America/Tijuana';
    if (norm.includes('sonora') || norm.includes('hermosillo')) return 'America/Hermosillo';
    if (norm.includes('quintana roo') || norm.includes('cancun')) return 'America/Cancun';
    if (norm.includes('sinaloa') || norm.includes('baja california sur') || norm.includes('nayarit')) return 'America/Mazatlan';
    if (norm.includes('chihuahua') || norm.includes('ciudad juarez') || norm.includes('cd juarez')) return 'America/Chihuahua';
    if (norm.includes('espana') || norm.includes('madrid')) return 'Europe/Madrid';
  }
  if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
    if (lat >= 28 && lng <= -114.5) return 'America/Tijuana';
    if (lat >= 26.5 && lat <= 32.5 && lng > -115 && lng <= -108.5) return 'America/Hermosillo';
    if (lat >= 17.8 && lat <= 21.8 && lng >= -89.3 && lng <= -86.5) return 'America/Cancun';
    if (lat >= 35 && lat <= 44 && lng >= -10 && lng <= 5) return 'Europe/Madrid';
  }
  return 'America/Mexico_City';
}

// Inicializar todos los Cron Jobs del backend
export const initCronJobs = () => {
  console.log('[Cron] Inicializando tareas programadas multi-zona...');

  // Se ejecuta cada hora en punto (0 * * * *) para evaluar si en la zona horaria del empleado son las 18:00 o 20:00
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    const companies = ['inttec', 'daravisa'];

    for (const company of companies) {
      try {
        const pool = getDbPool(company, 'prod');

        // Buscar asistencias abiertas de hoy o ayer (para cruces de madrugada)
        const asistQuery = `
          SELECT id, empleado_id, fecha, hora_entrada, direccion_entrada, latitud_entrada, longitud_entrada
          FROM asistencias 
          WHERE hora_entrada IS NOT NULL 
            AND hora_salida IS NULL
            AND fecha >= (CURRENT_DATE - INTERVAL '1 day')
        `;
        const { rows: asistencias } = await pool.query(asistQuery);
        if (!asistencias || asistencias.length === 0) continue;

        // Filtrar empleados que en su huso horario local se encuentren a las 18:00 o 20:00
        const empleadosParaNotificar: { empleadoId: string; isLate: boolean }[] = [];

        for (const a of asistencias) {
          const tz = extractTimezone(a.direccion_entrada, a.latitud_entrada, a.longitud_entrada);
          const localHourStr = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', hour12: false });
          const localHour = parseInt(localHourStr, 10);
          const localDate = now.toLocaleDateString('en-CA', { timeZone: tz });

          const cleanFecha = String(a.fecha).split('T')[0];
          // Solo notificar si en su huso horario es su jornada de hoy y son las 18:00 o 20:00
          if (cleanFecha === localDate && (localHour === 18 || localHour === 20)) {
            empleadosParaNotificar.push({
              empleadoId: a.empleado_id,
              isLate: localHour === 20
            });
          }
        }

        if (empleadosParaNotificar.length === 0) continue;

        const empleadoIds = Array.from(new Set(empleadosParaNotificar.map(e => e.empleadoId)));
        const placeholders = empleadoIds.map((_, i) => `$${i + 1}`).join(',');
        const usersQuery = `SELECT id, expo_push_token FROM usuarios WHERE id IN (${placeholders})`;
        const { rows: usuarios } = await pool.query(usersQuery, empleadoIds);

        if (!usuarios || usuarios.length === 0) continue;

        const pushMessages: any[] = [];

        for (const empItem of empleadosParaNotificar) {
          const u = usuarios.find((user: any) => user.id === empItem.empleadoId);
          if (!u) continue;

          const title = empItem.isLate ? '⏰ Último Aviso: Registro de Salida' : '⏰ Recordatorio de Salida';
          const msg = empItem.isLate 
            ? 'Aún no has registrado tu hora de salida en el sistema. Por favor marca tu salida.' 
            : 'Parece que olvidaste marcar tu salida hoy. Recuerda hacerlo antes de terminar tu jornada.';

          // 1. Insertar notificación In-App
          await pool.query(
            `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
            [u.id, title, msg, 'RECORDATORIO_SALIDA', null]
          );

          // 2. Preparar push notification
          if (u.expo_push_token && typeof u.expo_push_token === 'string' && u.expo_push_token.trim().length > 0) {
            pushMessages.push({
              to: u.expo_push_token.trim(),
              sound: 'default',
              title,
              body: msg,
              data: { screen: '/(empleado)' },
              priority: 'high',
              channelId: 'default',
            });
          }
        }

        if (pushMessages.length > 0) {
          console.log(`[Cron] [${company.toUpperCase()}] Enviando ${pushMessages.length} recordatorios de salida adaptados a su zona horaria...`);
          const chunkSize = 100;
          for (let i = 0; i < pushMessages.length; i += chunkSize) {
            const chunk = pushMessages.slice(i, i + chunkSize);
            fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
              body: JSON.stringify(chunk),
            }).catch(err => console.warn('[Cron] Error al enviar push notifications:', err));
          }
        }
      } catch (err) {
        console.error(`[Cron] Error verificando asistencias en ${company}:`, err);
      }
    }
  });

  console.log('[Cron] Tareas programadas inicializadas.');
};
