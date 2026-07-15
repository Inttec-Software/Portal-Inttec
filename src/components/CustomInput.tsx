import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface CustomInputProps extends TextInputProps {
  label?: string;
  error?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
}

const CustomInput = React.forwardRef<TextInput, CustomInputProps>(({
  label,
  error,
  iconName,
  isPassword = false,
  secureTextEntry,
  style,
  ...props
}, ref) => {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(!secureTextEntry);

  const isMultiline = props.multiline;
  const flattenedStyle = StyleSheet.flatten(style);
  const containerHeight = flattenedStyle?.height ?? (isMultiline ? 'auto' : 50);
  const inputStyle = isMultiline && flattenedStyle ? { ...flattenedStyle, height: undefined } : style;

  return (
    <View style={styles.container}>
      {!!label && <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>}
      
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: error
              ? themeColors.danger
              : isFocused
              ? themeColors.accent
              : themeColors.border,
            borderWidth: isFocused || error ? 1.5 : 1,
            height: containerHeight,
            alignItems: isMultiline ? 'flex-start' : 'center',
            paddingVertical: isMultiline ? Spacing.two : 0,
          },
        ]}
      >
        {iconName && (
          <Ionicons
            name={iconName}
            size={20}
            color={error ? themeColors.danger : themeColors.textSecondary}
            style={[styles.icon, isMultiline && { marginTop: 2 }]}
          />
        )}

        <TextInput
          ref={ref}
          style={[
            styles.input,
            { color: themeColors.text },
            isMultiline && { textAlignVertical: 'top', paddingTop: 0, paddingBottom: 0 },
            inputStyle,
          ]}
          placeholderTextColor={themeColors.textSecondary}
          secureTextEntry={isPassword ? !showPassword : secureTextEntry}
          onFocus={(e) => {
            setIsFocused(true);
            if (props.onFocus) props.onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (props.onBlur) props.onBlur(e);
          }}
          {...props}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.7}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color={themeColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {!!error && <Text style={[styles.errorText, { color: themeColors.danger }]}>{error}</Text>}
    </View>
  );
});

CustomInput.displayName = 'CustomInput';

export default CustomInput;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.three,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.half,
  },
  inputContainer: {
    borderRadius: BorderRadius.medium,
    flexDirection: 'row',
    paddingHorizontal: Spacing.two,
  },
  icon: {
    marginRight: Spacing.one,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  eyeIcon: {
    padding: Spacing.one,
  },
  errorText: {
    fontSize: 12,
    marginTop: Spacing.half,
    fontWeight: '500',
  },
});
