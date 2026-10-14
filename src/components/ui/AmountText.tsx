import type { StyleProp, TextStyle } from 'react-native';

import { formatSignedMoney } from '@/services/money';
import type { ColorToken, TypographyVariant } from '@/theme';

import { AppText } from './AppText';

type Props = {
  // Signed: negative cents show a minus sign.
  cents: number;
  currency: string;
  variant?: TypographyVariant;
  align?: 'left' | 'center' | 'right';
  maxFontSizeMultiplier?: number;
  // Color by sign: positive accent, negative alert, zero normal. The sign
  // character is always shown too, so color is never the only cue.
  colored?: boolean;
  // Show "+" on positive amounts (transaction rows).
  showPlus?: boolean;
};

const tabular: StyleProp<TextStyle> = { fontVariant: ['tabular-nums'] };

export function AmountText({
  cents,
  currency,
  variant = 'bodyStrong',
  align = 'right',
  maxFontSizeMultiplier,
  colored = false,
  showPlus = false,
}: Props) {
  let color: ColorToken = 'text';
  if (colored && cents > 0) color = 'accent';
  if (colored && cents < 0) color = 'alert';

  return (
    <AppText
      variant={variant}
      align={align}
      color={color}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={tabular}
    >
      {formatSignedMoney(cents, currency, { showPlus })}
    </AppText>
  );
}
