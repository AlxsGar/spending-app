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

// The ranges the chart can show: the last 7 or 30 days, this month (the 1st
// through today), or a custom run of days.
export type ChartRange =
  | { kind: 'days7' }
  | { kind: 'days30' }
  | { kind: 'month' }
  | { kind: 'custom'; from: Date; to: Date };

export const RANGE_DAYS = { days7: 7, days30: 30 } as const;

// The local days of a range, as of `today`.
export function rangeDays(range: ChartRange, today: Date): Date[] {
  switch (range.kind) {
    case 'days7':
      return lastDays(today, RANGE_DAYS.days7);
    case 'days30':
      return lastDays(today, RANGE_DAYS.days30);
    case 'month':
      return dayRange(new Date(today.getFullYear(), today.getMonth(), 1), today);
    case 'custom':
      return dayRange(range.from, range.to);
  }
}

export type CustomRangeError = 'order' | 'future' | 'tooLong';

const localDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, count: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
// The same calendar date a year later (Feb 29 becomes Mar 1 in a non-leap year).
const oneYearAfter = (date: Date) =>
  new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());

// The days the Custom range pickers may offer, so an invalid range cannot be
// chosen. The same one-year rule as validateCustomRange.
// From: no later than To, and no earlier than the first day whose "one year
// after" still reaches To. To: no earlier than From, and no later than today or
// one year after From, whichever comes first. All are local midnights.
export function fromBounds(to: Date): { min: Date; max: Date } {
  const end = localDay(to);
  let min = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
  while (oneYearAfter(addDays(min, -1)).getTime() >= end.getTime()) min = addDays(min, -1);
  while (oneYearAfter(min).getTime() < end.getTime()) min = addDays(min, 1);
  return { min, max: end };
}

export function toBounds(from: Date, today: Date): { min: Date; max: Date } {
  const start = localDay(from);
  const limit = oneYearAfter(start);
  const now = localDay(today);
  return { min: start, max: limit.getTime() < now.getTime() ? limit : now };
}

export function withinBounds(day: Date, bounds: { min: Date; max: Date }): boolean {
  const value = localDay(day).getTime();
  return value >= bounds.min.getTime() && value <= bounds.max.getTime();
}

// Why a custom From/To cannot be used, or null when it can. Rules: From is not
// after To, To is not after today, and the range spans at most one year: To is
// no later than the same calendar date one year after From (Feb 29 counts as
// Mar 1 in a non-leap year). So Nov 9 2025 through Nov 9 2026 is allowed
// (365 days after From, 366 across a Feb 29), and Nov 10 2026 is not.
export function validateCustomRange(from: Date, to: Date, today: Date): CustomRangeError | null {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = day(from);
  const end = day(to);
  if (end.getTime() < start.getTime()) return 'order';
  if (end.getTime() > day(today).getTime()) return 'future';
  const limit = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  if (end.getTime() > limit.getTime()) return 'tooLong';
  return null;
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
