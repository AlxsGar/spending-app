import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from 'react-native-paper';

import { colors, typography } from '@/theme';
import type { ColorToken, TypographyVariant } from '@/theme';

type Props = {
  children: ReactNode;
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
  // Shrink the text to stay on its lines (set numberOfLines), down to
  // minimumFontScale of its size, instead of wrapping or cutting it.
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  // Announce changes to the text to screen readers (Android live region).
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  style?: StyleProp<TextStyle>;
};

export function AppText({
  children,
  variant = 'body',
  color = 'text',
  align = 'left',
  numberOfLines,
  maxFontSizeMultiplier,
  adjustsFontSizeToFit,
  minimumFontScale,
  accessibilityLiveRegion,
  style,
}: Props) {
  return (
    <Text
      accessibilityLiveRegion={accessibilityLiveRegion}
      numberOfLines={numberOfLines}
      // A fitted text shrinks instead; it is never cut with an ellipsis.
      ellipsizeMode={adjustsFontSizeToFit ? undefined : 'tail'}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      style={[typography[variant], { color: colors[color], textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}
