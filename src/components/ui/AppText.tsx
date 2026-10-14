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
  style?: StyleProp<TextStyle>;
};

export function AppText({
  children,
  variant = 'body',
  color = 'text',
  align = 'left',
  numberOfLines,
  maxFontSizeMultiplier,
  style,
}: Props) {
  return (
    <Text
      numberOfLines={numberOfLines}
      ellipsizeMode="tail"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color: colors[color], textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}
