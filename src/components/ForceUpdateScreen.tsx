import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity, Image } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

// ID de la aplicación en la Play Store
const STORE_LINK = 'market://details?id=com.alexisef23.appmovil';

export const ForceUpdateScreen = () => {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  const handleUpdatePress = async () => {
    try {
      const supported = await Linking.canOpenURL(STORE_LINK);
      if (supported) {
        await Linking.openURL(STORE_LINK);
      } else {
        // Fallback a la web si no puede abrir la Play Store nativamente
        await Linking.openURL('https://play.google.com/store/apps/details?id=com.alexisef23.appmovil');
      }
    } catch (error) {
      console.error('Error al abrir la tienda:', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-download-outline" size={80} color={themeColors.primary} />
        </View>

        <Text style={[styles.title, { color: themeColors.text }]}>
          Actualización Obligatoria
        </Text>

        <Text style={[styles.description, { color: themeColors.textSecondary || themeColors.text }]}>
          Hay una nueva versión de la aplicación disponible. Para seguir utilizando el servicio de manera correcta y segura, es necesario que actualices la app a la última versión.
        </Text>

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: themeColors.textSecondary || themeColors.text }]}>
            Versión actual: {currentVersion}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: themeColors.primary }]}
          onPress={handleUpdatePress}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Actualizar ahora</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  versionContainer: {
    marginBottom: 30,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
