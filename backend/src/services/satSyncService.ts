import { getSupabaseClient } from '../config/supabase';

interface CompanySyncStatus {
  company: string;
  lastSyncTime: string | null;
  lastStatus: 'idle' | 'in_progress' | 'success' | 'error';
  lastMessage: string | null;
  facturasProcesadas: number;
  nuevaSolicitudCreada: boolean;
  nextScheduledSync: string | null;
}

const syncStatusMap: Record<string, CompanySyncStatus> = {
  inttec: {
    company: 'inttec',
    lastSyncTime: null,
    lastStatus: 'idle',
    lastMessage: null,
    facturasProcesadas: 0,
    nuevaSolicitudCreada: false,
    nextScheduledSync: null,
  },
  daravisa: {
    company: 'daravisa',
    lastSyncTime: null,
    lastStatus: 'idle',
    lastMessage: null,
    facturasProcesadas: 0,
    nuevaSolicitudCreada: false,
    nextScheduledSync: null,
  },
};

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

export class SatSyncService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Obtiene el estado actual del servicio de sincronización para una empresa
   */
  public static getStatus(company: string): CompanySyncStatus {
    const key = (company || 'inttec').toLowerCase();
    return (
      syncStatusMap[key] || {
        company: key,
        lastSyncTime: null,
        lastStatus: 'idle',
        lastMessage: 'Sin registro previo',
        facturasProcesadas: 0,
        nuevaSolicitudCreada: false,
        nextScheduledSync: null,
      }
    );
  }

  /**
   * Ejecuta el proceso de sincronización con el SAT para una compañía en particular
   */
  public static async syncCompany(company: 'inttec' | 'daravisa', env: 'cloud' | 'test' = 'cloud'): Promise<any> {
    const status = syncStatusMap[company] || {
      company,
      lastSyncTime: null,
      lastStatus: 'idle',
      lastMessage: null,
      facturasProcesadas: 0,
      nuevaSolicitudCreada: false,
      nextScheduledSync: null,
    };
    syncStatusMap[company] = status;

    if (status.lastStatus === 'in_progress') {
      console.log(`⏳ [SAT Cron] Sincronización para ${company} ya está en curso. Omitiendo.`);
      return { inProgress: true };
    }

    try {
      status.lastStatus = 'in_progress';
      console.log(`\n======================================================`);
      console.log(`🤖 [SAT Cron] Ejecutando sincronización automática para [${company.toUpperCase()}]...`);
      console.log(`⏰ [SAT Cron] Hora: ${new Date().toISOString()}`);

      const client = getSupabaseClient(company, env);

      // Invocamos la Edge Function de sincronización de facturas recibidas
      const { data, error } = await client.functions.invoke('sync-facturas-recibidas', {
        body: { action: 'sync' },
      });

      status.lastSyncTime = new Date().toISOString();

      if (error) {
        console.error(`❌ [SAT Cron] Error en Edge Function para ${company}:`, error);
        status.lastStatus = 'error';
        status.lastMessage = error.message || 'Error de conexión con Edge Function';
        return { success: false, error: error.message };
      }

      if (data?.missingCredentials) {
        console.warn(`⚠️ [SAT Cron] Faltan credenciales de e.firma para ${company} en Supabase Secrets.`);
        status.lastStatus = 'idle';
        status.lastMessage = 'Faltan credenciales SAT configuradas en Secrets';
        return data;
      }

      status.lastStatus = 'success';
      const resumen = data?.resumen || {};
      status.facturasProcesadas = resumen.facturasProcesadas || 0;
      status.nuevaSolicitudCreada = resumen.nuevaSolicitudCreada || false;
      status.lastMessage =
        data?.message ||
        (status.facturasProcesadas > 0
          ? `${status.facturasProcesadas} facturas descargadas`
          : 'Sincronizado sin paquetes pendientes');

      console.log(`✅ [SAT Cron] Sincronización finalizada para ${company}: ${status.lastMessage}`);
      console.log(`======================================================\n`);

      return data;
    } catch (err: any) {
      console.error(`💥 [SAT Cron] Excepción al sincronizar ${company}:`, err);
      status.lastStatus = 'error';
      status.lastMessage = err.message || 'Excepción no controlada';
      return { success: false, error: err.message };
    }
  }

  /**
   * Ejecuta el ciclo de sincronización para todas las compañías
   */
  public static async runAll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const companies: Array<'inttec' | 'daravisa'> = ['inttec', 'daravisa'];
      for (const comp of companies) {
        await this.syncCompany(comp, 'cloud');
      }
    } finally {
      this.isRunning = false;
      const nextTime = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
      for (const key of Object.keys(syncStatusMap)) {
        syncStatusMap[key].nextScheduledSync = nextTime;
      }
    }
  }

  /**
   * Inicia el Scheduler en segundo plano del servidor Node.js
   */
  public static startScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`⏰ [SAT Cron] Servicio de sincronización automática SAT iniciado (cada 30 minutos).`);

    // Primera ejecución a los 10 segundos del inicio del servidor
    setTimeout(() => {
      console.log(`🚀 [SAT Cron] Ejecutando primer ciclo de verificación automática inicial...`);
      SatSyncService.runAll();
    }, 10000);

    // Ciclo recurrente cada 30 minutos
    this.timer = setInterval(() => {
      SatSyncService.runAll();
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Detiene el Scheduler
   */
  public static stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`⏹️ [SAT Cron] Servicio de sincronización automática SAT detenido.`);
    }
  }
}
