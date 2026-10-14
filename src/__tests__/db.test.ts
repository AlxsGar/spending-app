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

  it('creates settings and accounts on a fresh install and ends at v2', async () => {
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    const creates = statements.filter((sql) => sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(2);
    expect(creates[0]).toContain('settings (key TEXT PRIMARY KEY, value TEXT)');
    expect(creates[1]).toContain('accounts');
    expect(creates[1]).toContain('in_global_cap INTEGER NOT NULL DEFAULT 1');
    expect(mockUserVersion).toBe(2);
  });

  it('upgrades a v1 database by adding accounts and keeping settings', async () => {
    mockUserVersion = 1;
    mockStore.set('language', 'es');
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    const creates = statements.filter((sql) => sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain('accounts');
    expect(statements.some((sql) => /DROP/i.test(sql))).toBe(false);
    expect(mockUserVersion).toBe(2);
    expect(await getSetting('language')).toBe('es');
  });

  it('does not migrate again when already up to date', async () => {
    mockUserVersion = 2;
    await initDb();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('reads and writes a setting', async () => {
    expect(await getSetting('language')).toBeNull();
    await setSetting('language', 'es');
    expect(await getSetting('language')).toBe('es');
  });
});
