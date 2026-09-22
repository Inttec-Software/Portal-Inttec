/**
 * Cache en memoria para pantallas y módulos de la app móvil.
 * Permite que al entrar a un módulo (Inventario, Ventas, Empleados, Cotizaciones, etc.)
 * la información previa se renderice de forma instantánea (0 milisegundos) sin bloquear
 * con spinners, aplicando el patrón Stale-While-Revalidate.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry<any>>();

export const ModuleCache = {
  /**
   * Obtiene datos cacheados de un módulo si existen.
   */
  get<T>(key: string): T | null {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    return entry.data as T;
  },

  /**
   * Guarda o actualiza los datos de un módulo en la memoria RAM del dispositivo.
   */
  set<T>(key: string, data: T): void {
    memoryStore.set(key, {
      data,
      timestamp: Date.now(),
    });
  },

  /**
   * Verifica si ya existen datos en caché para renderizar inmediatamente.
   */
  has(key: string): boolean {
    return memoryStore.has(key);
  },

  /**
   * Invalida entradas específicas o limpia toda la memoria.
   */
  invalidate(keyPattern?: string): void {
    if (!keyPattern) {
      memoryStore.clear();
      return;
    }
    for (const key of memoryStore.keys()) {
      if (key.includes(keyPattern)) {
        memoryStore.delete(key);
      }
    }
  },
};
