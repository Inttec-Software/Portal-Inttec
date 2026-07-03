import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { AuthService } from '@/services/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function EmpleadoLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      try {
        const user = await AuthService.getCurrentUser();
        if (!active) return;
        if (!user) {
          router.replace('/');
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error checking employee auth:', err);
        if (active) router.replace('/');
      }
    };

    checkAuth();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return <Slot />;
}
