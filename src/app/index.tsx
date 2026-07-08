import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { AuthService } from '@/services/supabase';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { isLoading, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const passwordInputRef = useRef<any>(null);

  // Validaciones locales
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // AuthContext maneja el checkSession automáticamente

  const handleLogin = async () => {
    // Reset errores
    setEmailError('');
    setPasswordError('');
    setErrorMsg('');

    let valid = true;

    if (!email) {
      setEmailError('El correo es requerido');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Formato de correo inválido');
      valid = false;
    }

    if (!password) {
      setPasswordError('La contraseña es requerida');
      valid = false;
    }

    if (!valid) return;

    setIsSubmitting(true);
    try {
      const user = await AuthService.login(email, password);
      setUser(user);
      // El useEffect de AuthContext se encargará de hacer el router.replace() al instante
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={[styles.loadingText, { color: themeColors.text }]}>Cargando aplicación...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { backgroundColor: themeColors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.logoContainer, { backgroundColor: '#ffffff' }]}>
            <Image
              source={require('@/assets/images/logo.jpeg')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>INTTEC</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Control de Gastos
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>Iniciar Sesión</Text>
          
          {errorMsg ? (
            <View style={[styles.errorAlert, { backgroundColor: themeColors.danger + '15' }]}>
              <Ionicons name="alert-circle" size={20} color={themeColors.danger} />
              <Text style={[styles.errorAlertText, { color: themeColors.danger }]}>{errorMsg}</Text>
            </View>
          ) : null}

          <CustomInput
            label="Correo Electrónico"
            placeholder="ejemplo@inttec.com"
            keyboardType="email-address"
            autoCapitalize="none"
            iconName="mail-outline"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError('');
            }}
            error={emailError}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            blurOnSubmit={false}
          />

          <CustomInput
            ref={passwordInputRef}
            label="Contraseña"
            placeholder="••••••••"
            secureTextEntry
            isPassword
            iconName="lock-closed-outline"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError('');
            }}
            error={passwordError}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          <CustomButton
            title="Ingresar"
            onPress={handleLogin}
            loading={isSubmitting}
            style={styles.submitBtn}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.large,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: Spacing.half,
  },
  card: {
    borderRadius: BorderRadius.large,
    padding: Spacing.four,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.three,
    gap: Spacing.one,
  },
  errorAlertText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  submitBtn: {
    marginTop: Spacing.two,
  },
});
