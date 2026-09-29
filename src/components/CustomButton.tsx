import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode | keyof typeof Ionicons.glyphMap | string;
}

export default function CustomButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: CustomButtonProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // Determinar colores de fondo y texto según variante
  let backgroundColor: string = themeColors.accent;
  let textColor: string = '#ffffff';
  let borderColor: string = 'transparent';
  let borderWidth = 0;
  let hasShadow = true;

  if (variant === 'secondary') {
    backgroundColor = 'transparent';
    textColor = themeColors.text;
    borderColor = themeColors.border;
    borderWidth = 1;
    hasShadow = false;
  } else if (variant === 'success') {
    backgroundColor = themeColors.success;
  } else if (variant === 'danger') {
    backgroundColor = themeColors.danger;
  } else if (variant === 'warning') {
    backgroundColor = themeColors.warning;
  }

  const isBtnDisabled = disabled || loading;

  const renderIcon = () => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      return (
        <Ionicons
          name={icon as any}
          size={18}
          color={textColor}
          style={{ marginRight: 8 }}
        />
      );
    }
    return icon;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isBtnDisabled}
      style={[
        styles.button,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          opacity: isBtnDisabled ? 0.6 : 1,
        },
        !hasShadow && {
          shadowOpacity: 0,
          elevation: 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {renderIcon()}
          <Text style={[styles.text, { color: textColor }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
