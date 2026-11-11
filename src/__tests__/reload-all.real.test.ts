/**
 * reloadAllStores with the real zustand stores on a REAL SQLite database: stale
 * state from before an import is replaced by what the database holds now.
 *
 * @jest-environment node
 */
import { initDb, resetDbForTests } from '@/services/db';
import { useAccountsStore } from '@/stores/accounts-store';
import { useCapSnackbarStore } from '@/stores/cap-snackbar-store';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';
import { useCapsStore } from '@/stores/caps-store';
import { useChartRangeStore } from '@/stores/chart-range-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useDefaultRemindersStore } from '@/stores/default-reminders';
import { useRecurringStore } from '@/stores/recurring-store';
import { reloadAllStores } from '@/stores/reload-all';
import { useTransactionsStore } from '@/stores/transactions-store';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';

let mockReal: RealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));

beforeEach(async () => {
  mockReal = createRealSqlite();
  resetDbForTests();
  await initDb();
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

it('replaces stale store state with the database content and clears stale hand-offs', async () => {
  // The state before the import: old ids, old values, loaded and ready.
  useAccountsStore.setState({
    accounts: [
      {
        id: 100,
        name: 'Old',
        icon: 'wallet',
        currency: 'JPY',
        inGlobalCap: true,
        createdAt: '2020-01-01T00:00:00.000Z',
        balanceAnchorCents: 0,
        balanceAnchorAt: null,
      },
    ],
    status: 'ready',
  });
  useTransactionsStore.setState({
    transactions: [{ id: 500 } as never],
    status: 'ready',
  });
  useRecurringStore.setState({ payments: [{ id: 300 } as never], status: 'ready' });
  useCapsStore.setState({ caps: [{ id: 9, accountId: 100, period: 'day', amountCents: 1 } as never], status: 'ready' });
  useDefaultCurrencyStore.setState({ value: 'JPY', loading: false, saveError: false });
  useDefaultRemindersStore.setState({ value: '3', saveError: false });
  useChartRangeStore.setState({ pending: { chartId: 'account-100', from: '2026-01-01', to: '2026-01-31' } });
  useCapSnackbarStore.setState({ pending: {} as never, current: {} as never });
  useCapsDialogStore.setState({ open: true });

  // What the import wrote.
  mockReal.exec(`
    INSERT INTO settings (key, value) VALUES ('default_currency', 'USD'), ('default_reminders', '2,0');
    INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at, balance_anchor_cents, balance_anchor_at)
      VALUES (1, 'Fresh', 'wallet', 'USD', 1, '2026-01-01T00:00:00.000Z', 0, NULL);
    INSERT INTO recurring_payments (id, account_id, name, amount_cents, interval, unit, start_date, notify_days_before, active, created_at)
      VALUES (3, 1, 'Rent', 900000, 1, 'month', '2026-01-05', '1,0', 1, '2026-01-01T00:00:00.000Z');
    INSERT INTO transactions (id, account_id, kind, amount_cents, date, created_at)
      VALUES (10, 1, 'expense', 500, '2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00.000Z');
    INSERT INTO soft_caps (id, account_id, period, amount_cents) VALUES (1, NULL, 'month', 100000);
  `);

  await reloadAllStores();

  expect(useAccountsStore.getState().accounts.map((a) => [a.id, a.name])).toEqual([[1, 'Fresh']]);
  expect(useAccountsStore.getState().status).toBe('ready');
  expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([10]);
  expect(useRecurringStore.getState().payments.map((p) => p.id)).toEqual([3]);
  expect(useCapsStore.getState().caps.map((c) => [c.id, c.accountId])).toEqual([[1, null]]);
  expect(useDefaultCurrencyStore.getState().value).toBe('USD');
  expect(useDefaultRemindersStore.getState().value).toBe('2,0');
  expect(useChartRangeStore.getState().pending).toBeNull();
  expect(useCapSnackbarStore.getState()).toMatchObject({ pending: null, current: null });
  expect(useCapsDialogStore.getState().open).toBe(false);
});
