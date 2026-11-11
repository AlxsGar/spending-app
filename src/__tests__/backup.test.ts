import { BACKUP_FORMAT, backupFileName, parseBackup } from '@/services/backup';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const account = {
  id: 1,
  name: 'Bank',
  icon: 'bank',
  currency: 'MXN',
  in_global_cap: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  balance_anchor_cents: 0,
  balance_anchor_at: null,
};

function make(overrides: Record<string, unknown> = {}, tables: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: 1,
    schemaVersion: 8,
    appVersion: '1.0.0',
    exportedAt: '2026-11-09T12:00:00.000Z',
    tables: {
      settings: [],
      accounts: [account],
      recurring_payments: [],
      transactions: [],
      soft_caps: [],
      ...tables,
    },
    ...overrides,
  });
}

const code = (text: string) => {
  try {
    parseBackup(text);
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'ok';
};

describe('parseBackup', () => {
  it('accepts a valid file', () => {
    const parsed = parseBackup(make());
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.tables.accounts).toEqual([account]);
  });

  it('refuses text that is not JSON', () => {
    expect(code('hello {')).toBe('notJson');
  });

  it('refuses an empty file', () => {
    expect(code('')).toBe('empty');
    expect(code('  \n ')).toBe('empty');
  });

  it('refuses JSON of another shape or a wrong format', () => {
    expect(code('[1,2]')).toBe('wrongFormat');
    expect(code('"x"')).toBe('wrongFormat');
    expect(code(make({ format: 'something-else' }))).toBe('wrongFormat');
  });

  it('refuses an unknown formatVersion', () => {
    expect(code(make({ formatVersion: 2 }))).toBe('unknownFormatVersion');
    expect(code(make({ formatVersion: undefined }))).toBe('unknownFormatVersion');
  });

  it('refuses a newer schemaVersion with its own code', () => {
    expect(code(make({ schemaVersion: 9 }))).toBe('newerSchema');
  });

  it('refuses missing or bad header fields', () => {
    expect(code(make({ schemaVersion: undefined }))).toBe('malformed');
    expect(code(make({ schemaVersion: 0 }))).toBe('malformed');
    expect(code(make({ schemaVersion: 7.5 }))).toBe('malformed');
    expect(code(make({ appVersion: 3 }))).toBe('malformed');
    expect(code(make({ exportedAt: 'yesterday' }))).toBe('malformed');
    expect(code(make({ tables: undefined }))).toBe('malformed');
  });

  it('refuses missing tables', () => {
    expect(code(make({}, { transactions: undefined }))).toBe('malformed');
    expect(code(make({}, { soft_caps: 'no' }))).toBe('malformed');
  });

  it('refuses wrong column types and missing columns', () => {
    expect(code(make({}, { accounts: [{ ...account, balance_anchor_cents: '100' }] }))).toBe(
      'malformed',
    );
    expect(code(make({}, { accounts: [{ ...account, balance_anchor_cents: 1.5 }] }))).toBe(
      'malformed',
    );
    expect(code(make({}, { accounts: [{ ...account, name: null }] }))).toBe('malformed');
    const { icon: _icon, ...withoutIcon } = account;
    expect(code(make({}, { accounts: [withoutIcon] }))).toBe('malformed');
    expect(code(make({}, { accounts: ['x'] }))).toBe('malformed');
  });

  it('does not require tables an older schema did not have', () => {
    const v2 = { ...account } as Record<string, unknown>;
    delete v2.balance_anchor_cents;
    delete v2.balance_anchor_at;
    const text = make({ schemaVersion: 2 }, { transactions: undefined, recurring_payments: undefined });
    expect(code(text)).toBe('ok');
    const parsed = parseBackup(
      JSON.stringify({ ...JSON.parse(text), tables: { settings: [], accounts: [v2] } }),
    );
    expect(parsed.tables.transactions).toBeUndefined();
  });

  it('drops the language setting', () => {
    const parsed = parseBackup(
      make({}, { settings: [{ key: 'language', value: 'es' }, { key: 'default_currency', value: 'USD' }] }),
    );
    expect(parsed.tables.settings).toEqual([{ key: 'default_currency', value: 'USD' }]);
  });
});

describe('parseBackup value checks', () => {
  const recurring = {
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
    dismissed_at: null,
  };
  const transaction = {
    id: 1,
    account_id: 1,
    kind: 'expense',
    amount_cents: 100,
    date: '2026-10-05T10:00:00.000Z',
    note: null,
    recurring_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
    recurring_occurrence: null,
  };

  it('accepts valid recurring payments and transactions', () => {
    expect(code(make({}, { recurring_payments: [recurring], transactions: [transaction] }))).toBe('ok');
  });

  it('refuses an unsupported currency', () => {
    expect(code(make({}, { accounts: [{ ...account, currency: 'XXX' }] }))).toBe('malformed');
    expect(
      code(make({}, { settings: [{ key: 'default_currency', value: 'ZZZ' }] })),
    ).toBe('malformed');
    expect(code(make({}, { settings: [{ key: 'default_currency', value: 'USD' }] }))).toBe('ok');
  });

  it('refuses a date that is not a real calendar day', () => {
    for (const start_date of ['banana', '2026-02-30', '2026-1-5', '2026-01-05T00:00:00Z']) {
      expect(code(make({}, { recurring_payments: [{ ...recurring, start_date }] }))).toBe('malformed');
    }
    expect(code(make({}, { recurring_payments: [{ ...recurring, end_date: 'soon' }] }))).toBe('malformed');
    expect(code(make({}, { recurring_payments: [{ ...recurring, dismissed_at: 'x' }] }))).toBe('malformed');
    expect(code(make({}, { recurring_payments: [{ ...recurring, last_confirmed_at: 'x' }] }))).toBe('malformed');
    expect(code(make({}, { transactions: [{ ...transaction, recurring_occurrence: 'x' }] }))).toBe('malformed');
  });

  it('refuses a timestamp that is not strict ISO UTC', () => {
    for (const created_at of ['banana', '2026-01-01', '2026-01-01T00:00:00', '2026-01-01T00:00:00+02:00', '2026-02-30T00:00:00Z']) {
      expect(code(make({}, { accounts: [{ ...account, created_at }] }))).toBe('malformed');
    }
    expect(code(make({}, { transactions: [{ ...transaction, date: 'tomorrow' }] }))).toBe('malformed');
    expect(code(make({ exportedAt: '2026-11-09' }))).toBe('malformed');
    expect(code(make({ exportedAt: '2026-11-09T12:00:00Z' }))).toBe('ok');
  });

  it('refuses a boolean that is not 0 or 1', () => {
    expect(code(make({}, { recurring_payments: [{ ...recurring, active: 7 }] }))).toBe('malformed');
    expect(code(make({}, { accounts: [{ ...account, in_global_cap: 2 }] }))).toBe('malformed');
    expect(code(make({}, { accounts: [{ ...account, in_global_cap: true }] }))).toBe('malformed');
  });

  it('refuses an id or foreign key id below 1', () => {
    expect(code(make({}, { accounts: [{ ...account, id: 0 }] }))).toBe('malformed');
    expect(code(make({}, { accounts: [{ ...account, id: -4 }] }))).toBe('malformed');
    expect(code(make({}, { transactions: [{ ...transaction, account_id: 0 }] }))).toBe('malformed');
    expect(code(make({}, { recurring_payments: [{ ...recurring, account_id: 0 }] }))).toBe('malformed');
    expect(code(make({}, { soft_caps: [{ id: 1, account_id: 0, period: 'day', amount_cents: 5 }] }))).toBe('malformed');
  });

  it('refuses an invalid default_reminders value', () => {
    for (const value of ['9', '1,x', 'soon', '1,,0', '-1']) {
      expect(code(make({}, { settings: [{ key: 'default_reminders', value }] }))).toBe('malformed');
    }
    expect(code(make({}, { settings: [{ key: 'default_reminders', value: null }] }))).toBe('malformed');
    for (const value of ['', '3', '3,2,1,0', '1,0']) {
      expect(code(make({}, { settings: [{ key: 'default_reminders', value }] }))).toBe('ok');
    }
  });

  it('refuses a missing, empty or long appVersion', () => {
    expect(code(make({ appVersion: '' }))).toBe('malformed');
    expect(code(make({ appVersion: 'x'.repeat(33) }))).toBe('malformed');
    expect(code(make({ appVersion: 'x'.repeat(32) }))).toBe('ok');
  });

  it('ignores unknown extra columns and an extra table', () => {
    const parsed = parseBackup(
      make({}, { accounts: [{ ...account, extra: 'x' }], mystery: [{ a: 1 }] }),
    );
    expect(parsed.tables.accounts).toEqual([account]);
    expect(Object.keys(parsed.tables)).not.toContain('mystery');
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 9, 23, 59))).toBe('spending-backup-2026-11-09.json');
    expect(backupFileName(new Date(2026, 0, 5, 0, 1))).toBe('spending-backup-2026-01-05.json');
  });
});
