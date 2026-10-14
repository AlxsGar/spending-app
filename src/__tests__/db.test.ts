import { getSetting, initDb, resetDbForTests, setSetting } from '@/services/db';

const mockExec = jest.fn();
const mockStore = new Map<string, string>();
let mockUserVersion = 0;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    getFirstAsync: jest.fn(async (sql: string, key?: string) => {
      if (sql.startsWith('PRAGMA user_version')) return { user_version: mockUserVersion };
      const value = mockStore.get(key as string);
      return value === undefined ? null : { value };
    }),
    execAsync: jest.fn(async (sql: string) => {
      mockExec(sql);
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
    resetDbForTests();
  });

  it('creates only the settings table and sets the schema version', async () => {
    await initDb();
    const statements = mockExec.mock.calls.map(([sql]) => sql as string);
    expect(statements.filter((sql) => sql.includes('CREATE TABLE'))).toHaveLength(1);
    expect(statements[0]).toContain('settings (key TEXT PRIMARY KEY, value TEXT)');
    expect(mockUserVersion).toBe(1);
  });

  it('does not migrate again when already up to date', async () => {
    mockUserVersion = 1;
    await initDb();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('reads and writes a setting', async () => {
    expect(await getSetting('language')).toBeNull();
    await setSetting('language', 'es');
    expect(await getSetting('language')).toBe('es');
  });
});
