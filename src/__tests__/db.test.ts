import { getSetting, initDb, resetDbForTests, setSetting } from '@/services/db';

// A recording stand-in for expo-sqlite. It proves ORDER and PLACEMENT only:
// which statements run, in what order, whether they sit inside BEGIN/COMMIT or
// outside it, that a throw propagates and stops the later statements (so
// user_version is never reached), and that a retry runs the steps again. It
// does not execute SQL, so it says nothing about what the statements do, real
// rollback, foreign keys or counters. That is proven on a real database in
// db-migrations.real.test.ts, which is where every new upgrade step needs cases.
const mockStore = new Map<string, string>();
let mockUserVersion = 0;
let mockFailOn: string | null = null;
let mockViolations = 0;
let mockInTransaction = false;
let mockForeignKeys = 0;
// Every statement and transaction marker, in order.
let mockEvents: string[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    getFirstAsync: jest.fn(async (sql: string, key?: string) => {
      if (sql.startsWith('PRAGMA user_version')) return { user_version: mockUserVersion };
      if (sql.startsWith('PRAGMA foreign_keys')) return { foreign_keys: mockForeignKeys };
      const value = mockStore.get(key as string);
      return value === undefined ? null : { value };
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      mockEvents.push(sql);
      if (mockFailOn && sql.includes(mockFailOn)) throw new Error('boom');
      if (sql === 'PRAGMA foreign_key_check') {
        return mockViolations > 0 ? [{ table: 'transactions', rowid: 1 }] : [];
      }
      return [];
    }),
    execAsync: jest.fn(async (sql: string) => {
      mockEvents.push(sql);
      if (mockFailOn && sql.includes(mockFailOn)) throw new Error('boom');
      if (sql.startsWith('PRAGMA foreign_keys =')) {
        // SQLite ignores this pragma inside a transaction.
        if (!mockInTransaction) mockForeignKeys = sql.endsWith('ON') ? 1 : 0;
        return;
      }
      if (sql.startsWith('PRAGMA user_version =')) {
        mockUserVersion = Number(sql.split('=')[1]);
      }
    }),
    runAsync: jest.fn(async (_sql: string, key: string, value: string) => {
      mockStore.set(key, value);
    }),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      const savedVersion = mockUserVersion;
      mockEvents.push('BEGIN');
      mockInTransaction = true;
      try {
        await task();
        mockEvents.push('COMMIT');
      } catch (error) {
        // Only the version is modelled, to show it is written last.
        mockUserVersion = savedVersion;
        mockEvents.push('ROLLBACK');
        throw error;
      } finally {
        mockInTransaction = false;
      }
    }),
  })),
}));

const statements = () =>
  mockEvents.filter((event) => !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(event));
const creates = () => statements().filter((sql) => sql.includes('CREATE TABLE'));
// From the first v4 statement through the end of the upgrade.
const v4Statements = () => {
  const all = statements();
  const start = all.findIndex((sql) => sql.startsWith('DELETE FROM transactions'));
  return all.slice(start, all.indexOf('PRAGMA user_version = 4') + 1);
};

describe('db service', () => {
  beforeEach(() => {
    mockEvents = [];
    mockStore.clear();
    mockUserVersion = 0;
    mockFailOn = null;
    mockViolations = 0;
    mockInTransaction = false;
    mockForeignKeys = 0;
    resetDbForTests();
  });

  it('keeps v1 and the settings when the accounts table fails to create', async () => {
    mockUserVersion = 1;
    mockStore.set('language', 'es');
    mockFailOn = 'accounts';
    await expect(initDb()).rejects.toThrow('boom');
    expect(mockUserVersion).toBe(1);
    mockFailOn = null;
    expect(await getSetting('language')).toBe('es');
  });

  it('runs the table steps in order on a fresh install and ends at v4', async () => {
    await initDb();
    const tables = creates();
    expect(tables).toHaveLength(4);
    expect(tables[0]).toContain('settings');
    expect(tables[1]).toContain('accounts');
    expect(tables[2]).toContain('transactions (');
    expect(tables[3]).toContain('transactions_new');
    expect(tables[3]).toContain('REFERENCES accounts(id) ON DELETE CASCADE');
    expect(mockUserVersion).toBe(4);
  });

  it('runs the same v4 statements on a fresh install and on a v3 upgrade', async () => {
    await initDb();
    const fresh = v4Statements();
    mockEvents = [];
    mockUserVersion = 3;
    resetDbForTests();
    await initDb();
    expect(v4Statements()).toEqual(fresh);
  });

  it('runs only the steps after the stored version', async () => {
    mockUserVersion = 1;
    await initDb();
    expect(creates()).toHaveLength(3);
    expect(creates()[0]).toContain('accounts');
    mockUserVersion = 2;
    mockEvents = [];
    resetDbForTests();
    await initDb();
    expect(creates()).toHaveLength(2);
    expect(creates()[0]).toContain('transactions (');
  });

  it('runs the v4 statements in the documented order, version last, all inside one transaction', async () => {
    mockUserVersion = 3;
    await initDb();
    const run = statements();
    const order = [
      'DELETE FROM transactions WHERE account_id NOT IN',
      'CREATE TABLE transactions_new',
      'INSERT INTO transactions_new (id, account_id, kind, amount_cents, date, note, recurring_id, created_at)',
      'UPDATE sqlite_sequence',
      'INSERT INTO sqlite_sequence',
      'DROP TABLE transactions',
      'ALTER TABLE transactions_new RENAME TO transactions',
      'CREATE INDEX idx_transactions_account_date ON transactions (account_id, date)',
      'PRAGMA foreign_key_check',
      'PRAGMA user_version = 4',
    ].map((prefix) => run.findIndex((sql) => sql.startsWith(prefix)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mockEvents.indexOf('BEGIN')).toBeLessThan(mockEvents.indexOf(run[order[0]]));
    expect(mockEvents.indexOf('PRAGMA user_version = 4')).toBeLessThan(
      mockEvents.indexOf('COMMIT'),
    );
  });

  describe('when a v4 step throws', () => {
    it.each([
      ['the orphan cleanup', 'NOT IN'],
      ['creating the new table', 'CREATE TABLE transactions_new'],
      ['the copy', 'INSERT INTO transactions_new'],
      ['carrying the counter over', 'UPDATE sqlite_sequence'],
      ['the drop', 'DROP TABLE transactions'],
      ['the foreign key check', 'PRAGMA foreign_key_check'],
    ])('at %s the error propagates, later statements never run and the version is not written', async (_label, failOn) => {
      mockUserVersion = 3;
      mockFailOn = failOn;
      await expect(initDb()).rejects.toThrow('boom');
      expect(mockUserVersion).toBe(3);
      expect(statements()).not.toContain('PRAGMA user_version = 4');
      expect(mockEvents).toContain('ROLLBACK');
      expect(mockEvents).not.toContain('COMMIT');
    });

    it('a violation reported by the foreign key check throws before the version is written', async () => {
      mockUserVersion = 3;
      mockViolations = 1;
      await expect(initDb()).rejects.toThrow('Foreign key check failed');
      expect(statements()).not.toContain('PRAGMA user_version = 4');
      expect(mockEvents).toContain('ROLLBACK');
      expect(mockUserVersion).toBe(3);
    });

    it('a retry runs the whole upgrade again', async () => {
      mockUserVersion = 3;
      mockFailOn = 'INSERT INTO transactions_new';
      await expect(initDb()).rejects.toThrow('boom');
      mockFailOn = null;
      mockEvents = [];
      await initDb();
      expect(mockUserVersion).toBe(4);
      expect(statements()).toContain('DROP TABLE transactions');
    });
  });

  describe('foreign keys', () => {
    const position = (event: string) => mockEvents.indexOf(event);

    it('are turned OFF before the migration and ON after it, both outside the transaction', async () => {
      mockUserVersion = 3;
      await initDb();
      const off = position('PRAGMA foreign_keys = OFF');
      const begin = position('BEGIN');
      const commit = position('COMMIT');
      const on = position('PRAGMA foreign_keys = ON');
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(begin);
      expect(commit).toBeLessThan(on);
      expect(mockForeignKeys).toBe(1);
    });

    it('are turned ON even when no migration runs', async () => {
      mockUserVersion = 4;
      await initDb();
      expect(mockEvents).not.toContain('BEGIN');
      expect(mockForeignKeys).toBe(1);
      expect(mockEvents[mockEvents.length - 1]).toBe('PRAGMA foreign_keys = ON');
    });

    it('fail loudly when they cannot be switched on', async () => {
      mockUserVersion = 4;
      // A silent no-op: the pragma runs but the setting stays 0.
      mockInTransaction = true;
      await expect(initDb()).rejects.toThrow('Could not enable foreign keys');
    });
  });

  it('does not migrate again when already up to date', async () => {
    mockUserVersion = 4;
    await initDb();
    expect(mockEvents).not.toContain('BEGIN');
    expect(statements().filter((sql) => !sql.startsWith('PRAGMA foreign_keys'))).toEqual([]);
  });

  it('reads and writes a setting', async () => {
    expect(await getSetting('language')).toBeNull();
    await setSetting('language', 'es');
    expect(await getSetting('language')).toBe('es');
  });
});
