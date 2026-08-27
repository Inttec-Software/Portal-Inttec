import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { AuthService } from '@/services/supabase';
import PendingTasksPopover from '@/components/PendingTasksPopover';

interface ModuleConfig {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

const MODULES: ModuleConfig[] = [
  { id: 'ventas', name: 'Ventas', icon: 'cart', route: '/(admin)/ventas', color: '#ff6b6b' },
  { id: 'gastos', name: 'Gastos', icon: 'cash', route: '/(admin)/gastos', color: '#feca57' },
  { id: 'facturas_recibidas', name: 'Facturas Recibidas', icon: 'receipt', route: '/(admin)/facturas-recibidas', color: '#2e86de' },
  { id: 'cotizaciones', name: 'Cotizaciones', icon: 'document-text', route: '/(admin)/cotizaciones', color: '#54a0ff' },
  { id: 'tareas', name: 'Tareas', icon: 'checkbox-outline', route: '/(admin)/tareas', color: '#f39c12' },
  { id: 'inventario', name: 'Inventario', icon: 'cube', route: '/(admin)/inventario', color: '#48dbfb' },
  { id: 'empleados', name: 'Empleados', icon: 'people', route: '/(admin)/empleados', color: '#1dd1a1' },
  { id: 'vehiculos', name: 'Flota', icon: 'car', route: '/(admin)/vehiculos', color: '#ff9ff3' },
  { id: 'evidencias', name: 'Evidencias', icon: 'briefcase', route: '/(admin)/evidencias', color: '#ff5252' },
  { id: 'reportes', name: 'Reportes', icon: 'document-text', route: '/(admin)/reportes', color: '#10ac84' },
  { id: 'catalogos', name: 'Catálogos', icon: 'list', route: '/(admin)/catalogos', color: '#5f27cd' },
  { id: 'auditoria', name: 'Auditoría', icon: 'shield-checkmark', route: '/(admin)/auditoria-tarjeta', color: '#ff9f43' },
  { id: 'documentos', name: 'Documentos', icon: 'create-outline', route: '/(admin)/documentos', color: '#0284c7' },
  { id: 'ia', name: 'Chat IA', icon: 'sparkles', route: '/(admin)/chat-ia', color: '#2e86de' },
];

export default function AdminDashboardGrid() {
  const [showTasksPopover, setShowTasksPopover] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { user, company, changeCompany, setUser } = useAuth();

  const isMobile = width < 600;

  const handleModulePress = (route: string) => {
    router.replace(route as any);
  };

  const handleToggleCompany = async (nextCompany: 'inttec' | 'daravisa') => {
    if (changeCompany) {
      await changeCompany(nextCompany);
    }
  };
  
  const handleLogout = async () => {
    try {
      await AuthService.logout();
      setUser(null);
      router.replace('/');
    } catch (error) {
      console.error('Error logging out:', error);
      // Forzar logout limpiando usuario aunque falle el servicio
      setUser(null);
      router.replace('/');
    }
  };

  const gradientColors = scheme === 'dark' 
    ? ['#0f172a', '#1e293b'] as const 
    : ['#f8fafc', '#e2e8f0'] as const;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
      <LinearGradient colors={gradientColors} style={styles.container}>
        
        {/* Top Bar para Perfil, Empresa y Salir */}
        <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
          <View style={styles.topBarMainRow}>
            <View style={styles.userInfo}>
              <View style={[styles.avatar, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.avatarText}>{user?.nombre?.charAt(0) || 'A'}</Text>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                  Bienvenido,
                </Text>
                <Text style={[styles.userName, { color: scheme === 'dark' ? '#fff' : '#0f172a' }]} numberOfLines={1}>
                  {user?.nombre || 'Administrador'}
                </Text>
                <Text style={{ color: themeColors.primary, fontSize: 10, fontWeight: 'bold', marginTop: 1 }}>
                  {user?.rol || 'Rol'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {!isMobile && (
                <View style={[
                  styles.companySwitch,
                  { backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }
                ]}>
                  <TouchableOpacity
                    onPress={() => company !== 'inttec' && handleToggleCompany('inttec')}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      borderRadius: 18,
                      backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
                    }}>
                      INTTEC
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => company !== 'daravisa' && handleToggleCompany('daravisa')}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      borderRadius: 18,
                      backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
                    }}>
                      DARAVISA
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Notificaciones */}
              <TouchableOpacity
                onPress={() => setShowTasksPopover(true)}
                style={[
                  styles.logoutBtn,
                  { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,119,182,0.1)', borderRadius: 20 }
                ]}
              >
                <Ionicons name="notifications-outline" size={22} color={themeColors.text} />
              </TouchableOpacity>

              {/* Perfil */}
              <TouchableOpacity
                onPress={() => router.push('/(admin)/perfil')}
                style={[
                  styles.logoutBtn,
                  { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,119,182,0.1)', borderRadius: 20 }
                ]}
              >
                <Ionicons name="person-circle-outline" size={22} color={themeColors.accent} />
              </TouchableOpacity>
              
              {/* Salir */}
              <TouchableOpacity
                onPress={handleLogout}
                style={[
                  styles.logoutBtn,
                  { backgroundColor: scheme === 'dark' ? 'rgba(255,51,51,0.15)' : 'rgba(211,47,47,0.1)', borderRadius: 20 }
                ]}
              >
                <Ionicons name="log-out-outline" size={22} color={themeColors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Switch de Empresa solo en móvil */}
          {isMobile && (
            <View style={[
              styles.companySwitch,
              { backgroundColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
              { marginTop: 10, alignSelf: 'center' }
            ]}>
              <TouchableOpacity
                onPress={() => company !== 'inttec' && handleToggleCompany('inttec')}
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 18,
                  backgroundColor: company === 'inttec' ? themeColors.accent : 'transparent',
                  alignItems: 'center'
                }}
              >
                <Text style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: company === 'inttec' ? '#ffffff' : themeColors.textSecondary,
                }}>
                  INTTEC
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => company !== 'daravisa' && handleToggleCompany('daravisa')}
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 18,
                  backgroundColor: company === 'daravisa' ? themeColors.accent : 'transparent',
                  alignItems: 'center'
                }}
              >
                <Text style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: company === 'daravisa' ? '#ffffff' : themeColors.textSecondary,
                }}>
                  DARAVISA
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <PendingTasksPopover 
          visible={showTasksPopover} 
          onClose={() => setShowTasksPopover(false)} 
        />

        {/* Grid de Módulos */}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.gridContainer, { justifyContent: 'center' }]}>
            {MODULES.map((mod) => {
              const containerWidth = Math.min(width, 1200);
              const padding = 32;
              const availableWidth = containerWidth - padding;
              const columns = isMobile ? 2 : Math.min(6, Math.floor(availableWidth / 200));
              const itemWidth = Math.floor(availableWidth / columns) - 16;

              return (
                <TouchableOpacity
                  key={mod.id}
                  style={[
                    styles.moduleCard,
                    { 
                      width: itemWidth,
                      backgroundColor: scheme === 'dark' ? '#1e293b' : '#ffffff',
                      borderColor: scheme === 'dark' ? '#334155' : '#e2e8f0'
                    }
                  ]}
                  onPress={() => handleModulePress(mod.route)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: mod.color }]}>
                    <Ionicons name={mod.icon} size={28} color="#fff" />
                  </View>
                  <Text style={[
                    styles.moduleName, 
                    { color: scheme === 'dark' ? '#f1f5f9' : '#1e293b' }
                  ]} numberOfLines={1}>
                    {mod.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  topBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  topBarMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  companySwitch: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 2,
    alignItems: 'center',
    width: 160,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.two,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 140,
  },
  logoutBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.seven,
    alignItems: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 16,
    maxWidth: 1200,
    width: '100%',
  },
  moduleCard: {
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    ...Platform.select({
      web: {
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'pointer',
      } as any
    })
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  moduleName: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  }
});
