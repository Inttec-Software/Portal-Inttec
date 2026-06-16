import { Stack, DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

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
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(empleado)/dashboard" />
        <Stack.Screen name="(empleado)/formulario" />
        <Stack.Screen name="(admin)/dashboard" />
        <Stack.Screen name="(admin)/catalogos" />
        <Stack.Screen name="(admin)/evidencias" />
      </Stack>
    </ThemeProvider>
  );
}
