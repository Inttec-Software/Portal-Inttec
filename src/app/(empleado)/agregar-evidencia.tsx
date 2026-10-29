import React, { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useHeaderAction } from '@/context/HeaderActionContext';
import { useEvidenciaForm } from '@/features/evidencias/hooks/useEvidenciaForm';
import EvidenciaFormView from '@/features/evidencias/components/EvidenciaFormView';
import BorradoresHeaderAction from '@/features/evidencias/components/BorradoresHeaderAction';

export default function AgregarEvidenciaScreen() {
  const params = useLocalSearchParams<{ draftId?: string }>();
  const form = useEvidenciaForm({ initialDraftId: params.draftId });
  const { setHeaderRight } = useHeaderAction();

  // Inyectar la acción de borradores directamente en el encabezado global de la aplicación
  useEffect(() => {
    setHeaderRight(
      <BorradoresHeaderAction
        count={form.draftsList.length}
        onPress={form.openDraftsModal}
      />
    );
    return () => setHeaderRight(null);
  }, [form.draftsList.length, form.openDraftsModal, setHeaderRight]);

  return <EvidenciaFormView form={form} />;
}
