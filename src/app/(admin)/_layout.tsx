import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';

export default function AdminLayout() {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  if (!user || user.rol !== 'ADMIN') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return <Slot />;
}
