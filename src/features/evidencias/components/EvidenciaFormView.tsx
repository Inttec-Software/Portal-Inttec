import React from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import StepIndicator from '@/components/StepIndicator';
import ImageViewerModal from '@/components/ImageViewerModal';
import Paso1Generales from './Paso1Generales';
import Paso2Revision from './Paso2Revision';
import DraftsModal from './DraftsModal';
import { useEvidenciaForm } from '../hooks/useEvidenciaForm';

interface EvidenciaFormViewProps {
  form: ReturnType<typeof useEvidenciaForm>;
  isEditing?: boolean;
}

export default function EvidenciaFormView({ form, isEditing = false }: EvidenciaFormViewProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    company,
    changeCompany,
    currentStep,
    nextStep,
    prevStep,
    formErrors,
    mainScrollRef,
    fieldPositions,
    stepContainerY,
    clientes,
    sucursalesCliente,
    selectedCliente,
    setSelectedCliente,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    selectedSucursal,
    setSelectedSucursal,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    empleadosDisponibles,
    selectedColaboradores,
    showColaboradorModal,
    setShowColaboradorModal,
    colaboradorSearch,
    setColaboradorSearch,
    handleAddColaborador,
    handleRemoveColaborador,
    trabajos,
    handleAddTrabajo,
    handleRemoveTrabajo,
    handleCloneTrabajo,
    handleUpdateTrabajoField,
    handleUpdateMaterialesUsados,
    handleMejorarRedaccion,
    getProductosDisponiblesParaTrabajo,
    processingPhotoTarget,
    selectedPhoto,
    viewerVisible,
    handleOpenPhoto,
    handleClosePhoto,
    handleCapturePhoto,
    handleSelectGallery,
    handleRemovePhoto,
    loadingModalVisible,
    loadingTitle,
    loadingMessage,
    loadingCurrent,
    loadingTotal,
    draftsList,
    activeDraftId,
    draftsModalVisible,
    closeDraftsModal,
    pendingDraftPrompt,
    dismissPrompt,
    isSavingDraft,
    handleSaveDraft,
    handleLoadDraft,
    handleDeleteDraft,
    handleStartNewDraft,
    isSubmitting,
    handleExportPDF,
    handleSaveToDatabase,
  } = form;

  const clienteObj = clientes.find((c) => c.id === selectedCliente);
  const sucObj = sucursalesCliente.find((s) => s.id === selectedSucursal);
  const clienteNombre = clienteObj ? clienteObj.nombre : selectedCliente;
  const sucursalNombre = sucObj ? sucObj.nombre : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      {/* Switch de Empresa */}
      <View
        style={[
          styles.companySwitch,
          {
            backgroundColor:
              scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => company !== 'inttec' && changeCompany && changeCompany('inttec')}
          style={[
            styles.companyTab,
            { backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent' },
          ]}
        >
          <Text
            style={[
              styles.companyText,
              { color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary },
            ]}
          >
            INTTEC
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => company !== 'daravisa' && changeCompany && changeCompany('daravisa')}
          style={[
            styles.companyTab,
            { backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent' },
          ]}
        >
          <Text
            style={[
              styles.companyText,
              { color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary },
            ]}
          >
            DARAVISA
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sugerencia de Borrador Reciente */}
      {pendingDraftPrompt && (
        <View
          style={[
            styles.promptBanner,
            {
              backgroundColor: themeColors.accent + '15',
              borderColor: themeColors.accent,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.promptTitle, { color: themeColors.accent }]}>
              Borrador pendiente detectado
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.text, marginTop: 2 }}>
              ¿Deseas continuar con "{pendingDraftPrompt.clienteNombre || 'Cliente'}"?
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={dismissPrompt}
              style={[styles.promptBtn, { backgroundColor: themeColors.background }]}
            >
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Descartar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleLoadDraft(pendingDraftPrompt)}
              style={[styles.promptBtn, { backgroundColor: themeColors.accent }]}
            >
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>Cargar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Contenido Principal con Scroll */}
      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <StepIndicator
          currentStep={currentStep}
          steps={['Información y Evidencias', 'Revisión y Finalizar']}
        />

        {currentStep === 1 ? (
          <Paso1Generales
            clientes={clientes}
            selectedCliente={selectedCliente}
            setSelectedCliente={setSelectedCliente}
            clienteSearch={clienteSearch}
            setClienteSearch={setClienteSearch}
            showCliDropdown={showCliDropdown}
            setShowCliDropdown={setShowCliDropdown}
            sucursalesCliente={sucursalesCliente}
            selectedSucursal={selectedSucursal}
            setSelectedSucursal={setSelectedSucursal}
            sucursalSearch={sucursalSearch}
            setSucursalSearch={setSucursalSearch}
            showSucursalDropdown={showSucursalDropdown}
            setShowSucursalDropdown={setShowSucursalDropdown}
            formErrors={formErrors}
            fieldPositions={fieldPositions}
            stepContainerY={stepContainerY}
            empleadosDisponibles={empleadosDisponibles}
            selectedColaboradores={selectedColaboradores}
            showColaboradorModal={showColaboradorModal}
            setShowColaboradorModal={setShowColaboradorModal}
            colaboradorSearch={colaboradorSearch}
            setColaboradorSearch={setColaboradorSearch}
            onAddColaborador={handleAddColaborador}
            onRemoveColaborador={handleRemoveColaborador}
            trabajos={trabajos}
            onAddTrabajo={handleAddTrabajo}
            onRemoveTrabajo={handleRemoveTrabajo}
            onCloneTrabajo={handleCloneTrabajo}
            onUpdateTrabajoField={handleUpdateTrabajoField}
            onUpdateMateriales={handleUpdateMaterialesUsados}
            onMejorarRedaccion={handleMejorarRedaccion}
            getProductosDisponiblesParaTrabajo={getProductosDisponiblesParaTrabajo}
            processingPhotoTarget={processingPhotoTarget}
            onCapturePhoto={handleCapturePhoto}
            onSelectGallery={handleSelectGallery}
            onRemovePhoto={handleRemovePhoto}
            onOpenPhoto={handleOpenPhoto}
            onNext={nextStep}
          />
        ) : (
          <Paso2Revision
            clienteNombre={clienteNombre}
            sucursalNombre={sucursalNombre}
            colaboradores={selectedColaboradores}
            trabajos={trabajos}
            isSubmitting={isSubmitting}
            isSavingDraft={isSavingDraft}
            isEditing={isEditing}
            onPrev={prevStep}
            onExportPDF={handleExportPDF}
            onSaveToDatabase={handleSaveToDatabase}
            onSaveDraft={() => handleSaveDraft(false)}
          />
        )}
      </ScrollView>

      {/* Modal de Borradores */}
      <DraftsModal
        visible={draftsModalVisible}
        onClose={closeDraftsModal}
        drafts={draftsList}
        activeDraftId={activeDraftId}
        onLoadDraft={handleLoadDraft}
        onDeleteDraft={handleDeleteDraft}
        onStartNewDraft={handleStartNewDraft}
        onSaveCurrentDraft={() => handleSaveDraft(false)}
        isSavingDraft={isSavingDraft}
      />

      {/* Visor de Fotos Ampliado */}
      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={selectedPhoto}
        onClose={handleClosePhoto}
      />

      {/* Modal de Progreso / Carga */}
      <Modal
        visible={loadingModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <View
            style={[
              styles.loadingBox,
              { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
            ]}
          >
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingTitle, { color: themeColors.text }]}>{loadingTitle}</Text>
            {loadingMessage ? (
              <Text style={[styles.loadingMessage, { color: themeColors.textSecondary }]}>
                {loadingMessage}
              </Text>
            ) : null}
            {loadingTotal > 0 && (
              <Text style={[styles.loadingCounter, { color: themeColors.primary }]}>
                {loadingCurrent} de {loadingTotal}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  companySwitch: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 2,
    alignItems: 'center',
    width: 200,
    alignSelf: 'center',
    marginBottom: 8,
    marginTop: 6,
  },
  companyTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 18,
    alignItems: 'center',
  },
  companyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  promptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  promptTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  promptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.small,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  loadingMessage: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  loadingCounter: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
});
