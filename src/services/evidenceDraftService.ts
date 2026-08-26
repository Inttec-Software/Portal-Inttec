import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

export interface EvidenceDraftTrabajo {
  descripcion: string;
  materiales: string;
  materiales_usados?: {
    productoId: string;
    nombre: string;
    retirado: number;
    usado: number;
    sobrante: number;
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
      return parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

      const newDraft: EvidenceDraft = {
        id: draftId,
        userId,
        company: company || 'inttec',
        selectedCliente: draftData.selectedCliente || '',
        clienteNombre: draftData.clienteNombre || '',
        selectedSucursal: draftData.selectedSucursal || '',
        sucursalNombre: draftData.sucursalNombre || '',
        currentStep: draftData.currentStep || 1,
        trabajos: draftData.trabajos || [],
        createdAt: draftData.createdAt || now,
        updatedAt: now,
      };

      const existingIndex = drafts.findIndex(d => d.id === draftId);
      let updatedDrafts: EvidenceDraft[];

      if (existingIndex >= 0) {
        updatedDrafts = [...drafts];
        updatedDrafts[existingIndex] = newDraft;
      } else {
        updatedDrafts = [newDraft, ...drafts];
      }

      const key = this.getStorageKey(userId, company);
      await AsyncStorage.setItem(key, JSON.stringify(updatedDrafts));
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
