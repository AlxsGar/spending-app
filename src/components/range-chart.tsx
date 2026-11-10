import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, LineChart, SectionHeader } from '@/components/ui';
import type { LineChartPoint } from '@/components/ui';
import { dailyTotals, labelIndices, lastDays, sumTotals } from '@/services/chart-range';
import { formatDateRange } from '@/services/format-date';
import { localDayKey } from '@/services/day-groups';
import { formatMoney } from '@/services/money';
import { dayToDate } from '@/services/recurring';
import type { Transaction } from '@/services/transactions';
import { useToday } from '@/stores/today';
import { spacing } from '@/theme';

// The chart's days: the last 7 local days, kept current (a new day shifts the
// window). The same array until the day changes.
export function useChartDays(): Date[] {
  const today = useToday();
  return useMemo(() => lastDays(dayToDate(today)), [today]);
}

type Props = {
  // Already limited to the scope (one account, or the accounts of one currency).
  transactions: readonly Transaction[];
  accountIds: ReadonlySet<number>;
  currency: string;
  // Any run of consecutive local days; the last one is selected first.
  days: readonly Date[];
  // Shown under the title, above the chart (Home's currency chips).
  controls?: ReactNode;
};

// Income vs expenses per day over `days` as two lines, with the range totals
// above and the selected day's totals below. The last day (today) is selected
// first. Planned recurring payments are not included, and income and expenses
// are never netted.
export function RangeChart({ transactions, accountIds, currency, days, controls }: Props) {
  const { t, i18n } = useTranslation();
  // The key of the day the user tapped; null until they tap.
  const [picked, setPicked] = useState<string | null>(null);

  const keys = useMemo(() => days.map(localDayKey), [days]);
  const totals = useMemo(
    () => dailyTotals(transactions, days, accountIds),
    [transactions, days, accountIds],
  );
  const range = useMemo(() => sumTotals(totals), [totals]);
  const shownLabels = useMemo(() => new Set(labelIndices(days.length)), [days.length]);

  const pickedIndex = picked === null ? -1 : keys.indexOf(picked);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : days.length - 1;

  const title = <SectionHeader title={t('chart.title')} />;
  if (days.length === 0 || (range.incomeCents === 0 && range.expenseCents === 0)) {
    return (
      <View style={styles.section}>
        {title}
        <View style={styles.body}>
          {controls}
          <AppText color="textSecondary">{t('chart.empty')}</AppText>
        </View>
      </View>
    );
  }

  const describe = (index: number) => ({
    date: formatDateRange(days[index], days[index], i18n.language),
    income: formatMoney(totals[index].incomeCents, currency),
    expenses: formatMoney(totals[index].expenseCents, currency),
  });
  const points: LineChartPoint[] = days.map((day, index) => ({
    key: keys[index],
    label: shownLabels.has(index) ? String(day.getDate()) : '',
    incomeCents: totals[index].incomeCents,
    expenseCents: totals[index].expenseCents,
    accessibilityLabel: t('chart.day', describe(index)),
  }));

  return (
    <View style={styles.section}>
      {title}
      <View style={styles.body}>
        {controls}
        <AppText>
          {t('chart.totals', {
            income: formatMoney(range.incomeCents, currency),
            expenses: formatMoney(range.expenseCents, currency),
          })}
        </AppText>
        <LineChart
          points={points}
          selectedIndex={selectedIndex}
          onSelect={(index) => setPicked(keys[index])}
          incomeLabel={t('chart.income')}
          expensesLabel={t('chart.expenses')}
        />
        <AppText color="textSecondary" variant="caption" accessibilityLiveRegion="polite">
          {t('chart.day', describe(selectedIndex))}
        </AppText>
      </View>
    </View>
  );
}

type AccountProps = {
  accountId: number;
  currency: string;
  // Any transactions; only this account's are charted.
  transactions: readonly Transaction[];
};

// The account detail's chart: this account only, in its currency, no chips.
export function AccountRangeChart({ accountId, currency, transactions }: AccountProps) {
  const days = useChartDays();
  const accountIds = useMemo(() => new Set([accountId]), [accountId]);
  return (
    <RangeChart
      transactions={transactions}
      accountIds={accountIds}
      currency={currency}
      days={days}
    />
  );
}

const styles = StyleSheet.create({
  // The gap between sections (the same as under the cap banner), also under the
  // empty-state line.
  section: {
    marginBottom: spacing.xl,
  },
  body: {
    gap: spacing.md,
  },
});
