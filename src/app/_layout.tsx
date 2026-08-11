import { Stack, DarkTheme, DefaultTheme, ThemeProvider, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase, CompanyService, EnvService } from '@/services/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
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
        // Cargar empresa y entorno activos ANTES de renderizar y consultar versión
        await CompanyService.loadSavedCompany();
        await EnvService.loadSavedEnv();
        
        // Si es la versión web, no forzamos la actualización de la tienda
        if (Platform.OS !== 'web') {
          const { data, error } = await supabase
            .from('app_settings')
            .select('min_version_code')
            .eq('id', 1)
            .single();

          if (data && data.min_version_code) {
            const currentVersionCode = Constants.expoConfig?.android?.versionCode || 1;
            if (currentVersionCode < data.min_version_code) {
              setNeedsUpdate(true);
            }
          }
        }
      } catch (err) {
        console.error('Error durante inicialización:', err);
      } finally {
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
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
  );
}
