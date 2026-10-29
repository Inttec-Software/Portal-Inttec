import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { EvidenceDraftService, EvidenceDraft } from '@/services/evidenceDraftService';
import { TrabajoRealizado, ColaboradorItem } from '../types';

interface SaveDraftParams {
  userId: string;
  company: string;
  activeDraftId: string | null;
  selectedCliente: string;
  clienteNombre: string;
  selectedSucursal: string;
  sucursalNombre: string;
  colaboradores?: ColaboradorItem[];
  currentStep: number;
  trabajos: TrabajoRealizado[];
}

export function useEvidenceDrafts() {
  const [draftsList, setDraftsList] = useState<EvidenceDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [draftsModalVisible, setDraftsModalVisible] = useState(false);
  const [pendingDraftPrompt, setPendingDraftPrompt] = useState<EvidenceDraft | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const refreshDrafts = useCallback(async (userId: string, company: string) => {
    try {
      const list = await EvidenceDraftService.getDrafts(userId, company);
      setDraftsList(list);
      return list;
    } catch (err) {
      console.warn('Error fetching drafts:', err);
      return [];
    }
  }, []);

  const saveDraft = useCallback(async (params: SaveDraftParams, silent = false): Promise<string | null> => {
    setIsSavingDraft(true);
    try {
      const saved = await EvidenceDraftService.saveDraft(params.userId, params.company, {
        id: params.activeDraftId || undefined,
        selectedCliente: params.selectedCliente,
        clienteNombre: params.clienteNombre || (params.selectedCliente ? 'Cliente' : 'Sin cliente asignado'),
        selectedSucursal: params.selectedSucursal,
        sucursalNombre: params.sucursalNombre || '',
        colaboradores: params.colaboradores,
        currentStep: params.currentStep,
        trabajos: params.trabajos as any,
      });

      setActiveDraftId(saved.id);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSavedAt(timeStr);
      await refreshDrafts(params.userId, params.company);
      setPendingDraftPrompt(null);

      if (!silent) {
        Alert.alert(
          'Borrador Guardado',
          `El progreso de la evidencia se guardó en tu dispositivo (${timeStr}). Puedes salir o continuar cuando gustes.`
        );
      }
      return saved.id;
    } catch (err) {
      console.error('Error guardando borrador:', err);
      if (!silent) {
        Alert.alert('Error', 'No se pudo guardar el borrador en la memoria local.');
      }
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  }, [refreshDrafts]);

  const deleteDraft = useCallback(async (userId: string, company: string, draftId: string) => {
    const doDelete = async () => {
      await EvidenceDraftService.deleteDraft(userId, company, draftId);
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
        setLastSavedAt(null);
      }
      if (pendingDraftPrompt?.id === draftId) {
        setPendingDraftPrompt(null);
      }
      await refreshDrafts(userId, company);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Deseas eliminar este borrador permanentemente?')) {
        await doDelete();
      }
    } else {
      Alert.alert('Eliminar Borrador', '¿Deseas eliminar este borrador permanentemente?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [activeDraftId, pendingDraftPrompt, refreshDrafts]);

  const openDraftsModal = useCallback(() => setDraftsModalVisible(true), []);
  const closeDraftsModal = useCallback(() => setDraftsModalVisible(false), []);
  const dismissPrompt = useCallback(() => setPendingDraftPrompt(null), []);

  return {
    draftsList,
    activeDraftId,
    setActiveDraftId,
    lastSavedAt,
    setLastSavedAt,
    draftsModalVisible,
    openDraftsModal,
    closeDraftsModal,
    pendingDraftPrompt,
    setPendingDraftPrompt,
    dismissPrompt,
    isSavingDraft,
    refreshDrafts,
    saveDraft,
    deleteDraft,
  };
}
