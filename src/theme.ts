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
  iconSmall: 16,
  iconLarge: 40,
  accountCard: 160,
  accountCardHeight: 200,
  dialogList: 320,
  badge: 24,
  successIcon: 48,
  successCardMinWidth: 200,
  // The PIN pad: round keys and the dots that show how many digits were typed.
  pinKey: 64,
  pinDot: 12,
  pinPadMaxWidth: 288,
  // The tab bar's height, the lift that keeps the snackbar above it. Approximate:
  // the snackbar host sits at the root, outside the tabs, so it cannot use
  // useBottomTabBarHeight. On screens without a tab bar it floats about this much
  // higher. Paper already adds the safe-area inset.
  tabBar: 56,
} as const;

// The line chart (LineChart). plotHeight is the height of the drawing area;
// plotInset keeps the dots inside it. Lines are lineWidth thick with a dot of
// dotRadius on each day; the selected day gets a larger dot (selectedDotRadius)
// and a guideWidth vertical line, and its label is bold and tinted too, so
// selection is not shown by color alone. The baseline (zero) is a divider line.
export const chart = {
  plotHeight: 120,
  plotInset: 8,
  lineWidth: 2,
  dotRadius: 3,
  selectedDotRadius: 5,
  guideWidth: 1,
  baselineWidth: 1,
  // The expense line is dashed (income is solid) so color is never the only cue;
  // the legend sample is a short line of legendWidth with the same style.
  dashArray: [6, 4],
  legendWidth: 24,
  legendHeight: 12,
  // Day dots are drawn only when each day has at least this much width (long
  // ranges show the lines and the selected day's dot only).
  dotMinSpacing: 8,
  // How far a finger moves sideways before a drag takes over from a tap, and how
  // far up or down before the scroll view takes the gesture instead.
  scrubSlop: 10,
} as const;

// Timing and spring settings for the success feedback card.
export const motion = {
  successDuration: 1500,
  fadeDuration: 200,
  springFriction: 6,
  springTension: 80,
  successStartScale: 0.7,
  // Swiping a stack card right: past this distance (or this speed) it is
  // dismissed; the card slides off in swipeExitDuration milliseconds.
  swipeDistance: 96,
  swipeVelocity: 800,
  swipeExitDuration: 200,
  // How far (in px) the pointer must move sideways before the swipe starts, so
  // a tap or a vertical scroll is not taken for one.
  swipeStart: 16,
} as const;

// The card deck (CardStack): up to two textless layers peek out below the top
// card. Layer n (1 is the nearest) sits n * layerOffset px lower, is
// layerWidths[n - 1] as wide as the top card (centered), and is the text color
// at layerTints[n - 1] opacity over the screen background (the same derived
// overlay the dividers use; the surface color is too close to the background to
// show). The radius is the shared card radius. The
// count badge sits on the top card's top-right corner, inside the card, badgeInset
// px from the top and the right edge (never outside the deck's bounds, so no
// parent can clip it). The card's first line leaves room for it.
// settleDuration is how long the next card (and the layers) take to move up
// after a dismissal.
export const deck = {
  maxLayers: 2,
  layerOffset: 6,
  layerWidths: [0.96, 0.92],
  layerTints: [0.12, 0.07],
  badgeInset: 8,
  settleDuration: 220,
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
  // The fill of a selected chip: the accent color over the screen.
  selected: 0.16,
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
