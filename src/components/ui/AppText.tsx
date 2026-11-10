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
  accessibilityLiveRegion,
  style,
}: Props) {
  return (
    <Text
      accessibilityLiveRegion={accessibilityLiveRegion}
      numberOfLines={numberOfLines}
      ellipsizeMode="tail"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color: colors[color], textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}
