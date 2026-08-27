import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PerfilScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const { user, setUser, company } = useAuth();
  
  const [profilePhone, setProfilePhone] = useState(user?.telefono || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setProfilePhone(user.telefono || '');
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);

    try {
      const updates: any = {
        telefono: profilePhone.trim(),
      };
      
      if (profilePassword.trim().length > 0) {
        if (profilePassword.trim().length < 6) {
          Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
          setIsSavingProfile(false);
          return;
        }
        updates.password = profilePassword.trim();
      }

      // 1. Update in auth user
      if (updates.password) {
        const { error: authError } = await supabase.auth.updateUser({
          password: updates.password
        });
        if (authError) throw authError;
      }

      // 2. Update in usuarios table
      // Inttec
      const { error: errorInttec } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', user.id);
        
      if (errorInttec) throw errorInttec;

      // 3. Update local user state
      const updatedUser = { ...user, ...updates };
      delete updatedUser.password;
      
      setUser(updatedUser);
      if (company) {
        await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(updatedUser));
      }

      Alert.alert('Éxito', 'Perfil actualizado correctamente');
      setProfilePassword('');
      router.back();
    } catch (error: any) {
      console.error('Error al actualizar perfil:', error.message);
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: Spacing.three, padding: Spacing.one }}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Configuración</Text>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Mi Perfil</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
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

          <View style={{ marginTop: Spacing.four }}>
            <CustomButton
              title="Guardar Cambios"
              onPress={handleSaveProfile}
              loading={isSavingProfile}
              variant="primary"
            />
          </View>
        </View>

        {/* Apartado de Firma de Documentos para Administradores */}
        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginTop: Spacing.three }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.two }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="create-outline" size={24} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>Documentos y Firmas</Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                Revisa y firma digitalmente las cartas responsivas, comunicados y acuerdos asignados.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: scheme === 'dark' ? '#0f2b48' : '#e0f2fe',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: BorderRadius.medium,
              borderWidth: 1,
              borderColor: scheme === 'dark' ? '#0284c7' : '#bae6fd',
              marginTop: 4,
            }}
            onPress={() => router.push('/(admin)/documentos?tab=mis_documentos' as any)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="pencil" size={18} color="#0284c7" />
              <Text style={{ color: '#0284c7', fontWeight: 'bold', fontSize: 14 }}>
                Ir a Mis Documentos por Firmar
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#0284c7" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  content: {
    padding: Spacing.four,
  },
  card: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.four,
  },
});
