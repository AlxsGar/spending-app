import { MD3DarkTheme } from 'react-native-paper';

export const colors = {
  background: '#1A1A1A',
  surface: '#262626',
  accent: '#10B981',
  accentSecondary: '#06B6D4',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  alert: '#EF4444',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = 12;

export const borderWidth = 2;

export const sizes = {
  touchTarget: 48,
  fab: 56,
  icon: 24,
  iconLarge: 40,
  accountCard: 160,
  accountCardHeight: 176,
  dialogList: 320,
  successIcon: 48,
  successCardMinWidth: 200,
} as const;

// Timing and spring settings for the success feedback card.
export const motion = {
  successDuration: 1500,
  fadeDuration: 200,
  springFriction: 6,
  springTension: 80,
  successStartScale: 0.7,
} as const;

// Fixed-size elements grow with the system font scale, up to these caps. Text
// inside them is capped at the same multiplier so it never outgrows the box.
export const fontScaleLimits = {
  maxHeight: 2,
  maxWidth: 1.25,
} as const;

export function scaleSize(base: number, fontScale: number, max: number): number {
  return Math.round(base * Math.min(Math.max(fontScale, 1), max));
}

export const typography = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
} as const;

export type TypographyVariant = keyof typeof typography;

export const opacity = {
  divider: 0.1,
  disabled: 0.4,
  scrim: 0.7,
} as const;

export function withOpacity(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const dividerColor = withOpacity(colors.text, opacity.divider);

export const disabledColor = (hex: string) => withOpacity(hex, opacity.disabled);

export const scrimColor = withOpacity(colors.background, opacity.scrim);

export const paperTheme = {
  ...MD3DarkTheme,
  dark: true,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.accent,
    onPrimary: colors.background,
    primaryContainer: colors.accent,
    onPrimaryContainer: colors.background,
    secondary: colors.accentSecondary,
    onSecondary: colors.background,
    secondaryContainer: colors.accentSecondary,
    onSecondaryContainer: colors.background,
    tertiary: colors.accentSecondary,
    onTertiary: colors.background,
    tertiaryContainer: colors.accentSecondary,
    onTertiaryContainer: colors.background,
    error: colors.alert,
    onError: colors.text,
    errorContainer: colors.alert,
    onErrorContainer: colors.text,
    background: colors.background,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.surface,
    onSurfaceVariant: colors.textSecondary,
    outline: dividerColor,
    outlineVariant: dividerColor,
    inverseSurface: colors.text,
    inverseOnSurface: colors.background,
    inversePrimary: colors.accent,
    surfaceDisabled: disabledColor(colors.surface),
    onSurfaceDisabled: disabledColor(colors.text),
    backdrop: scrimColor,
    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
  },
};
