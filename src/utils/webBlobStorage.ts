import { Platform } from 'react-native';

const DB_NAME = 'inttec_draft_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'draft_blobs';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[WebBlobStorage] Error al abrir IndexedDB:', req.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('[WebBlobStorage] IndexedDB no soportado o bloqueado:', e);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

export const WebBlobStorage = {
  /**
   * Guarda un blob o URI local en IndexedDB asociado al borrador para persistirlo entre recargas
   */
  async saveDraftMedia(draftId: string, mediaKey: string, uriOrBlob: string | Blob): Promise<boolean> {
    if (Platform.OS !== 'web' || !draftId || !mediaKey || !uriOrBlob) return false;

    try {
      const db = await getDb();
      if (!db) return false;

      let blob: Blob;
      if (typeof uriOrBlob === 'string') {
        const clean = uriOrBlob.trim();
        if (!clean) return false;
        // Si ya es un URL remoto de S3/HTTP no necesita guardarse en IndexedDB
        if ((clean.startsWith('http://') || clean.startsWith('https://')) && !clean.startsWith('blob:')) {
          return false;
        }

        const res = await fetch(clean);
        blob = await res.blob();
      } else {
        blob = uriOrBlob;
      }

      const fullKey = `${draftId}_${mediaKey}`;

      return new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put({
            key: fullKey,
            draftId,
            mediaKey,
            blob,
            mimeType: blob.type || 'image/jpeg',
            updatedAt: Date.now(),
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => {
            console.warn('[WebBlobStorage] Error guardando blob en IndexedDB:', tx.error);
            resolve(false);
          };
        } catch (txErr) {
          console.warn('[WebBlobStorage] Excepción en transacción put:', txErr);
          resolve(false);
        }
      });
    } catch (err) {
      console.warn('[WebBlobStorage] Error procesando saveDraftMedia:', err);
      return false;
    }
  },

  /**
   * Recupera un blob de IndexedDB y crea un nuevo Blob URL válido para la sesión actual
   */
  async getDraftMediaUrl(draftId: string, mediaKey: string): Promise<string | null> {
    if (Platform.OS !== 'web' || !draftId || !mediaKey) return null;

    try {
      const db = await getDb();
      if (!db) return null;

      const fullKey = `${draftId}_${mediaKey}`;

      return new Promise<string | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(fullKey);

          req.onsuccess = () => {
            const data = req.result;
            if (data && data.blob instanceof Blob) {
              try {
                const freshUrl = URL.createObjectURL(data.blob);
                resolve(freshUrl);
              } catch (urlErr) {
                console.warn('[WebBlobStorage] Error creando ObjectURL:', urlErr);
                resolve(null);
              }
            } else {
              resolve(null);
            }
          };

          req.onerror = () => {
            console.warn('[WebBlobStorage] Error al leer IndexedDB:', req.error);
            resolve(null);
          };
        } catch (txErr) {
          console.warn('[WebBlobStorage] Excepción en transacción get:', txErr);
          resolve(null);
        }
      });
    } catch (err) {
      console.warn('[WebBlobStorage] Error en getDraftMediaUrl:', err);
      return null;
    }
  },

  /**
   * Recupera el Blob original para conversión directa a Base64
   */
  async getDraftMediaBlob(draftId: string, mediaKey: string): Promise<Blob | null> {
    if (Platform.OS !== 'web' || !draftId || !mediaKey) return null;

    try {
      const db = await getDb();
      if (!db) return null;

      const fullKey = `${draftId}_${mediaKey}`;

      return new Promise<Blob | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(fullKey);

          req.onsuccess = () => {
            const data = req.result;
            if (data && data.blob instanceof Blob) {
              resolve(data.blob);
            } else {
              resolve(null);
            }
          };

          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  },

  /**
   * Elimina todas las fotos asociadas a un borrador específico
   */
  async deleteDraftMedia(draftId: string): Promise<void> {
    if (Platform.OS !== 'web' || !draftId) return;

    try {
      const db = await getDb();
      if (!db) return;

      return new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.openCursor();

          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const item = cursor.value;
              if (item && (item.draftId === draftId || cursor.key.toString().startsWith(`${draftId}_`))) {
                cursor.delete();
              }
              cursor.continue();
            } else {
              resolve();
            }
          };

          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Ignorar fallas silenciosas en eliminación
    }
  },

  /**
   * Limpia toda la base de datos de fotos temporales de borradores
   */
  async clearAllDraftMedia(): Promise<void> {
    if (Platform.OS !== 'web') return;

    try {
      const db = await getDb();
      if (!db) return;

      return new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Ignorar
    }
  },
};
