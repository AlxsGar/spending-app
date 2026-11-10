/**
 * The default currency on a REAL SQLite database: services that read it from
 * the settings table (recurring.ts) see a change made through the store.
 *
 * @jest-environment node
 */
import { initDb, resetDbForTests } from '@/services/db';
import { createRecurring } from '@/services/recurring';
import { payOccurrence } from '@/services/recurring-actions';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';

let mockReal: RealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));

const ACCOUNT_SQL =
  'INSERT INTO accounts (id, name, icon, currency, in_global_cap, created_at) VALUES (?, ?, ?, ?, ?, ?)';

const input = {
  accountId: null,
  name: 'Loose',
  amount: '5.25',
  interval: '1',
  unit: 'month',
  startDate: '2026-05-31',
  endDate: null,
  note: '',
  active: true,
};
const now = new Date(2026, 3, 20, 10, 0, 0);

beforeEach(async () => {
  mockReal = createRealSqlite();
  resetDbForTests();
  useDefaultCurrencyStore.setState({ value: null, saveError: false, loading: false });
  await initDb();
  mockReal.adapter.runAsync(ACCOUNT_SQL, 1, 'Yen', 'wallet', 'JPY', 0, '2026-01-01T00:00:00.000Z');
});

afterEach(() => {
  resetDbForTests();
  mockReal.close();
});

it('after the default currency changes, an unassigned payment is parsed and paid in the new currency', async () => {
  // MXN by default: decimals are fine.
  expect((await createRecurring(input, now)).amountCents).toBe(525);

  expect(await useDefaultCurrencyStore.getState().set('JPY')).toBe(true);
  expect(mockReal.query('SELECT value FROM settings WHERE key = ?', 'default_currency')).toEqual([
    { value: 'JPY' },
  ]);
  await expect(createRecurring(input, now)).rejects.toMatchObject({
    code: 'amountDecimalsNotAllowed',
  });
  const loose = await createRecurring({ ...input, amount: '525' }, now);
  // 525 yen, stored in hundredths like every currency here.
  expect(loose.amountCents).toBe(52500);
  expect(loose.accountId).toBeNull();

  // Paying it onto the yen account: the expense keeps the cents, in that
  // account's (JPY) currency, nothing converted.
  const { transaction } = await payOccurrence({
    paymentId: loose.id,
    occurrence: '2026-05-31',
    accountId: 1,
    now,
  });
  expect(transaction).toMatchObject({ accountId: 1, kind: 'expense', amountCents: 52500 });
  expect(
    mockReal.query(
      'SELECT t.amount_cents AS cents, a.currency AS currency FROM transactions t JOIN accounts a ON a.id = t.account_id',
    ),
  ).toEqual([{ cents: 52500, currency: 'JPY' }]);
});
