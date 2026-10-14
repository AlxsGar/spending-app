import { parseAmountToCents } from '@/services/money';
import {
  ACCOUNT_ICONS,
  AccountValidationError,
  CURRENCIES,
  createAccount,
  getAccount,
  getDefaultCurrency,
  listAccounts,
  parseBalance,
  removeAccount,
  updateAccount,
  validateAccountInput,
  validateBalance,
} from '@/services/accounts';

type Row = {
  id: number;
  name: string;
  icon: string;
  currency: string;
  in_global_cap: number;
  created_at: string;
  balance_anchor_cents: number;
  balance_anchor_at: string | null;
};

let rows: Row[] = [];
let nextId = 1;
// The account id of each stored transaction.
let transactionAccountIds: number[] = [];
let failAccountDelete = false;
let mockSettings: Record<string, string> = {};

const mockDb = {
  getAllAsync: jest.fn(async () => rows.map((row) => ({ ...row }))),
  getFirstAsync: jest.fn(async (_sql: string, id: number) => {
    const row = rows.find((item) => item.id === id);
    return row ? { ...row } : null;
  }),
  runAsync: jest.fn(async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const [name, icon, currency, createdAt, anchorCents, anchorAt] = args as [
        string,
        string,
        string,
        string,
        number,
        string | null,
      ];
      const id = nextId++;
      rows.push({
        id,
        name,
        icon,
        currency,
        in_global_cap: 1,
        created_at: createdAt,
        balance_anchor_cents: anchorCents,
        balance_anchor_at: anchorAt,
      });
      return { lastInsertRowId: id, changes: 1 };
    }
    if (sql.startsWith('UPDATE')) {
      const withBalance = sql.includes('balance_anchor_cents');
      const [name, icon, currency, ...rest] = args as [string, string, string, ...unknown[]];
      const id = rest[rest.length - 1] as number;
      const row = rows.find((item) => item.id === id);
      if (!row) return { lastInsertRowId: 0, changes: 0 };
      Object.assign(row, { name, icon, currency });
      if (withBalance) {
        row.balance_anchor_cents = rest[0] as number;
        row.balance_anchor_at = rest[1] as string;
      }
      return { lastInsertRowId: 0, changes: 1 };
    }
    const [id] = args as [number];
    if (sql.startsWith('DELETE FROM transactions')) {
      const beforeTx = transactionAccountIds.length;
      transactionAccountIds = transactionAccountIds.filter((item) => item !== id);
      return { lastInsertRowId: 0, changes: beforeTx - transactionAccountIds.length };
    }
    if (failAccountDelete) throw new Error('boom');
    const before = rows.length;
    rows = rows.filter((item) => item.id !== id);
    return { lastInsertRowId: 0, changes: before - rows.length };
  }),
  // Like SQLite: a throw inside the task rolls everything back.
  withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
    const savedRows = rows.map((row) => ({ ...row }));
    const savedTransactions = [...transactionAccountIds];
    try {
      await task();
    } catch (error) {
      rows = savedRows;
      transactionAccountIds = savedTransactions;
      throw error;
    }
  }),
};

jest.mock('@/services/db', () => ({
  initDb: async () => mockDb,
  getSetting: async (key: string) => mockSettings[key] ?? null,
}));

const valid = { name: 'Main', icon: 'bank', currency: 'USD' };

describe('accounts service', () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
    transactionAccountIds = [];
    failAccountDelete = false;
    mockSettings = {};
  });

  it('removes an account together with its transactions', async () => {
    const a = await createAccount(valid);
    const b = await createAccount(valid);
    transactionAccountIds = [a.id, b.id, a.id];
    await removeAccount(a.id);
    expect((await listAccounts()).map((item) => item.id)).toEqual([b.id]);
    expect(transactionAccountIds).toEqual([b.id]);
  });

  it('removes nothing when the account delete fails after the transactions were deleted', async () => {
    const a = await createAccount(valid);
    transactionAccountIds = [a.id, a.id];
    failAccountDelete = true;
    await expect(removeAccount(a.id)).rejects.toThrow('boom');
    expect((await listAccounts()).map((item) => item.id)).toEqual([a.id]);
    expect(transactionAccountIds).toEqual([a.id, a.id]);
  });

  it('keeps the icon and currency lists in the agreed order', () => {
    expect([...ACCOUNT_ICONS]).toEqual([
      'bank',
      'wallet',
      'safe',
      'cash',
      'credit-card',
      'piggy-bank',
      'home',
      'briefcase',
      'cart',
      'gift',
    ]);
    expect([...CURRENCIES]).toEqual([
      'MXN',
      'USD',
      'CAD',
      'AUD',
      'BRL',
      'CHF',
      'COP',
      'EUR',
      'GBP',
      'JPY',
    ]);
  });

  it('creates an account with trimmed name, global cap on and a UTC ISO date', async () => {
    const account = await createAccount({ ...valid, name: '  Main  ' });
    expect(account.name).toBe('Main');
    expect(account.inGlobalCap).toBe(true);
    expect(account.createdAt).toBe(new Date(account.createdAt).toISOString());
    expect(rows[0].in_global_cap).toBe(1);
    expect(rows[0].name).toBe('Main');
  });

  it('lists, gets, updates and removes', async () => {
    const a = await createAccount(valid);
    const b = await createAccount({ ...valid, name: 'Main' });
    expect((await listAccounts()).map((item) => item.id)).toEqual([a.id, b.id]);
    expect((await getAccount(a.id))?.name).toBe('Main');
    expect(await getAccount(999)).toBeNull();

    const updated = await updateAccount(a.id, { name: ' Cash ', icon: 'cash', currency: 'EUR' });
    expect(updated).toMatchObject({ id: a.id, name: 'Cash', icon: 'cash', currency: 'EUR' });
    expect((await getAccount(a.id))?.currency).toBe('EUR');

    await removeAccount(a.id);
    expect((await listAccounts()).map((item) => item.id)).toEqual([b.id]);
  });

  it('fails to update a missing account', async () => {
    await expect(updateAccount(42, valid)).rejects.toThrow('not found');
  });

  it.each([
    ['empty name', { ...valid, name: '' }, 'nameRequired'],
    ['whitespace name', { ...valid, name: '   ' }, 'nameRequired'],
    ['41 characters', { ...valid, name: 'a'.repeat(41) }, 'nameTooLong'],
    ['unknown icon', { ...valid, icon: 'rocket' }, 'invalidIcon'],
    ['unknown currency', { ...valid, currency: 'XXX' }, 'invalidCurrency'],
  ])('rejects %s on create and update', async (_label, input, code) => {
    expect(validateAccountInput(input)).toBe(code);
    await expect(createAccount(input)).rejects.toBeInstanceOf(AccountValidationError);
    await expect(createAccount(input)).rejects.toMatchObject({ code });
    const existing = await createAccount(valid);
    await expect(updateAccount(existing.id, input)).rejects.toMatchObject({ code });
    expect(rows).toHaveLength(1);
  });

  it('accepts a 40-character name and duplicate names', async () => {
    await createAccount({ ...valid, name: 'a'.repeat(40) });
    await createAccount({ ...valid, name: 'a'.repeat(40) });
    expect(rows).toHaveLength(2);
  });

  describe('balance', () => {
    // A balance is plain text; a negative one starts with "-".
    const bal = (text: string) => text;

    it.each([
      ['500', 'USD', 50000],
      ['12,5', 'USD', 1250],
      ['-500.00', 'USD', -50000],
      ['-500,5', 'USD', -50050],
      ['-0.01', 'USD', -1],
      [' -1 234.50 ', 'USD', -123450],
      ['0', 'USD', 0],
      ['-0', 'USD', 0],
      ['-0.00', 'USD', 0],
      ['-0,0', 'USD', 0],
      ['500', 'JPY', 50000],
      ['-500', 'JPY', -50000],
      ['999999999.99', 'USD', 99_999_999_999],
      ['-999999999.99', 'USD', -99_999_999_999],
    ])('parses %s (%s) to %s cents, and -0 is never negative zero', (text, currency, cents) => {
      // toEqual tells -0 from 0.
      expect(parseBalance(text, currency)).toEqual({ ok: true, cents });
    });

    it.each([
      ['letters', 'abc', 'USD', 'balanceInvalid'],
      ['a minus after the digits', '5-', 'USD', 'balanceInvalid'],
      ['a minus in the middle', '5-5', 'USD', 'balanceInvalid'],
      ['two minuses at the start', '--5', 'USD', 'balanceInvalid'],
      ['minuses at both ends', '-5-', 'USD', 'balanceInvalid'],
      ['a lone minus', '-', 'USD', 'balanceInvalid'],
      ['a space after the minus', '- 5', 'USD', 'balanceInvalid'],
      ['a plus', '+5', 'USD', 'balanceInvalid'],
      ['a minus with a plus', '-+5', 'USD', 'balanceInvalid'],
      ['the unicode minus', '−5', 'USD', 'balanceInvalid'],
      ['both separators', '1,234.56', 'USD', 'balanceInvalid'],
      ['JPY decimals', '12.50', 'JPY', 'balanceDecimalsNotAllowed'],
      ['negative JPY decimals', '-12.50', 'JPY', 'balanceDecimalsNotAllowed'],
      ['3 decimals', '1.234', 'USD', 'balanceTooManyDecimals'],
      ['above the maximum', '1000000000', 'USD', 'balanceTooLarge'],
      ['negative above the maximum', '-1000000000', 'USD', 'balanceTooLarge'],
      ['one cent above the maximum', '-1000000000.00', 'USD', 'balanceTooLarge'],
    ])('rejects %s', (_label, text, currency, code) => {
      expect(parseBalance(text, currency)).toEqual({ ok: false, code });
    });

    it('empty is fine on create (no balance) and required on update', () => {
      expect(validateBalance(bal(''), 'USD', 'create')).toBeNull();
      expect(validateBalance(bal('  '), 'USD', 'create')).toBeNull();
      expect(validateBalance(bal(''), 'USD', 'update')).toBe('balanceRequired');
      expect(validateBalance(undefined, 'USD', 'update')).toBeNull();
    });

    it('create: empty, 0 or -0 stores no anchor', async () => {
      const empty = await createAccount({ ...valid, balance: bal('') });
      const zero = await createAccount({ ...valid, balance: bal('0') });
      const minusZero = await createAccount({ ...valid, balance: '-0' });
      for (const account of [empty, zero, minusZero]) {
        expect(account).toMatchObject({ balanceAnchorCents: 0, balanceAnchorAt: null });
      }
      expect(rows.map((row) => [row.balance_anchor_cents, row.balance_anchor_at])).toEqual([
        [0, null],
        [0, null],
        [0, null],
      ]);
    });

    it('create: "-500.00" stores -50000 anchored at the creation time', async () => {
      const account = await createAccount({ ...valid, balance: '-500.00' });
      expect(account).toMatchObject({ balanceAnchorCents: -50000, balanceAnchorAt: account.createdAt });
    });

    it('transaction amounts still reject a minus', () => {
      expect(parseAmountToCents('-5', 'USD')).toEqual({ ok: false, code: 'notPositive' });
      expect(parseAmountToCents('-5', 'USD', { allowZero: true })).toEqual({
        ok: false,
        code: 'notPositive',
      });
    });

    it('create: a non-zero balance is anchored at the creation time, negative when chosen', async () => {
      const positive = await createAccount({ ...valid, balance: bal('500') });
      const negative = await createAccount({ ...valid, balance: bal('-200') });
      expect(positive).toMatchObject({
        balanceAnchorCents: 50000,
        balanceAnchorAt: positive.createdAt,
      });
      expect(negative).toMatchObject({
        balanceAnchorCents: -20000,
        balanceAnchorAt: negative.createdAt,
      });
      expect(rows[1].balance_anchor_cents).toBe(-20000);
    });

    it('create: an invalid balance throws a typed code and stores nothing', async () => {
      await expect(createAccount({ ...valid, currency: 'JPY', balance: bal('12.50') })).rejects.toMatchObject({
        code: 'balanceDecimalsNotAllowed',
      });
      await expect(createAccount({ ...valid, balance: bal('x') })).rejects.toBeInstanceOf(
        AccountValidationError,
      );
      expect(rows).toHaveLength(0);
    });

    it('update: no balance keeps the anchor; a balance (also 0) sets it at now', async () => {
      const created = await createAccount({ ...valid, balance: bal('100') });
      await updateAccount(created.id, { ...valid, name: 'Other' });
      expect(rows[0]).toMatchObject({
        name: 'Other',
        balance_anchor_cents: 10000,
        balance_anchor_at: created.createdAt,
      });

      const now = new Date('2026-07-01T09:00:00.000Z');
      const moved = await updateAccount(created.id, { ...valid, balance: bal('-30') }, now);
      expect(moved).toMatchObject({ balanceAnchorCents: -3000, balanceAnchorAt: now.toISOString() });

      const later = new Date('2026-07-02T09:00:00.000Z');
      const zero = await updateAccount(created.id, { ...valid, balance: bal('0') }, later);
      expect(zero).toMatchObject({ balanceAnchorCents: 0, balanceAnchorAt: later.toISOString() });
    });

    it('update: an empty or invalid balance throws and changes nothing', async () => {
      const created = await createAccount({ ...valid, balance: bal('100') });
      await expect(
        updateAccount(created.id, { ...valid, name: 'X', balance: bal('') }),
      ).rejects.toMatchObject({ code: 'balanceRequired' });
      await expect(
        updateAccount(created.id, { ...valid, name: 'X', balance: bal('1,2,3') }),
      ).rejects.toMatchObject({ code: 'balanceInvalid' });
      expect(rows[0]).toMatchObject({ name: 'Main', balance_anchor_cents: 10000 });
    });

    it('update with a currency change and a balance saves both in one statement', async () => {
      const created = await createAccount(valid);
      mockDb.runAsync.mockClear();
      await updateAccount(created.id, { ...valid, currency: 'EUR', balance: bal('5') });
      expect(rows[0]).toMatchObject({ currency: 'EUR', balance_anchor_cents: 500 });
      const updates = mockDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
      expect(updates).toHaveLength(1);
    });
  });

  it('default currency follows the setting and falls back to MXN', async () => {
    expect(await getDefaultCurrency()).toBe('MXN');
    mockSettings.default_currency = 'EUR';
    expect(await getDefaultCurrency()).toBe('EUR');
    mockSettings.default_currency = 'ZZZ';
    expect(await getDefaultCurrency()).toBe('MXN');
  });
});
