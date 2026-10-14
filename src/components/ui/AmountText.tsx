import type { StyleProp, TextStyle } from 'react-native';

import { formatMoney } from '@/services/money';
import type { TypographyVariant } from '@/theme';

import { AppText } from './AppText';

type Props = {
  cents: number;
  currency: string;
  variant?: TypographyVariant;
  align?: 'left' | 'center' | 'right';
  maxFontSizeMultiplier?: number;
};

const tabular: StyleProp<TextStyle> = { fontVariant: ['tabular-nums'] };

export function AmountText({ cents, currency, variant = 'bodyStrong', align = 'right',
  maxFontSizeMultiplier,
}: Props) {
  return (
    <AppText
      variant={variant}
      align={align}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={tabular}
    >
      {formatMoney(cents, currency)}
    </AppText>
  );
}
