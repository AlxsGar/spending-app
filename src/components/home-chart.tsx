import { useMemo, useState } from 'react';

import { ChartRangeHeader, useChartRange } from '@/components/chart-range-controls';
import { RangeChart } from '@/components/range-chart';
import { FilterChips } from '@/components/ui';
import type { Account, Currency } from '@/services/accounts';
import { pickChartCurrency, rangeCurrencies } from '@/services/chart-range';
import type { Transaction } from '@/services/transactions';
import { useDefaultCurrency } from '@/stores/default-currency';

type Props = {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
};

// Home's chart, over the range chosen with the range chips (7 days at first). Totals never mix currencies: the chart is for
// one currency, chosen among those of the accounts that have transactions in the
// range. Chips appear only with two or more (the default currency is selected
// first when it is among them, else the first alphabetically); with one there
// are no chips; with none the chart shows its empty line (in the default
// currency). Transactions of deleted accounts are skipped.
export function HomeChart({ accounts, transactions }: Props) {
  const { chartId, range, setRange, days, today, title } = useChartRange('home');
  const defaultCurrency = useDefaultCurrency();
  const [chosen, setChosen] = useState<Currency | null>(null);

  const currencies = useMemo(
    () => rangeCurrencies(transactions, accounts, days),
    [transactions, accounts, days],
  );
  const currency = pickChartCurrency(currencies, defaultCurrency, chosen);
  const accountIds = useMemo(
    () =>
      new Set(accounts.filter((account) => account.currency === currency).map((a) => a.id)),
    [accounts, currency],
  );

  // With several currencies the first pick depends on the default currency, so
  // wait for it rather than show one currency and then jump to another.
  if (currencies.length > 1 && defaultCurrency === null) return null;
  const shown = currency ?? defaultCurrency;
  if (shown === null) return null;

  const chips =
    currencies.length > 1 && currency !== null ? (
      <FilterChips
        options={currencies.map((value) => ({ value, label: value }))}
        selected={[currency]}
        onChange={(next) => {
          // A chip is a choice, not a toggle: tapping the selected one keeps it.
          const other = next.find((value) => value !== currency);
          const option = currencies.find((value) => value === other);
          if (option !== undefined) setChosen(option);
        }}
      />
    ) : null;

  return (
    <RangeChart
      transactions={transactions}
      accountIds={accountIds}
      currency={shown}
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
      controls={chips}
    />
  );
}
