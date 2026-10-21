import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { WebBlobStorage } from '@/utils/webBlobStorage';

export interface EvidenceDraftTrabajo {
  descripcion: string;
  usa_materiales?: boolean;
  materiales: string;
  materiales_usados?: {
    productoId: string;
    nombre: string;
    retirado: number;
    usado: number;
    sobrante: number;
    unidad?: string;
    empleadoId?: string;
    empleadoNombre?: string;
  }[];
  solucion: string;
  antesImg?: { uri: string; base64: string | null };
  despuesImg?: { uri: string; base64: string | null };
  fotosAdicionales?: { uri: string; base64: string | null }[];
}

export interface Colaborador {
  id: string;
  nombre: string;
  email?: string;
}

export interface EvidenceDraft {
  id: string;
  userId: string;
  company: string;
  selectedCliente: string;
  clienteNombre?: string;
  selectedSucursal: string;
  sucursalNombre?: string;
  colaboradores?: Colaborador[];
  currentStep: number;
  trabajos: EvidenceDraftTrabajo[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PREFIX = 'evidencia_drafts_';
const MAX_SAVED_DRAFTS = 25;

export const sanitizeTrabajosForDraft = (trabajos: EvidenceDraftTrabajo[]): EvidenceDraftTrabajo[] => {
  if (!Array.isArray(trabajos)) return [];
  return trabajos.map(t => {
    const item: EvidenceDraftTrabajo = {
      descripcion: t.descripcion || '',
      usa_materiales: t.usa_materiales ?? Boolean(t.materiales_usados && t.materiales_usados.length > 0),
      materiales: t.materiales || '',
      materiales_usados: t.materiales_usados || [],
      solucion: t.solucion || '',
    };
    if (t.antesImg && t.antesImg.uri) {
      item.antesImg = { uri: t.antesImg.uri, base64: null };
    }
    if (t.despuesImg && t.despuesImg.uri) {
      item.despuesImg = { uri: t.despuesImg.uri, base64: null };
    }
    if (Array.isArray(t.fotosAdicionales)) {
      item.fotosAdicionales = t.fotosAdicionales
        .filter(f => f && f.uri)
        .map(f => ({ uri: f.uri, base64: null }));
    } else {
      item.fotosAdicionales = [];
    }
    return item;
  });
};

/**
 * Rehidrata las imágenes de un borrador en Web desde IndexedDB si la sesión del navegador se reinició.
 * Esto asegura que los Blob URLs siempre sean válidos y frescos al cargar un borrador.
 */
export const hydrateDraftMedia = async (draft: EvidenceDraft): Promise<EvidenceDraft> => {
  if (Platform.OS !== 'web' || !draft || !Array.isArray(draft.trabajos)) {
    return draft;
  }

  const hydratedTrabajos = await Promise.all(
    draft.trabajos.map(async (t, i) => {
      let antesImg = t.antesImg;
      if (antesImg?.uri) {
        if (!antesImg.uri.startsWith('http') || antesImg.uri.startsWith('blob:')) {
          const freshUrl = await WebBlobStorage.getDraftMediaUrl(draft.id, `t${i}_antes`);
          if (freshUrl) {
            antesImg = { uri: freshUrl, base64: null };
          } else if (antesImg.uri.startsWith('blob:')) {
            // Verificar si el blob antiguo sigue vivo en memoria
            try {
              const res = await fetch(antesImg.uri);
              if (!res.ok) antesImg = undefined;
            } catch {
              antesImg = undefined;
            }
          }
        }
      }

      let despuesImg = t.despuesImg;
      if (despuesImg?.uri) {
        if (!despuesImg.uri.startsWith('http') || despuesImg.uri.startsWith('blob:')) {
          const freshUrl = await WebBlobStorage.getDraftMediaUrl(draft.id, `t${i}_despues`);
          if (freshUrl) {
            despuesImg = { uri: freshUrl, base64: null };
          } else if (despuesImg.uri.startsWith('blob:')) {
            try {
              const res = await fetch(despuesImg.uri);
              if (!res.ok) despuesImg = undefined;
            } catch {
              despuesImg = undefined;
            }
          }
        }
      }

      const fotosAdicionales = await Promise.all(
        (t.fotosAdicionales || []).map(async (extra, extraIdx) => {
          if (!extra?.uri) return null;
          if (extra.uri.startsWith('http') && !extra.uri.startsWith('blob:')) {
            return extra;
          }
          const freshUrl = await WebBlobStorage.getDraftMediaUrl(draft.id, `t${i}_extra_${extraIdx}`);
          if (freshUrl) {
            return { uri: freshUrl, base64: null };
          }
          if (extra.uri.startsWith('blob:')) {
            try {
              const res = await fetch(extra.uri);
              if (res.ok) return extra;
            } catch {}
            return null;
          }
          return extra;
        })
      );

      return {
        ...t,
        antesImg,
        despuesImg,
        fotosAdicionales: fotosAdicionales.filter((f): f is { uri: string; base64: string | null } => f !== null),
      };
    })
  );

  return {
    ...draft,
    trabajos: hydratedTrabajos,
  };
};

export const EvidenceDraftService = {
  getStorageKey(userId: string, company: string): string {
    return `${STORAGE_PREFIX}${userId}_${company || 'inttec'}`;
  },

  async getDrafts(userId: string, company: string): Promise<EvidenceDraft[]> {
    try {
      const key = this.getStorageKey(userId, company);
      const data = await AsyncStorage.getItem(key);
      if (!data) return [];
      const parsed: EvidenceDraft[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      
      const sanitized = parsed
        .map(d => ({
          ...d,
          trabajos: sanitizeTrabajosForDraft(d.trabajos || []),
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      // Rehidratar medios locales en Web
      return await Promise.all(sanitized.map(d => hydrateDraftMedia(d)));
    } catch (err) {
      logger.error('[EvidenceDraftService] Error obteniendo borradores:', err);
      return [];
    }
  },

  async getDraftById(userId: string, company: string, draftId: string): Promise<EvidenceDraft | null> {
    const drafts = await this.getDrafts(userId, company);
    const found = drafts.find(d => d.id === draftId);
    return found || null;
  },

  async getLatestDraft(userId: string, company: string): Promise<EvidenceDraft | null> {
    const drafts = await this.getDrafts(userId, company);
    return drafts.length > 0 ? drafts[0] : null;
  },

  async saveDraft(
    userId: string,
    company: string,
    draftData: Omit<EvidenceDraft, 'id' | 'userId' | 'company' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
    }
  ): Promise<EvidenceDraft> {
    try {
      const key = this.getStorageKey(userId, company);
      const data = await AsyncStorage.getItem(key);
      const drafts: EvidenceDraft[] = data ? JSON.parse(data) : [];

      const now = new Date().toISOString();
      const draftId = draftData.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const sanitizedTrabajos = sanitizeTrabajosForDraft(draftData.trabajos || []);

      // En Web, persistir los blobs en IndexedDB local sin tocar S3 ni llenar el quota de 5MB de localStorage
      if (Platform.OS === 'web' && Array.isArray(draftData.trabajos)) {
        await Promise.all(
          draftData.trabajos.map(async (t, i) => {
            if (t.antesImg?.uri && (t.antesImg.uri.startsWith('blob:') || t.antesImg.uri.startsWith('data:'))) {
              await WebBlobStorage.saveDraftMedia(draftId, `t${i}_antes`, t.antesImg.uri);
            }
            if (t.despuesImg?.uri && (t.despuesImg.uri.startsWith('blob:') || t.despuesImg.uri.startsWith('data:'))) {
              await WebBlobStorage.saveDraftMedia(draftId, `t${i}_despues`, t.despuesImg.uri);
            }
            if (Array.isArray(t.fotosAdicionales)) {
              await Promise.all(
                t.fotosAdicionales.map(async (extra, extraIdx) => {
                  if (extra?.uri && (extra.uri.startsWith('blob:') || extra.uri.startsWith('data:'))) {
                    await WebBlobStorage.saveDraftMedia(draftId, `t${i}_extra_${extraIdx}`, extra.uri);
                  }
                })
              );
            }
          })
        );
      }

      const existingIndex = drafts.findIndex(d => d.id === draftId);
      const originalCreatedAt = (existingIndex >= 0 && drafts[existingIndex]?.createdAt)
        ? drafts[existingIndex].createdAt
        : (draftData.createdAt || now);

      const newDraft: EvidenceDraft = {
        id: draftId,
        userId,
        company: company || 'inttec',
        selectedCliente: draftData.selectedCliente || '',
        clienteNombre: draftData.clienteNombre || '',
        selectedSucursal: draftData.selectedSucursal || '',
        sucursalNombre: draftData.sucursalNombre || '',
        colaboradores: draftData.colaboradores || [],
        currentStep: draftData.currentStep || 1,
        trabajos: sanitizedTrabajos,
        createdAt: originalCreatedAt,
        updatedAt: now,
      };

      let updatedDrafts: EvidenceDraft[];
      if (existingIndex >= 0) {
        updatedDrafts = [...drafts];
        updatedDrafts[existingIndex] = newDraft;
      } else {
        updatedDrafts = [newDraft, ...drafts];
      }

      // Re-sort and limit drafts count to avoid storage bloat
      const sortedClean = updatedDrafts
        .map(d => ({
          ...d,
          trabajos: sanitizeTrabajosForDraft(d.trabajos || []),
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_SAVED_DRAFTS);

      try {
        await AsyncStorage.setItem(key, JSON.stringify(sortedClean));
      } catch (storageErr) {
        logger.warn('[EvidenceDraftService] AsyncStorage quota warning, pruning old drafts:', storageErr);
        const pruned = sortedClean.slice(0, 3);
        await AsyncStorage.setItem(key, JSON.stringify(pruned));
      }

      return newDraft;
    } catch (err) {
      logger.error('[EvidenceDraftService] Error guardando borrador:', err);
      throw err;
    }
  },

  async deleteDraft(userId: string, company: string, draftId: string): Promise<void> {
    try {
      const key = this.getStorageKey(userId, company);
      const data = await AsyncStorage.getItem(key);
      const drafts: EvidenceDraft[] = data ? JSON.parse(data) : [];
      const filtered = drafts.filter(d => d.id !== draftId);
      await AsyncStorage.setItem(key, JSON.stringify(filtered));

      // Limpiar fotos de IndexedDB en Web
      if (Platform.OS === 'web') {
        await WebBlobStorage.deleteDraftMedia(draftId);
      }
    } catch (err) {
      logger.error('[EvidenceDraftService] Error eliminando borrador:', err);
      throw err;
    }
  },

  async clearAllDrafts(userId: string, company: string): Promise<void> {
    try {
      const key = this.getStorageKey(userId, company);
      await AsyncStorage.removeItem(key);

      // Limpiar todas las fotos en IndexedDB
      if (Platform.OS === 'web') {
        await WebBlobStorage.clearAllDraftMedia();
      }
    } catch (err) {
      logger.error('[EvidenceDraftService] Error limpiando borradores:', err);
    }
  },
};
