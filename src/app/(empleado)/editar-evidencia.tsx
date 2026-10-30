import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useEvidenciaForm } from '@/features/evidencias/hooks/useEvidenciaForm';
import EvidenciaFormView from '@/features/evidencias/components/EvidenciaFormView';

export default function EmpleadoEditarEvidenciaScreen() {
  const params = useLocalSearchParams<{ id?: string; draftId?: string }>();
  const form = useEvidenciaForm({
    isEditing: true,
    evidenceId: params.id,
    initialDraftId: params.draftId,
  });

  return <EvidenciaFormView form={form} isEditing />;
}
