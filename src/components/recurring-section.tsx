import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RecurringRow } from '@/components/recurring-row';
import { SectionHeader } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { dayToDate, sortRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { useToday } from '@/stores/today';

type Props = {
  payments: RecurringPayment[];
  accounts: Account[];
  // The currency of payments that have no account.
  defaultCurrency: string;
  // Called with the payment id when a row is tapped.
  onOpen: (id: number) => void;
  // When given, each row gets a ⋮ menu (Pay now, Skip, Edit); Edit is onOpen.
  // Account detail leaves it out: its rows only open the edit form.
  onPay?: (id: number) => void;
  onSkip?: (id: number) => void;
  // The header is left out on the Recurring payments screen, whose title says it.
  hideHeader?: boolean;
  // Opens one payment's actions dialog when `signal` changes (a tapped reminder).
  openRequest?: { id: number; signal: number };
};

// The "Recurring payments" section: a header and one row per payment, soonest
// due first. Nothing at all when there are none. A payment with no account is
// listed ("Not set"); one whose account is gone is skipped. "Today" follows the
// clock, so a section left open past midnight updates.
export function RecurringSection({
  payments,
  accounts,
  defaultCurrency,
  onOpen,
  onPay,
  onSkip,
  hideHeader,
  openRequest,
}: Props) {
  const { t } = useTranslation();
  const today = useToday();
  const known = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const sorted = useMemo(
    () =>
      sortRecurring(
        payments.filter((item) => item.accountId === null || known.has(item.accountId)),
        dayToDate(today),
      ),
    [payments, known, today],
  );

  if (sorted.length === 0) return null;
  return (
    <View>
      {hideHeader ? null : <SectionHeader title={t('recurring.sectionTitle')} />}
      {sorted.map((payment) => (
        <RecurringRow
          key={payment.id}
          payment={payment}
          today={today}
          account={payment.accountId === null ? null : (known.get(payment.accountId) ?? null)}
          defaultCurrency={defaultCurrency}
          onPress={() => onOpen(payment.id)}
          openSignal={openRequest?.id === payment.id ? openRequest.signal : undefined}
          actions={
            onPay && onSkip
              ? {
                  onPay: () => onPay(payment.id),
                  onSkip: () => onSkip(payment.id),
                  onEdit: () => onOpen(payment.id),
                }
              : undefined
          }
        />
      ))}
    </View>
  );
}
