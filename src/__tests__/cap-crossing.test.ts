import type { Account, Currency } from '@/services/accounts';
import { crossedCaps, headlineCap } from '@/services/soft-caps';
import type { SoftCap } from '@/services/soft-caps';
import type { Transaction } from '@/services/transactions';

// Local times throughout: the periods follow the device's calendar.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
// Monday 2026-11-09, noon.
const NOW = at(2026, 11, 9);

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
  date: Date = NOW,
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

const crossed = (
  caps: SoftCap[],
  accounts: Account[],
  before: Transaction[],
  after: Transaction[],
  defaultCurrency: Currency = 'MXN',
) => crossedCaps({ caps, accounts, before, after, defaultCurrency, now: NOW });

describe('crossedCaps', () => {
  const accounts = [account(1)];
  const caps = [cap(null, 'week', 10000)];

  it('under to over: crossed', () => {
    const before = [tx(1, 'expense', 9000)];
    const result = crossed(caps, accounts, before, [...before, tx(1, 'expense', 2000)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ accountId: null, spentCents: 11000, capCents: 10000 });
  });

  it('already over to more over: not crossed', () => {
    const before = [tx(1, 'expense', 12000)];
    expect(crossed(caps, accounts, before, [...before, tx(1, 'expense', 500)])).toEqual([]);
  });

  it('under to exactly at the cap: not crossed', () => {
    const before = [tx(1, 'expense', 9000)];
    expect(crossed(caps, accounts, before, [...before, tx(1, 'expense', 1000)])).toEqual([]);
  });

  it('one cent over from exactly at: crossed', () => {
    const before = [tx(1, 'expense', 10000)];
    expect(crossed(caps, accounts, before, [...before, tx(1, 'expense', 1)])).toHaveLength(1);
  });

  it('an expense backdated into an earlier period: not crossed', () => {
    const before = [tx(1, 'expense', 9500)];
    const lastWeek = at(2026, 11, 8);
    expect(crossed(caps, accounts, before, [...before, tx(1, 'expense', 5000, lastWeek)])).toEqual(
      [],
    );
  });

  it('income never crosses a cap', () => {
    const before = [tx(1, 'expense', 9500)];
    expect(crossed(caps, accounts, before, [...before, tx(1, 'income', 50000)])).toEqual([]);
  });

  it('an edit that raises the amount crosses; one that changes income to expense crosses', () => {
    const other = tx(1, 'expense', 9000);
    const small = tx(1, 'expense', 500);
    expect(
      crossed(caps, accounts, [other, small], [other, { ...small, amountCents: 3000 }]),
    ).toHaveLength(1);
    const income = tx(1, 'income', 3000);
    expect(
      crossed(caps, accounts, [other, income], [other, { ...income, kind: 'expense' }]),
    ).toHaveLength(1);
  });

  it('an edit that moves the date into the current period crosses', () => {
    const other = tx(1, 'expense', 9000);
    const old = tx(1, 'expense', 3000, at(2026, 11, 1));
    expect(crossed(caps, accounts, [other, old], [other, { ...old, date: NOW.toISOString() }]))
      .toHaveLength(1);
  });

  it("an edit moving an expense to another account crosses that account's cap", () => {
    const two = [account(1), account(2)];
    const accountCaps = [cap(2, 'day', 5000)];
    const base = tx(2, 'expense', 4000);
    const moving = tx(1, 'expense', 2000);
    const result = crossed(
      accountCaps,
      two,
      [base, moving],
      [base, { ...moving, accountId: 2 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ accountId: 2, spentCents: 6000, capCents: 5000 });
  });

  it('a non-default-currency account never crosses the global cap', () => {
    const usd = [account(1, { currency: 'USD' })];
    expect(crossed(caps, usd, [], [tx(1, 'expense', 999999)], 'MXN')).toEqual([]);
  });

  it('an account that opted out of the global cap does not cross it', () => {
    const out = [account(1, { inGlobalCap: false })];
    expect(crossed(caps, out, [], [tx(1, 'expense', 999999)])).toEqual([]);
  });

  describe('one save crossing both an account cap and the global cap', () => {
    const two = [account(1), account(2)];
    const bothCaps = [cap(null, 'week', 10000), cap(2, 'day', 5000)];
    const before = [tx(1, 'expense', 8000), tx(2, 'expense', 1000)];
    const after = [...before, tx(2, 'expense', 4500)];

    it('returns both, global first, and the headline is the global cap', () => {
      const result = crossed(bothCaps, two, before, after);
      expect(result.map((item) => item.accountId)).toEqual([null, 2]);
      expect(headlineCap(result)?.accountId).toBeNull();
      expect(result.length - 1).toBe(1);
    });

    it('without a global cap among the crossed, the one furthest over by percentage leads', () => {
      const three = [account(1), account(2), account(3)];
      const accountCaps = [cap(2, 'day', 5000), cap(3, 'day', 1000)];
      const result = crossed(
        accountCaps,
        three,
        [],
        [tx(2, 'expense', 6000), tx(3, 'expense', 3000)],
      );
      expect(headlineCap(result)?.accountId).toBe(3);
    });
  });
});
