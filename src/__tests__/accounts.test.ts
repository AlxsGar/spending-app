import {
  ACCOUNT_ICONS,
  AccountValidationError,
  CURRENCIES,
  createAccount,
  getAccount,
  getDefaultCurrency,
  listAccounts,
  removeAccount,
  updateAccount,
  validateAccountInput,
} from '@/services/accounts';

type Row = {
  id: number;
  name: string;
  icon: string;
  currency: string;
  in_global_cap: number;
  created_at: string;
};

let rows: Row[] = [];
let nextId = 1;
let mockSettings: Record<string, string> = {};

const mockDb = {
  getAllAsync: jest.fn(async () => rows.map((row) => ({ ...row }))),
  getFirstAsync: jest.fn(async (_sql: string, id: number) => {
    const row = rows.find((item) => item.id === id);
    return row ? { ...row } : null;
  }),
  runAsync: jest.fn(async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const [name, icon, currency, createdAt] = args as string[];
      const id = nextId++;
      rows.push({
        id,
        name,
        icon,
        currency,
        in_global_cap: 1,
        created_at: createdAt,
      });
      return { lastInsertRowId: id, changes: 1 };
    }
    if (sql.startsWith('UPDATE')) {
      const [name, icon, currency, id] = args as [string, string, string, number];
      const row = rows.find((item) => item.id === id);
      if (!row) return { lastInsertRowId: 0, changes: 0 };
      Object.assign(row, { name, icon, currency });
      return { lastInsertRowId: 0, changes: 1 };
    }
    const [id] = args as [number];
    const before = rows.length;
    rows = rows.filter((item) => item.id !== id);
    return { lastInsertRowId: 0, changes: before - rows.length };
  }),
};

jest.mock('@/services/db', () => ({
  initDb: async () => mockDb,
  getSetting: async (key: string) => mockSettings[key] ?? null,
}));

const valid = { name: 'Main', icon: 'bank', currency: 'USD' };

describe('accounts service', () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
    mockSettings = {};
  });

  it('keeps the icon and currency lists in the agreed order', () => {
    expect([...ACCOUNT_ICONS]).toEqual([
      'bank',
      'wallet',
      'safe',
      'cash',
      'credit-card',
      'piggy-bank',
      'home',
      'briefcase',
      'cart',
      'gift',
    ]);
    expect([...CURRENCIES]).toEqual([
      'MXN',
      'USD',
      'CAD',
      'AUD',
      'BRL',
      'CHF',
      'COP',
      'EUR',
      'GBP',
      'JPY',
    ]);
  });

  it('creates an account with trimmed name, global cap on and a UTC ISO date', async () => {
    const account = await createAccount({ ...valid, name: '  Main  ' });
    expect(account.name).toBe('Main');
    expect(account.inGlobalCap).toBe(true);
    expect(account.createdAt).toBe(new Date(account.createdAt).toISOString());
    expect(rows[0].in_global_cap).toBe(1);
    expect(rows[0].name).toBe('Main');
  });

  it('lists, gets, updates and removes', async () => {
    const a = await createAccount(valid);
    const b = await createAccount({ ...valid, name: 'Main' });
    expect((await listAccounts()).map((item) => item.id)).toEqual([a.id, b.id]);
    expect((await getAccount(a.id))?.name).toBe('Main');
    expect(await getAccount(999)).toBeNull();

    const updated = await updateAccount(a.id, { name: ' Cash ', icon: 'cash', currency: 'EUR' });
    expect(updated).toMatchObject({ id: a.id, name: 'Cash', icon: 'cash', currency: 'EUR' });
    expect((await getAccount(a.id))?.currency).toBe('EUR');

    await removeAccount(a.id);
    expect((await listAccounts()).map((item) => item.id)).toEqual([b.id]);
  });

  it('fails to update a missing account', async () => {
    await expect(updateAccount(42, valid)).rejects.toThrow('not found');
  });

  it.each([
    ['empty name', { ...valid, name: '' }, 'nameRequired'],
    ['whitespace name', { ...valid, name: '   ' }, 'nameRequired'],
    ['41 characters', { ...valid, name: 'a'.repeat(41) }, 'nameTooLong'],
    ['unknown icon', { ...valid, icon: 'rocket' }, 'invalidIcon'],
    ['unknown currency', { ...valid, currency: 'XXX' }, 'invalidCurrency'],
  ])('rejects %s on create and update', async (_label, input, code) => {
    expect(validateAccountInput(input)).toBe(code);
    await expect(createAccount(input)).rejects.toBeInstanceOf(AccountValidationError);
    await expect(createAccount(input)).rejects.toMatchObject({ code });
    const existing = await createAccount(valid);
    await expect(updateAccount(existing.id, input)).rejects.toMatchObject({ code });
    expect(rows).toHaveLength(1);
  });

  it('accepts a 40-character name and duplicate names', async () => {
    await createAccount({ ...valid, name: 'a'.repeat(40) });
    await createAccount({ ...valid, name: 'a'.repeat(40) });
    expect(rows).toHaveLength(2);
  });

  it('default currency follows the setting and falls back to MXN', async () => {
    expect(await getDefaultCurrency()).toBe('MXN');
    mockSettings.default_currency = 'EUR';
    expect(await getDefaultCurrency()).toBe('EUR');
    mockSettings.default_currency = 'ZZZ';
    expect(await getDefaultCurrency()).toBe('MXN');
  });
});
