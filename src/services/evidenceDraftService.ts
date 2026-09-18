import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

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
  }[];
  solucion: string;
  antesImg?: { uri: string; base64: string | null };
  despuesImg?: { uri: string; base64: string | null };
  fotosAdicionales?: { uri: string; base64: string | null }[];
}

export interface EvidenceDraft {
  id: string;
  userId: string;
  company: string;
  selectedCliente: string;
  clienteNombre?: string;
  selectedSucursal: string;
  sucursalNombre?: string;
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
      return parsed
        .map(d => ({
          ...d,
          trabajos: sanitizeTrabajosForDraft(d.trabajos || []),
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err) {
      logger.error('[EvidenceDraftService] Error obteniendo borradores:', err);
      return [];
    }
  },

  async getDraftById(userId: string, company: string, draftId: string): Promise<EvidenceDraft | null> {
    const drafts = await this.getDrafts(userId, company);
    return drafts.find(d => d.id === draftId) || null;
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
      const drafts = await this.getDrafts(userId, company);
      const now = new Date().toISOString();
      const draftId = draftData.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const sanitizedTrabajos = sanitizeTrabajosForDraft(draftData.trabajos || []);

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

      const key = this.getStorageKey(userId, company);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(sortedClean));
      } catch (storageErr) {
        logger.warn('[EvidenceDraftService] AsyncStorage quota warning, pruning old drafts:', storageErr);
        // Fallback: save only the latest 3 drafts if quota is tight
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
      const drafts = await this.getDrafts(userId, company);
      const filtered = drafts.filter(d => d.id !== draftId);
      const key = this.getStorageKey(userId, company);
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch (err) {
      logger.error('[EvidenceDraftService] Error eliminando borrador:', err);
      throw err;
    }
  },

  async clearAllDrafts(userId: string, company: string): Promise<void> {
    try {
      const key = this.getStorageKey(userId, company);
      await AsyncStorage.removeItem(key);
    } catch (err) {
      logger.error('[EvidenceDraftService] Error limpiando borradores:', err);
    }
  },
};
