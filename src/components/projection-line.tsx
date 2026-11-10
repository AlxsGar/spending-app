import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui';
import { formatSignedMoney } from '@/services/money';

type Props = {
  cents: number;
  currency: string;
  maxFontSizeMultiplier?: number;
};

// "End of month: $1,240" under an account's balance. Quiet secondary text like
// the cap line; a negative amount carries the minus sign, so no color is needed.
export function ProjectionLine({ cents, currency, maxFontSizeMultiplier }: Props) {
  const { t } = useTranslation();
  return (
    <AppText
      variant="caption"
      color="textSecondary"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {t('projection.account', { amount: formatSignedMoney(cents, currency) })}
    </AppText>
  );
}
