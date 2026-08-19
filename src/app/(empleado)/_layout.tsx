import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet, Platform, TouchableWithoutFeedback, ScrollView, Alert } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '@/services/supabase';

export default function EmpleadoLayout() {
  const { user, setUser } = useAuth();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHoveringHeader, setIsHoveringHeader] = useState(false);

  useEffect(() => {
    setIsHoveringHeader(false);
  }, [pathname]);

  if (!user || (user.rol !== 'EMPLEADO' && user.rol !== 'DEV')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  const getModuleName = () => {
    const parts = pathname.split('/');
    let lastPart = parts[parts.length - 1];

    // Si el último segmento es un UUID (detalle), usar el segmento anterior
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(lastPart) && parts.length > 1) {
      lastPart = parts[parts.length - 2];
    }

    if (!lastPart || lastPart === 'gastos' || lastPart === 'dashboard') return 'Gastos';
    if (lastPart === 'chat-ia') return 'Chat IA';
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ');
  };

  const quickLinks = [
    { route: '/(empleado)/gastos', icon: 'cash-outline', color: '#feca57', name: 'Gastos' },
    { route: '/(empleado)/asistencia', icon: 'time-outline', color: '#1dd1a1', name: 'Asistencia' },
    { route: '/(empleado)/evidencia', icon: 'briefcase-outline', color: '#ff5252', name: 'Evidencias' },
    { route: '/(empleado)/retiro-material', icon: 'cart-outline', color: '#ff7f50', name: 'Retiro Material' },
    { route: '/(empleado)/devoluciones', icon: 'return-up-back-outline', color: '#2ed573', name: 'Devoluciones' },
    { route: '/(empleado)/vehiculos', icon: 'car-outline', color: '#ff9ff3', name: 'Vehículos' },
    { route: '/(empleado)/tareas', icon: 'checkbox-outline', color: '#f39c12', name: 'Tareas' },
    { route: '/(empleado)/chat-ia', icon: 'sparkles-outline', color: '#2e86de', name: 'Chat IA' },
    { route: '/(empleado)/perfil', icon: 'person-outline', color: '#5f27cd', name: 'Perfil' },
  ];

  const handleLogout = async () => {
    setIsMenuOpen(false);
    const performLogout = async () => {
      await AuthService.logout();
      setUser(null);
      router.replace('/');
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
      if (confirm) {
        await performLogout();
      }
    } else {
      Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Sesión', style: 'destructive', onPress: performLogout },
      ]);
    }
  };

  const isHome = getModuleName() === 'Gastos';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header estilo Odoo (Visible en TODAS las pantallas del empleado) */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        {isHome ? (
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              {getModuleName()}
            </Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.headerTitleContainer}
            onPress={() => {
              setIsMenuOpen(false);
              router.replace('/(empleado)/gastos');
            }}
            // @ts-ignore
            onMouseEnter={() => setIsHoveringHeader(true)}
            // @ts-ignore
            onMouseLeave={() => setIsHoveringHeader(false)}
            activeOpacity={0.7}
          >
            {isHoveringHeader || Platform.OS !== 'web' ? (
              <Ionicons name="arrow-back" size={24} color={themeColors.text} style={{ marginRight: 8 }} />
            ) : null}
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              {isHoveringHeader && Platform.OS === 'web' ? 'Volver al Inicio' : getModuleName()}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        {/* Botón de Menú Desplegable */}
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => setIsMenuOpen(!isMenuOpen)}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={28} color={themeColors.text} />
        </TouchableOpacity>
      </View>

      {/* Contenido Principal */}
      <View style={{ flex: 1, backgroundColor: themeColors.background, zIndex: 1 }}>
        <Slot />
      </View>

      {/* Dropdown Menu Overlay */}
      {isMenuOpen && (
        <>
          <TouchableWithoutFeedback onPress={() => setIsMenuOpen(false)}>
            <View style={styles.dropdownOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.dropdownMenu, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <ScrollView style={{ maxHeight: 620 }} bounces={false}>
              {quickLinks.map((link, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border, borderBottomWidth: 1 }]}
                  onPress={() => {
                    setIsMenuOpen(false);
                    router.replace(link.route as any);
                  }}
                >
                  <View style={[styles.dropdownIconContainer, { backgroundColor: link.color + '15' }]}>
                    <Ionicons name={link.icon as any} size={20} color={link.color} />
                  </View>
                  <Text style={[styles.dropdownText, { color: themeColors.text }]}>{link.name}</Text>
                </TouchableOpacity>
              ))}
              
              {/* Salir Sesion */}
              <TouchableOpacity
                style={[styles.dropdownItem, { borderBottomWidth: 0, marginTop: Spacing.one }]}
                onPress={handleLogout}
              >
                <View style={[styles.dropdownIconContainer, { backgroundColor: Colors.light.danger + '15' }]}>
                  <Ionicons name="log-out-outline" size={20} color={Colors.light.danger} />
                </View>
                <Text style={[styles.dropdownText, { color: Colors.light.danger }]}>Salir Sesión</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  menuButton: {
    padding: 8,
  },
  dropdownOverlay: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: 5,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 220,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
  },
  dropdownIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '500',
  }
});
