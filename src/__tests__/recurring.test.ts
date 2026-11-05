import {
  RecurringValidationError,
  createRecurring,
  getRecurring,
  listRecurring,
  nextDueDay,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { RecurringInput } from '@/services/recurring';

type Row = {
  id: number;
  account_id: number;
  name: string;
  amount_cents: number;
  note: string | null;
  interval: number;
  unit: string;
  start_date: string;
  end_date: string | null;
  notify_days_before: string;
  active: number;
  last_confirmed_at: string | null;
  created_at: string;
};

let rows: Row[] = [];
let nextId = 1;

const mockDb = {
  getAllAsync: jest.fn(async () => [...rows].sort((a, b) => a.id - b.id)),
  getFirstAsync: jest.fn(async (_sql: string, id: number) => {
    const row = rows.find((item) => item.id === id);
    return row ? { ...row } : null;
  }),
  runAsync: jest.fn(async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('UPDATE')) {
      const [accountId, name, amount, note, interval, unit, startDate, endDate, active, id] =
        args as [number, string, number, string | null, number, string, string, string | null, number, number];
      const row = rows.find((item) => item.id === id);
      if (!row) return { lastInsertRowId: 0, changes: 0 };
      Object.assign(row, {
        account_id: accountId,
        name,
        amount_cents: amount,
        note,
        interval,
        unit,
        start_date: startDate,
        end_date: endDate,
        active,
      });
      return { lastInsertRowId: 0, changes: 1 };
    }
    if (sql.startsWith('DELETE')) {
      const [id] = args as [number];
      const before = rows.length;
      rows = rows.filter((item) => item.id !== id);
      return { lastInsertRowId: 0, changes: before - rows.length };
    }
    const [accountId, name, amount, note, interval, unit, startDate, endDate, active, createdAt] =
      args as [number, string, number, string | null, number, string, string, string | null, number, string];
    const id = nextId++;
    rows.push({
      id,
      account_id: accountId,
      name,
      amount_cents: amount,
      note,
      interval,
      unit,
      start_date: startDate,
      end_date: endDate,
      notify_days_before: '',
      active,
      last_confirmed_at: null,
      created_at: createdAt,
    });
    return { lastInsertRowId: id, changes: 1 };
  }),
};

const mockAccounts: Record<number, { id: number; currency: string }> = {
  1: { id: 1, currency: 'USD' },
  2: { id: 2, currency: 'JPY' },
};

// The default_currency setting, as getDefaultCurrency reads it.
let mockDefaultCurrency: string | null = null;

jest.mock('@/services/db', () => ({
  initDb: jest.fn(async () => mockDb),
  getSetting: jest.fn(async () => mockDefaultCurrency),
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  getAccount: jest.fn(async (id: number) => mockAccounts[id] ?? null),
}));

// 20 Oct 2026, local time.
const now = new Date(2026, 9, 20, 9, 0, 0);
const input: RecurringInput = {
  accountId: 1,
  name: ' Rent ',
  amount: '1200,5',
  interval: '2',
  unit: 'week',
  startDate: '2026-10-22',
  endDate: '2026-12-31',
  note: '',
  active: true,
};

beforeEach(() => {
  rows = [];
  nextId = 1;
  mockDefaultCurrency = null;
  jest.clearAllMocks();
});

describe('recurring service', () => {
  it('creates with trimmed text, integer cents, the schedule, and no confirmation', async () => {
    const created = await createRecurring(input, now);
    expect(created).toEqual({
      id: 1,
      accountId: 1,
      name: 'Rent',
      amountCents: 120050,
      note: null,
      interval: 2,
      unit: 'week',
      startDate: '2026-10-22',
      endDate: '2026-12-31',
      notifyDaysBefore: '',
      active: true,
      lastConfirmedAt: null,
      createdAt: now.toISOString(),
    });
    expect(rows[0]).toMatchObject({
      amount_cents: 120050,
      interval: 2,
      unit: 'week',
      start_date: '2026-10-22',
      end_date: '2026-12-31',
      notify_days_before: '',
      last_confirmed_at: null,
      active: 1,
    });
  });

  it('stores an indefinite payment with a null end date, the trimmed note and the inactive flag', async () => {
    const created = await createRecurring(
      { ...input, endDate: null, note: '  pay by card ', active: false },
      now,
    );
    expect(created).toMatchObject({ endDate: null, note: 'pay by card', active: false });
    expect(rows[0]).toMatchObject({ end_date: null, note: 'pay by card', active: 0 });
  });

  it('accepts a start date of today and rejects one in the past', async () => {
    await expect(createRecurring({ ...input, startDate: '2026-10-20' }, now)).resolves.toBeTruthy();
    await expect(createRecurring({ ...input, startDate: '2026-10-19' }, now)).rejects.toMatchObject({
      code: 'startDateInPast',
    });
  });

  it('uses the local calendar day for "today", late at night', async () => {
    const lateNight = new Date(2026, 9, 20, 23, 59);
    await expect(createRecurring({ ...input, startDate: '2026-10-20' }, lateNight)).resolves.toBeTruthy();
    const earlyMorning = new Date(2026, 9, 21, 0, 1);
    await expect(
      createRecurring({ ...input, startDate: '2026-10-20' }, earlyMorning),
    ).rejects.toMatchObject({ code: 'startDateInPast' });
  });

  it('rejects invalid input with a coded error and writes nothing', async () => {
    const reject = (extra: Partial<RecurringInput>, code: string) =>
      expect(createRecurring({ ...input, ...extra }, now)).rejects.toMatchObject({ code });
    await expect(createRecurring({ ...input, name: '' }, now)).rejects.toBeInstanceOf(
      RecurringValidationError,
    );
    await reject({ amount: '' }, 'amountRequired');
    await reject({ accountId: 99 }, 'accountNotFound');
    await reject({ accountId: 2 }, 'amountDecimalsNotAllowed');
    await reject({ interval: '0' }, 'intervalOutOfRange');
    await reject({ interval: '366' }, 'intervalOutOfRange');
    await reject({ interval: '1.5' }, 'intervalInvalid');
    await reject({ unit: 'decade' }, 'invalidUnit');
    await reject({ endDate: '2026-10-21' }, 'endBeforeStart');
    expect(rows).toEqual([]);
  });

  describe('without an account', () => {
    it('creates and lists a payment with a null account', async () => {
      const created = await createRecurring({ ...input, accountId: null }, now);
      expect(created).toMatchObject({ accountId: null, amountCents: 120050 });
      expect(rows[0].account_id).toBeNull();
      expect(await listRecurring()).toEqual([created]);
      expect(await getRecurring(created.id)).toEqual(created);
    });

    it('parses the amount in the default currency: MXN without a setting, JPY without decimals', async () => {
      // No setting: MXN, two decimals allowed.
      expect((await createRecurring({ ...input, accountId: null, amount: '10.55' }, now)).amountCents).toBe(
        1055,
      );
      mockDefaultCurrency = 'JPY';
      await expect(
        createRecurring({ ...input, accountId: null, amount: '10.5' }, now),
      ).rejects.toMatchObject({ code: 'amountDecimalsNotAllowed' });
      expect((await createRecurring({ ...input, accountId: null, amount: '500' }, now)).amountCents).toBe(
        50000,
      );
      mockDefaultCurrency = 'ZZZ';
      expect((await createRecurring({ ...input, accountId: null, amount: '1.25' }, now)).amountCents).toBe(
        125,
      );
    });

    it('edits to and from "no account", re-validating the amount against the new currency', async () => {
      const created = await createRecurring(input, now);
      expect(created.accountId).toBe(1);

      const loose = await updateRecurring(created.id, { ...input, accountId: null }, now);
      expect(loose.accountId).toBeNull();
      expect(rows[0].account_id).toBeNull();

      const back = await updateRecurring(created.id, { ...input, accountId: 1 }, now);
      expect(back.accountId).toBe(1);

      // Moving to the JPY account (or a JPY default) rejects decimals.
      await expect(
        updateRecurring(created.id, { ...input, accountId: 2 }, now),
      ).rejects.toMatchObject({ code: 'amountDecimalsNotAllowed' });
      mockDefaultCurrency = 'JPY';
      await expect(
        updateRecurring(created.id, { ...input, accountId: null }, now),
      ).rejects.toMatchObject({ code: 'amountDecimalsNotAllowed' });
      expect(rows[0].account_id).toBe(1);
    });
  });

  it('accepts interval bounds 1 and 365', async () => {
    expect((await createRecurring({ ...input, interval: '1' }, now)).interval).toBe(1);
    expect((await createRecurring({ ...input, interval: '365' }, now)).interval).toBe(365);
  });

  it('lists and gets', async () => {
    const a = await createRecurring(input, now);
    const b = await createRecurring({ ...input, name: 'Gym' }, now);
    expect(await listRecurring()).toEqual([a, b]);
    expect(await getRecurring(b.id)).toEqual(b);
    expect(await getRecurring(99)).toBeNull();
  });

  it('updates the editable fields and keeps notify, last confirmed and created_at', async () => {
    const created = await createRecurring(input, now);
    rows[0].last_confirmed_at = '2026-09-01';
    rows[0].notify_days_before = '1,0';
    const updated = await updateRecurring(
      created.id,
      {
        accountId: 2,
        name: ' Yen rent ',
        amount: '5000',
        interval: '3',
        unit: 'month',
        startDate: '2026-11-30',
        endDate: null,
        note: 'x',
        active: false,
      },
      now,
    );
    expect(updated).toMatchObject({
      id: created.id,
      accountId: 2,
      name: 'Yen rent',
      amountCents: 500000,
      note: 'x',
      interval: 3,
      unit: 'month',
      startDate: '2026-11-30',
      endDate: null,
      active: false,
      lastConfirmedAt: '2026-09-01',
      createdAt: created.createdAt,
    });
    expect(rows[0]).toMatchObject({
      account_id: 2,
      interval: 3,
      unit: 'month',
      start_date: '2026-11-30',
      end_date: null,
      active: 0,
      last_confirmed_at: '2026-09-01',
      notify_days_before: '1,0',
      created_at: created.createdAt,
    });
  });

  it('update rejects invalid input and a missing payment without writing', async () => {
    const created = await createRecurring(input, now);
    await expect(updateRecurring(created.id, { ...input, name: '' }, now)).rejects.toBeInstanceOf(
      RecurringValidationError,
    );
    await expect(updateRecurring(99, input, now)).rejects.toThrow('not found');
    expect(rows[0].name).toBe('Rent');
  });

  describe('edit and the next due date (never paid)', () => {
    // Every 10 days from Oct 24; today is Oct 20 -> next due Oct 24.
    const base: RecurringInput = {
      ...input,
      interval: '10',
      unit: 'day',
      startDate: '2026-10-24',
      endDate: null,
    };
    const dueOf = async (id: number, at: Date) => nextDueDay((await getRecurring(id))!, at);

    it('changing the interval, the unit or the start date moves it', async () => {
      const created = await createRecurring(base, now);
      expect(await dueOf(created.id, now)).toBe('2026-10-24');

      await updateRecurring(created.id, { ...base, startDate: '2026-10-22' }, now);
      expect(await dueOf(created.id, now)).toBe('2026-10-22');

      // Every 2 weeks from Oct 22: Oct 22 still next; at Oct 23 the missed Oct 22 stays current.
      await updateRecurring(created.id, { ...base, startDate: '2026-10-22', interval: '2', unit: 'week' }, now);
      expect(await dueOf(created.id, new Date(2026, 9, 23))).toBe('2026-10-22');
      expect(await dueOf(created.id, new Date(2026, 10, 5))).toBe('2026-11-05');

      await updateRecurring(created.id, { ...base, startDate: '2026-10-22', interval: '1', unit: 'month' }, now);
      expect(await dueOf(created.id, new Date(2026, 10, 5))).toBe('2026-10-22');
      expect(await dueOf(created.id, new Date(2026, 10, 23))).toBe('2026-11-22');
    });

    it('a rename or an amount edit never moves it, even after the day has passed', async () => {
      const created = await createRecurring({ ...base, startDate: '2026-10-22' }, now);
      const later = new Date(2026, 9, 28);
      const before = await dueOf(created.id, later);
      expect(before).toBe('2026-10-22');

      await updateRecurring(
        created.id,
        { ...base, startDate: '2026-10-22', name: 'Renamed' },
        later,
      );
      expect(await dueOf(created.id, later)).toBe(before);
      expect(rows[0].start_date).toBe('2026-10-22');

      await updateRecurring(
        created.id,
        { ...base, startDate: '2026-10-22', amount: '99' },
        later,
      );
      expect(await dueOf(created.id, later)).toBe(before);
      expect(rows[0].start_date).toBe('2026-10-22');
    });

    it('an unchanged past start date is kept on edit, a changed past one is rejected', async () => {
      const created = await createRecurring({ ...base, startDate: '2026-10-22' }, now);
      const later = new Date(2026, 10, 30);
      await expect(
        updateRecurring(created.id, { ...base, startDate: '2026-10-22', name: 'Kept' }, later),
      ).resolves.toMatchObject({ name: 'Kept', startDate: '2026-10-22' });
      await expect(
        updateRecurring(created.id, { ...base, startDate: '2026-10-23' }, later),
      ).rejects.toMatchObject({ code: 'startDateInPast' });
      expect(rows[0].start_date).toBe('2026-10-22');
    });

    it('clamps day 31 on edit: Feb 28 in a normal year, Feb 29 in a leap year', async () => {
      const created = await createRecurring(base, now);
      await updateRecurring(
        created.id,
        { ...base, interval: '1', unit: 'month', startDate: '2026-12-31' },
        now,
      );
      expect(await dueOf(created.id, new Date(2027, 1, 27))).toBe('2027-01-31');
      expect(await dueOf(created.id, new Date(2027, 1, 28))).toBe('2027-02-28');
      expect(await dueOf(created.id, new Date(2027, 2, 1))).toBe('2027-02-28');
      await updateRecurring(
        created.id,
        { ...base, interval: '1', unit: 'month', startDate: '2027-12-31' },
        now,
      );
      expect(await dueOf(created.id, new Date(2028, 1, 28))).toBe('2028-01-31');
      expect(await dueOf(created.id, new Date(2028, 1, 29))).toBe('2028-02-29');
    });
  });

  it('removes a payment', async () => {
    const a = await createRecurring(input, now);
    const b = await createRecurring({ ...input, name: 'Gym' }, now);
    await removeRecurring(a.id);
    expect(await listRecurring()).toEqual([b]);
  });
});
