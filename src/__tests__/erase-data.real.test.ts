/**
 * Erase all data on REAL SQLite (node:sqlite): every table is empty afterwards,
 * the reminders are cancelled, the lock entries are gone, and a failure leaves
 * the data (and the lock) intact.
 *
 * @jest-environment node
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { enableLock } from '@/services/app-lock';
import { initDb, resetDbForTests } from '@/services/db';
import { eraseAllData, ERASE_ORDER } from '@/services/erase-data';
import { useAppLockStore, resetAppLockForTests } from '@/stores/app-lock-store';
import { REMINDER_ID_PREFIX } from '@/services/reminder-plan';
import { silenceConsoleError } from '@/test/console-error';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';

silenceConsoleError();

let mockReal: RealSqlite;
const mockCreate = createRealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));

jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn().mockResolvedValue(undefined) }));

const secure =SecureStore as unknown as { __items: Map<string, string>; __reset: () => void };
const getScheduled = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

const tables = () =>
  mockReal
    .query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .map((row) => row.name);
const counts = () =>
  Object.fromEntries(
    tables().map((name) => [
      name,
      mockReal.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`)[0].n,
    ]),
  );

function seed(db: RealSqlite) {
  db.exec(`
    INSERT INTO settings (key, value) VALUES ('default_currency', 'USD'), ('default_reminders', '1,0');
    INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at, balance_anchor_cents, balance_anchor_at)
      VALUES (1, 'Bank', 'bank', 'MXN', 1, '2026-01-01T00:00:00.000Z', 150000, '2026-01-02T00:00:00.000Z');
    INSERT INTO recurring_payments (id, account_id, name, amount_cents, note, interval, unit, start_date, end_date,
        notify_days_before, active, last_confirmed_at, created_at, dismissed_at)
      VALUES (3, 1, 'Rent', 900000, NULL, 1, 'month', '2026-01-05', NULL, '1,0', 1, NULL, '2026-01-01T00:00:00.000Z', NULL);
    INSERT INTO transactions (id, account_id, kind, amount_cents, date, note, recurring_id, created_at, recurring_occurrence)
      VALUES (10, 1, 'expense', 900000, '2026-10-05T10:00:00.000Z', NULL, 3, '2026-10-05T10:00:00.000Z', '2026-10-05');
    INSERT INTO soft_caps (id, account_id, period, amount_cents) VALUES (1, NULL, 'month', 100000);
  `);
}

beforeEach(async () => {
  mockReal = mockCreate();
  resetDbForTests();
  secure.__reset();
  resetAppLockForTests();
  jest.clearAllMocks();
  getScheduled.mockResolvedValue([]);
  await initDb();
  seed(mockReal);
  await enableLock('1234');
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

describe('eraseAllData', () => {
  it('lists every table of the database', () => {
    expect([...ERASE_ORDER].sort()).toEqual([...tables()].sort());
  });

  it('leaves every table empty, cancels the reminders and clears the lock', async () => {
    expect(Object.values(counts()).every((n) => n > 0)).toBe(true);

    await eraseAllData();

    expect(Object.values(counts()).every((n) => n === 0)).toBe(true);
    expect(secure.__items.size).toBe(0);
  });

  it('cancels scheduled reminders of ours', async () => {
    getScheduled.mockResolvedValue([
      { identifier: `${REMINDER_ID_PREFIX}a` },
      { identifier: 'other' },
    ]);
    await eraseAllData();
    expect(cancel).toHaveBeenCalledWith(`${REMINDER_ID_PREFIX}a`);
    expect(cancel).not.toHaveBeenCalledWith('other');
  });

  it('on a database failure changes nothing: data, reminders and lock stay', async () => {
    const before = mockReal.query('SELECT * FROM transactions');
    const settingsBefore = mockReal.query('SELECT * FROM settings ORDER BY key');
    const lockBefore = new Map(secure.__items);
    mockReal.failOn('DELETE FROM accounts');

    await expect(eraseAllData()).rejects.toThrow();

    mockReal.clearFailure();
    expect(Object.values(counts()).every((n) => n > 0)).toBe(true);
    expect(mockReal.query('SELECT * FROM transactions')).toEqual(before);
    expect(mockReal.query('SELECT * FROM settings ORDER BY key')).toEqual(settingsBefore);
    expect(new Map(secure.__items)).toEqual(lockBefore);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not report a failure when the secure store delete fails after the wipe', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    await useAppLockStore.getState().load();
    expect(useAppLockStore.getState().locked).toBe(true);

    // The data is gone and the call resolves: no "nothing was changed" error.
    await expect(useAppLockStore.getState().erase()).resolves.toBeUndefined();

    expect(Object.values(counts()).every((n) => n === 0)).toBe(true);
    expect(useAppLockStore.getState()).toMatchObject({ enabled: false, locked: false });
  });

  it('still clears the lock if cancelling the reminders fails', async () => {
    getScheduled.mockRejectedValueOnce(new Error('no notifications'));
    await eraseAllData();
    expect(Object.values(counts()).every((n) => n === 0)).toBe(true);
    expect(secure.__items.size).toBe(0);
  });
});
