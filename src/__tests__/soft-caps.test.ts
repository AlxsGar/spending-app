import type { Account } from '@/services/accounts';
import { accountCapProgress, exceededCaps, headlineCap, parseCapInput, periodBounds, spentInPeriod, validateCapInput } from '@/services/soft-caps';
import type { SoftCap } from '@/services/soft-caps';
import type { Transaction } from '@/services/transactions';

// Local times throughout: the periods follow the device's calendar.
const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, s, ms);

const parts = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];

const account = (id: number, extra: Partial<Account> = {}): Account => ({
  id,
  name: `Account ${id}`,
  icon: 'bank',
  currency: 'MXN',
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
  ...extra,
});

let nextId = 1;
const tx = (
  accountId: number,
  kind: 'expense' | 'income',
  amountCents: number,
  date: Date,
): Transaction => ({
  id: nextId++,
  accountId,
  kind,
  amountCents,
  date: date.toISOString(),
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: date.toISOString(),
});

const cap = (accountId: number | null, period: SoftCap['period'], amountCents: number): SoftCap => ({
  id: nextId++,
  accountId,
  period,
  amountCents,
});

describe('periodBounds', () => {
  it('day: the local calendar day, midnight to midnight', () => {
    const { start, end } = periodBounds('day', at(2026, 11, 9, 15, 30));
    expect(parts(start)).toEqual([2026, 11, 9, 0, 0]);
    expect(parts(end)).toEqual([2026, 11, 10, 0, 0]);
  });

  it('week: Monday 00:00 to the next Monday 00:00, from any day of the week', () => {
    // 2026-11-09 is a Monday; the 15th is the Sunday after it.
    for (const day of [9, 10, 12, 15]) {
      const { start, end } = periodBounds('week', at(2026, 11, day));
      expect(parts(start)).toEqual([2026, 11, 9, 0, 0]);
      expect(parts(end)).toEqual([2026, 11, 16, 0, 0]);
    }
    // The Sunday before belongs to the previous week.
    expect(parts(periodBounds('week', at(2026, 11, 8)).start)).toEqual([2026, 11, 2, 0, 0]);
  });

  it('week: crosses month and year ends', () => {
    // Thursday 2026-12-31: the week started Monday 2026-12-28.
    const { start, end } = periodBounds('week', at(2026, 12, 31));
    expect(parts(start)).toEqual([2026, 12, 28, 0, 0]);
    expect(parts(end)).toEqual([2027, 1, 4, 0, 0]);
  });

  it('month: the first day to the first of the next month, in a short month and in December', () => {
    expect(parts(periodBounds('month', at(2026, 2, 28)).start)).toEqual([2026, 2, 1, 0, 0]);
    expect(parts(periodBounds('month', at(2026, 2, 28)).end)).toEqual([2026, 3, 1, 0, 0]);
    expect(parts(periodBounds('month', at(2026, 12, 15)).end)).toEqual([2027, 1, 1, 0, 0]);
  });
});

describe('spentInPeriod', () => {
  const ids = new Set([1]);
  const now = at(2026, 11, 11); // a Wednesday

  it('counts expenses only: income never offsets', () => {
    const items = [tx(1, 'expense', 1000, at(2026, 11, 11, 9)), tx(1, 'income', 5000, at(2026, 11, 11, 10))];
    expect(spentInPeriod(items, ids, 'day', now)).toBe(1000);
  });

  it('week: Sunday 23:59:59.999 is in, the next Monday 00:00 is out; Monday 00:00 is in', () => {
    const items = [
      tx(1, 'expense', 1, at(2026, 11, 9, 0, 0)), // Monday 00:00: in
      tx(1, 'expense', 10, at(2026, 11, 15, 23, 59, 59, 999)), // Sunday end: in
      tx(1, 'expense', 100, at(2026, 11, 16, 0, 0)), // next Monday 00:00: out
      tx(1, 'expense', 1000, at(2026, 11, 8, 23, 59, 59, 999)), // Sunday before: out
    ];
    expect(spentInPeriod(items, ids, 'week', now)).toBe(11);
  });

  it('month: the first and the last day are in, the days around are out', () => {
    const items = [
      tx(1, 'expense', 1, at(2026, 11, 1, 0, 0)),
      tx(1, 'expense', 10, at(2026, 11, 30, 23, 59, 59, 999)),
      tx(1, 'expense', 100, at(2026, 12, 1, 0, 0)),
      tx(1, 'expense', 1000, at(2026, 10, 31, 23, 59, 59, 999)),
    ];
    expect(spentInPeriod(items, ids, 'month', now)).toBe(11);
  });

  it('day: only the current local day', () => {
    const items = [
      tx(1, 'expense', 1, at(2026, 11, 11, 0, 0)),
      tx(1, 'expense', 10, at(2026, 11, 11, 23, 59)),
      tx(1, 'expense', 100, at(2026, 11, 10, 23, 59)),
      tx(1, 'expense', 1000, at(2026, 11, 12, 0, 0)),
    ];
    expect(spentInPeriod(items, ids, 'day', now)).toBe(11);
  });

  it('ignores accounts that are not in the set', () => {
    expect(spentInPeriod([tx(2, 'expense', 500, at(2026, 11, 11))], ids, 'day', now)).toBe(0);
  });
});

describe('exceededCaps', () => {
  const now = at(2026, 11, 11);
  const base = { defaultCurrency: 'MXN' as const, now };

  it('equal to the cap is not exceeded; one cent over is', () => {
    const accounts = [account(1)];
    const caps = [cap(1, 'day', 5000)];
    expect(
      exceededCaps({ ...base, caps, accounts, transactions: [tx(1, 'expense', 5000, now)] }),
    ).toEqual([]);
    expect(
      exceededCaps({ ...base, caps, accounts, transactions: [tx(1, 'expense', 5001, now)] }),
    ).toEqual([
      { accountId: 1, period: 'day', capCents: 5000, spentCents: 5001, currency: 'MXN' },
    ]);
  });

  it('lists the global cap first, then account caps in account order, each with its own period', () => {
    const accounts = [account(1), account(2)];
    const caps = [cap(2, 'week', 100), cap(null, 'month', 200), cap(1, 'day', 50)];
    const transactions = [
      tx(1, 'expense', 120, now),
      tx(2, 'expense', 150, at(2026, 11, 10)),
    ];
    const result = exceededCaps({ ...base, caps, accounts, transactions });
    expect(result.map((item) => [item.accountId, item.period, item.spentCents])).toEqual([
      [null, 'month', 270],
      [1, 'day', 120],
      [2, 'week', 150],
    ]);
  });

  it('the global cap skips opted-out accounts and accounts in another currency, even with the flag on', () => {
    const accounts = [
      account(1),
      account(2, { inGlobalCap: false }),
      account(3, { currency: 'USD', inGlobalCap: true }),
    ];
    const transactions = [
      tx(1, 'expense', 60, now),
      tx(2, 'expense', 1000, now),
      tx(3, 'expense', 1000, now),
    ];
    const caps = [cap(null, 'day', 100)];
    expect(exceededCaps({ ...base, caps, accounts, transactions })).toEqual([]);
    expect(
      exceededCaps({
        ...base,
        caps: [cap(null, 'day', 59)],
        accounts,
        transactions,
      }),
    ).toEqual([
      { accountId: null, period: 'day', capCents: 59, spentCents: 60, currency: 'MXN' },
    ]);
  });

  it('an account cap counts that account in its own currency, even when opted out of the global cap', () => {
    const accounts = [account(3, { currency: 'USD', inGlobalCap: false })];
    const result = exceededCaps({
      ...base,
      caps: [cap(3, 'day', 10)],
      accounts,
      transactions: [tx(3, 'expense', 11, now)],
    });
    expect(result).toEqual([
      { accountId: 3, period: 'day', capCents: 10, spentCents: 11, currency: 'USD' },
    ]);
  });

  it('ignores the cap of an account that is gone, and expenses from earlier periods', () => {
    expect(
      exceededCaps({
        ...base,
        caps: [cap(9, 'day', 1), cap(1, 'week', 100)],
        accounts: [account(1)],
        transactions: [tx(9, 'expense', 500, now), tx(1, 'expense', 500, at(2026, 11, 8))],
      }),
    ).toEqual([]);
  });

  it('the period turning over clears the cap', () => {
    const accounts = [account(1)];
    const caps = [cap(1, 'day', 100)];
    const transactions = [tx(1, 'expense', 500, now)];
    expect(exceededCaps({ ...base, caps, accounts, transactions })).toHaveLength(1);
    expect(exceededCaps({ ...base, now: at(2026, 11, 12), caps, accounts, transactions })).toEqual([]);
  });
});

describe('headlineCap', () => {
  const item = (accountId: number | null, spent: number, capCents: number) => ({
    accountId,
    period: 'day' as const,
    capCents,
    spentCents: spent,
    currency: 'MXN' as const,
  });

  it('is null for none, the only one for one', () => {
    expect(headlineCap([])).toBeNull();
    expect(headlineCap([item(3, 200, 100)])).toEqual(item(3, 200, 100));
  });

  it('prefers the global cap even when an account cap is further over', () => {
    expect(headlineCap([item(null, 101, 100), item(2, 900, 100)])?.accountId).toBeNull();
  });

  it('else picks the largest spent / cap, not the largest amount over', () => {
    // 150% of 100 beats 120% of 10000 although 2000 is over by more.
    expect(headlineCap([item(1, 12000, 10000), item(2, 150, 100)])?.accountId).toBe(2);
  });

  it('a tie goes to the earlier one in the list (account order)', () => {
    expect(headlineCap([item(4, 200, 100), item(2, 400, 200)])?.accountId).toBe(4);
  });
});

describe('accountCapProgress', () => {
  const now = at(2026, 11, 11);
  const caps = [cap(1, 'day', 5000), cap(null, 'day', 1)];

  it('is null without an account cap (the global cap is not used)', () => {
    expect(accountCapProgress({ caps, accountId: 2, transactions: [], now })).toBeNull();
  });

  it('under, exactly at and over the cap', () => {
    const run = (cents: number) =>
      accountCapProgress({ caps, accountId: 1, transactions: [tx(1, 'expense', cents, now)], now });
    expect(run(4000)).toEqual({ period: 'day', capCents: 5000, spentCents: 4000, exceeded: false });
    expect(run(5000)?.exceeded).toBe(false);
    expect(run(5001)?.exceeded).toBe(true);
  });
});

describe('cap input', () => {
  it('empty means no cap; amounts follow the money rules for the currency', () => {
    expect(parseCapInput({ amount: ' ', period: 'week' }, 'MXN')).toBeNull();
    expect(parseCapInput({ amount: '1 250,5', period: 'week' }, 'MXN')).toEqual({
      cents: 125050,
      period: 'week',
    });
    expect(validateCapInput({ amount: '0', period: 'day' }, 'MXN')).toBe('capNotPositive');
    expect(validateCapInput({ amount: '-5', period: 'day' }, 'MXN')).toBe('capNotPositive');
    expect(validateCapInput({ amount: 'abc', period: 'day' }, 'MXN')).toBe('capInvalid');
    expect(validateCapInput({ amount: '1.5', period: 'day' }, 'JPY')).toBe('capDecimalsNotAllowed');
    expect(validateCapInput({ amount: '1.555', period: 'day' }, 'MXN')).toBe('capTooManyDecimals');
    expect(validateCapInput({ amount: '9999999999', period: 'day' }, 'MXN')).toBe('capTooLarge');
    expect(
      validateCapInput({ amount: '5', period: 'year' as unknown as 'day' }, 'MXN'),
    ).toBe('capInvalidPeriod');
    expect(validateCapInput({ amount: '5', period: 'day' }, 'MXN')).toBeNull();
  });
});
