import { Stack, DarkTheme, DefaultTheme, ThemeProvider, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase, CompanyService, EnvService } from '@/services/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ForceUpdateScreen } from '@/components/ForceUpdateScreen';

// Prevent auto-hide of splash screen
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Cargar empresa y entorno activos en paralelo
        await Promise.all([
          CompanyService.loadSavedCompany(),
          EnvService.loadSavedEnv(),
        ]);
      } catch (err) {
        console.error('Error cargando configuración local:', err);
      } finally {
        // Desbloquear interfaz y ocultar Splash Screen inmediatamente
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }

      // Verificación de versión en segundo plano (sin bloquear el arranque ni el Splash)
      if (Platform.OS !== 'web') {
        try {
          const versionPromise = supabase
            .from('app_settings')
            .select('min_version_code')
            .eq('id', 1)
            .single();

          const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error('Version check timeout') }), 2500)
          );

          const { data } = await Promise.race([versionPromise, timeoutPromise]);

          if (data?.min_version_code) {
            const currentVersionCode = Constants.expoConfig?.android?.versionCode || 1;
            if (currentVersionCode < data.min_version_code) {
              setNeedsUpdate(true);
            }
          }
        } catch (verErr) {
          console.warn('Verificación de versión secundaria falló o expiró:', verErr);
        }
      }
    };
    
    initApp();
  }, []);

  const customTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: themeColors.background,
      primary: themeColors.primary,
      card: themeColors.backgroundElement,
      text: themeColors.text,
      border: themeColors.border,
      notification: themeColors.accent,
    },
  };

  if (!isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={customTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {needsUpdate ? (
          <ForceUpdateScreen />
        ) : (
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="explore" />
              <Stack.Screen name="(empleado)" />
              <Stack.Screen name="(admin)" />
            </Stack>
          </AuthProvider>
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
