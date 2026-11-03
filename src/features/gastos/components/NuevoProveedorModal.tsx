import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useGastoForm } from '../hooks/useGastoForm';

interface NuevoProveedorModalProps {
  form: ReturnType<typeof useGastoForm>;
  themeColors: any;
}

export default function NuevoProveedorModal({ form, themeColors }: NuevoProveedorModalProps) {
  const {
    modalNuevoProveedorVisible,
    setModalNuevoProveedorVisible,
    nuevoProvNombre,
    setNuevoProvNombre,
    nuevoProvRfc,
    setNuevoProvRfc,
    isSavingProv,
    handleCrearNuevoProveedor,
  } = form;

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={modalNuevoProveedorVisible}
      onRequestClose={() => setModalNuevoProveedorVisible(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four }}
        onPress={() => setModalNuevoProveedorVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 480 }}>
          <Pressable
            style={{ backgroundColor: themeColors.background, borderRadius: BorderRadius.large, padding: Spacing.four, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                <Ionicons name="business" size={22} color={themeColors.primary} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: themeColors.text }}>Nuevo Proveedor</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setModalNuevoProveedorVisible(false);
                  setNuevoProvNombre('');
                  setNuevoProvRfc('');
                }}
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre o Razón Social *"
                placeholder="Ej. Papelería Lumen, OXXO, etc."
                value={nuevoProvNombre}
                onChangeText={setNuevoProvNombre}
                iconName="business-outline"
              />

              <CustomInput
                label="RFC (Opcional)"
                placeholder="Ej. LUM951010AB1"
                value={nuevoProvRfc}
                onChangeText={setNuevoProvRfc}
                autoCapitalize="characters"
                iconName="card-outline"
              />

              <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
                <CustomButton
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => {
                    setModalNuevoProveedorVisible(false);
                    setNuevoProvNombre('');
                    setNuevoProvRfc('');
                  }}
                  style={{ flex: 1 }}
                />
                <CustomButton
                  title={isSavingProv ? 'Guardando...' : 'Guardar'}
                  onPress={handleCrearNuevoProveedor}
                  loading={isSavingProv}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
