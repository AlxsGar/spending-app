import { getSetting, initDb, resetDbForTests, setSetting } from '@/services/db';

const mockExec = jest.fn();
const mockStore = new Map<string, string>();
let mockUserVersion = 0;
let mockFailOn: string | null = null;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    getFirstAsync: jest.fn(async (sql: string, key?: string) => {
      if (sql.startsWith('PRAGMA user_version')) return { user_version: mockUserVersion };
      const value = mockStore.get(key as string);
      return value === undefined ? null : { value };
    }),
    execAsync: jest.fn(async (sql: string) => {
      mockExec(sql);
      if (mockFailOn && sql.includes(mockFailOn)) throw new Error('boom');
      if (sql.startsWith('PRAGMA user_version =')) {
        mockUserVersion = Number(sql.split('=')[1]);
      }
    }),
    runAsync: jest.fn(async (_sql: string, key: string, value: string) => {
      mockStore.set(key, value);
    }),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
  })),
}));

describe('db service', () => {
  beforeEach(() => {
    mockExec.mockClear();
    mockStore.clear();
    mockUserVersion = 0;
    mockFailOn = null;
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

  it('creates settings, accounts and transactions on a fresh install and ends at v3', async () => {
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    const creates = statements.filter((sql) => sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(3);
    expect(creates[0]).toContain('settings (key TEXT PRIMARY KEY, value TEXT)');
    expect(creates[1]).toContain('accounts');
    expect(creates[1]).toContain('in_global_cap INTEGER NOT NULL DEFAULT 1');
    expect(creates[2]).toContain('transactions');
    expect(creates[2]).toContain("CHECK (kind IN ('expense','income'))");
    expect(creates[2]).toContain('CHECK (amount_cents > 0)');
    expect(creates[2]).toContain('recurring_id INTEGER,');
    expect(creates[2]).not.toContain('REFERENCES');
    expect(statements.some((sql) => sql.includes('INDEX') && sql.includes('(account_id, date)'))).toBe(
      true,
    );
    expect(mockUserVersion).toBe(3);
  });

  it('upgrades a v1 database by adding accounts and transactions and keeping settings', async () => {
    mockUserVersion = 1;
    mockStore.set('language', 'es');
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    const creates = statements.filter((sql) => sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(2);
    expect(creates[0]).toContain('accounts');
    expect(creates[1]).toContain('transactions');
    expect(statements.some((sql) => /DROP/i.test(sql))).toBe(false);
    expect(mockUserVersion).toBe(3);
    expect(await getSetting('language')).toBe('es');
  });

  it('upgrades a v2 database by adding only transactions', async () => {
    mockUserVersion = 2;
    mockStore.set('language', 'es');
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    const creates = statements.filter((sql) => sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain('transactions');
    expect(statements.some((sql) => /DROP|ALTER|DELETE/i.test(sql))).toBe(false);
    expect(mockUserVersion).toBe(3);
    expect(await getSetting('language')).toBe('es');
  });

  it('keeps v2 when the transactions table fails to create', async () => {
    mockUserVersion = 2;
    mockFailOn = 'transactions';
    await expect(initDb()).rejects.toThrow('boom');
    expect(mockUserVersion).toBe(2);
  });

  it('does not migrate again when already up to date', async () => {
    mockUserVersion = 3;
    await initDb();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('reads and writes a setting', async () => {
    expect(await getSetting('language')).toBeNull();
    await setSetting('language', 'es');
    expect(await getSetting('language')).toBe('es');
  });
});
