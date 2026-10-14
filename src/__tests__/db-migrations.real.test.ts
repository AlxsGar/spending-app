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
import { createRealSqlite, seedSchema } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';

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
  it('ends at v5 with the balance anchor columns, the foreign key in the transactions DDL and the index', async () => {
    await initDb();
    expect(userVersion()).toBe(5);
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

describe('upgrades end at v5 with an identical schema', () => {
  it('from v1, v2, v3 and v4 the schema equals a fresh install', async () => {
    await initDb();
    const fresh = schema();
    mockReal.close();

    for (const version of [1, 2, 3, 4] as const) {
      mockReal = createRealSqlite();
      resetDbForTests();
      seedSchema(mockReal, version);
      await initDb();
      expect(userVersion()).toBe(5);
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
    expect(userVersion()).toBe(5);
    expect(await getSetting('language')).toBe('es');
    expect(allTransactions()).toEqual([]);
  });

  it('from v2 keeps the settings and the accounts', async () => {
    seedSchema(mockReal, 2);
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es')");
    insertAccounts();
    await initDb();
    expect(userVersion()).toBe(5);
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

    expect(userVersion()).toBe(5);
    expect(await getSetting('language')).toBe('es');
    expect(await getSetting('default_currency')).toBe('EUR');
    // Every old column is unchanged; the two new ones have their defaults.
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(
      accountsBefore.map((row) => ({ ...row, balance_anchor_cents: 0, balance_anchor_at: null })),
    );
    expectNoAnchors();
    expect(allTransactions()).toEqual(VALID);
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

    expect(userVersion()).toBe(5);
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
    expect(allTransactions()).toEqual(transactionsBefore);
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
  it('are ON after open on a fresh install, after an upgrade, and on an already-v5 database', async () => {
    expect(foreignKeys()).toBe(0);
    await initDb();
    expect(foreignKeys()).toBe(1);

    // Already v5: no migration runs, and it is still turned ON.
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
    expect(userVersion()).toBe(5);
    expect(allTransactions()).toEqual(VALID);
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
    expect(userVersion()).toBe(5);
    expect(allTransactions()).toEqual(VALID);
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
    mockReal.failOn('PRAGMA user_version = 5');
    await expect(initDb()).rejects.toThrow('Injected failure');
    expect(userVersion()).toBe(3);
    expect(
      schema().find((item) => item.name === 'transactions')?.sql,
    ).not.toContain('REFERENCES');
    expect(allTransactions()).toHaveLength(VALID.length + ORPHANS.length);
  });
});

describe('a failed v4 to v5 upgrade changes nothing, and a retry succeeds', () => {
  const failures = [
    ['the first ADD COLUMN', 'ADD COLUMN balance_anchor_cents'],
    ['the second ADD COLUMN', 'ADD COLUMN balance_anchor_at'],
    ['writing the version', 'PRAGMA user_version = 5'],
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
    expect(userVersion()).toBe(5);
    expect(accountColumns()).toHaveLength(2);
    expectNoAnchors();
    expect(allTransactions()).toEqual(rowsBefore);
    expect(foreignKeys()).toBe(1);
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
