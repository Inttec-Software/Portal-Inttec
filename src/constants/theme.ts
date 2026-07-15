import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0d1b2a',
    textSecondary: '#4a5759',
    background: '#f4f6f9',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e0e5ec',
    primary: '#0d1b2a', // Azul Oscuro Corporativo
    secondary: '#1b4965',
    accent: '#0077b6', // Azul vibrante para botones
    border: '#d8e2dc',
    success: '#2e7d32', // APPROVED
    warning: '#f9a825', // PENDING
    danger: '#d32f2f', // REJECTED
    actionRequired: '#7b1fa2', // ACTION_REQUIRED
  },
  dark: {
    text: '#ffffff',
    textSecondary: '#cbd5e1',
    background: '#0d1b2a', // Azul Oscuro Profundo
    backgroundElement: '#1b4965', // Fondo de cartas/elementos
    backgroundSelected: '#2c5e7a',
    primary: '#00b4d8', // Azul vibrante para acento en modo oscuro
    secondary: '#1b4965',
    accent: '#00b4d8', // Azul neón vibrante para botones
    border: '#2c5e7a',
    success: '#4caf50', // APPROVED
    warning: '#ffb703', // PENDING
    danger: '#ff3333', // REJECTED
    actionRequired: '#ba68c8', // ACTION_REQUIRED
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Courier New',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, sans-serif',
    serif: 'serif',
    rounded: 'system-ui, sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 4,
  one: 8,
  two: 12,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const BorderRadius = {
  small: 6,
  medium: 12,
  large: 20,
  pill: 9999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
