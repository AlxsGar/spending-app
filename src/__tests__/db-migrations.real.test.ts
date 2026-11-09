/**
 * Upgrade tests on a REAL SQLite database (node:sqlite, see src/test/real-sqlite.ts),
 * running the real migrate/open from src/services/db.ts. The hand-written mock in
 * db.test.ts only checks statement order; this file proves what the SQL does.
 *
 * CONVENTION: every new upgrade step in src/services/db.ts (a new user_version)
 * must add cases here: an upgrade from each older version with real data, a fresh
 * install, and a rollback with an injected failure at each risky statement
 * followed by a successful retry. Do not merge a schema change without them.
 *
 * @jest-environment node
 */
import { getSetting, initDb, resetDbForTests } from '@/services/db';
import { createAccount, listAccounts, removeAccount, updateAccount } from '@/services/accounts';
import {
  createRecurring,
  dayToDate,
  dismissRecurring,
  getRecurring,
  listRecurring,
  removeRecurring,
  scheduleState,
  updateRecurring,
} from '@/services/recurring';
import * as recurringModule from '@/services/recurring';
import type { RecurringInput } from '@/services/recurring';
import {
  AlreadyHandledError,
  payOccurrence,
  removeTransactionUndoing,
  skipOccurrence,
} from '@/services/recurring-actions';
import { createRealSqlite, seedSchema } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';
import { silenceConsoleError } from '@/test/console-error';

// Failed upgrades log "[db] open/migrate failed:" before rethrowing.
const consoleError = silenceConsoleError();

let mockReal: RealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));

type TxRow = {
  id: number;
  account_id: number;
  kind: string;
  amount_cents: number;
  date: string;
  note: string | null;
  recurring_id: number | null;
  // Only on a v7 database.
  recurring_occurrence?: string | null;
  created_at: string;
};

const ACCOUNT_SQL =
  'INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const TX_SQL =
  'INSERT INTO transactions (id, account_id, kind, amount_cents, date, note, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

const insertAccounts = () => {
  mockReal.adapter.runAsync(ACCOUNT_SQL, 1, 'Checking', 'bank', 'USD', 1, '2026-01-01T00:00:00.000Z');
  mockReal.adapter.runAsync(ACCOUNT_SQL, 2, 'Yen "wallet"', 'wallet', 'JPY', 0, '2026-01-02T00:00:00.000Z');
};

const insertTx = (row: TxRow) =>
  mockReal.adapter.runAsync(
    TX_SQL,
    row.id,
    row.account_id,
    row.kind,
    row.amount_cents,
    row.date,
    row.note,
    row.recurring_id,
    row.created_at,
  );

const tx = (id: number, accountId: number, extra: Partial<TxRow> = {}): TxRow => ({
  id,
  account_id: accountId,
  kind: 'expense',
  amount_cents: 100 + id,
  date: `2026-03-0${id}T18:30:00.000Z`,
  note: null,
  recurring_id: null,
  created_at: `2026-03-0${id}T18:31:00.000Z`,
  ...extra,
});

// Valid rows use every column, including NULLs, a recurring id and odd text.
const VALID: TxRow[] = [
  tx(1, 1, { note: 'Lunch' }),
  tx(2, 2, { kind: 'income', amount_cents: 50000, recurring_id: 7 }),
  tx(4, 1, { kind: 'income', amount_cents: 99, note: "ünï 'quote' \"dq\" 日本" }),
  tx(6, 2, { amount_cents: 1 }),
];
// Their accounts do not exist.
const ORPHANS: TxRow[] = [tx(3, 9), tx(5, 8, { note: 'gone' })];
// The v6 upgrade clears a recurring_id that points at no recurring payment
// (none can exist before v6); the v7 upgrade adds recurring_occurrence, NULL on
// every existing row; every other column is untouched.
const VALID_UPGRADED: TxRow[] = VALID.map((row) => ({
  ...row,
  recurring_id: null,
  recurring_occurrence: null,
}));

const userVersion = () => mockReal.query<{ user_version: number }>('PRAGMA user_version')[0].user_version;
const foreignKeys = () => mockReal.query<{ foreign_keys: number }>('PRAGMA foreign_keys')[0].foreign_keys;
// The two columns added in v5 (name, declared type, NOT NULL flag, default).
const accountColumns = () =>
  mockReal
    .query<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
      'PRAGMA table_info(accounts)',
    )
    .filter((column) => column.name.startsWith('balance_anchor'))
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));
const allTransactions = () => mockReal.query<TxRow>('SELECT * FROM transactions ORDER BY id');
// SQLite stores each DDL text as written, so whitespace is collapsed: the seed
// schemas in the helper are laid out differently from the code in db.ts.
const schema = () =>
  mockReal
    .query<{ type: string; name: string; tbl_name: string; sql: string | null }>(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .map((item) => ({ ...item, sql: item.sql && item.sql.replace(/\s+/g, ' ') }));
const sequence = (name: string) =>
  mockReal.query<{ seq: number }>('SELECT seq FROM sqlite_sequence WHERE name = ?', name);
const insertNew = async () =>
  (
    await mockReal.adapter.runAsync(
      "INSERT INTO transactions (account_id, kind, amount_cents, date, created_at) VALUES (1, 'expense', 1, 'd', 'c')",
    )
  ).lastInsertRowId;

// Reopen the app: a new connection state, the same database.
const reopen = async () => {
  resetDbForTests();
  await initDb();
};

const seedV3 = async (rows: TxRow[] = [...VALID, ...ORPHANS]) => {
  seedSchema(mockReal, 3);
  mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es'), ('default_currency', 'EUR')");
  insertAccounts();
  for (const row of rows) await insertTx(row);
};

const seedV4 = async (rows: TxRow[] = VALID) => {
  seedSchema(mockReal, 4);
  mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es'), ('default_currency', 'EUR')");
  insertAccounts();
  for (const row of rows) await insertTx(row);
};

const seedV5 = async (rows: TxRow[] = VALID) => {
  seedSchema(mockReal, 5);
  mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es'), ('default_currency', 'EUR')");
  insertAccounts();
  mockReal.exec(
    "UPDATE accounts SET balance_anchor_cents = -500, balance_anchor_at = '2026-05-01T00:00:00.000Z' WHERE id = 1",
  );
  for (const row of rows) await insertTx(row);
};

const RECURRING_SQL =
  "INSERT INTO recurring_payments (id, account_id, name, amount_cents, note, interval, unit, start_date, created_at) VALUES (?, ?, ?, ?, ?, 2, 'week', '2026-06-15', '2026-06-01T00:00:00.000Z')";
const insertRecurring = (id: number, accountId: number, name = `Rent ${id}`) =>
  mockReal.adapter.runAsync(RECURRING_SQL, id, accountId, name, 1000 + id, null);
// A recurring payment with chosen schedule columns (no id, account 1).
const insertSchedule = (
  interval: number,
  unit: string,
  startDate: string,
  endDate: string | null,
) =>
  mockReal.adapter.runAsync(
    "INSERT INTO recurring_payments (account_id, name, amount_cents, interval, unit, start_date, end_date, created_at) VALUES (1, 'x', 1, ?, ?, ?, ?, 'c')",
    interval,
    unit,
    startDate,
    endDate,
  );
const transactionColumns = () =>
  mockReal
    .query<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
      'PRAGMA table_info(transactions)',
    )
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));
const recurringColumns = () =>
  mockReal
    .query<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
      'PRAGMA table_info(recurring_payments)',
    )
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));

// Existing accounts get no anchor, so their balances do not change.
const expectNoAnchors = () =>
  expect(
    mockReal.query('SELECT id, balance_anchor_cents, balance_anchor_at FROM accounts ORDER BY id'),
  ).toEqual([
    { id: 1, balance_anchor_cents: 0, balance_anchor_at: null },
    { id: 2, balance_anchor_cents: 0, balance_anchor_at: null },
  ]);

beforeEach(() => {
  mockReal = createRealSqlite();
  resetDbForTests();
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

describe('fresh install', () => {
  it('ends at v7 with the recurring table, the anchor columns, the foreign keys in the transactions DDL and the indexes', async () => {
    await initDb();
    expect(userVersion()).toBe(7);
    expect(recurringColumns()).toEqual([
      { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null },
      // Nullable: a recurring payment may have no account.
      { name: 'account_id', type: 'INTEGER', notnull: 0, dflt_value: null },
      { name: 'name', type: 'TEXT', notnull: 1, dflt_value: null },
      { name: 'amount_cents', type: 'INTEGER', notnull: 1, dflt_value: null },
      { name: 'note', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'interval', type: 'INTEGER', notnull: 1, dflt_value: null },
      { name: 'unit', type: 'TEXT', notnull: 1, dflt_value: null },
      { name: 'start_date', type: 'TEXT', notnull: 1, dflt_value: null },
      { name: 'end_date', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'notify_days_before', type: 'TEXT', notnull: 1, dflt_value: "''" },
      { name: 'active', type: 'INTEGER', notnull: 1, dflt_value: '1' },
      { name: 'last_confirmed_at', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'created_at', type: 'TEXT', notnull: 1, dflt_value: null },
      // v7: the dismissed occurrence, NULL when none.
      { name: 'dismissed_at', type: 'TEXT', notnull: 0, dflt_value: null },
    ]);
    expect(transactionColumns().slice(-2)).toEqual([
      { name: 'created_at', type: 'TEXT', notnull: 1, dflt_value: null },
      // v7: the occurrence a linked expense paid, NULL when none.
      { name: 'recurring_occurrence', type: 'TEXT', notnull: 0, dflt_value: null },
    ]);
    const recurring = schema().find((item) => item.name === 'recurring_payments');
    expect(recurring?.sql).toContain('AUTOINCREMENT');
    expect(recurring?.sql).toContain('REFERENCES accounts(id) ON DELETE CASCADE');
    expect(recurring?.sql).toContain('CHECK (amount_cents > 0)');
    expect(recurring?.sql).toContain('CHECK (interval >= 1)');
    expect(recurring?.sql).toContain("CHECK (unit IN ('day','week','month','year'))");
    expect(recurring?.sql).toContain('CHECK (end_date IS NULL OR end_date >= start_date)');
    expect(recurring?.sql).not.toMatch(/day_of_month|start_period|last_confirmed_period/);
    expect(schema().find((item) => item.name === 'idx_recurring_payments_account')).toMatchObject({
      type: 'index',
      tbl_name: 'recurring_payments',
    });
    expect(
      schema().find((item) => item.name === 'transactions')?.sql,
    ).toContain('recurring_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL');
    expect(accountColumns()).toEqual([
      { name: 'balance_anchor_cents', type: 'INTEGER', notnull: 1, dflt_value: '0' },
      { name: 'balance_anchor_at', type: 'TEXT', notnull: 0, dflt_value: null },
    ]);
    const transactions = schema().find((item) => item.name === 'transactions');
    expect(transactions?.sql).toContain('REFERENCES accounts(id) ON DELETE CASCADE');
    expect(transactions?.sql).toContain('AUTOINCREMENT');
    expect(transactions?.sql).toContain("CHECK (kind IN ('expense','income'))");
    expect(transactions?.sql).toContain('CHECK (amount_cents > 0)');
    const index = schema().find((item) => item.name === 'idx_transactions_account_date');
    expect(index).toMatchObject({ type: 'index', tbl_name: 'transactions' });
    expect(index?.sql).toContain('(account_id, date)');
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(schema().map((item) => item.name)).toEqual(
      expect.arrayContaining(['settings', 'accounts', 'transactions']),
    );
  });
});

describe('upgrades end at v7 with an identical schema', () => {
  it('from v1, v2, v3, v4, v5 and v6 the schema equals a fresh install', async () => {
    await initDb();
    const fresh = schema();
    mockReal.close();

    for (const version of [1, 2, 3, 4, 5, 6] as const) {
      mockReal = createRealSqlite();
      resetDbForTests();
      seedSchema(mockReal, version);
      await initDb();
      expect(userVersion()).toBe(7);
      expect(schema()).toEqual(fresh);
      mockReal.close();
    }
    // afterEach closes whatever mockReal points at; give it a live one.
    mockReal = createRealSqlite();
  });

  it('from v1 keeps the settings', async () => {
    seedSchema(mockReal, 1);
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es')");
    await initDb();
    expect(userVersion()).toBe(7);
    expect(await getSetting('language')).toBe('es');
    expect(allTransactions()).toEqual([]);
  });

  it('from v2 keeps the settings and the accounts', async () => {
    seedSchema(mockReal, 2);
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es')");
    insertAccounts();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(await getSetting('language')).toBe('es');
    expect(mockReal.query('SELECT id, name, in_global_cap FROM accounts ORDER BY id')).toEqual([
      { id: 1, name: 'Checking', in_global_cap: 1 },
      { id: 2, name: 'Yen "wallet"', in_global_cap: 0 },
    ]);
    expectNoAnchors();
  });

  it('from v3 keeps settings, accounts, valid transactions (same ids and values) and drops orphans', async () => {
    await seedV3();
    const accountsBefore = mockReal.query<object>('SELECT * FROM accounts ORDER BY id');
    expect(allTransactions()).toHaveLength(VALID.length + ORPHANS.length);

    await initDb();

    expect(userVersion()).toBe(7);
    expect(await getSetting('language')).toBe('es');
    expect(await getSetting('default_currency')).toBe('EUR');
    // Every old column is unchanged; the two new ones have their defaults.
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(
      accountsBefore.map((row) => ({ ...row, balance_anchor_cents: 0, balance_anchor_at: null })),
    );
    expectNoAnchors();
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(
      schema().find((item) => item.name === 'idx_transactions_account_date'),
    ).toMatchObject({ tbl_name: 'transactions' });
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('from v4 keeps settings, accounts and transactions untouched and adds the anchor columns', async () => {
    await seedV4();
    const accountsBefore = mockReal.query<object>('SELECT * FROM accounts ORDER BY id');
    const transactionsBefore = allTransactions();
    expect(transactionsBefore).toEqual(VALID);

    await initDb();

    expect(userVersion()).toBe(7);
    expect(accountColumns().map((column) => column.name)).toEqual([
      'balance_anchor_cents',
      'balance_anchor_at',
    ]);
    expect(await getSetting('language')).toBe('es');
    expect(await getSetting('default_currency')).toBe('EUR');
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(
      accountsBefore.map((row) => ({ ...row, balance_anchor_cents: 0, balance_anchor_at: null })),
    );
    expectNoAnchors();
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(foreignKeys()).toBe(1);
    // The anchor columns are usable and the cascade still works after the upgrade.
    mockReal.exec(
      "UPDATE accounts SET balance_anchor_cents = -500, balance_anchor_at = '2026-05-01T00:00:00.000Z' WHERE id = 1",
    );
    await mockReal.adapter.runAsync('DELETE FROM accounts WHERE id = ?', 1);
    expect(allTransactions().map((row) => row.id)).toEqual([2, 6]);
  });

  it('a v4 database reached through the real service reads existing balances unchanged', async () => {
    await seedV4();
    await initDb();
    const accounts = await listAccounts();
    expect(accounts.map((item) => [item.balanceAnchorCents, item.balanceAnchorAt])).toEqual([
      [0, null],
      [0, null],
    ]);
  });

  it('the rebuilt table still enforces its CHECK constraints', async () => {
    await seedV3();
    await initDb();
    await expect(
      mockReal.adapter.runAsync(
        "INSERT INTO transactions (account_id, kind, amount_cents, date, created_at) VALUES (1, 'refund', 5, 'd', 'c')",
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      mockReal.adapter.runAsync(
        "INSERT INTO transactions (account_id, kind, amount_cents, date, created_at) VALUES (1, 'expense', 0, 'd', 'c')",
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe('sqlite_sequence carry-over (ids are never reused)', () => {
  it('after the newest rows were deleted, the next id is higher than the old counter', async () => {
    const rows = [tx(1, 1), tx(2, 1), tx(3, 1), tx(4, 1), tx(5, 1)];
    await seedV3(rows);
    mockReal.exec('DELETE FROM transactions WHERE id IN (4, 5)');
    // Before the upgrade the counter is 5 while the highest row is 3.
    expect(sequence('transactions')).toEqual([{ seq: 5 }]);

    await initDb();

    expect(allTransactions().map((row) => row.id)).toEqual([1, 2, 3]);
    expect(sequence('transactions')).toEqual([{ seq: 5 }]);
    expect(sequence('transactions_new')).toEqual([]);
    expect(await insertNew()).toBe(6);
  });

  it('counts orphan ids too: the next id is above the highest id ever used', async () => {
    await seedV3([tx(1, 1), tx(2, 9)]);
    await initDb();
    expect(allTransactions().map((row) => row.id)).toEqual([1]);
    expect(await insertNew()).toBe(3);
  });

  it('an empty table that once had rows keeps its counter', async () => {
    await seedV3([tx(1, 1), tx(2, 1), tx(3, 1)]);
    mockReal.exec('DELETE FROM transactions');
    expect(sequence('transactions')).toEqual([{ seq: 3 }]);

    await initDb();

    expect(allTransactions()).toEqual([]);
    expect(sequence('transactions')).toEqual([{ seq: 3 }]);
    expect(sequence('transactions_new')).toEqual([]);
    expect(await insertNew()).toBe(4);
  });

  it('a table that never had a row starts at 1 and leaves no stray counter', async () => {
    await seedV3([]);
    expect(sequence('transactions')).toEqual([]);

    await initDb();

    // SQLite writes a counter of 0 when it copies zero rows into an
    // AUTOINCREMENT table; that is harmless, the next id is still 1.
    expect(sequence('transactions')).toEqual([{ seq: 0 }]);
    expect(sequence('transactions_new')).toEqual([]);
    expect(await insertNew()).toBe(1);
  });
});

describe('foreign keys', () => {
  it('are ON after open on a fresh install, after an upgrade, and on an already-v6 database', async () => {
    expect(foreignKeys()).toBe(0);
    await initDb();
    expect(foreignKeys()).toBe(1);

    // Already v6: no migration runs, and it is still turned ON.
    mockReal.exec('PRAGMA foreign_keys = OFF');
    mockReal.statements.length = 0;
    await reopen();
    expect(mockReal.statements.some((sql) => /^(CREATE|DROP|ALTER|DELETE)/.test(sql))).toBe(false);
    expect(foreignKeys()).toBe(1);
  });

  it('are ON after an upgrade from v3', async () => {
    await seedV3();
    expect(foreignKeys()).toBe(0);
    await initDb();
    expect(foreignKeys()).toBe(1);
  });

  it('delete the transactions when the account is deleted (ON DELETE CASCADE)', async () => {
    await seedV3();
    await initDb();
    await mockReal.adapter.runAsync('DELETE FROM accounts WHERE id = ?', 1);
    expect(allTransactions().map((row) => row.id)).toEqual([2, 6]);
  });

  it('reject a transaction for an account that does not exist', async () => {
    await seedV3();
    await initDb();
    await expect(
      mockReal.adapter.runAsync(
        "INSERT INTO transactions (account_id, kind, amount_cents, date, created_at) VALUES (99, 'expense', 5, 'd', 'c')",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe('a failed upgrade from v3 changes nothing, and a retry succeeds', () => {
  const failures = [
    ['the copy', 'INSERT INTO transactions_new'],
    ['the drop', 'DROP TABLE transactions'],
    ['the rename', 'RENAME TO transactions'],
    ['the index', 'CREATE INDEX idx_transactions_account_date'],
    ['the foreign key check', 'PRAGMA foreign_key_check'],
  ] as const;

  it.each(failures)('fails at %s', async (_label, statement) => {
    await seedV3();
    const schemaBefore = schema();
    const rowsBefore = allTransactions();
    const sequenceBefore = sequence('transactions');

    mockReal.failOn(statement);
    await expect(initDb()).rejects.toThrow('Injected failure');

    // The statement was really reached, then everything was rolled back.
    expect(mockReal.statements.some((sql) => sql.includes(statement))).toBe(true);
    expect(userVersion()).toBe(3);
    expect(schema()).toEqual(schemaBefore);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(
      schema().find((item) => item.name === 'transactions')?.sql,
    ).not.toContain('REFERENCES');
    expect(schema().find((item) => item.name === 'idx_transactions_account_date')).toBeTruthy();
    // Orphans included: the cleanup was rolled back too.
    expect(allTransactions()).toEqual(rowsBefore);
    expect(sequence('transactions')).toEqual(sequenceBefore);
    expect(sequence('transactions_new')).toEqual([]);
    expect(await mockReal.query('SELECT key FROM settings ORDER BY key')).toEqual([
      { key: 'default_currency' },
      { key: 'language' },
    ]);

    // Retry without the failure.
    mockReal.clearFailure();
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(foreignKeys()).toBe(1);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
  });

  // The orphan cleanup removes every row the check could flag, so a full upgrade
  // cannot produce a violation by itself. Instead a row pointing at a missing
  // account is inserted INSIDE the upgrade, right after the rename (foreign keys
  // are OFF there, so SQLite allows it). The check is then the real PRAGMA
  // returning real rows, and the throw is db.ts's own check-and-throw logic.
  it('a real foreign key violation found by the check aborts the upgrade', async () => {
    await seedV3();
    const schemaBefore = schema();
    const rowsBefore = allTransactions();
    mockReal.afterStatement(
      'RENAME TO transactions',
      "INSERT INTO transactions (id, account_id, kind, amount_cents, date, created_at) VALUES (100, 77, 'expense', 5, 'd', 'c')",
    );
    const checks: unknown[][] = [];
    const getAll = mockReal.adapter.getAllAsync;
    mockReal.adapter.getAllAsync = async <T>(sql: string, ...params: (string | number | null)[]) => {
      const rows = await getAll<T>(sql, ...params);
      if (sql === 'PRAGMA foreign_key_check') checks.push(rows);
      return rows;
    };

    await expect(initDb()).rejects.toThrow('Foreign key check failed');

    // The check really returned the violating row...
    expect(checks).toHaveLength(1);
    expect(checks[0]).toEqual([
      { table: 'transactions', rowid: 100, parent: 'accounts', fkid: 0 },
    ]);
    // ...and the whole upgrade was undone.
    expect(userVersion()).toBe(3);
    expect(schema()).toEqual(schemaBefore);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(allTransactions()).toEqual(rowsBefore);
    expect(allTransactions().some((row) => row.id === 100)).toBe(false);

    // Without the violation the same database upgrades.
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(allTransactions()).toEqual(VALID_UPGRADED);
  });

  it('fails at the orphan cleanup', async () => {
    await seedV3();
    mockReal.failOn('DELETE FROM transactions WHERE account_id NOT IN');
    await expect(initDb()).rejects.toThrow('Injected failure');
    expect(userVersion()).toBe(3);
    expect(allTransactions()).toHaveLength(VALID.length + ORPHANS.length);
  });

  it('fails when writing the version, after the rebuild', async () => {
    await seedV3();
    mockReal.failOn('PRAGMA user_version = 7');
    await expect(initDb()).rejects.toThrow('Injected failure');
    expect(userVersion()).toBe(3);
    expect(
      schema().find((item) => item.name === 'transactions')?.sql,
    ).not.toContain('REFERENCES');
    expect(allTransactions()).toHaveLength(VALID.length + ORPHANS.length);
  });
});

// Seeded at v4, so these fail inside the v5 step (the two ADD COLUMNs) or at the
// very end (the v6 version write): a column already added must be undone too.
describe('a failed upgrade from v4 changes nothing, and a retry succeeds', () => {
  const failures = [
    ['the first ADD COLUMN', 'ADD COLUMN balance_anchor_cents'],
    ['the second ADD COLUMN', 'ADD COLUMN balance_anchor_at'],
    ['writing the version', 'PRAGMA user_version = 7'],
  ] as const;

  it.each(failures)('fails at %s', async (_label, statement) => {
    await seedV4();
    const schemaBefore = schema();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const rowsBefore = allTransactions();

    mockReal.failOn(statement);
    await expect(initDb()).rejects.toThrow('Injected failure');

    // The statement was really reached, then everything was rolled back, even
    // a column that had already been added.
    expect(mockReal.statements.some((sql) => sql.includes(statement))).toBe(true);
    expect(userVersion()).toBe(4);
    expect(schema()).toEqual(schemaBefore);
    expect(accountColumns()).toEqual([]);
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(allTransactions()).toEqual(rowsBefore);
    expect(mockReal.query('SELECT key FROM settings ORDER BY key')).toEqual([
      { key: 'default_currency' },
      { key: 'language' },
    ]);

    // Retry without the failure.
    mockReal.clearFailure();
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(accountColumns()).toHaveLength(2);
    expectNoAnchors();
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(foreignKeys()).toBe(1);
  });
});

describe('diagnostic logging', () => {
  it('a failed upgrade logs "[db] open/migrate failed:" with the error, then rejects as before', async () => {
    await seedV5();
    mockReal.failOn('CREATE TABLE recurring_payments');
    await expect(initDb()).rejects.toThrow('Injected failure');
    expect(consoleError()).toHaveBeenCalledTimes(1);
    expect(consoleError()).toHaveBeenCalledWith(
      '[db] open/migrate failed:',
      expect.objectContaining({ name: 'InjectedFailure' }),
    );
    // Still retried on the next call (the cached rejection is reset).
    mockReal.clearFailure();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(consoleError()).toHaveBeenCalledTimes(1);
  });

  it('a successful open logs nothing', async () => {
    await initDb();
    expect(consoleError()).not.toHaveBeenCalled();
  });
});

describe('upgrade from v5 (recurring payments)', () => {
  it('keeps settings, accounts with their anchors and transactions; clears a dangling recurring_id', async () => {
    await seedV5();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    expect(accountsBefore[0]).toMatchObject({ balance_anchor_cents: -500 });
    // Transaction 2 points at recurring payment 7, which cannot exist yet.
    expect(allTransactions().find((row) => row.id === 2)?.recurring_id).toBe(7);

    await initDb();

    expect(userVersion()).toBe(7);
    expect(await getSetting('language')).toBe('es');
    expect(await getSetting('default_currency')).toBe('EUR');
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(mockReal.query('SELECT * FROM recurring_payments')).toEqual([]);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(
      schema().find((item) => item.name === 'idx_transactions_account_date'),
    ).toMatchObject({ tbl_name: 'transactions' });
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(foreignKeys()).toBe(1);
  });

  it('keeps the transactions counter: ids are never reused', async () => {
    await seedV5([tx(1, 1), tx(2, 1), tx(3, 1), tx(4, 1), tx(5, 1)]);
    mockReal.exec('DELETE FROM transactions WHERE id IN (4, 5)');
    expect(sequence('transactions')).toEqual([{ seq: 5 }]);

    await initDb();

    expect(allTransactions().map((row) => row.id)).toEqual([1, 2, 3]);
    expect(sequence('transactions')).toEqual([{ seq: 5 }]);
    expect(sequence('transactions_new')).toEqual([]);
    expect(await insertNew()).toBe(6);
  });

  it('an empty transactions table that once had rows keeps its counter', async () => {
    await seedV5([tx(1, 1), tx(2, 1), tx(3, 1)]);
    mockReal.exec('DELETE FROM transactions');
    await initDb();
    expect(allTransactions()).toEqual([]);
    expect(sequence('transactions')).toEqual([{ seq: 3 }]);
    expect(await insertNew()).toBe(4);
  });

  it('deleting a recurring payment keeps its transactions and sets their recurring_id to NULL', async () => {
    await seedV5([tx(1, 1), tx(2, 1), tx(3, 2)]);
    await initDb();
    await insertRecurring(1, 1);
    await insertRecurring(2, 2);
    mockReal.exec('UPDATE transactions SET recurring_id = 1 WHERE id IN (1, 2)');
    mockReal.exec('UPDATE transactions SET recurring_id = 2 WHERE id = 3');
    const before = allTransactions();

    await mockReal.adapter.runAsync('DELETE FROM recurring_payments WHERE id = ?', 1);

    expect(mockReal.query('SELECT id FROM recurring_payments')).toEqual([{ id: 2 }]);
    expect(allTransactions()).toEqual([
      { ...before[0], recurring_id: null },
      { ...before[1], recurring_id: null },
      before[2],
    ]);
  });

  it('deleting an account cascades to its recurring payments and transactions, and only those', async () => {
    await seedV5([tx(1, 1), tx(2, 2), tx(3, 1), tx(4, 2)]);
    await initDb();
    await insertRecurring(1, 1);
    await insertRecurring(2, 2);
    await insertRecurring(3, 1);
    mockReal.exec('UPDATE transactions SET recurring_id = 2 WHERE id = 4');

    await mockReal.adapter.runAsync('DELETE FROM accounts WHERE id = ?', 1);

    expect(mockReal.query('SELECT id FROM recurring_payments')).toEqual([{ id: 2 }]);
    expect(allTransactions().map((row) => [row.id, row.recurring_id])).toEqual([
      [2, null],
      [4, 2],
    ]);
  });

  it('allows a recurring payment with a NULL account; deleting an account leaves it alone', async () => {
    await seedV5([tx(1, 1), tx(2, 2)]);
    await initDb();
    await mockReal.adapter.runAsync(
      "INSERT INTO recurring_payments (id, account_id, name, amount_cents, interval, unit, start_date, created_at) VALUES (1, NULL, 'Loose', 500, 1, 'month', '2026-06-15', 'c')",
    );
    await insertRecurring(2, 1);
    await insertRecurring(3, 2);
    await insertRecurring(4, 1);
    // A transaction can link to an unassigned payment too.
    mockReal.exec('UPDATE transactions SET recurring_id = 1 WHERE id = 2');
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);

    await mockReal.adapter.runAsync('DELETE FROM accounts WHERE id = ?', 1);

    // Only account 1's payments went; the unassigned and account 2's stay.
    expect(mockReal.query('SELECT id, account_id FROM recurring_payments ORDER BY id')).toEqual([
      { id: 1, account_id: null },
      { id: 3, account_id: 2 },
    ]);
    expect(allTransactions().map((row) => [row.id, row.recurring_id])).toEqual([[2, 1]]);

    // Deleting the unassigned payment unlinks its transaction, as for any payment.
    await mockReal.adapter.runAsync('DELETE FROM recurring_payments WHERE id = ?', 1);
    expect(allTransactions().map((row) => [row.id, row.recurring_id])).toEqual([[2, null]]);
  });

  it('enforces the foreign keys and CHECKs of the new table and column', async () => {
    await seedV5();
    await initDb();
    await expect(insertRecurring(1, 99)).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(
      mockReal.adapter.runAsync(
        "INSERT INTO transactions (account_id, kind, amount_cents, date, recurring_id, created_at) VALUES (1, 'expense', 5, 'd', 42, 'c')",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    const insert = (amount: number) =>
      mockReal.adapter.runAsync(
        "INSERT INTO recurring_payments (account_id, name, amount_cents, interval, unit, start_date, created_at) VALUES (1, 'x', ?, 1, 'month', '2026-06-15', 'c')",
        amount,
      );
    await expect(insert(0)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insert(-5)).rejects.toThrow(/CHECK constraint failed/);
    await insert(100);
    expect(
      mockReal.query(
        'SELECT end_date, notify_days_before, active, last_confirmed_at FROM recurring_payments',
      ),
    ).toEqual([{ end_date: null, notify_days_before: '', active: 1, last_confirmed_at: null }]);
  });

  it('enforces the interval, unit and end date CHECKs', async () => {
    await seedV5();
    await initDb();
    // The database only requires interval >= 1; the cap of 365 is validation.
    await expect(insertSchedule(0, 'day', '2026-06-15', null)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertSchedule(-1, 'day', '2026-06-15', null)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertSchedule(1, 'fortnight', '2026-06-15', null)).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await expect(insertSchedule(1, 'Day', '2026-06-15', null)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertSchedule(1, 'day', '2026-06-15', '2026-06-14')).rejects.toThrow(
      /CHECK constraint failed/,
    );
    for (const unit of ['day', 'week', 'month', 'year']) {
      await insertSchedule(1, unit, '2026-06-15', null);
    }
    await insertSchedule(1000, 'day', '2026-06-15', null);
    // End on the start day, and after it, are fine.
    await insertSchedule(1, 'day', '2026-06-15', '2026-06-15');
    await insertSchedule(1, 'day', '2026-06-15', '2026-06-16');
    expect(mockReal.query('SELECT id FROM recurring_payments')).toHaveLength(7);
  });

  it('never reuses recurring ids', async () => {
    await seedV5();
    await initDb();
    await insertRecurring(1, 1);
    await insertRecurring(2, 1);
    await mockReal.adapter.runAsync('DELETE FROM recurring_payments WHERE id = 2');
    const next = await mockReal.adapter.runAsync(
      "INSERT INTO recurring_payments (account_id, name, amount_cents, interval, unit, start_date, created_at) VALUES (1, 'x', 1, 1, 'day', '2026-06-15', 'c')",
    );
    expect(next.lastInsertRowId).toBe(3);
  });
});

describe('a failed upgrade from v5 changes nothing, and a retry succeeds', () => {
  const failures = [
    ['creating the recurring table', 'CREATE TABLE recurring_payments'],
    ['the recurring index', 'CREATE INDEX idx_recurring_payments_account'],
    ['the dangling link cleanup', 'UPDATE transactions SET recurring_id = NULL'],
    ['creating the new transactions table', 'CREATE TABLE transactions_new'],
    ['the copy', 'INSERT INTO transactions_new'],
    ['carrying the counter over (update)', 'UPDATE sqlite_sequence'],
    ['carrying the counter over (insert)', 'INSERT INTO sqlite_sequence'],
    ['the drop', 'DROP TABLE transactions'],
    ['the rename', 'RENAME TO transactions'],
    ['the transactions index', 'CREATE INDEX idx_transactions_account_date'],
    ['the foreign key check', 'PRAGMA foreign_key_check'],
    ['the v7 dismissed_at column', 'ADD COLUMN dismissed_at'],
    ['the v7 recurring_occurrence column', 'ADD COLUMN recurring_occurrence'],
    ['writing the version', 'PRAGMA user_version = 7'],
  ] as const;

  it.each(failures)('fails at %s', async (_label, statement) => {
    await seedV5();
    const schemaBefore = schema();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const rowsBefore = allTransactions();
    const sequenceBefore = sequence('transactions');
    expect(rowsBefore).toEqual(VALID);

    mockReal.failOn(statement);
    await expect(initDb()).rejects.toThrow('Injected failure');

    // The statement was really reached, then everything was rolled back.
    expect(mockReal.statements.some((sql) => sql.includes(statement))).toBe(true);
    expect(userVersion()).toBe(5);
    expect(schema()).toEqual(schemaBefore);
    expect(schema().some((item) => item.name === 'recurring_payments')).toBe(false);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(
      schema().find((item) => item.name === 'transactions')?.sql,
    ).not.toContain('recurring_payments');
    expect(schema().find((item) => item.name === 'idx_transactions_account_date')).toBeTruthy();
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    // Data intact, including the dangling recurring_id the cleanup would clear.
    expect(allTransactions()).toEqual(rowsBefore);
    expect(sequence('transactions')).toEqual(sequenceBefore);
    expect(sequence('transactions_new')).toEqual([]);
    expect(mockReal.query('SELECT key FROM settings ORDER BY key')).toEqual([
      { key: 'default_currency' },
      { key: 'language' },
    ]);

    // Retry without the failure.
    mockReal.clearFailure();
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(allTransactions()).toEqual(VALID_UPGRADED);
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(foreignKeys()).toBe(1);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
  });

  // Foreign keys are OFF during the upgrade, so a row linked to a recurring
  // payment that does not exist is inserted right after the rename, and the
  // check must find it and abort.
  it('a real foreign key violation found by the check aborts the upgrade', async () => {
    await seedV5();
    const schemaBefore = schema();
    const rowsBefore = allTransactions();
    mockReal.afterStatement(
      'RENAME TO transactions',
      "INSERT INTO transactions (id, account_id, kind, amount_cents, date, recurring_id, created_at) VALUES (100, 1, 'expense', 5, 'd', 99, 'c')",
    );
    const checks: unknown[][] = [];
    const getAll = mockReal.adapter.getAllAsync;
    mockReal.adapter.getAllAsync = async <T>(sql: string, ...params: (string | number | null)[]) => {
      const rows = await getAll<T>(sql, ...params);
      if (sql === 'PRAGMA foreign_key_check') checks.push(rows);
      return rows;
    };

    await expect(initDb()).rejects.toThrow('Foreign key check failed');

    expect(checks).toHaveLength(1);
    expect(checks[0]).toEqual([
      expect.objectContaining({ table: 'transactions', rowid: 100, parent: 'recurring_payments' }),
    ]);
    expect(userVersion()).toBe(5);
    expect(schema()).toEqual(schemaBefore);
    expect(allTransactions()).toEqual(rowsBefore);

    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(allTransactions()).toEqual(VALID_UPGRADED);
  });
});

describe('recurring payments through the real service', () => {
  const input = {
    accountId: 1,
    name: ' Rent ',
    amount: '1200.50',
    interval: '1',
    unit: 'month',
    startDate: '2026-03-31',
    endDate: '2026-12-31',
    note: ' monthly ',
    active: true,
  };
  const now = new Date(2026, 1, 20, 10, 0, 0);

  const setup = async () => {
    await initDb();
    insertAccounts();
  };

  it('creates, lists, updates and removes, keeping reminders and confirmation on update', async () => {
    await setup();
    const created = await createRecurring(input, now);
    expect(created).toMatchObject({
      accountId: 1,
      name: 'Rent',
      amountCents: 120050,
      note: 'monthly',
      interval: 1,
      unit: 'month',
      startDate: '2026-03-31',
      endDate: '2026-12-31',
      notifyDaysBefore: '',
      active: true,
      lastConfirmedAt: null,
      createdAt: now.toISOString(),
    });
    expect(await listRecurring()).toEqual([created]);
    expect(await getRecurring(created.id)).toEqual(created);
    // Stored as plain calendar days, not timestamps.
    expect(
      mockReal.query('SELECT start_date, end_date, last_confirmed_at FROM recurring_payments'),
    ).toEqual([{ start_date: '2026-03-31', end_date: '2026-12-31', last_confirmed_at: null }]);

    const updated = await updateRecurring(
      created.id,
      {
        ...input,
        accountId: 2,
        name: 'Yen rent',
        amount: '5000',
        interval: '2',
        unit: 'week',
        startDate: '2026-04-01',
        endDate: null,
        note: '',
        active: false,
      },
      new Date(2026, 1, 21, 10),
    );
    expect(updated).toEqual({
      ...created,
      accountId: 2,
      name: 'Yen rent',
      amountCents: 500000,
      note: null,
      interval: 2,
      unit: 'week',
      startDate: '2026-04-01',
      endDate: null,
      active: false,
    });
    expect(await listRecurring()).toEqual([updated]);

    await removeRecurring(created.id);
    expect(await listRecurring()).toEqual([]);
  });

  it('removing a payment keeps the transactions linked to it, with recurring_id NULL', async () => {
    await setup();
    const created = await createRecurring(input, now);
    await insertTx(tx(1, 1, { recurring_id: created.id }));
    await removeRecurring(created.id);
    expect(allTransactions().map((row) => [row.id, row.recurring_id])).toEqual([[1, null]]);
  });

  it('removeAccount deletes the recurring payments too, in one transaction', async () => {
    await setup();
    const mine = await createRecurring(input, now);
    const other = await createRecurring({ ...input, accountId: 2, amount: '100' }, now);
    await insertTx(tx(1, 1, { recurring_id: mine.id }));

    mockReal.failOn('DELETE FROM accounts');
    await expect(removeAccount(1)).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    // The recurring delete ran, then was rolled back with everything else.
    expect(mockReal.statements.some((sql) => sql.startsWith('DELETE FROM recurring_payments WHERE account_id = ?'))).toBe(true);
    expect((await listRecurring()).map((item) => item.id)).toEqual([mine.id, other.id]);
    expect(allTransactions()).toHaveLength(1);

    await removeAccount(1);
    expect((await listRecurring()).map((item) => item.id)).toEqual([other.id]);
    expect(allTransactions()).toEqual([]);
  });

  it('a payment without an account uses the default_currency setting and survives removeAccount', async () => {
    await setup();
    const loose = await createRecurring({ ...input, accountId: null, amount: '500' }, now);
    expect(loose.accountId).toBeNull();
    // MXN when the setting is missing (decimals allowed), then JPY from the setting.
    expect((await createRecurring({ ...input, accountId: null, amount: '5.25' }, now)).amountCents).toBe(525);
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('default_currency', 'JPY')");
    await expect(
      createRecurring({ ...input, accountId: null, amount: '5.25' }, now),
    ).rejects.toMatchObject({ code: 'amountDecimalsNotAllowed' });

    const mine = await createRecurring(input, now);
    await removeAccount(1);
    expect((await listRecurring()).map((item) => item.id)).toEqual([loose.id, loose.id + 1]);
    expect(mine.accountId).toBe(1);

    // Edit to an account and back to none.
    const moved = await updateRecurring(loose.id, { ...input, accountId: 2, amount: '500' }, now);
    expect(moved.accountId).toBe(2);
    const unset = await updateRecurring(loose.id, { ...input, accountId: null, amount: '500' }, now);
    expect(unset.accountId).toBeNull();
  });

  it('rejects invalid input without writing', async () => {
    await setup();
    await expect(createRecurring({ ...input, name: '  ' }, now)).rejects.toMatchObject({
      code: 'nameRequired',
    });
    await expect(createRecurring({ ...input, accountId: 99 }, now)).rejects.toMatchObject({
      code: 'accountNotFound',
    });
    await expect(createRecurring({ ...input, amount: '10.5', accountId: 2 }, now)).rejects.toMatchObject({
      code: 'amountDecimalsNotAllowed',
    });
    await expect(createRecurring({ ...input, interval: '0' }, now)).rejects.toMatchObject({
      code: 'intervalOutOfRange',
    });
    await expect(createRecurring({ ...input, startDate: '2026-02-19' }, now)).rejects.toMatchObject({
      code: 'startDateInPast',
    });
    await expect(createRecurring({ ...input, endDate: '2026-03-30' }, now)).rejects.toMatchObject({
      code: 'endBeforeStart',
    });
    expect(await listRecurring()).toEqual([]);
  });
});

describe('accounts through the real service (balance anchor)', () => {
  const base = { name: 'Main', icon: 'bank', currency: 'USD' };

  it('creates without an anchor for an empty or zero initial balance, with one otherwise', async () => {
    await initDb();
    const none = await createAccount(base);
    const empty = await createAccount({ ...base, balance: '' });
    const zero = await createAccount({ ...base, balance: '-0.00' });
    const positive = await createAccount({ ...base, balance: '500' });
    const negative = await createAccount({ ...base, balance: '-200,5' });

    for (const account of [none, empty, zero]) {
      expect(account).toMatchObject({ balanceAnchorCents: 0, balanceAnchorAt: null });
    }
    expect(positive).toMatchObject({ balanceAnchorCents: 50000, balanceAnchorAt: positive.createdAt });
    expect(negative).toMatchObject({ balanceAnchorCents: -20050, balanceAnchorAt: negative.createdAt });
    // And what was stored is what comes back.
    expect(await listAccounts()).toEqual([none, empty, zero, positive, negative]);
  });

  it('update without a balance keeps the anchor; with one (even 0) re-anchors at now', async () => {
    await initDb();
    const created = await createAccount({ ...base, balance: '100' });
    const renamed = await updateAccount(created.id, { ...base, name: 'Renamed' });
    expect(renamed).toMatchObject({
      name: 'Renamed',
      balanceAnchorCents: 10000,
      balanceAnchorAt: created.createdAt,
    });

    const now = new Date('2026-06-01T10:00:00.000Z');
    const moved = await updateAccount(
      created.id,
      { ...base, balance: '-25.5' },
      now,
    );
    expect(moved).toMatchObject({ balanceAnchorCents: -2550, balanceAnchorAt: now.toISOString() });

    const later = new Date('2026-06-02T10:00:00.000Z');
    const zeroed = await updateAccount(
      created.id,
      { ...base, balance: '0' },
      later,
    );
    expect(zeroed).toMatchObject({ balanceAnchorCents: 0, balanceAnchorAt: later.toISOString() });
  });
});

describe('changing an account currency is a relabel (real SQLite)', () => {
  it('JPY and back to MXN leave every stored amount and the anchor identical, with no error', async () => {
    await initDb();
    const created = await createAccount({
      name: 'Main',
      icon: 'bank',
      currency: 'MXN',
      balance: '12.50',
    });
    await insertTx(tx(1, created.id, { kind: 'income', amount_cents: 777, date: '2999-01-01T00:00:00.000Z' }));
    await insertTx(tx(2, created.id, { amount_cents: 1 }));
    const accountBefore = mockReal.query('SELECT * FROM accounts WHERE id = ?', created.id);
    const transactionsBefore = allTransactions();
    expect(accountBefore).toMatchObject([
      { balance_anchor_cents: 1250, balance_anchor_at: created.createdAt },
    ]);

    // The service call the form makes when only the currency changed: no balance.
    const input = { name: 'Main', icon: 'bank' };
    const asJpy = await updateAccount(created.id, { ...input, currency: 'JPY' });
    expect(asJpy).toMatchObject({
      currency: 'JPY',
      balanceAnchorCents: 1250,
      balanceAnchorAt: created.createdAt,
    });
    expect(allTransactions()).toEqual(transactionsBefore);

    const backToMxn = await updateAccount(created.id, { ...input, currency: 'MXN' });
    expect(backToMxn).toEqual(created);
    expect(mockReal.query('SELECT * FROM accounts WHERE id = ?', created.id)).toEqual(accountBefore);
    expect(allTransactions()).toEqual(transactionsBefore);
  });
});

describe('removeAccount through the real service', () => {
  const setup = async () => {
    await initDb();
    insertAccounts();
    for (const row of [tx(1, 1), tx(2, 2), tx(3, 1), tx(4, 2)]) await insertTx(row);
  };

  it('deletes the account and its transactions, and only those', async () => {
    await setup();
    await removeAccount(1);
    expect(mockReal.query('SELECT id FROM accounts')).toEqual([{ id: 2 }]);
    expect(allTransactions().map((row) => row.id)).toEqual([2, 4]);
  });

  it('removes nothing when it fails after the transactions were deleted', async () => {
    await setup();
    mockReal.failOn('DELETE FROM accounts');
    await expect(removeAccount(1)).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    // The explicit transaction delete ran, then was rolled back with everything else.
    expect(mockReal.statements.some((sql) => sql.startsWith('DELETE FROM transactions WHERE account_id = ?'))).toBe(true);
    expect(mockReal.query('SELECT id FROM accounts ORDER BY id')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(allTransactions().map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });

  it('removes nothing when it fails at the transactions delete', async () => {
    await setup();
    mockReal.failOn('DELETE FROM transactions');
    await expect(removeAccount(1)).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    expect(mockReal.query('SELECT id FROM accounts ORDER BY id')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(allTransactions()).toHaveLength(4);
  });
});

// ---- v7: dismissed_at and recurring_occurrence ----------------------------

const RECURRING_V6_SQL =
  "INSERT INTO recurring_payments (id, account_id, name, amount_cents, note, interval, unit, start_date, end_date, active, last_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, '2026-01-01T00:00:00.000Z')";

// A v6 database with two recurring payments (Rent monthly from Jan 15 with
// March paid; Gym weekly with no account, never confirmed) and linked and
// unlinked transactions.
const seedV6 = async () => {
  seedSchema(mockReal, 6);
  mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es'), ('default_currency', 'EUR')");
  insertAccounts();
  mockReal.exec(
    "UPDATE accounts SET balance_anchor_cents = -500, balance_anchor_at = '2026-05-01T00:00:00.000Z' WHERE id = 1",
  );
  await mockReal.adapter.runAsync(RECURRING_V6_SQL, 1, 1, 'Rent', 1000, 'monthly', 1, 'month', '2026-01-15', '2026-03-15');
  await mockReal.adapter.runAsync(RECURRING_V6_SQL, 2, null, 'Gym', 500, null, 1, 'week', '2026-01-01', null);
  await insertTx(tx(1, 1, { recurring_id: 1 }));
  await insertTx(tx(2, 2, { note: 'plain' }));
  await insertTx(tx(3, 2, { recurring_id: 1 }));
  await insertTx(tx(4, 1, { recurring_id: 2 }));
};

const recurringRows = () => mockReal.query('SELECT * FROM recurring_payments ORDER BY id');

describe('upgrade from v6 (dismissed_at and recurring_occurrence)', () => {
  it('keeps every row and value; the two new columns are NULL on existing rows', async () => {
    await seedV6();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const recurringBefore = recurringRows();
    const transactionsBefore = allTransactions();
    expect(recurringBefore).toHaveLength(2);
    expect(transactionsBefore.map((row) => row.recurring_id)).toEqual([1, null, 1, 2]);

    await initDb();

    expect(userVersion()).toBe(7);
    expect(await getSetting('language')).toBe('es');
    expect(await getSetting('default_currency')).toBe('EUR');
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(recurringRows()).toEqual(
      recurringBefore.map((row) => ({ ...(row as object), dismissed_at: null })),
    );
    expect(allTransactions()).toEqual(
      transactionsBefore.map((row) => ({ ...row, recurring_occurrence: null })),
    );
    expect(recurringColumns().slice(-2).map((column) => column.name)).toEqual([
      'created_at',
      'dismissed_at',
    ]);
    expect(transactionColumns().slice(-2).map((column) => column.name)).toEqual([
      'created_at',
      'recurring_occurrence',
    ]);
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(foreignKeys()).toBe(1);
    // No table was rebuilt: the counter and the indexes are as they were.
    expect(sequence('transactions')).toEqual([{ seq: 4 }]);
    expect(schema().some((item) => item.name === 'transactions_new')).toBe(false);
    expect(
      schema().find((item) => item.name === 'idx_transactions_account_date'),
    ).toMatchObject({ tbl_name: 'transactions' });
  });

  it('ON DELETE SET NULL on recurring_id leaves recurring_occurrence in place (harmless)', async () => {
    await seedV6();
    await initDb();
    mockReal.exec("UPDATE transactions SET recurring_occurrence = '2026-03-15' WHERE id IN (1, 3)");
    await mockReal.adapter.runAsync('DELETE FROM recurring_payments WHERE id = ?', 1);
    expect(
      allTransactions().map((row) => [row.id, row.recurring_id, row.recurring_occurrence]),
    ).toEqual([
      [1, null, '2026-03-15'],
      [2, null, null],
      [3, null, '2026-03-15'],
      [4, 2, null],
    ]);
  });
});

describe('a failed upgrade from v6 changes nothing, and a retry succeeds', () => {
  const failures = [
    ['the dismissed_at column', 'ADD COLUMN dismissed_at'],
    ['the recurring_occurrence column', 'ADD COLUMN recurring_occurrence'],
    ['writing the version', 'PRAGMA user_version = 7'],
  ] as const;

  it.each(failures)('fails at %s', async (_label, statement) => {
    await seedV6();
    const schemaBefore = schema();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const recurringBefore = recurringRows();
    const transactionsBefore = allTransactions();

    mockReal.failOn(statement);
    await expect(initDb()).rejects.toThrow('Injected failure');

    // The statement was really reached, then everything was rolled back, even
    // a column that had already been added: the database is exactly v6.
    expect(mockReal.statements.some((sql) => sql.includes(statement))).toBe(true);
    expect(userVersion()).toBe(6);
    expect(schema()).toEqual(schemaBefore);
    expect(recurringColumns().some((column) => column.name === 'dismissed_at')).toBe(false);
    expect(transactionColumns().some((column) => column.name === 'recurring_occurrence')).toBe(false);
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(recurringRows()).toEqual(recurringBefore);
    expect(allTransactions()).toEqual(transactionsBefore);
    expect(mockReal.query('SELECT key FROM settings ORDER BY key')).toEqual([
      { key: 'default_currency' },
      { key: 'language' },
    ]);

    // Retry without the failure.
    mockReal.clearFailure();
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(7);
    expect(recurringRows()).toEqual(
      recurringBefore.map((row) => ({ ...(row as object), dismissed_at: null })),
    );
    expect(allTransactions()).toEqual(
      transactionsBefore.map((row) => ({ ...row, recurring_occurrence: null })),
    );
    expect(foreignKeys()).toBe(1);
  });
});

describe('dismiss, pay and undo through the real services', () => {
  const now = new Date(2026, 3, 20, 9, 30, 15);

  const setup = async () => {
    await seedV6();
    await initDb();
  };

  it('dismissRecurring sets dismissed_at and leaves last_confirmed_at alone; a missing payment throws', async () => {
    await setup();
    await dismissRecurring(1, '2026-04-15');
    expect(await getRecurring(1)).toMatchObject({
      dismissedAt: '2026-04-15',
      lastConfirmedAt: '2026-03-15',
    });
    expect((await getRecurring(2))?.dismissedAt).toBeNull();
    await expect(dismissRecurring(99, '2026-04-15')).rejects.toThrow('not found');
  });

  it('payOccurrence creates one linked expense and confirms the occurrence', async () => {
    await setup();
    const before = allTransactions().length;
    const result = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });

    expect(allTransactions()).toHaveLength(before + 1);
    const stored = mockReal.query<Record<string, unknown>>(
      'SELECT * FROM transactions WHERE id = ?',
      result.transaction.id,
    )[0];
    expect(stored).toEqual({
      id: result.transaction.id,
      account_id: 1,
      kind: 'expense',
      amount_cents: 1000,
      date: now.toISOString(),
      note: 'monthly',
      recurring_id: 1,
      recurring_occurrence: '2026-04-15',
      created_at: now.toISOString(),
    });
    expect(result.transaction).toEqual({
      id: result.transaction.id,
      accountId: 1,
      kind: 'expense',
      amountCents: 1000,
      date: now.toISOString(),
      note: 'monthly',
      recurringId: 1,
      recurringOccurrence: '2026-04-15',
      createdAt: now.toISOString(),
    });
    expect(result.payment.lastConfirmedAt).toBe('2026-04-15');
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-04-15');
  });

  it('pays a payment with no account from a chosen account in another currency: cents unchanged, empty note kept null', async () => {
    await setup();
    const result = await payOccurrence({ paymentId: 2, occurrence: '2026-04-16', accountId: 2, now });
    expect(result.transaction).toMatchObject({
      accountId: 2,
      amountCents: 500,
      note: null,
      recurringId: 2,
      recurringOccurrence: '2026-04-16',
    });
    // The payment itself still has no account.
    expect((await getRecurring(2))?.accountId).toBeNull();
    expect((await getRecurring(2))?.lastConfirmedAt).toBe('2026-04-16');
  });

  it('writes neither half when the confirmation fails', async () => {
    await setup();
    const before = allTransactions();
    mockReal.failOn('UPDATE recurring_payments SET last_confirmed_at');
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now }),
    ).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    expect(allTransactions()).toEqual(before);
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-03-15');
  });

  it('writes neither half when the expense insert fails', async () => {
    await setup();
    mockReal.failOn('INSERT INTO transactions');
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now }),
    ).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-03-15');
  });

  it('refuses an already handled occurrence, a missing payment and a missing account, writing nothing', async () => {
    await setup();
    const before = allTransactions();
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-03-15', accountId: 1, now }),
    ).rejects.toThrow('already handled');
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-02-15', accountId: 1, now }),
    ).rejects.toThrow('already handled');
    await expect(
      payOccurrence({ paymentId: 99, occurrence: '2026-04-15', accountId: 1, now }),
    ).rejects.toThrow('not found');
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 99, now }),
    ).rejects.toThrow('not found');
    expect(allTransactions()).toEqual(before);
  });

  it('two overlapping payOccurrence calls for one occurrence write exactly one expense and one confirmation', async () => {
    await setup();
    const before = allTransactions().length;
    const first = payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    const second = payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    const results = await Promise.allSettled([first, second]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(AlreadyHandledError) });
    expect(allTransactions()).toHaveLength(before + 1);
    expect(
      allTransactions().filter((row) => row.recurring_occurrence === '2026-04-15'),
    ).toHaveLength(1);
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-04-15');
    // The loser's guarded UPDATE changed nothing and no second expense was inserted.
    expect(
      mockReal.statements.filter((sql) => sql.startsWith('INSERT INTO transactions (account_id')),
    ).toHaveLength(1);
  });

  it('the guard is atomic: it refuses when the confirmation is already at or past the occurrence, even if it was read earlier', async () => {
    await setup();
    // Read the payment as unpaid for April, then another write confirms May
    // before this call's transaction runs.
    const stale = await getRecurring(1);
    expect(stale?.lastConfirmedAt).toBe('2026-03-15');
    mockReal.exec("UPDATE recurring_payments SET last_confirmed_at = '2026-05-15' WHERE id = 1");
    const before = allTransactions();
    await expect(
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now }),
    ).rejects.toBeInstanceOf(AlreadyHandledError);
    expect(allTransactions()).toEqual(before);
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-05-15');
  });

  it('an account delete overlapping a pay: both complete and the state is consistent', async () => {
    await setup();
    // Payment 1 belongs to account 1; pay it from account 2 while account 1 is
    // being deleted (its payments go with it, and the new expense's link clears).
    const [paid, removed] = await Promise.allSettled([
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 2, now }),
      removeAccount(1),
    ]);
    expect(removed.status).toBe('fulfilled');
    expect(paid.status).toBe('fulfilled');
    expect(mockReal.query('SELECT id FROM accounts')).toEqual([{ id: 2 }]);
    expect(await getRecurring(1)).toBeNull();
    const expense = allTransactions().find((row) => row.recurring_occurrence === '2026-04-15');
    // The expense survived on account 2, its link cleared by the cascade.
    expect(expense).toMatchObject({ account_id: 2, recurring_id: null });
    expect(allTransactions().every((row) => row.account_id === 2)).toBe(true);
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('the same two calls in the other order also complete: the pay is refused cleanly', async () => {
    await setup();
    const [removed, paid] = await Promise.allSettled([
      removeAccount(1),
      payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 2, now }),
    ]);
    expect(removed.status).toBe('fulfilled');
    // Account 1 and its payment are gone, so the pay finds nothing to pay.
    expect(paid).toMatchObject({ status: 'rejected' });
    expect(mockReal.query('SELECT id FROM accounts')).toEqual([{ id: 2 }]);
    expect(allTransactions().some((row) => row.recurring_occurrence === '2026-04-15')).toBe(false);
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('two overlapping undo calls for the same expense undo once', async () => {
    await setup();
    const paid = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    const [a, b] = await Promise.all([
      removeTransactionUndoing(paid.transaction.id),
      removeTransactionUndoing(paid.transaction.id),
    ]);
    expect([a.undone, b.undone].filter(Boolean)).toHaveLength(1);
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-03-15');
  });

  it('deleting the latest linked expense restores the previous occurrence', async () => {
    await setup();
    const paid = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    const result = await removeTransactionUndoing(paid.transaction.id);
    expect(result).toEqual({ undone: { paymentId: 1, lastConfirmedAt: '2026-03-15' } });
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-03-15');
    expect(allTransactions().some((row) => row.id === paid.transaction.id)).toBe(false);
  });

  it('deleting the expense of the FIRST occurrence sets last_confirmed_at to NULL', async () => {
    await setup();
    // Gym: weekly from Thursday 2026-01-01; pay the first occurrence.
    const paid = await payOccurrence({
      paymentId: 2,
      occurrence: '2026-01-01',
      accountId: 1,
      now: new Date(2026, 0, 1, 9),
    });
    const result = await removeTransactionUndoing(paid.transaction.id);
    expect(result).toEqual({ undone: { paymentId: 2, lastConfirmedAt: null } });
    expect((await getRecurring(2))?.lastConfirmedAt).toBeNull();
  });

  it('deleting an OLDER linked expense changes nothing but the delete', async () => {
    await setup();
    const older = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    await payOccurrence({ paymentId: 1, occurrence: '2026-05-15', accountId: 1, now });
    const result = await removeTransactionUndoing(older.transaction.id);
    expect(result).toEqual({ undone: null });
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-05-15');
  });

  it('deleting a linked expense with no occurrence (older data) or an unlinked one changes nothing', async () => {
    await setup();
    // Transaction 1 is linked to payment 1 (v6 data, no occurrence).
    expect(await removeTransactionUndoing(1)).toEqual({ undone: null });
    expect(await removeTransactionUndoing(2)).toEqual({ undone: null });
    expect(await removeTransactionUndoing(999)).toEqual({ undone: null });
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-03-15');
    expect(allTransactions().map((row) => row.id)).toEqual([3, 4]);
  });

  it('keeps the expense when the undo fails', async () => {
    await setup();
    const paid = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 1, now });
    mockReal.failOn('UPDATE recurring_payments SET last_confirmed_at');
    await expect(removeTransactionUndoing(paid.transaction.id)).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    expect(allTransactions().some((row) => row.id === paid.transaction.id)).toBe(true);
    expect((await getRecurring(1))?.lastConfirmedAt).toBe('2026-04-15');
  });

  it('deleting an account clears recurring_id on other accounts transactions linked to its payments', async () => {
    await setup();
    // Payment 1 belongs to account 1; pay it from account 2 (relabel).
    const paid = await payOccurrence({ paymentId: 1, occurrence: '2026-04-15', accountId: 2, now });
    await removeAccount(1);
    const row = allTransactions().find((item) => item.id === paid.transaction.id);
    expect(row).toMatchObject({
      account_id: 2,
      recurring_id: null,
      // The database keeps the occurrence; it is only read while linked.
      recurring_occurrence: '2026-04-15',
    });
    expect(await getRecurring(1)).toBeNull();
  });
});

describe('Pay now and Skip through the real services', () => {
  const created = new Date(2026, 9, 1, 9, 0, 0);
  const now = new Date(2026, 10, 9, 10, 30, 0);
  const input: RecurringInput = {
    accountId: 1,
    name: 'Rent',
    amount: '10.00',
    interval: '1',
    unit: 'month',
    startDate: '2026-10-15',
    endDate: null,
    note: 'monthly',
    active: true,
  };

  const setup = async () => {
    await initDb();
    insertAccounts();
    return createRecurring(input, created);
  };

  it('Pay now with an edited amount on another account writes one expense and leaves the payment alone', async () => {
    const payment = await setup();
    const result = await payOccurrence({
      paymentId: payment.id,
      occurrence: '2026-10-15',
      accountId: 2,
      amountCents: 250000,
      now,
    });
    const rows = allTransactions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.transaction.id,
      account_id: 2,
      kind: 'expense',
      amount_cents: 250000,
      note: 'monthly',
      recurring_id: payment.id,
      recurring_occurrence: '2026-10-15',
    });
    expect(await getRecurring(payment.id)).toEqual({ ...payment, lastConfirmedAt: '2026-10-15' });
  });

  it('rejects a zero or fractional amount and writes nothing', async () => {
    const payment = await setup();
    for (const amountCents of [0, -5, 1.5]) {
      await expect(
        payOccurrence({ paymentId: payment.id, occurrence: '2026-10-15', accountId: 1, amountCents, now }),
      ).rejects.toThrow('Invalid amount');
    }
    expect(allTransactions()).toHaveLength(0);
    expect((await getRecurring(payment.id))?.lastConfirmedAt).toBeNull();
  });

  it('Skip confirms the occurrence without an expense', async () => {
    const payment = await setup();
    const skipped = await skipOccurrence(payment.id, '2026-10-15', now);
    expect(skipped.lastConfirmedAt).toBe('2026-10-15');
    expect((await getRecurring(payment.id))?.lastConfirmedAt).toBe('2026-10-15');
    expect(allTransactions()).toHaveLength(0);
  });

  it('Skip twice, or after paying, or an older occurrence, is AlreadyHandled and writes nothing', async () => {
    const payment = await setup();
    await skipOccurrence(payment.id, '2026-10-15', now);
    await expect(skipOccurrence(payment.id, '2026-10-15', now)).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skipOccurrence(payment.id, '2026-09-15', now)).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(
      payOccurrence({ paymentId: payment.id, occurrence: '2026-10-15', accountId: 1, now }),
    ).rejects.toBeInstanceOf(AlreadyHandledError);
    expect(allTransactions()).toHaveLength(0);
    await expect(skipOccurrence(999, '2026-10-15', now)).rejects.toThrow('not found');
  });

  it('two overlapping Skips write once', async () => {
    const payment = await setup();
    const results = await Promise.allSettled([
      skipOccurrence(payment.id, '2026-10-15', now),
      skipOccurrence(payment.id, '2026-10-15', now),
    ]);
    expect(results.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('Skip then Pay of the next occurrence works, paying early included', async () => {
    const payment = await setup();
    await skipOccurrence(payment.id, '2026-10-15', now);
    await payOccurrence({ paymentId: payment.id, occurrence: '2026-11-15', accountId: 1, now });
    expect((await getRecurring(payment.id))?.lastConfirmedAt).toBe('2026-11-15');
    expect(allTransactions()).toHaveLength(1);
  });
});

describe('pay and skip only act on the occurrence the payment is waiting on (real SQLite)', () => {
  const now = new Date(2026, 10, 9, 10, 30, 0);
  const base: RecurringInput = {
    accountId: 1,
    name: 'Rent',
    amount: '10.00',
    interval: '1',
    unit: 'month',
    startDate: '2026-10-15',
    endDate: null,
    note: '',
    active: true,
  };
  const create = async (extra: Partial<RecurringInput> = {}, at = new Date(2026, 9, 1)) => {
    await initDb();
    insertAccounts();
    return (await createRecurring({ ...base, ...extra }, at)).id;
  };
  const pay = (id: number, occurrence: string) =>
    payOccurrence({ paymentId: id, occurrence, accountId: 1, now });
  const skip = (id: number, occurrence: string) => skipOccurrence(id, occurrence, now);
  const untouched = async (id: number, last: string | null = null) => {
    expect(allTransactions()).toHaveLength(0);
    expect((await getRecurring(id))?.lastConfirmedAt).toBe(last);
  };

  it.each([
    ['a past occurrence', '2026-09-15'],
    ['a future one beyond the current', '2026-11-15'],
    ['a far future one', '2026-12-15'],
    ['a day that is not an occurrence', '2026-10-16'],
  ])('rejects %s for pay (quick Paid too) and skip, writing nothing', async (_name, day) => {
    const id = await create();
    await expect(pay(id, day)).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skip(id, day)).rejects.toBeInstanceOf(AlreadyHandledError);
    await untouched(id);
  });

  it('accepts the current occurrence, then only the next one', async () => {
    const id = await create();
    await expect(pay(id, '2026-10-15')).resolves.toBeDefined();
    await expect(pay(id, '2026-12-15')).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skip(id, '2026-12-15')).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skip(id, '2026-11-15')).resolves.toBeDefined();
    expect((await getRecurring(id))?.lastConfirmedAt).toBe('2026-11-15');
  });

  it('accepts the next occurrence (early) when none is due yet, and nothing after it', async () => {
    const id = await create({ startDate: '2026-12-01' });
    await expect(pay(id, '2027-01-01')).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skip(id, '2026-11-01')).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(pay(id, '2026-12-01')).resolves.toBeDefined();
  });

  it('rejects an inactive payment, even for its current occurrence', async () => {
    const id = await create({ active: false });
    await expect(pay(id, '2026-10-15')).rejects.toBeInstanceOf(AlreadyHandledError);
    await expect(skip(id, '2026-10-15')).rejects.toBeInstanceOf(AlreadyHandledError);
    await untouched(id);
  });

  it('rejects a finished payment', async () => {
    const id = await create({ endDate: '2026-10-20' });
    await skip(id, '2026-10-15');
    for (const day of ['2026-10-15', '2026-11-15']) {
      await expect(pay(id, day)).rejects.toBeInstanceOf(AlreadyHandledError);
      await expect(skip(id, day)).rejects.toBeInstanceOf(AlreadyHandledError);
    }
    expect(allTransactions()).toHaveLength(0);
  });

  it('judges the schedule as it is now: an occurrence from before an edit is rejected', async () => {
    const id = await create();
    // A screen opened for Oct 15, then the schedule was edited to start Dec 1.
    await updateRecurring(id, { ...base, startDate: '2026-12-01' }, now);
    await expect(pay(id, '2026-10-15')).rejects.toBeInstanceOf(AlreadyHandledError);
    await untouched(id);
  });

  describe('with a dismissed card', () => {
    // Weekly from Mon Nov 2; today Nov 9: the current occurrence is Nov 9.
    const weekly = async () => {
      const id = await create(
        { unit: 'week', startDate: '2026-11-02' },
        new Date(2026, 10, 2),
      );
      await dismissRecurring(id, '2026-11-09');
      return id;
    };

    it('ignores the dismissal for the current occurrence', async () => {
      const id = await weekly();
      await expect(skip(id, '2026-11-09')).resolves.toBeDefined();
    });

    it('also accepts the occurrence the deck shows after the dismissed one (quick Paid on that card), no further', async () => {
      const id = await weekly();
      await expect(pay(id, '2026-11-23')).rejects.toBeInstanceOf(AlreadyHandledError);
      await expect(pay(id, '2026-11-16')).resolves.toBeDefined();
      expect((await getRecurring(id))?.lastConfirmedAt).toBe('2026-11-16');
    });

    it('the successor is accepted on the last day of the 7-day window (today + 7) and rejected beyond it', async () => {
      // Weekly: successor Nov 16 = today (Nov 9) + 7, inside.
      const inside = await weekly();
      await expect(skip(inside, '2026-11-16')).resolves.toBeDefined();
    });

    it('rejects a successor beyond the window', async () => {
      // Monthly from Nov 1, dismissed: the successor Dec 1 is 22 days away, so
      // the deck does not show it and it cannot be paid or skipped.
      const id = await create({ startDate: '2026-11-01' }, new Date(2026, 10, 1));
      await dismissRecurring(id, '2026-11-01');
      await expect(pay(id, '2026-12-01')).rejects.toBeInstanceOf(AlreadyHandledError);
      await expect(skip(id, '2026-12-01')).rejects.toBeInstanceOf(AlreadyHandledError);
      await untouched(id);
      // The dismissed current occurrence itself is still fine.
      await expect(pay(id, '2026-11-01')).resolves.toBeDefined();
    });
  });

  describe('the conditional UPDATE guard, behind the pre-check', () => {
    // The pre-check normally rejects first. To prove the UPDATE alone still
    // refuses a handled occurrence (a change that slipped in after the re-read),
    // the pre-check is forced to say yes for the call; no production hook needed.
    afterEach(() => jest.restoreAllMocks());

    it('pay: an occurrence already confirmed is rejected by the UPDATE and no expense is written', async () => {
      const id = await create();
      await skip(id, '2026-10-15');
      jest.spyOn(recurringModule, 'canHandleOccurrence').mockReturnValue(true);
      await expect(pay(id, '2026-10-15')).rejects.toBeInstanceOf(AlreadyHandledError);
      expect(recurringModule.canHandleOccurrence).toHaveBeenCalled();
      await untouched(id, '2026-10-15');
    });

    it('skip: the same, and the confirmation is unchanged', async () => {
      const id = await create();
      await skip(id, '2026-10-15');
      await skip(id, '2026-11-15');
      jest.spyOn(recurringModule, 'canHandleOccurrence').mockReturnValue(true);
      await expect(skip(id, '2026-10-15')).rejects.toBeInstanceOf(AlreadyHandledError);
      await expect(skip(id, '2026-11-15')).rejects.toBeInstanceOf(AlreadyHandledError);
      await untouched(id, '2026-11-15');
    });
  });

  it('the paid-today prompt: a new active payment starting today can be paid for today', async () => {
    const id = await create({ startDate: '2026-11-09' }, now);
    await expect(pay(id, '2026-11-09')).resolves.toBeDefined();
    expect(allTransactions()).toHaveLength(1);
  });
});

describe('editing after a payment was paid or skipped (real SQLite)', () => {
  const created = new Date(2026, 9, 1, 9, 0, 0);
  // Today is Nov 9. The payment is monthly from Oct 15 and Oct 15 was handled.
  const now = new Date(2026, 10, 9, 10, 30, 0);
  const today = '2026-11-09';
  const base: RecurringInput = {
    accountId: 1,
    name: 'Rent',
    amount: '10.00',
    interval: '1',
    unit: 'month',
    startDate: '2026-10-15',
    endDate: null,
    note: '',
    active: true,
  };

  const setup = async (how: 'paid' | 'skipped', startDate = '2026-10-15') => {
    await initDb();
    insertAccounts();
    // Created on the start date itself, so a past start date is allowed.
    const at = dayToDate(startDate);
    const payment = await createRecurring({ ...base, startDate }, at);
    if (how === 'paid') {
      await payOccurrence({ paymentId: payment.id, occurrence: startDate, accountId: 1, now: at });
    } else {
      await skipOccurrence(payment.id, startDate, at);
    }
    return payment.id;
  };
  const next = async (id: number, day = today) => scheduleState((await getRecurring(id))!, day);
  const edit = (id: number, extra: Partial<RecurringInput>) =>
    updateRecurring(id, { ...base, ...extra }, now);
  const expectCode = async (promise: Promise<unknown>, code: string) =>
    expect(await promise.then(() => null, (error: { code?: string }) => error.code)).toBe(code);

  it.each(['paid', 'skipped'] as const)(
    'renames and amount edits (%s) move nothing: handled occurrence, start date and expenses stay',
    async (how) => {
      const id = await setup(how);
      const before = allTransactions();
      // Account 2 is in yen: no decimals.
      await edit(id, { name: 'Flat', amount: '99', note: 'x', accountId: 2 });
      expect(await getRecurring(id)).toMatchObject({
        name: 'Flat',
        amountCents: 9900,
        startDate: '2026-10-15',
        lastConfirmedAt: '2026-10-15',
      });
      expect(allTransactions()).toEqual(before);
      expect(await next(id)).toEqual({ kind: 'upcoming', date: '2026-11-15' });
    },
  );

  it('leaving the schedule alone keeps the stored anchor (a clamped month does not drift)', async () => {
    // Monthly from Jan 31; Feb 28 was handled. A rename must not re-anchor to
    // Feb 28 (that would make the next one Mar 28 instead of Mar 31).
    const id = await setup('paid', '2026-01-31');
    await expect(skipOccurrence(id, '2026-02-28', new Date(2026, 1, 28))).resolves.toBeDefined();
    await updateRecurring(id, { ...base, startDate: '2026-02-28', name: 'Flat' }, new Date(2026, 2, 1));
    expect(await getRecurring(id)).toMatchObject({ startDate: '2026-01-31', lastConfirmedAt: '2026-02-28' });
    expect(await next(id, '2026-03-01')).toEqual({ kind: 'upcoming', date: '2026-03-31' });
  });

  it.each(['paid', 'skipped'] as const)(
    'changing the interval (%s) counts from the handled occurrence, which stays handled',
    async (how) => {
      const id = await setup(how);
      await edit(id, { interval: '2' });
      expect(await getRecurring(id)).toMatchObject({
        interval: 2,
        startDate: '2026-10-15',
        lastConfirmedAt: '2026-10-15',
      });
      // Anchor + one new step.
      expect(await next(id, '2026-10-16')).toEqual({ kind: 'upcoming', date: '2026-12-15' });
      expect(await next(id)).toEqual({ kind: 'upcoming', date: '2026-12-15' });
    },
  );

  it.each(['paid', 'skipped'] as const)(
    'changing the unit (%s) counts from the handled occurrence',
    async (how) => {
      const id = await setup(how);
      await edit(id, { unit: 'week' });
      expect(await getRecurring(id)).toMatchObject({
        unit: 'week',
        startDate: '2026-10-15',
        lastConfirmedAt: '2026-10-15',
      });
      expect(await next(id, '2026-10-16')).toEqual({ kind: 'upcoming', date: '2026-10-22' });
    },
  );

  it('re-anchors from a handled occurrence that is not the stored start date', async () => {
    const id = await setup('paid');
    await payOccurrence({ paymentId: id, occurrence: '2026-11-15', accountId: 1, now });
    await edit(id, { startDate: '2026-11-15', interval: '3' });
    expect(await getRecurring(id)).toMatchObject({ startDate: '2026-11-15', lastConfirmedAt: '2026-11-15' });
    expect(await next(id)).toEqual({ kind: 'upcoming', date: '2027-02-15' });
  });

  it('a new start date after the handled one and today or later becomes the anchor; nothing is handled by it', async () => {
    const id = await setup('paid');
    await edit(id, { startDate: '2026-12-01' });
    expect(await getRecurring(id)).toMatchObject({ startDate: '2026-12-01', lastConfirmedAt: '2026-10-15' });
    expect(await next(id)).toEqual({ kind: 'upcoming', date: '2026-12-01' });
    // Today itself is allowed, and is then due.
    await edit(id, { startDate: today });
    expect(await next(id)).toEqual({ kind: 'current', date: today });
  });

  it('a new start date on or before the handled one, or in the past, is rejected and nothing changes', async () => {
    const id = await setup('skipped');
    const stored = await getRecurring(id);
    await expectCode(edit(id, { startDate: '2026-10-10' }), 'startDateNotAfterHandled');
    await expectCode(edit(id, { startDate: '2026-10-14' }), 'startDateNotAfterHandled');
    // After the handled one but before today.
    await expectCode(edit(id, { startDate: '2026-10-16' }), 'startDateInPast');
    await expectCode(edit(id, { startDate: '2026-11-08' }), 'startDateInPast');
    expect(await getRecurring(id)).toEqual(stored);
  });

  it('an end date before the new anchor is rejected, also when only the interval changed', async () => {
    const id = await setup('paid');
    const stored = await getRecurring(id);
    await expectCode(edit(id, { interval: '2', endDate: '2026-10-01' }), 'endBeforeStart');
    await expectCode(edit(id, { startDate: '2026-12-01', endDate: '2026-11-30' }), 'endBeforeStart');
    expect(await getRecurring(id)).toEqual(stored);
    // On the anchor itself is fine (the payment is then finished).
    await edit(id, { interval: '2', endDate: '2026-10-15' });
    expect(await next(id)).toEqual({ kind: 'finished' });
  });

  it('never-paid payments keep the old rules', async () => {
    await initDb();
    insertAccounts();
    const payment = await createRecurring(base, created);
    await edit(payment.id, { name: 'Flat' });
    expect((await getRecurring(payment.id))?.startDate).toBe('2026-10-15');
    await expectCode(edit(payment.id, { startDate: '2026-10-16' }), 'startDateInPast');
    await edit(payment.id, { startDate: '2026-11-20', interval: '2' });
    expect(await getRecurring(payment.id)).toMatchObject({ startDate: '2026-11-20', lastConfirmedAt: null });
  });

  describe('undo after a re-anchor', () => {
    const lastConfirmed = async (id: number) => (await getRecurring(id))?.lastConfirmedAt;

    it('deleting the expense of the anchor makes the anchor unpaid again (never earlier than it)', async () => {
      const id = await setup('paid');
      const txId = allTransactions()[0].id;
      await edit(id, { interval: '2' });
      expect(await removeTransactionUndoing(txId)).toEqual({ undone: { paymentId: id, lastConfirmedAt: null } });
      expect(await lastConfirmed(id)).toBeNull();
      // The anchor is the first occurrence of the new schedule, due again.
      expect(await next(id)).toEqual({ kind: 'current', date: '2026-10-15' });
    });

    it('an occurrence paid after the re-anchor undoes back to the anchor', async () => {
      const id = await setup('paid');
      await edit(id, { interval: '2' });
      const paid = await payOccurrence({ paymentId: id, occurrence: '2026-12-15', accountId: 1, now });
      expect(await removeTransactionUndoing(paid.transaction.id)).toEqual({
        undone: { paymentId: id, lastConfirmedAt: '2026-10-15' },
      });
      expect(await lastConfirmed(id)).toBe('2026-10-15');
    });

    it('after a start date change, deleting the old expense clears the confirmation and the new start stays next', async () => {
      const id = await setup('paid');
      const txId = allTransactions()[0].id;
      await edit(id, { startDate: '2026-12-01' });
      expect(await removeTransactionUndoing(txId)).toEqual({ undone: { paymentId: id, lastConfirmedAt: null } });
      expect(await next(id)).toEqual({ kind: 'upcoming', date: '2026-12-01' });
    });

    it('deleting the expense of an older, handled-before occurrence changes nothing', async () => {
      const id = await setup('paid');
      const older = allTransactions()[0].id;
      await edit(id, { interval: '2' });
      await skipOccurrence(id, '2026-12-15', now);
      expect(await removeTransactionUndoing(older)).toEqual({ undone: null });
      expect(await lastConfirmed(id)).toBe('2026-12-15');
    });
  });
});
