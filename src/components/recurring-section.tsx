import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RecurringRow } from '@/components/recurring-row';
import { SectionHeader } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { sortRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';

type Props = {
  payments: RecurringPayment[];
  accounts: Account[];
  // The currency of payments that have no account.
  defaultCurrency: string;
  // Called with the payment id when a row is tapped.
  onOpen: (id: number) => void;
};

// The "Recurring payments" section: a header and one row per payment, soonest
// due first. Nothing at all when there are none. A payment with no account is
// listed ("Not set"); one whose account is gone is skipped.
export function RecurringSection({ payments, accounts, defaultCurrency, onOpen }: Props) {
  const { t } = useTranslation();
  const known = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const sorted = useMemo(
    () =>
      sortRecurring(payments.filter((item) => item.accountId === null || known.has(item.accountId))),
    [payments, known],
  );

  if (sorted.length === 0) return null;
  return (
    <View>
      <SectionHeader title={t('recurring.sectionTitle')} />
      {sorted.map((payment) => (
        <RecurringRow
          key={payment.id}
          payment={payment}
          account={payment.accountId === null ? null : (known.get(payment.accountId) ?? null)}
          defaultCurrency={defaultCurrency}
          onPress={() => onOpen(payment.id)}
        />
      ))}
    </View>
  );
}
