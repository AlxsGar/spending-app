import type { Account } from '@/services/accounts';
import {
  dailyTotals,
  dayRange,
  labelIndices,
  lastDays,
  pickChartCurrency,
  rangeCurrencies,
  sumTotals,
} from '@/services/chart-range';
import { localDayKey } from '@/services/day-groups';
import type { Transaction } from '@/services/transactions';

const tx = (
  id: number,
  kind: 'income' | 'expense',
  amountCents: number,
  date: Date,
  accountId = 1,
): Transaction => ({
  id,
  accountId,
  kind,
  amountCents,
  date: date.toISOString(),
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: date.toISOString(),
});

const keys = (days: Date[]) => days.map(localDayKey);
const ids = new Set([1]);

describe('lastDays', () => {
  it('is today minus 6 through today', () => {
    expect(keys(lastDays(new Date(2026, 10, 11)))).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(keys(lastDays(new Date(2026, 10, 2)))).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(keys(lastDays(new Date(2027, 0, 3)))).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('crosses the end of February in a leap year', () => {
    expect(keys(lastDays(new Date(2028, 2, 2))).slice(0, 3)).toEqual([
      '2028-02-25',
      '2028-02-26',
      '2028-02-27',
    ]);
    expect(keys(lastDays(new Date(2028, 2, 2)))).toContain('2028-02-29');
  });

  it('works for any length and ignores the time of day', () => {
    expect(lastDays(new Date(2026, 10, 11, 23, 59), 30)).toHaveLength(30);
    expect(lastDays(new Date(2026, 10, 11, 23, 59))[6].getHours()).toBe(0);
  });
});

describe('dayRange', () => {
  it('is inclusive and empty when the end is before the start', () => {
    expect(keys(dayRange(new Date(2026, 10, 1), new Date(2026, 10, 1)))).toEqual(['2026-11-01']);
    expect(dayRange(new Date(2026, 10, 2), new Date(2026, 10, 1))).toEqual([]);
  });
});

describe('dailyTotals', () => {
  const days = lastDays(new Date(2026, 10, 11)); // Nov 5 .. Nov 11

  it('keeps income and expenses separate, by day', () => {
    const totals = dailyTotals(
      [
        tx(1, 'income', 1000, new Date(2026, 10, 6, 12)),
        tx(2, 'expense', 400, new Date(2026, 10, 6, 13)),
        tx(3, 'expense', 100, new Date(2026, 10, 11, 9)),
      ],
      days,
      ids,
    );
    expect(totals[1]).toEqual({ incomeCents: 1000, expenseCents: 400 });
    expect(totals[6]).toEqual({ incomeCents: 0, expenseCents: 100 });
    expect(totals[0]).toEqual({ incomeCents: 0, expenseCents: 0 });
    expect(sumTotals(totals)).toEqual({ incomeCents: 1000, expenseCents: 500 });
  });

  it('counts 00:00 on the first day and 23:59 on the last day, but not the day before or after', () => {
    const totals = dailyTotals(
      [
        tx(1, 'expense', 1, new Date(2026, 10, 5, 0, 0, 0)),
        tx(2, 'expense', 10, new Date(2026, 10, 11, 23, 59, 59)),
        tx(3, 'expense', 100, new Date(2026, 10, 4, 23, 59, 59)),
        tx(4, 'expense', 1000, new Date(2026, 10, 12, 0, 0, 0)),
      ],
      days,
      ids,
    );
    expect(totals[0].expenseCents).toBe(1);
    expect(totals[6].expenseCents).toBe(10);
    expect(sumTotals(totals).expenseCents).toBe(11);
  });

  it('totals across a month boundary window', () => {
    const window = lastDays(new Date(2026, 10, 2));
    const totals = dailyTotals(
      [
        tx(1, 'income', 5, new Date(2026, 9, 31, 23, 30)),
        tx(2, 'income', 7, new Date(2026, 10, 1, 0, 30)),
      ],
      window,
      ids,
    );
    expect(totals[4].incomeCents).toBe(5);
    expect(totals[5].incomeCents).toBe(7);
  });

  it('totals across a year boundary window', () => {
    const window = lastDays(new Date(2027, 0, 3));
    const totals = dailyTotals(
      [
        tx(1, 'expense', 5, new Date(2026, 11, 31, 23, 59)),
        tx(2, 'expense', 7, new Date(2027, 0, 1, 0, 0)),
      ],
      window,
      ids,
    );
    expect(totals[3].expenseCents).toBe(5);
    expect(totals[4].expenseCents).toBe(7);
  });

  it('counts only the given accounts', () => {
    const totals = dailyTotals(
      [
        tx(1, 'expense', 5, new Date(2026, 10, 6), 1),
        tx(2, 'expense', 7, new Date(2026, 10, 6), 2),
      ],
      days,
      ids,
    );
    expect(sumTotals(totals).expenseCents).toBe(5);
  });
});

describe('labelIndices', () => {
  it('shows all 7 labels for 7 days', () => {
    expect(labelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('thins out longer ranges to at most the given number, first label included', () => {
    expect(labelIndices(30, 7)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(labelIndices(366, 6).length).toBeLessThanOrEqual(6);
    expect(labelIndices(366, 6)[0]).toBe(0);
  });

  it('is empty for nothing', () => {
    expect(labelIndices(0)).toEqual([]);
  });
});

const account = (id: number, currency: 'USD' | 'MXN' | 'EUR'): Account => ({
  id,
  name: `A${id}`,
  icon: 'bank',
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
});

describe('chart currencies', () => {
  const days = lastDays(new Date(2026, 10, 11));
  const accounts = [account(1, 'USD'), account(2, 'MXN'), account(3, 'EUR')];

  it('collects the currencies of accounts with transactions in the range, sorted', () => {
    const list = rangeCurrencies(
      [
        tx(1, 'expense', 1, new Date(2026, 10, 10), 2),
        tx(2, 'expense', 1, new Date(2026, 10, 10), 1),
        // Before the range: EUR is not listed.
        tx(3, 'expense', 1, new Date(2026, 10, 4), 3),
        // Deleted account.
        tx(4, 'expense', 1, new Date(2026, 10, 10), 99),
      ],
      accounts,
      days,
    );
    expect(list).toEqual(['MXN', 'USD']);
  });

  it('none gives nothing to pick', () => {
    expect(pickChartCurrency([], 'USD', null)).toBeNull();
  });

  it('one currency is picked whatever the default is', () => {
    expect(pickChartCurrency(['EUR'], 'USD', null)).toBe('EUR');
  });

  it('prefers the default currency, else the first alphabetically', () => {
    expect(pickChartCurrency(['MXN', 'USD'], 'USD', null)).toBe('USD');
    expect(pickChartCurrency(['MXN', 'USD'], 'EUR', null)).toBe('MXN');
    expect(pickChartCurrency(['MXN', 'USD'], null, null)).toBe('MXN');
  });

  it('keeps the user pick while it is available', () => {
    expect(pickChartCurrency(['MXN', 'USD'], 'USD', 'MXN')).toBe('MXN');
    expect(pickChartCurrency(['USD'], 'USD', 'MXN')).toBe('USD');
  });
});
