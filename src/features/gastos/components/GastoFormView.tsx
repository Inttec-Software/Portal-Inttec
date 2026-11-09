import React from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import StepIndicator from '@/components/StepIndicator';
import ImageViewerModal from '@/components/ImageViewerModal';
import { useGastoForm } from '../hooks/useGastoForm';
import { GastoFormRole, GastoFormMode } from '../types';
import { styles } from './gastoFormStyles';
import Paso1Comprobantes from './Paso1Comprobantes';
import Paso2Detalles from './Paso2Detalles';
import Paso3Categorizacion from './Paso3Categorizacion';
import GastoSplitModal from './GastoSplitModal';
import NuevoProveedorModal from './NuevoProveedorModal';

interface GastoFormViewProps {
  role: GastoFormRole;
  mode: GastoFormMode;
  gastoId?: string;
}

export default function GastoFormView({ role, mode, gastoId }: GastoFormViewProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const form = useGastoForm({ role, mode, gastoId });

  const {
    currentStep,
    setCurrentStep,
    ticketFiles,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    activePreviewUrl,
    setActivePreviewUrl,
    closeAllDropdowns,
  } = form;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {role === 'admin' && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Registrar Gasto</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            mode === 'create' ? { paddingBottom: 120 } : undefined,
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
        >
          <Pressable onPress={closeAllDropdowns} style={{ flex: 1 }}>
            <StepIndicator
              currentStep={currentStep}
              steps={mode === 'create' ? ['Datos', 'Clasificación', 'Comprobante'] : ['Evidencia', 'Detalles', 'Categoría']}
              onStepPress={(step) => {
                if (mode === 'create') {
                  if (step < currentStep || true) {
                    setCurrentStep(step);
                  }
                } else {
                  if (step < currentStep) {
                    setCurrentStep(step);
                  }
                }
              }}
            />

            {currentStep === 1 && <Paso1Comprobantes form={form} themeColors={themeColors} />}
            {currentStep === 2 && <Paso2Detalles form={form} themeColors={themeColors} />}
            {currentStep === 3 && <Paso3Categorizacion form={form} themeColors={themeColors} />}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={activePreviewUrl}
        imageUrls={
          ticketFiles.length > 0
            ? ticketFiles.filter(f => f.ext !== 'pdf').map(f => f.uri)
            : activePreviewUrl
            ? [activePreviewUrl]
            : []
        }
        initialIndex={viewerInitialIndex}
        onClose={() => {
          setViewerVisible(false);
          setActivePreviewUrl(null);
        }}
      />

      {mode === 'create' && <GastoSplitModal form={form} themeColors={themeColors} />}

      {role === 'admin' && <NuevoProveedorModal form={form} themeColors={themeColors} />}
    </View>
  );
}
