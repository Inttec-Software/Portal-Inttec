import { Stack, DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ForceUpdateScreen } from '@/components/ForceUpdateScreen';

export default function RootLayout() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    // Si es la versión web, no forzamos la actualización de la tienda
    if (Platform.OS === 'web') return;

    const checkVersion = async () => {
      try {
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
      } catch (err) {
        console.error('Error verificando actualización requerida:', err);
      }
    };
    checkVersion();
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
