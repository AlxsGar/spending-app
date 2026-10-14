// The service uses the device's local time zone, so pin it (UTC-6, no DST).
import '@/test/pin-timezone';

import {
  TransactionValidationError,
  composeTransactionDate,
  computeBalances,
  createTransaction,
  latestRecorded,
  listTransactions,
  sortTransactions,
  validateTransactionInput,
} from '@/services/transactions';
import type { Transaction, TransactionInput } from '@/services/transactions';

type Row = {
  id: number;
  account_id: number;
  kind: string;
  amount_cents: number;
  date: string;
  note: string | null;
  recurring_id: number | null;
  created_at: string;
};

let rows: Row[] = [];
let nextId = 1;
const mockAccounts: Record<number, { id: number; currency: string }> = {
  1: { id: 1, currency: 'USD' },
  2: { id: 2, currency: 'JPY' },
};

const mockDb = {
  getAllAsync: jest.fn(async (_sql: string) =>
    [...rows].sort((a, b) =>
      a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
    ),
  ),
  runAsync: jest.fn(async (_sql: string, ...args: unknown[]) => {
    const [accountId, kind, amount, date, note, createdAt] = args as [
      number,
      string,
      number,
      string,
      string | null,
      string,
    ];
    const id = nextId++;
    rows.push({
      id,
      account_id: accountId,
      kind,
      amount_cents: amount,
      date,
      note,
      recurring_id: null,
      created_at: createdAt,
    });
    return { lastInsertRowId: id, changes: 1 };
  }),
};

jest.mock('@/services/db', () => ({ initDb: async () => mockDb }));
jest.mock('@/services/accounts', () => ({
  getAccount: async (id: number) => mockAccounts[id] ?? null,
}));

// 2026-03-10 15:20:30.123 local (UTC-6).
const NOW = new Date(2026, 2, 10, 15, 20, 30, 123);
const TODAY = new Date(2026, 2, 10);

const valid: TransactionInput = {
  accountId: 1,
  kind: 'expense',
  amount: '12,50',
  date: TODAY,
  note: '',
};

describe('time zone for these tests', () => {
  it('is pinned to UTC-6', () => {
    expect(new Date(2026, 2, 10, 12).getTimezoneOffset()).toBe(360);
  });
});

describe('composeTransactionDate', () => {
  it('combines the chosen local day with the current local time, as UTC', () => {
    expect(composeTransactionDate(TODAY, NOW)).toBe('2026-03-10T21:20:30.123Z');
    // An earlier day keeps the time of day.
    expect(composeTransactionDate(new Date(2026, 2, 1), NOW)).toBe('2026-03-01T21:20:30.123Z');
  });

  it('can land on the next UTC day, never a different local day', () => {
    const late = new Date(2026, 2, 10, 23, 30);
    const iso = composeTransactionDate(TODAY, late);
    expect(iso).toBe('2026-03-11T05:30:00.000Z');
    expect(new Date(iso).getDate()).toBe(10);
  });
});

describe('validateTransactionInput', () => {
  it('accepts valid input, including today and a past day', () => {
    expect(validateTransactionInput(valid, 'USD', NOW)).toBeNull();
    expect(validateTransactionInput({ ...valid, date: new Date(2020, 0, 1) }, 'USD', NOW)).toBeNull();
    expect(validateTransactionInput({ ...valid, kind: 'income' }, 'USD', NOW)).toBeNull();
  });

  it.each([
    ['no account', { accountId: null }, 'USD', 'accountRequired'],
    ['unknown account', {}, null, 'accountNotFound'],
    ['bad kind', { kind: 'transfer' }, 'USD', 'invalidKind'],
    ['empty amount', { amount: '' }, 'USD', 'amountRequired'],
    ['text amount', { amount: 'abc' }, 'USD', 'amountInvalid'],
    ['zero', { amount: '0' }, 'USD', 'amountNotPositive'],
    ['negative', { amount: '-3' }, 'USD', 'amountNotPositive'],
    ['over max', { amount: '1000000000' }, 'USD', 'amountTooLarge'],
    ['max + 0.01', { amount: '1000000000.01' }, 'USD', 'amountTooLarge'],
    ['3 decimals', { amount: '1.234' }, 'USD', 'amountTooManyDecimals'],
    ['JPY decimals', { amount: '5.5' }, 'JPY', 'amountDecimalsNotAllowed'],
    ['invalid date', { date: new Date(NaN) }, 'USD', 'invalidDate'],
    ['tomorrow', { date: new Date(2026, 2, 11) }, 'USD', 'dateInFuture'],
    ['note of 141', { note: 'a'.repeat(141) }, 'USD', 'noteTooLong'],
  ])('rejects %s', (_label, patch, currency, code) => {
    expect(validateTransactionInput({ ...valid, ...patch }, currency, NOW)).toBe(code);
  });

  it('accepts a note of exactly 140 after trimming', () => {
    const note = `  ${'a'.repeat(140)}  `;
    expect(validateTransactionInput({ ...valid, note }, 'USD', NOW)).toBeNull();
  });

  it('treats tomorrow as the future even late tonight in local time', () => {
    const lateTonight = new Date(2026, 2, 10, 23, 59);
    expect(
      validateTransactionInput({ ...valid, date: new Date(2026, 2, 11, 0, 1) }, 'USD', lateTonight),
    ).toBe('dateInFuture');
    expect(validateTransactionInput({ ...valid, date: new Date(2026, 2, 10, 23, 59) }, 'USD', lateTonight)).toBeNull();
  });
});

describe('createTransaction', () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
    mockDb.runAsync.mockClear();
  });

  it('stores cents, a UTC ISO date, a trimmed note and a null recurring id', async () => {
    const created = await createTransaction({ ...valid, kind: 'income', note: '  Salary  ' }, NOW);
    expect(created).toMatchObject({
      id: 1,
      accountId: 1,
      kind: 'income',
      amountCents: 1250,
      date: '2026-03-10T21:20:30.123Z',
      note: 'Salary',
      recurringId: null,
      createdAt: NOW.toISOString(),
    });
    expect(rows[0]).toMatchObject({ amount_cents: 1250, note: 'Salary', recurring_id: null });
  });

  it('stores an empty note as NULL', async () => {
    await createTransaction({ ...valid, note: '   ' }, NOW);
    expect(rows[0].note).toBeNull();
  });

  it('converts JPY whole units to cents x100', async () => {
    await createTransaction({ ...valid, accountId: 2, amount: '500' }, NOW);
    expect(rows[0].amount_cents).toBe(50000);
  });

  it.each([
    ['missing account', { accountId: null }, 'accountRequired'],
    ['nonexistent account', { accountId: 99 }, 'accountNotFound'],
    ['invalid kind', { kind: 'x' }, 'invalidKind'],
    ['zero amount', { amount: '0' }, 'amountNotPositive'],
    ['amount over max', { amount: '1000000000' }, 'amountTooLarge'],
    ['JPY decimals', { accountId: 2, amount: '1.5' }, 'amountDecimalsNotAllowed'],
    ['3 decimals', { amount: '1.005' }, 'amountTooManyDecimals'],
    ['future date', { date: new Date(2026, 2, 11) }, 'dateInFuture'],
    ['long note', { note: 'a'.repeat(141) }, 'noteTooLong'],
  ])('rejects %s and writes nothing', async (_label, patch, code) => {
    const promise = createTransaction({ ...valid, ...patch }, NOW);
    await expect(promise).rejects.toBeInstanceOf(TransactionValidationError);
    await expect(promise).rejects.toMatchObject({ code });
    expect(rows).toHaveLength(0);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('asks the database for newest first: date desc, then id desc', async () => {
    // The mock re-sorts rows, so the order itself is only proven by the SQL.
    mockDb.getAllAsync.mockClear();
    await listTransactions();
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync.mock.calls[0][0]).toContain('ORDER BY date DESC, id DESC');
  });
});

const make = (
  id: number,
  accountId: number,
  kind: 'expense' | 'income',
  amountCents: number,
  date = '2026-03-10T12:00:00.000Z',
): Transaction => ({
  id,
  accountId,
  kind,
  amountCents,
  date,
  note: null,
  recurringId: null,
  createdAt: date,
});

describe('computeBalances', () => {
  it('is empty with no transactions', () => {
    expect(computeBalances([])).toEqual({});
  });

  it('sums income minus expense', () => {
    expect(
      computeBalances([make(1, 1, 'income', 10000), make(2, 1, 'expense', 2550), make(3, 1, 'income', 1)]),
    ).toEqual({ 1: 7451 });
  });

  it('goes negative when expenses exceed income', () => {
    expect(computeBalances([make(1, 1, 'income', 500), make(2, 1, 'expense', 1500)])).toEqual({
      1: -1000,
    });
  });

  it('can be exactly zero', () => {
    expect(computeBalances([make(1, 1, 'income', 500), make(2, 1, 'expense', 500)])).toEqual({
      1: 0,
    });
  });

  it('keeps accounts separate', () => {
    expect(
      computeBalances([
        make(1, 1, 'income', 1000),
        make(2, 2, 'expense', 300),
        make(3, 2, 'income', 100),
        make(4, 3, 'income', 99_999_999_999),
      ]),
    ).toEqual({ 1: 1000, 2: -200, 3: 99_999_999_999 });
  });
});

describe('latestRecorded (Home order: created_at desc, then id desc)', () => {
  const rec = (id: number, date: string, createdAt: string): Transaction => ({
    ...make(id, 1, 'income', 1, date),
    createdAt,
  });

  it('picks by when recorded, not by transaction date', () => {
    const input = [
      // Date order (as listTransactions returns): three from today, then a backdated one.
      rec(1, '2026-03-10T10:00:00.000Z', '2026-03-10T10:00:00.000Z'),
      rec(2, '2026-03-10T11:00:00.000Z', '2026-03-10T11:00:00.000Z'),
      rec(3, '2026-03-10T12:00:00.000Z', '2026-03-10T12:00:00.000Z'),
      rec(4, '2026-03-09T09:00:00.000Z', '2026-03-10T13:00:00.000Z'),
    ];
    expect(latestRecorded(input, 3).map((item) => item.id)).toEqual([4, 3, 2]);
    expect(input.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it('breaks created_at ties by id desc', () => {
    const at = '2026-03-10T10:00:00.000Z';
    const input = [rec(1, at, at), rec(3, at, at), rec(2, at, at)];
    expect(latestRecorded(input, 2).map((item) => item.id)).toEqual([3, 2]);
  });

  it('applies the filter before the limit, and handles short lists', () => {
    const at = (n: number) => `2026-03-10T10:00:0${n}.000Z`;
    const input = [rec(1, at(1), at(1)), rec(2, at(2), at(2)), rec(3, at(3), at(3))];
    expect(latestRecorded(input, 2, (item) => item.id !== 3).map((item) => item.id)).toEqual([2, 1]);
    expect(latestRecorded(input, 10)).toHaveLength(3);
    expect(latestRecorded([], 3)).toEqual([]);
  });
});

describe('sortTransactions (Movements and account detail: date desc, then id desc)', () => {
  it('orders by date desc then id desc without mutating', () => {
    const input = [
      make(1, 1, 'income', 1, '2026-03-01T00:00:00.000Z'),
      make(2, 1, 'income', 1, '2026-03-10T00:00:00.000Z'),
      make(3, 1, 'income', 1, '2026-03-10T00:00:00.000Z'),
    ];
    expect(sortTransactions(input).map((item) => item.id)).toEqual([3, 2, 1]);
    expect(input.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
