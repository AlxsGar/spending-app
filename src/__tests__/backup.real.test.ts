/**
 * Backup export and import on REAL SQLite (node:sqlite): round trip, rollback,
 * older schema versions upgraded by the existing migrations, newer versions
 * refused, language left out.
 *
 * @jest-environment node
 */
import {
  applyImport,
  BACKUP_FORMAT,
  BackupError,
  buildBackupJson,
  prepareImport,
} from '@/services/backup';
import type { PreparedBackup } from '@/services/backup';
import { initDb, resetDbForTests } from '@/services/db';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';
import { silenceConsoleError } from '@/test/console-error';

// A rejected file logs "[backup] file rejected:" before the refusal.
silenceConsoleError();

let mockReal: RealSqlite;
const mockCreate = createRealSqlite;

jest.mock('expo-sqlite', () => ({
  // The scratch database used by prepareImport is a separate in-memory database.
  openDatabaseAsync: jest.fn(async (name: string) =>
    name === ':memory:' ? mockCreate().adapter : mockReal.adapter,
  ),
}));

const TABLES = ['settings', 'accounts', 'recurring_payments', 'transactions', 'soft_caps'];
const ORDER: Record<string, string> = { settings: 'key' };
const dump = (db: RealSqlite) =>
  Object.fromEntries(
    TABLES.map((table) => [
      table,
      db.query(`SELECT * FROM ${table} ORDER BY ${ORDER[table] ?? 'id'}`),
    ]),
  );

function seedCurrent(db: RealSqlite) {
  db.exec(`
    INSERT INTO settings (key, value) VALUES ('default_currency', 'USD'), ('default_reminders', '1,0'), ('language', 'es');
    INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at, balance_anchor_cents, balance_anchor_at)
      VALUES (1, 'Bank', 'bank', 'MXN', 1, '2026-01-01T00:00:00.000Z', 150000, '2026-01-02T00:00:00.000Z'),
             (7, 'Cash', 'wallet', 'USD', 0, '2026-02-01T00:00:00.000Z', 0, NULL);
    INSERT INTO recurring_payments (id, account_id, name, amount_cents, note, interval, unit, start_date, end_date,
        notify_days_before, active, last_confirmed_at, created_at, dismissed_at)
      VALUES (3, 1, 'Rent', 900000, 'flat', 1, 'month', '2026-01-05', NULL, '1,0', 1, '2026-10-05', '2026-01-01T00:00:00.000Z', NULL),
             (4, NULL, 'Loose', 525, NULL, 2, 'week', '2026-03-01', '2026-12-01', '', 0, NULL, '2026-03-01T00:00:00.000Z', '2026-11-01');
    INSERT INTO transactions (id, account_id, kind, amount_cents, date, note, recurring_id, created_at, recurring_occurrence)
      VALUES (10, 1, 'expense', 900000, '2026-10-05T10:00:00.000Z', NULL, 3, '2026-10-05T10:00:00.000Z', '2026-10-05'),
             (12, 7, 'income', 2500, '2026-10-06T10:00:00.000Z', 'tip é ñ', NULL, '2026-10-06T10:00:00.000Z', NULL);
    INSERT INTO soft_caps (id, account_id, period, amount_cents) VALUES (1, NULL, 'month', 100000), (2, 7, 'day', 5000);
  `);
}

const NOW_ISO = '2026-10-05T10:00:00.000Z';

// Row builders in the shape of a given schema version.
const account = (v: number, extra: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Bank',
  icon: 'bank',
  currency: 'MXN',
  in_global_cap: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  ...(v >= 5 ? { balance_anchor_cents: 500, balance_anchor_at: '2026-01-02T00:00:00.000Z' } : {}),
  ...extra,
});
const recurring = (v: number, extra: Record<string, unknown> = {}) => ({
  id: 3,
  account_id: 1,
  name: 'Rent',
  amount_cents: 900000,
  note: null,
  interval: 1,
  unit: 'month',
  start_date: '2026-01-05',
  end_date: null,
  notify_days_before: '1,0',
  active: 1,
  last_confirmed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...(v >= 7 ? { dismissed_at: null } : {}),
  ...extra,
});
const tx = (v: number, id: number, extra: Record<string, unknown> = {}) => ({
  id,
  account_id: 1,
  kind: 'expense',
  amount_cents: 1000 * id,
  date: NOW_ISO,
  note: null,
  recurring_id: null,
  created_at: NOW_ISO,
  ...(v >= 7 ? { recurring_occurrence: null } : {}),
  ...extra,
});

// A file at `version`, with only the tables that schema had.
function fileAt(version: number, tables: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  const wanted: Record<string, number> = {
    settings: 1,
    accounts: 2,
    transactions: 3,
    recurring_payments: 6,
    soft_caps: 8,
  };
  const present = Object.fromEntries(
    Object.entries(wanted)
      .filter(([, since]) => since <= version)
      .map(([name]) => [name, tables[name] ?? []]),
  );
  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: 1,
    schemaVersion: version,
    appVersion: '1.0.0',
    exportedAt: '2026-11-09T12:00:00.000Z',
    tables: present,
    ...extra,
  });
}

const userVersion = () =>
  mockReal.query<{ user_version: number }>('PRAGMA user_version')[0].user_version;

beforeEach(async () => {
  mockReal = createRealSqlite();
  resetDbForTests();
  await initDb();
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

describe('export and import round trip', () => {
  it('gives identical rows in every table, ids kept, and leaves language out', async () => {
    seedCurrent(mockReal);
    const json = await buildBackupJson(new Date('2026-11-10T08:00:00.000Z'));
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: 1,
      schemaVersion: 8,
      exportedAt: '2026-11-10T08:00:00.000Z',
    });
    expect(typeof parsed.appVersion).toBe('string');
    expect(parsed.tables.settings.map((row: { key: string }) => row.key)).toEqual([
      'default_currency',
      'default_reminders',
    ]);

    // A fresh database, as after reinstalling the app.
    mockReal.close();
    mockReal = createRealSqlite();
    resetDbForTests();
    await initDb();
    await applyImport(await prepareImport(json));

    const restored = dump(mockReal);
    expect(restored.accounts.map((row) => (row as { id: number }).id)).toEqual([1, 7]);
    expect(restored.transactions.map((row) => (row as { id: number }).id)).toEqual([10, 12]);
    // Everything but the language setting equals what was exported.
    expect(restored).toEqual(parsed.tables);
    expect(userVersion()).toBe(8);
  });

  it('replaces data that was there and keeps the foreign keys working', async () => {
    seedCurrent(mockReal);
    const json = await buildBackupJson();
    const before = dump(mockReal);
    mockReal.exec(
      "INSERT INTO accounts (id, name, icon, currency, created_at) VALUES (99, 'Extra', 'x', 'MXN', 'c')",
    );
    mockReal.exec('DELETE FROM transactions WHERE id = 10');
    await applyImport(await prepareImport(json));
    // The language setting that was in the database is replaced away too.
    expect(dump(mockReal)).toEqual({
      ...before,
      settings: before.settings.filter((row) => (row as { key: string }).key !== 'language'),
    });
    expect(mockReal.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('export reads in a transaction', async () => {
    const spy = jest.spyOn(mockReal.adapter, 'withTransactionAsync');
    await buildBackupJson();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mockReal.statements.filter((sql) => sql.startsWith('SELECT')).length).toBe(5);
  });
});

describe('failures', () => {
  it('a failure partway through the import rolls back and keeps the current data', async () => {
    seedCurrent(mockReal);
    const prepared = await prepareImport(await buildBackupJson());
    mockReal.exec("UPDATE accounts SET name = 'Changed' WHERE id = 1");
    const before = dump(mockReal);
    mockReal.failOn('INSERT INTO transactions');
    await expect(applyImport(prepared)).rejects.toThrow('Injected failure');
    mockReal.clearFailure();
    expect(dump(mockReal)).toEqual(before);
  });

  it('a foreign key violation found before commit rolls back', async () => {
    seedCurrent(mockReal);
    const before = dump(mockReal);
    const bad: PreparedBackup = {
      appVersion: '1',
      exportedAt: '2026-11-09T12:00:00.000Z',
      counts: { accounts: 0, transactions: 1, recurringPayments: 0 },
      tables: {
        settings: [],
        accounts: [],
        recurring_payments: [],
        transactions: [tx(8, 1, { account_id: 55 }) as PreparedBackup['tables']['transactions'][number]],
        soft_caps: [],
      },
    };
    await expect(applyImport(bad)).rejects.toThrow();
    expect(dump(mockReal)).toEqual(before);
  });

  it('a CHECK violation or a missing parent is refused before anything changes', async () => {
    seedCurrent(mockReal);
    const before = dump(mockReal);
    await expect(
      prepareImport(
        fileAt(8, { accounts: [account(8)], transactions: [tx(8, 1, { amount_cents: 0 })] }),
      ),
    ).rejects.toMatchObject({ code: 'malformed' });
    await expect(
      prepareImport(fileAt(8, { transactions: [tx(8, 1)] })),
    ).rejects.toMatchObject({ code: 'malformed' });
    expect(dump(mockReal)).toEqual(before);
  });

  it.each([4, 5, 6, 7, 8])('a v%i file with an orphan transaction is refused', async (version) => {
    seedCurrent(mockReal);
    const before = dump(mockReal);
    await expect(
      prepareImport(
        fileAt(version, {
          accounts: [account(version)],
          transactions: [tx(version, 1), tx(version, 2, { account_id: 9 })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'malformed' });
    expect(dump(mockReal)).toEqual(before);
  });

  it('duplicate ids and duplicate setting keys are refused as malformed', async () => {
    seedCurrent(mockReal);
    const before = dump(mockReal);
    await expect(
      prepareImport(fileAt(8, { accounts: [account(8), account(8, { name: 'Twin' })] })),
    ).rejects.toMatchObject({ code: 'malformed' });
    await expect(
      prepareImport(
        fileAt(8, {
          settings: [
            { key: 'default_currency', value: 'USD' },
            { key: 'default_currency', value: 'MXN' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'malformed' });
    expect(dump(mockReal)).toEqual(before);
  });

  it('a newer schemaVersion is refused and nothing changes', async () => {
    seedCurrent(mockReal);
    const before = dump(mockReal);
    const newer = fileAt(8, {}, { schemaVersion: 9 });
    await expect(prepareImport(newer)).rejects.toBeInstanceOf(BackupError);
    await expect(prepareImport(newer)).rejects.toMatchObject({ code: 'newerSchema' });
    expect(dump(mockReal)).toEqual(before);
    expect(userVersion()).toBe(8);
  });
});

describe('older schema versions', () => {
  const upgrade = async (json: string) => {
    await applyImport(await prepareImport(json));
    expect(userVersion()).toBe(8);
    return dump(mockReal);
  };

  it('a v1 file (settings only) ends up correct at v8', async () => {
    const result = await upgrade(fileAt(1, { settings: [{ key: 'default_currency', value: 'EUR' }] }));
    expect(result).toEqual({
      settings: [{ key: 'default_currency', value: 'EUR' }],
      accounts: [],
      recurring_payments: [],
      transactions: [],
      soft_caps: [],
    });
  });

  it('a v2 file gets the balance anchor defaults', async () => {
    const result = await upgrade(fileAt(2, { accounts: [account(2)] }));
    expect(result.accounts).toEqual([
      { ...account(2), balance_anchor_cents: 0, balance_anchor_at: null },
    ]);
  });

  it('a v3 file is upgraded by the existing steps (orphan transactions dropped)', async () => {
    const json = fileAt(3, { accounts: [account(3)], transactions: [tx(3, 1), tx(3, 2, { account_id: 9 })] });
    const prepared = await prepareImport(json);
    expect(prepared.counts.transactions).toBe(1);
    await applyImport(prepared);
    expect(dump(mockReal)).toMatchObject({
      accounts: [{ id: 1, balance_anchor_cents: 0, balance_anchor_at: null }],
      transactions: [{ id: 1, recurring_occurrence: null }],
    });
    expect(userVersion()).toBe(8);
  });

  it('a v4 file ends up correct at v8', async () => {
    const result = await upgrade(fileAt(4, { accounts: [account(4)], transactions: [tx(4, 1), tx(4, 2)] }));
    expect(result.transactions).toEqual([
      { ...tx(4, 1), recurring_occurrence: null },
      { ...tx(4, 2), recurring_occurrence: null },
    ]);
    expect(result.accounts).toEqual([{ ...account(4), balance_anchor_cents: 0, balance_anchor_at: null }]);
  });

  it('a v5 file ends up correct at v8', async () => {
    const result = await upgrade(fileAt(5, { accounts: [account(5)], transactions: [tx(5, 1)] }));
    expect(result.accounts).toEqual([account(5)]);
    expect(result.transactions).toEqual([{ ...tx(5, 1), recurring_occurrence: null }]);
    expect(result.recurring_payments).toEqual([]);
  });

  it('a v6 file ends up correct at v8', async () => {
    const result = await upgrade(
      fileAt(6, {
        settings: [{ key: 'default_currency', value: 'EUR' }],
        accounts: [account(6)],
        recurring_payments: [recurring(6)],
        transactions: [tx(6, 1, { recurring_id: 3 }), tx(6, 2)],
      }),
    );
    expect(result).toEqual({
      settings: [{ key: 'default_currency', value: 'EUR' }],
      accounts: [account(6)],
      recurring_payments: [{ ...recurring(6), dismissed_at: null }],
      transactions: [
        { ...tx(6, 1, { recurring_id: 3 }), recurring_occurrence: null },
        { ...tx(6, 2), recurring_occurrence: null },
      ],
      soft_caps: [],
    });
  });

  it('a v7 file ends up correct at v8', async () => {
    const result = await upgrade(
      fileAt(7, {
        accounts: [account(7)],
        recurring_payments: [recurring(7, { dismissed_at: '2026-11-01' })],
        transactions: [tx(7, 1, { recurring_id: 3, recurring_occurrence: '2026-10-05' })],
      }),
    );
    expect(result).toMatchObject({
      recurring_payments: [{ id: 3, dismissed_at: '2026-11-01' }],
      transactions: [{ id: 1, recurring_id: 3, recurring_occurrence: '2026-10-05' }],
      soft_caps: [],
    });
  });

  it.each([3, 4, 5])(
    'a v%i file with a recurring_id loses that link at the v6 step (nothing it could point to)',
    async (version) => {
      const result = await upgrade(
        fileAt(version, {
          accounts: [account(version)],
          transactions: [tx(version, 1, { recurring_id: 3 })],
        }),
      );
      expect(result.transactions).toMatchObject([{ id: 1, recurring_id: null }]);
    },
  );
});

describe('unknown content', () => {
  it('ignores extra columns and an extra table', async () => {
    const json = JSON.stringify({
      ...JSON.parse(fileAt(8, { accounts: [account(8)] })),
    });
    const data = JSON.parse(json);
    data.tables.accounts[0].favourite_color = 'green';
    data.tables.mystery = [{ a: 1 }];
    await applyImport(await prepareImport(JSON.stringify(data)));
    expect(dump(mockReal).accounts).toEqual([account(8)]);
    expect(mockReal.query("SELECT name FROM sqlite_master WHERE name = 'mystery'")).toEqual([]);
  });
});

describe('language', () => {
  it('a language key in a file is ignored; other settings come along', async () => {
    mockReal.exec("INSERT INTO settings (key, value) VALUES ('language', 'en')");
    const json = fileAt(8, {
      settings: [
        { key: 'language', value: 'es' },
        { key: 'default_currency', value: 'USD' },
        { key: 'default_reminders', value: '2' },
      ],
    });
    await applyImport(await prepareImport(json));
    expect(mockReal.query('SELECT key, value FROM settings ORDER BY key')).toEqual([
      { key: 'default_currency', value: 'USD' },
      { key: 'default_reminders', value: '2' },
    ]);
  });
});
