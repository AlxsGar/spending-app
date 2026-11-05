import { useTranslation } from 'react-i18next';

import { AmountText, ListRow } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatShortDate } from '@/services/format-date';
import { formatSignedMoney } from '@/services/money';
import { dayToDate, scheduleState, toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';

type Props = {
  payment: RecurringPayment;
  // null: the payment has no account; it shows "Not set" and uses the default
  // currency.
  account: Account | null;
  defaultCurrency: string;
  onPress?: () => void;
};

const EVERY_KEYS = {
  day: 'recurring.everyDay',
  week: 'recurring.everyWeek',
  month: 'recurring.everyMonth',
  year: 'recurring.everyYear',
} as const;

// Account name; then "Every 2 weeks · next Oct 28" (or Inactive / Finished in
// place of the next date); then "Ends Dec 31" when there is an end date. The
// amount sits on the right, in the account's currency.
export function RecurringRow({ payment, account, defaultCurrency, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const currency = account ? account.currency : defaultCurrency;
  const accountName = account ? account.name : t('recurring.noAccount');
  const date = (day: string) => formatShortDate(dayToDate(day), i18n.language);

  let status: string;
  if (!payment.active) {
    status = t('recurring.inactive');
  } else {
    const state = scheduleState(payment, toDay(new Date()));
    status =
      state.kind === 'finished'
        ? t('recurring.finished')
        : t('recurring.next', { date: date(state.date) });
  }
  const every = t(EVERY_KEYS[payment.unit], { count: payment.interval });
  const lines = [accountName, `${every} · ${status}`];
  if (payment.endDate) lines.push(t('recurring.ends', { date: date(payment.endDate) }));

  return (
    <ListRow
      onPress={onPress}
      accessibilityLabel={t('recurring.rowLabel', {
        name: payment.name,
        account: accountName,
        amount: formatSignedMoney(payment.amountCents, currency),
        schedule: lines.slice(1).join(', '),
      })}
      icon="calendar-sync"
      title={payment.name}
      description={lines.join('\n')}
      descriptionLines={3}
      right={<AmountText cents={payment.amountCents} currency={currency} />}
    />
  );
}
