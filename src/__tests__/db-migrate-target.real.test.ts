/**
 * migrate(db, target) on REAL SQLite: a partial migration (used to build a
 * scratch database at an older schema for backup imports) stops at the target,
 * continues to the current version with the same result as a direct upgrade, and
 * rolls back as a whole on a failure.
 *
 * @jest-environment node
 */
import { CURRENT_SCHEMA_VERSION, migrate } from '@/services/db';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';
import { silenceConsoleError } from '@/test/console-error';

silenceConsoleError();

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

let real: RealSqlite;
const run = (target?: number) => migrate(real.adapter as never, target);

const userVersion = () => real.query<{ user_version: number }>('PRAGMA user_version')[0].user_version;
const names = () =>
  real
    .query<{ name: string }>("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((row) => row.name);
const columns = (table: string) =>
  real.query<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
const master = () =>
  real
    .query<{ type: string; name: string; sql: string | null }>(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .map((item) => ({ ...item, sql: item.sql && item.sql.replace(/\s+/g, ' ') }));

beforeEach(() => {
  real = createRealSqlite();
});
afterEach(() => real.close());

const SEED = `
  INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at) VALUES (1, 'A', 'i', 'MXN', 1, 'c');
  INSERT INTO transactions (id, account_id, kind, amount_cents, date, created_at) VALUES (1, 1, 'expense', 100, 'd', 'c');
`;

it('migrate(db, 5) stops at version 5, without any v6+ table or column', async () => {
  await run(5);
  expect(userVersion()).toBe(5);
  expect(names()).toEqual(
    expect.arrayContaining(['settings', 'accounts', 'transactions', 'idx_transactions_account_date']),
  );
  expect(names()).not.toContain('recurring_payments');
  expect(names()).not.toContain('soft_caps');
  expect(columns('accounts')).toContain('balance_anchor_at');
  expect(columns('transactions')).not.toContain('recurring_occurrence');
  expect(columns('transactions')).toContain('recurring_id');
});

it('migrate(db, 5) then migrate(db, 8) equals a direct migrate(db, 8), schema and rows', async () => {
  await run(5);
  real.exec(SEED);
  await run(CURRENT_SCHEMA_VERSION);
  const stepped = { schema: master(), accounts: real.query('SELECT * FROM accounts'), tx: real.query('SELECT * FROM transactions'), version: userVersion() };
  real.close();

  real = createRealSqlite();
  await run();
  real.exec(SEED);
  expect({
    schema: master(),
    accounts: real.query('SELECT * FROM accounts'),
    tx: real.query('SELECT * FROM transactions'),
    version: userVersion(),
  }).toEqual(stepped);
  expect(stepped.version).toBe(CURRENT_SCHEMA_VERSION);
});

it('a failure in a step of a partial migrate rolls back that call, user_version included', async () => {
  await run(3);
  real.exec(SEED);
  real.failOn('ADD COLUMN balance_anchor_at');
  await expect(run(5)).rejects.toThrow('Injected failure');
  real.clearFailure();
  expect(userVersion()).toBe(3);
  expect(columns('accounts')).not.toContain('balance_anchor_cents');
  expect(real.query('SELECT id FROM transactions')).toEqual([{ id: 1 }]);
  // And it can be run again afterwards.
  await run(5);
  expect(userVersion()).toBe(5);
});

it('migrate(db, target) does nothing when the database is already at or past the target', async () => {
  await run();
  const before = master();
  await run(5);
  expect(userVersion()).toBe(CURRENT_SCHEMA_VERSION);
  expect(master()).toEqual(before);
});
