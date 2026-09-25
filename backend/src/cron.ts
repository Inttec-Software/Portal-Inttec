import cron from 'node-cron';
import { getSupabaseClient } from './config/supabase';

// Inicializar todos los Cron Jobs del backend
export const initCronJobs = () => {
  console.log('[Cron] Inicializando tareas programadas...');

  // Tarea: Recordatorio de salida a las 6:00 PM (18:00) y a las 8:00 PM (20:00)
  // Se ejecuta todos los días a las 18:00 y 20:00 (hora local del servidor)
  cron.schedule('0 18,20 * * *', async () => {
    console.log('[Cron] Ejecutando verificación de asistencias pendientes de salida...');
    try {
      // Usaremos un client default, en producción se deberá ajustar para múltiples tenants si es necesario
      const company = 'inttec';
      const env: 'cloud' | 'test' = 'cloud';
      const supabase = getSupabaseClient(company, env);

      // Fecha actual en formato YYYY-MM-DD
      const today = new Date();
      // Formato seguro para timezone local del servidor
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      
      const hour = today.getHours();
      const isLateReminder = hour >= 20;

      const title = isLateReminder ? '⚠️ Último Aviso: Registro de Salida' : '⏰ Recordatorio de Salida';
      const msg = isLateReminder 
        ? 'Aún no has registrado tu hora de salida en el sistema. Por favor marca tu salida.' 
        : 'Parece que olvidaste marcar tu salida hoy. Recuerda hacerlo antes de terminar tu jornada.';

      // Buscar asistencias de hoy que tengan entrada pero no salida
      const { data: asistencias, error } = await supabase
        .from('asistencias')
        .select('empleado_id')
        .eq('fecha', dateStr)
        .not('hora_entrada', 'is', null)
        .is('hora_salida', null);

      if (error) throw error;

      if (asistencias && asistencias.length > 0) {
        const empleadoIds = asistencias.map((a: any) => a.empleado_id);
        
        // Obtener los push tokens de estos empleados
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, expo_push_token')
          .in('id', empleadoIds);

        if (usuarios && usuarios.length > 0) {
          // 1. Insertar notificaciones In-App
          const notificaciones = usuarios.map(u => ({
            usuario_id: u.id,
            titulo: title,
            mensaje: msg,
            tipo: 'RECORDATORIO_SALIDA',
            referencia_id: null,
          }));
          await supabase.from('notificaciones').insert(notificaciones);

          // 2. Enviar push notifications
          const pushMessages = usuarios
            .filter(u => u.expo_push_token && typeof u.expo_push_token === 'string' && u.expo_push_token.trim().length > 0)
            .map(u => ({
              to: u.expo_push_token.trim(),
              sound: 'default',
              title: title,
              body: msg,
              data: { screen: '/(empleado)' }, // Redirigir al inicio donde está el checador
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
