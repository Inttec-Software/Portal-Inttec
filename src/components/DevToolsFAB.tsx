import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSegments } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';

export default function DevToolsFAB() {
  const { user, env, changeEnv } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  
  const [isOpen, setIsOpen] = useState(false);

  if (user?.rol !== 'DEV') return null;

  const isAdminView = segments[0] === '(admin)' || segments[0] === 'dashboard';

  return (
    <View style={styles.container}>
      {isOpen && (
        <View style={[styles.menu, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
          <Text style={[styles.title, { color: themeColors.text }]}>DEV TOOLS</Text>
          
          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: env === 'cloud' ? themeColors.primary + '15' : Colors.light.danger + '15' }]}
            onPress={() => {
              changeEnv(env === 'cloud' ? 'test' : 'cloud');
            }}
          >
            <Ionicons name={env === 'cloud' ? "cloud-outline" : "server-outline"} size={18} color={env === 'cloud' ? themeColors.primary : Colors.light.danger} />
            <Text style={{ fontSize: 12, marginLeft: 8, color: env === 'cloud' ? themeColors.primary : Colors.light.danger, fontWeight: '600' }}>
              DB: {env === 'cloud' ? 'CLOUD' : 'TEST'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: themeColors.accent + '15' }]}
            onPress={() => {
              if (isAdminView) {
                router.replace('/(empleado)/gastos' as any);
              } else {
                router.replace('/(admin)/dashboard');
              }
              setIsOpen(false);
            }}
          >
            <Ionicons name="swap-horizontal-outline" size={18} color={themeColors.accent} />
            <Text style={{ fontSize: 12, marginLeft: 8, color: themeColors.accent, fontWeight: '600' }}>
              {isAdminView ? 'Cambiar a Empleado' : 'Cambiar a Admin'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: '#8b5cf6' }]} 
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.8}
      >
        <Ionicons name={isOpen ? "close" : "code-slash"} size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 20 : 170,
    right: 20,
    zIndex: 9999,
    alignItems: 'flex-end',
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  menu: {
    marginBottom: 10,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    gap: Spacing.two,
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  }
});
