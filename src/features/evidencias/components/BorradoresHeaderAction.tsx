import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface BorradoresHeaderActionProps {
  count: number;
  onPress: () => void;
}

export default function BorradoresHeaderAction({ count, onPress }: BorradoresHeaderActionProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.btn,
        {
          backgroundColor: themeColors.accent + '20',
          borderColor: themeColors.accent,
        },
      ]}
    >
      <Ionicons name="folder-open-outline" size={16} color={themeColors.accent} />
      <Text style={[styles.text, { color: themeColors.accent }]}>
        Borradores{count > 0 ? ` (${count})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginRight: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
