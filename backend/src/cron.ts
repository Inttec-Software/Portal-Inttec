import cron from 'node-cron';
import { getDbPool } from './config/database';

// Inicializar todos los Cron Jobs del backend
export const initCronJobs = () => {
  console.log('[Cron] Inicializando tareas programadas...');

  cron.schedule('0 18,20 * * *', async () => {
    console.log('[Cron] Ejecutando verificación de asistencias pendientes de salida...');
    try {
      const company = 'inttec';
      const env = 'prod'; // Se usaba 'cloud', ahora mapped to prod
      const pool = getDbPool(company, env);

      const today = new Date();
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      
      const hour = today.getHours();
      const isLateReminder = hour >= 20;

      const title = isLateReminder ? '⏰ Último Aviso: Registro de Salida' : '⏰ Recordatorio de Salida';
      const msg = isLateReminder 
        ? 'Aún no has registrado tu hora de salida en el sistema. Por favor marca tu salida.' 
        : 'Parece que olvidaste marcar tu salida hoy. Recuerda hacerlo antes de terminar tu jornada.';

      const asistQuery = `
        SELECT empleado_id 
        FROM asistencias 
        WHERE fecha = $1 
          AND hora_entrada IS NOT NULL 
          AND hora_salida IS NULL
      `;
      const { rows: asistencias } = await pool.query(asistQuery, [dateStr]);

      if (asistencias && asistencias.length > 0) {
        const empleadoIds = asistencias.map((a: any) => a.empleado_id);
        
        // Obtener los push tokens de estos empleados
        const placeholders = empleadoIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const usersQuery = `SELECT id, expo_push_token FROM usuarios WHERE id IN (${placeholders})`;
        const { rows: usuarios } = await pool.query(usersQuery, empleadoIds);

        if (usuarios && usuarios.length > 0) {
          // 1. Insertar notificaciones In-App
          const notificaciones = usuarios.map((u: any) => ({
            usuario_id: u.id,
            titulo: title,
            mensaje: msg,
            tipo: 'RECORDATORIO_SALIDA',
            referencia_id: null,
          }));

          for (const notif of notificaciones) {
            await pool.query(
              `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, referencia_id) VALUES ($1, $2, $3, $4, $5)`,
              [notif.usuario_id, notif.titulo, notif.mensaje, notif.tipo, notif.referencia_id]
            );
          }

          // 2. Enviar push notifications
          const pushMessages = usuarios
            .filter((u: any) => u.expo_push_token && typeof u.expo_push_token === 'string' && u.expo_push_token.trim().length > 0)
            .map((u: any) => ({
              to: u.expo_push_token.trim(),
              sound: 'default',
              title: title,
              body: msg,
              data: { screen: '/(empleado)' },
              priority: 'high',
              channelId: 'default',
            }));

          if (pushMessages.length > 0) {
            console.log(`[Cron] Enviando ${pushMessages.length} recordatorios de salida...`);
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
        }
      } else {
        console.log('[Cron] No hay salidas pendientes para notificar.');
      }
    } catch (err) {
      console.error('[Cron] Error verificando asistencias:', err);
    }
  });

  console.log('[Cron] Tareas programadas inicializadas.');
};
