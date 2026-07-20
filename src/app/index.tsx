import React, { useState, useRef } from 'react';
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
  TouchableOpacity,
} from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { AuthService } from '@/services/supabase';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { isLoading, setUser, company, changeCompany } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const passwordInputRef = useRef<any>(null);

  // Validaciones locales
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleLogin = async () => {
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

  const gradientColors = scheme === 'dark'
    ? [themeColors.background, '#13283c'] as const
    : ['#f4f6f9', '#dce3ec'] as const;

  const cardBackground = scheme === 'dark'
    ? 'rgba(27, 73, 101, 0.45)'
    : 'rgba(255, 255, 255, 0.75)';

  const cardBorderColor = scheme === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(13, 27, 42, 0.08)';

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={company === 'daravisa' ? require('@/assets/images/logo_daravisa.png') : require('@/assets/images/logo.jpeg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>INTTEC & DARAVISA</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {company === 'daravisa' ? 'Portal de Gestión' : 'Control de Gastos'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBackground, borderColor: cardBorderColor }]}>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Iniciar Sesión</Text>
            
            {/* Selector de Empresa */}
            <View style={styles.companySelectorContainer}>
              <TouchableOpacity
                style={[
                  styles.companySelectorBtn,
                  company === 'inttec' && { backgroundColor: themeColors.accent }
                ]}
                onPress={() => changeCompany('inttec')}
              >
                <Text style={[
                  styles.companySelectorText,
                  { color: company === 'inttec' ? '#ffffff' : themeColors.text }
                ]}>
                  INTTEC
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.companySelectorBtn,
                  company === 'daravisa' && { backgroundColor: themeColors.accent }
                ]}
                onPress={() => changeCompany('daravisa')}
              >
                <Text style={[
                  styles.companySelectorText,
                  { color: company === 'daravisa' ? '#ffffff' : themeColors.text }
                ]}>
                  DARAVISA
                </Text>
              </TouchableOpacity>
            </View>

            {errorMsg ? (
              <View style={[styles.errorAlert, { backgroundColor: themeColors.danger + '15' }]}>
                <Ionicons name="alert-circle" size={20} color={themeColors.danger} />
                <Text style={[styles.errorAlertText, { color: themeColors.danger }]}>{errorMsg}</Text>
              </View>
            ) : null}

            <CustomInput
              label="Correo Electrónico"
              placeholder={company === 'daravisa' ? 'ejemplo@daravisa.com' : 'ejemplo@inttec.com'}
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
    </LinearGradient>
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
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  logoImage: {
    width: '90%',
    height: '90%',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: Spacing.half,
  },
  card: {
    borderRadius: BorderRadius.large,
    padding: Spacing.four,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
    // Efecto de desenfoque traslúcido para web
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any
    })
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
  companySelectorContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.medium,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 4,
    marginBottom: Spacing.three,
  },
  companySelectorBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.medium,
  },
  companySelectorText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
