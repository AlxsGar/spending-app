import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { WHEN_KEYS } from '@/components/cap-labels';
import { AlertBanner, AppText } from '@/components/ui';
import type { Currency } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import { dayToDate } from '@/services/recurring';
import { accountCapProgress } from '@/services/soft-caps';
import { useCaps } from '@/stores/caps-store';
import { useToday } from '@/stores/today';
import { useTransactions } from '@/stores/transactions-store';

type Props = {
  accountId: number;
  currency: Currency;
};

// Under the balance on the account detail: this account's own cap (never the
// global one). A quiet progress line while the cap holds (at exactly the cap too),
// an alert banner while it is exceeded, nothing without a cap or while the caps
// failed to load. It follows the transactions, the caps and the local day.
export function AccountCapLine({ accountId, currency }: Props) {
  const { t } = useTranslation();
  const { transactions } = useTransactions();
  const { caps, status } = useCaps();
  const today = useToday();

  const progress = useMemo(
    () =>
      status === 'error'
        ? null
        : accountCapProgress({ caps, accountId, transactions, now: dayToDate(today) }),
    [caps, status, accountId, transactions, today],
  );
  if (progress === null) return null;

  const values = {
    spent: formatMoney(progress.spentCents, currency),
    cap: formatMoney(progress.capCents, currency),
    when: t(WHEN_KEYS[progress.period]),
  };
  if (progress.exceeded) return <AlertBanner lines={[t('caps.exceededAccount', values)]} />;
  return (
    <AppText variant="caption" color="textSecondary">
      {t('caps.progress', values)}
    </AppText>
  );
}
