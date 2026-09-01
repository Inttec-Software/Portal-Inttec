import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet, Platform, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DevToolsFAB from '@/components/DevToolsFAB';

export default function AdminLayout() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const router = useRouter();

  const [isHoveringHeader, setIsHoveringHeader] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsHoveringHeader(false);
  }, [pathname]);

  if (!user || (user.rol !== 'ADMIN' && user.rol !== 'DEV')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  const isDashboard = pathname === '/dashboard' || pathname === '/(admin)/dashboard' || pathname === '/perfil' || pathname === '/(admin)/perfil';

  // Odoo style top header
  const getModuleName = () => {
    const parts = pathname.split('/');
    let lastPart = parts[parts.length - 1];
    
    // Si el último segmento es un UUID (detalle), usar el segmento anterior
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(lastPart) && parts.length > 1) {
      lastPart = parts[parts.length - 2];
    }

    if (!lastPart || lastPart === 'dashboard') return 'Inicio';
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ');
  };

  const quickLinks = [
    { route: '/(admin)/ventas', icon: 'cart-outline', color: '#ff6b6b', name: 'Ventas' },
    { route: '/(admin)/facturacion', icon: 'receipt-outline', color: '#0984e3', name: 'Facturación CFDI' },
    { route: '/(admin)/gastos', icon: 'cash-outline', color: '#feca57', name: 'Gastos' },
    { route: '/(admin)/facturas-recibidas', icon: 'receipt-outline', color: '#2e86de', name: 'Facturas Recibidas' },
    { route: '/(admin)/cotizaciones', icon: 'document-text-outline', color: '#54a0ff', name: 'Cotizaciones' },
    { route: '/(admin)/tareas', icon: 'checkbox-outline', color: '#f39c12', name: 'Tareas' },
    { route: '/(admin)/inventario', icon: 'cube-outline', color: '#48dbfb', name: 'Inventario' },
    { route: '/(admin)/empleados', icon: 'people-outline', color: '#1dd1a1', name: 'Empleados' },
    { route: '/(admin)/vehiculos', icon: 'car-outline', color: '#ff9ff3', name: 'Flota' },
    { route: '/(admin)/evidencias', icon: 'briefcase-outline', color: '#ff5252', name: 'Evidencias' },
    { route: '/(admin)/reportes', icon: 'document-text-outline', color: '#10ac84', name: 'Reportes' },
    { route: '/(admin)/catalogos', icon: 'list-outline', color: '#5f27cd', name: 'Catálogos' },
    { route: '/(admin)/auditoria-tarjeta', icon: 'shield-checkmark-outline', color: '#ff9f43', name: 'Auditoría' },
    { route: '/(admin)/documentos', icon: 'create-outline', color: '#0284c7', name: 'Documentos' },
    { route: '/(admin)/chat-ia', icon: 'sparkles-outline', color: '#2e86de', name: 'Chat IA' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header estilo Odoo (Solo fuera del inicio) */}
      {!isDashboard && (
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            style={styles.headerTitleContainer}
            onPress={() => {
              setIsMenuOpen(false);
              if (pathname.includes('editar-gasto') || pathname.includes('formulario') || pathname.includes('nueva-cotizacion')) {
                router.back();
              } else {
                router.replace('/(admin)/dashboard');
              }
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

          <View style={{ flex: 1 }} />

          {/* Botón de Formulario (Solo en Gastos) */}
          {(pathname === '/gastos' || pathname === '/(admin)/gastos') && (
            <TouchableOpacity 
              style={[styles.menuButton, { marginRight: 4 }]} 
              onPress={() => {
                setIsMenuOpen(false);
                router.push('/(admin)/formulario');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="ticket-outline" size={26} color={themeColors.text} />
            </TouchableOpacity>
          )}

          {/* Botón de Menú Desplegable */}
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={() => setIsMenuOpen(!isMenuOpen)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={28} color={themeColors.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* Contenido Principal */}
      <View style={{ flex: 1, backgroundColor: themeColors.background, zIndex: 1 }}>
        <Slot />
      </View>

      {/* Dropdown Menu Overlay */}
      {!isDashboard && isMenuOpen && (
        <>
          <TouchableWithoutFeedback onPress={() => setIsMenuOpen(false)}>
            <View style={styles.dropdownOverlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.dropdownMenu, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <ScrollView style={{ maxHeight: 620 }} bounces={false}>
              {quickLinks.map((link, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border, borderBottomWidth: index === quickLinks.length - 1 ? 0 : 1 }]}
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
            </ScrollView>
          </View>
        </>
      )}

      <DevToolsFAB />
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
    paddingRight: 16,
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
