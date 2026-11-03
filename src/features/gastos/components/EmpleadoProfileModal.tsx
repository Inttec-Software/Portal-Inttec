import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { styles } from './empleadoGastosStyles';
import { useEmpleadoGastos } from '../hooks/useEmpleadoGastos';

interface EmpleadoProfileModalProps {
  emp: ReturnType<typeof useEmpleadoGastos>;
  themeColors: any;
}

export default function EmpleadoProfileModal({ emp, themeColors }: EmpleadoProfileModalProps) {
  const {
    user,
    profileModalVisible,
    setProfileModalVisible,
    profilePhone,
    setProfilePhone,
    profilePassword,
    setProfilePassword,
    isSavingProfile,
    handleSaveProfile,
  } = emp;

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={profileModalVisible}
      onRequestClose={() => setProfileModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Mi Perfil</Text>
            <TouchableOpacity
              onPress={() => {
                setProfileModalVisible(false);
                setProfilePassword('');
              }}
            >
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalDetails}>
              <CustomInput
                label="Nombre Completo"
                value={user?.nombre || ''}
                editable={false}
                style={{ opacity: 0.7 }}
              />

              <CustomInput
                label="Correo Electrónico"
                value={user?.email || ''}
                editable={false}
                autoCapitalize="none"
                style={{ opacity: 0.7 }}
              />

              <CustomInput
                label="Rol"
                value={user?.rol || ''}
                editable={false}
                style={{ opacity: 0.7 }}
              />

              <CustomInput
                label="Teléfono"
                placeholder="Ej. 5512345678"
                value={profilePhone}
                onChangeText={setProfilePhone}
                keyboardType="phone-pad"
              />

              <CustomInput
                label="Nueva Contraseña (Opcional)"
                placeholder="Dejar en blanco para no cambiar"
                value={profilePassword}
                onChangeText={setProfilePassword}
                isPassword
                autoCapitalize="none"
              />

              <View style={{ marginTop: Spacing.two }}>
                <CustomButton
                  title="Guardar Cambios"
                  onPress={handleSaveProfile}
                  loading={isSavingProfile}
                  variant="primary"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
