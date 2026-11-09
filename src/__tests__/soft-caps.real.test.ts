/**
 * v8 (soft_caps) on a REAL SQLite database (node:sqlite, see
 * src/test/real-sqlite.ts): the upgrade from v7, a fresh install, the table's
 * constraints, the cascade, rollback, and the services that write caps.
 *
 * @jest-environment node
 */
import { createAccount, removeAccount, updateAccount } from '@/services/accounts';
import { initDb, resetDbForTests } from '@/services/db';
import { listCaps, saveGlobalCap } from '@/services/soft-caps';
import { createRealSqlite, seedSchema } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';
import { silenceConsoleError } from '@/test/console-error';

// Failed upgrades log "[db] open/migrate failed:" before rethrowing.
silenceConsoleError();

let mockReal: RealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));

const userVersion = () =>
  mockReal.query<{ user_version: number }>('PRAGMA user_version')[0].user_version;
const schema = () =>
  mockReal
    .query<{ type: string; name: string; sql: string | null }>(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .map((item) => ({ ...item, sql: item.sql && item.sql.replace(/\s+/g, ' ') }));
const capRows = () =>
  mockReal.query<{ id: number; account_id: number | null; period: string; amount_cents: number }>(
    'SELECT * FROM soft_caps ORDER BY id',
  );
const run = (sql: string, ...params: (string | number | null)[]) =>
  mockReal.adapter.runAsync(sql, ...params);

const ACCOUNT_SQL =
  'INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const insertAccounts = async () => {
  await run(ACCOUNT_SQL, 1, 'Checking', 'bank', 'MXN', 1, '2026-01-01T00:00:00.000Z');
  await run(ACCOUNT_SQL, 2, 'Cash', 'wallet', 'MXN', 0, '2026-01-02T00:00:00.000Z');
};
const insertTx = (id: number, accountId: number) =>
  run(
    "INSERT INTO transactions (id, account_id, kind, amount_cents, date, created_at) VALUES (?, ?, 'expense', 100, '2026-01-05T12:00:00.000Z', '2026-01-05T12:00:00.000Z')",
    id,
    accountId,
  );

beforeEach(() => {
  mockReal = createRealSqlite();
  resetDbForTests();
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

describe('upgrade from v7', () => {
  const seedV7 = async () => {
    seedSchema(mockReal, 7);
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'es')");
    await insertAccounts();
    await insertTx(1, 1);
    await insertTx(2, 2);
  };

  it('adds an empty soft_caps table and keeps every existing row untouched', async () => {
    await seedV7();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const transactionsBefore = mockReal.query('SELECT * FROM transactions ORDER BY id');
    const accountsSqlBefore = schema().find((item) => item.name === 'accounts');

    await initDb();

    expect(userVersion()).toBe(8);
    expect(capRows()).toEqual([]);
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(mockReal.query('SELECT * FROM transactions ORDER BY id')).toEqual(transactionsBefore);
    // accounts is not changed by this step.
    expect(schema().find((item) => item.name === 'accounts')).toEqual(accountsSqlBefore);
    expect(mockReal.query('SELECT value FROM settings WHERE key = ?', 'language')).toEqual([
      { value: 'es' },
    ]);
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('a fresh install ends at v8 with the same schema as the upgrade', async () => {
    await initDb();
    expect(userVersion()).toBe(8);
    const fresh = schema();
    mockReal.close();

    mockReal = createRealSqlite();
    resetDbForTests();
    await seedV7();
    await initDb();
    expect(schema()).toEqual(fresh);
  });

  it('declares the table and the scope index as decided', async () => {
    await initDb();
    const table = schema().find((item) => item.name === 'soft_caps');
    expect(table?.sql).toContain('id INTEGER PRIMARY KEY');
    expect(table?.sql).not.toContain('AUTOINCREMENT');
    expect(table?.sql).toContain('account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE');
    expect(table?.sql).toContain("period TEXT NOT NULL CHECK (period IN ('day','week','month'))");
    expect(table?.sql).toContain('amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)');
    expect(schema().find((item) => item.name === 'idx_soft_caps_scope')?.sql).toContain(
      'UNIQUE INDEX idx_soft_caps_scope ON soft_caps (COALESCE(account_id, 0))',
    );
  });
});

describe('a failed upgrade from v7 changes nothing, and a retry succeeds', () => {
  const failures = [
    ['creating the table', 'CREATE TABLE soft_caps'],
    ['creating the scope index', 'CREATE UNIQUE INDEX idx_soft_caps_scope'],
    ['writing the version', 'PRAGMA user_version = 8'],
  ] as const;

  it.each(failures)('fails at %s', async (_label, statement) => {
    seedSchema(mockReal, 7);
    await insertAccounts();
    await insertTx(1, 1);
    const schemaBefore = schema();
    const accountsBefore = mockReal.query('SELECT * FROM accounts ORDER BY id');
    const transactionsBefore = mockReal.query('SELECT * FROM transactions ORDER BY id');

    mockReal.failOn(statement);
    await expect(initDb()).rejects.toThrow('Injected failure');

    // The statement was reached, then everything rolled back, even a table or
    // index that had already been created: the database is exactly v7.
    expect(mockReal.statements.some((sql) => sql.includes(statement))).toBe(true);
    expect(userVersion()).toBe(7);
    expect(schema()).toEqual(schemaBefore);
    expect(mockReal.query('SELECT * FROM accounts ORDER BY id')).toEqual(accountsBefore);
    expect(mockReal.query('SELECT * FROM transactions ORDER BY id')).toEqual(transactionsBefore);

    mockReal.clearFailure();
    resetDbForTests();
    await initDb();
    expect(userVersion()).toBe(8);
    expect(capRows()).toEqual([]);
    expect(mockReal.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
  });
});

describe('soft_caps constraints (real SQLite)', () => {
  beforeEach(async () => {
    await initDb();
    await insertAccounts();
  });

  const insertCap = (accountId: number | null, period = 'week', cents = 1000) =>
    run('INSERT INTO soft_caps (account_id, period, amount_cents) VALUES (?, ?, ?)', accountId, period, cents);

  it('accepts one global cap and one cap per account', async () => {
    await insertCap(null);
    await insertCap(1, 'day');
    await insertCap(2, 'month');
    expect(capRows().map((row) => row.account_id)).toEqual([null, 1, 2]);
  });

  it('rejects a second global cap even though NULLs are distinct', async () => {
    await insertCap(null);
    await expect(insertCap(null, 'month', 500)).rejects.toThrow(/UNIQUE constraint failed/);
    expect(capRows()).toHaveLength(1);
  });

  it('rejects a second cap for the same account', async () => {
    await insertCap(1);
    await expect(insertCap(1, 'day', 5)).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('rejects a bad period, a zero or negative amount and a missing account', async () => {
    await expect(insertCap(1, 'year')).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertCap(1, 'week', 0)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertCap(1, 'week', -5)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertCap(99)).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(capRows()).toEqual([]);
  });

  it('deletes an account cap with its account (ON DELETE CASCADE) and leaves the others', async () => {
    await insertCap(null);
    await insertCap(1);
    await insertCap(2);
    await run('DELETE FROM accounts WHERE id = ?', 1);
    expect(capRows().map((row) => row.account_id)).toEqual([null, 2]);
  });
});

describe('caps through the real services', () => {
  const account = { name: 'Main', icon: 'bank', currency: 'MXN' };

  it('createAccount writes the account, its switch and its cap together', async () => {
    const created = await createAccount({
      ...account,
      inGlobalCap: false,
      cap: { amount: '1,50', period: 'day' },
    });
    expect(created.inGlobalCap).toBe(false);
    expect(mockReal.query('SELECT in_global_cap FROM accounts')).toEqual([{ in_global_cap: 0 }]);
    expect(await listCaps()).toEqual([
      { id: 1, accountId: created.id, period: 'day', amountCents: 150 },
    ]);
  });

  it('createAccount without a switch value counts toward the global cap, and an empty cap writes no row', async () => {
    const created = await createAccount({ ...account, cap: { amount: '  ', period: 'month' } });
    expect(created.inGlobalCap).toBe(true);
    expect(mockReal.query('SELECT in_global_cap FROM accounts')).toEqual([{ in_global_cap: 1 }]);
    expect(await listCaps()).toEqual([]);
  });

  it('createAccount writes neither half when the cap insert fails', async () => {
    await initDb();
    mockReal.failOn('INSERT INTO soft_caps');
    await expect(
      createAccount({ ...account, cap: { amount: '10', period: 'week' } }),
    ).rejects.toThrow('Injected failure');
    expect(mockReal.query('SELECT * FROM accounts')).toEqual([]);
    expect(capRows()).toEqual([]);
  });

  it('an invalid cap is rejected before anything is written', async () => {
    await initDb();
    await expect(
      createAccount({ ...account, cap: { amount: '0', period: 'week' } }),
    ).rejects.toMatchObject({ code: 'capNotPositive' });
    await expect(
      createAccount({ ...account, currency: 'JPY', cap: { amount: '1.5', period: 'week' } }),
    ).rejects.toMatchObject({ code: 'capDecimalsNotAllowed' });
    expect(mockReal.query('SELECT * FROM accounts')).toEqual([]);
  });

  it('updateAccount sets, changes and clears the cap, and persists the switch', async () => {
    const created = await createAccount(account);
    await updateAccount(created.id, { ...account, inGlobalCap: false, cap: { amount: '20', period: 'week' } });
    expect(await listCaps()).toEqual([
      { id: 1, accountId: created.id, period: 'week', amountCents: 2000 },
    ]);
    expect(mockReal.query('SELECT in_global_cap FROM accounts')).toEqual([{ in_global_cap: 0 }]);

    await updateAccount(created.id, { ...account, inGlobalCap: true, cap: { amount: '35.5', period: 'month' } });
    expect(await listCaps()).toEqual([
      { id: 1, accountId: created.id, period: 'month', amountCents: 3550 },
    ]);
    expect(mockReal.query('SELECT in_global_cap FROM accounts')).toEqual([{ in_global_cap: 1 }]);

    // Without cap or switch the account update leaves both alone.
    await updateAccount(created.id, { ...account, name: 'Renamed' });
    expect(await listCaps()).toHaveLength(1);
    expect(mockReal.query('SELECT in_global_cap FROM accounts')).toEqual([{ in_global_cap: 1 }]);

    await updateAccount(created.id, { ...account, cap: { amount: '', period: 'month' } });
    expect(await listCaps()).toEqual([]);
  });

  it('updateAccount for a missing account writes no cap', async () => {
    await initDb();
    await expect(
      updateAccount(99, { ...account, cap: { amount: '5', period: 'day' } }),
    ).rejects.toThrow('not found');
    expect(capRows()).toEqual([]);
  });

  it('removeAccount deletes the account cap and keeps the global one', async () => {
    const created = await createAccount({ ...account, cap: { amount: '5', period: 'day' } });
    await saveGlobalCap({ amount: '100', period: 'week' }, 'MXN');
    expect((await listCaps()).map((cap) => cap.accountId)).toEqual([created.id, null]);
    await removeAccount(created.id);
    expect(await listCaps()).toEqual([
      { id: 2, accountId: null, period: 'week', amountCents: 10000 },
    ]);
  });

  it('saveGlobalCap sets, changes and clears the one global row', async () => {
    await initDb();
    await saveGlobalCap({ amount: '5000', period: 'week' }, 'MXN');
    await saveGlobalCap({ amount: '6000.50', period: 'month' }, 'MXN');
    expect(await listCaps()).toEqual([
      { id: 1, accountId: null, period: 'month', amountCents: 600050 },
    ]);
    await saveGlobalCap({ amount: '', period: 'month' }, 'MXN');
    expect(await listCaps()).toEqual([]);
    // Clearing when there is none is fine.
    await saveGlobalCap({ amount: '', period: 'day' }, 'MXN');
    expect(() => saveGlobalCap({ amount: 'abc', period: 'day' }, 'MXN')).toThrow();
  });
});
