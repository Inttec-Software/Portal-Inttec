import React from 'react';
import { View } from 'react-native';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';
import { AdminGastosMainList } from './AdminGastosMainList';
import { AdminGastoReviewModal } from './AdminGastoReviewModal';
import { AdminGastoQuickEditModals } from './AdminGastoQuickEditModals';
import { AdminLinkSaleModal } from './AdminLinkSaleModal';
import { AdminExtraModals } from './AdminExtraModals';
import { ProyectoFormModal } from '@/features/proyectos/components/ProyectoFormModal';
import { AssignProyectoModal } from '@/features/proyectos/components/AssignProyectoModal';

export function AdminGastosView() {
  const vm = useAdminGastos();
  const {
    themeColors,
    proyectos,
    clientesCatalog,
    sucursalesCatalog,
    proyectoFormModalVisible,
    setProyectoFormModalVisible,
    editingProyecto,
    setEditingProyecto,
    isSavingProyecto,
    handleSaveProyecto,
    assignProyectoModalVisible,
    setAssignProyectoModalVisible,
    gastoToAssignProyecto,
    setGastoToAssignProyecto,
    isAssigningProyecto,
    handleConfirmAssignProyecto,
    handleOpenNewProyecto,
    formatCurrency,
  } = vm;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={{ flex: 1 }}>
        <AdminGastosMainList vm={vm} />
        <AdminGastoReviewModal vm={vm} />
        <AdminGastoQuickEditModals vm={vm} />
        <AdminLinkSaleModal vm={vm} />
        <AdminExtraModals vm={vm} />

        <ProyectoFormModal
          visible={proyectoFormModalVisible}
          editingProyecto={editingProyecto}
          clientesCatalog={clientesCatalog}
          sucursalesCatalog={sucursalesCatalog}
          isSaving={isSavingProyecto}
          themeColors={themeColors}
          onClose={() => {
            setProyectoFormModalVisible(false);
            setEditingProyecto(null);
          }}
          onSave={handleSaveProyecto}
        />

        <AssignProyectoModal
          visible={assignProyectoModalVisible}
          gasto={gastoToAssignProyecto}
          proyectos={proyectos}
          isSaving={isAssigningProyecto}
          themeColors={themeColors}
          formatCurrency={formatCurrency}
          onClose={() => {
            setAssignProyectoModalVisible(false);
            setGastoToAssignProyecto(null);
          }}
          onConfirm={handleConfirmAssignProyecto}
          onOpenCreateProyecto={() => {
            setAssignProyectoModalVisible(false);
            handleOpenNewProyecto();
          }}
        />
      </View>
    </View>
  );
}
