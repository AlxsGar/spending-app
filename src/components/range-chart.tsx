import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ChartRangeHeader, useChartRange } from '@/components/chart-range-controls';
import { AppText, LineChart } from '@/components/ui';
import type { LineChartPoint } from '@/components/ui';
import { dailyTotals, labelIndices, sumTotals } from '@/services/chart-range';
import { formatDateRange } from '@/services/format-date';
import { localDayKey } from '@/services/day-groups';
import { formatMoney } from '@/services/money';
import type { Transaction } from '@/services/transactions';
import { spacing } from '@/theme';

type Props = {
  // Already limited to the scope (one account, or the accounts of one currency).
  transactions: readonly Transaction[];
  accountIds: ReadonlySet<number>;
  currency: string;
  // Any run of consecutive local days; the last one is selected first.
  days: readonly Date[];
  // The range's title ("Last 7 days", "Oct 3 – Nov 9"): the chart's accessible label.
  title: string;
  // The header row at the top of the block (the range dropdown and filter button).
  header: ReactNode;
  // Under the header, above the totals (Home's currency chips).
  controls?: ReactNode;
};

// Income vs expenses per day over `days` as two lines, with the range totals
// above and the selected day's totals below. The last day (today) is selected
// first, and again whenever the range changes. Planned recurring payments are
// not included, and income and expenses are never netted.
export function RangeChart({ transactions, accountIds, currency, days, title, header, controls }: Props) {
  const { t, i18n } = useTranslation();
  // The day the user picked, for this range only.
  const [picked, setPicked] = useState<{ range: readonly Date[]; index: number } | null>(null);

  const keys = useMemo(() => days.map(localDayKey), [days]);
  const totals = useMemo(
    () => dailyTotals(transactions, days, accountIds),
    [transactions, days, accountIds],
  );
  const range = useMemo(() => sumTotals(totals), [totals]);
  const shownLabels = useMemo(() => new Set(labelIndices(days.length)), [days.length]);

  // A new range starts again from its last day. The days array is new whenever
  // the range is set (even to the same dates) or the day changes, and is the same
  // array otherwise, so it identifies the range.
  if (picked !== null && picked.range !== days) setPicked(null);
  const selectedIndex = picked !== null ? picked.index : days.length - 1;

  if (days.length === 0 || (range.incomeCents === 0 && range.expenseCents === 0)) {
    return (
      <View style={styles.section}>
        <View style={styles.body}>
          {header}
          {controls}
          <AppText color="textSecondary">{t('chart.empty')}</AppText>
        </View>
      </View>
    );
  }

  const describe = (index: number) =>
    t('chart.day', {
      date: formatDateRange(days[index], days[index], i18n.language),
      income: formatMoney(totals[index].incomeCents, currency),
      expenses: formatMoney(totals[index].expenseCents, currency),
    });
  const points: LineChartPoint[] = days.map((day, index) => ({
    key: keys[index],
    label: shownLabels.has(index) ? String(day.getDate()) : '',
    incomeCents: totals[index].incomeCents,
    expenseCents: totals[index].expenseCents,
  }));

  return (
    <View style={styles.section}>
      <View style={styles.body}>
        {header}
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
          onSelect={(index) => setPicked({ range: days, index })}
          incomeLabel={t('chart.income')}
          expensesLabel={t('chart.expenses')}
          accessibilityLabel={title}
          accessibilityValue={describe(selectedIndex)}
        />
        <AppText color="textSecondary" variant="caption" accessibilityLiveRegion="polite">
          {describe(selectedIndex)}
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

// The account detail's chart: this account only, in its currency, no currency
// chips; the range dropdown and filter button choose the days.
export function AccountRangeChart({ accountId, currency, transactions }: AccountProps) {
  const { chartId, range, setRange, days, today, title } = useChartRange(`account-${accountId}`);
  const accountIds = useMemo(() => new Set([accountId]), [accountId]);
  return (
    <RangeChart
      transactions={transactions}
      accountIds={accountIds}
      currency={currency}
      days={days}
      title={title}
      header={
        <ChartRangeHeader
          chartId={chartId}
          range={range}
          title={title}
          days={days}
          today={today}
          onChange={setRange}
        />
      }
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
