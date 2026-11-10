import type { Account, Currency } from './accounts';
import { localDayKey } from './day-groups';
import type { Transaction } from './transactions';

// The chart's fixed range for now: the last 7 local days, today included.
export const CHART_DAYS = 7;

export type DayTotals = {
  incomeCents: number;
  expenseCents: number;
};

// Every local calendar day from `start` through `end`, both inclusive, as local
// midnights. Stepped by calendar parts (day + 1), never by adding 24 hours, so
// a daylight saving change cannot skip or repeat a day. Empty when end is before
// start. Any range works (7 days, 30, a month, a custom one).
export function dayRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  for (
    let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    day.getTime() <= last.getTime();
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    days.push(day);
  }
  return days;
}

// The `count` local days ending on `today` (today - (count - 1) through today).
export function lastDays(today: Date, count: number = CHART_DAYS): Date[] {
  return dayRange(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1)),
    today,
  );
}

// Income and expenses per day (kept separate, never netted) for the recorded
// transactions of the accounts in `accountIds`, by the device's local date.
// Transactions outside the days are left out.
export function dailyTotals(
  transactions: readonly Transaction[],
  days: readonly Date[],
  accountIds: ReadonlySet<number>,
): DayTotals[] {
  const totals = days.map(() => ({ incomeCents: 0, expenseCents: 0 }));
  const indexOf = new Map(days.map((day, index) => [localDayKey(day), index]));
  for (const item of transactions) {
    if (!accountIds.has(item.accountId)) continue;
    const index = indexOf.get(localDayKey(new Date(item.date)));
    if (index === undefined) continue;
    if (item.kind === 'income') totals[index].incomeCents += item.amountCents;
    else totals[index].expenseCents += item.amountCents;
  }
  return totals;
}

export function sumTotals(totals: readonly DayTotals[]): DayTotals {
  return totals.reduce(
    (sum, item) => ({
      incomeCents: sum.incomeCents + item.incomeCents,
      expenseCents: sum.expenseCents + item.expenseCents,
    }),
    { incomeCents: 0, expenseCents: 0 },
  );
}

// Which x-axis labels to show: every day when they fit, else every nth (the
// first one always, then every `step` days) so at most `maxLabels` appear.
// 7 days with the default shows all 7.
export function labelIndices(count: number, maxLabels: number = CHART_DAYS): number[] {
  if (count <= 0 || maxLabels <= 0) return [];
  const step = Math.ceil(count / maxLabels);
  const shown: number[] = [];
  for (let index = 0; index < count; index += step) shown.push(index);
  return shown;
}

// The currencies of the existing accounts that have a transaction on one of
// `days`, sorted alphabetically. Transactions of deleted accounts are skipped.
export function rangeCurrencies(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  days: readonly Date[],
): Currency[] {
  const keys = new Set(days.map(localDayKey));
  const currencyOf = new Map(accounts.map((account) => [account.id, account.currency]));
  const found = new Set<Currency>();
  for (const item of transactions) {
    const currency = currencyOf.get(item.accountId);
    if (currency === undefined) continue;
    if (keys.has(localDayKey(new Date(item.date)))) found.add(currency);
  }
  return [...found].sort();
}

// The currency Home's chart shows: the user's pick while it is still available,
// else the default currency when it is among them, else the first alphabetically.
// Null when there are none.
export function pickChartCurrency(
  currencies: readonly Currency[],
  defaultCurrency: Currency | null,
  chosen: Currency | null,
): Currency | null {
  if (currencies.length === 0) return null;
  if (chosen !== null && currencies.includes(chosen)) return chosen;
  if (defaultCurrency !== null && currencies.includes(defaultCurrency)) return defaultCurrency;
  return currencies[0];
}
