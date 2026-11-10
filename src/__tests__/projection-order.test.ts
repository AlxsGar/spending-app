import { projectBalances } from '@/services/projection';
import type { RecurringPayment } from '@/services/recurring';
import { payOccurrence, removeTransactionUndoing } from '@/services/recurring-actions';
import { computeBalances } from '@/services/transactions';
import type { Transaction } from '@/services/transactions';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';

// The pay and undo flows change two stores (a transaction and the payment's
// last_confirmed_at). React batches those into one render, but non-React
// subscribers see each store notification. These tests read the projection from
// the stores on EVERY notification and pin the order: no notification may show
// a value below the final one (an occurrence subtracted twice).

jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
  removeTransactionUndoing: jest.fn(),
}));
jest.mock('@/services/reminders', () => ({ requestReminderSync: jest.fn() }));

const account = {
  id: 7,
  currency: 'USD' as const,
  balanceAnchorCents: 100000,
  balanceAnchorAt: null as string | null,
};
const TODAY = '2026-11-10';

const payment = (extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 1,
  accountId: 7,
  name: 'Rent',
  amountCents: 30000,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-11-20',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const expense: Transaction = {
  id: 900,
  accountId: 7,
  kind: 'expense',
  amountCents: 30000,
  date: '2026-11-10T12:00:00.000Z',
  note: null,
  recurringId: 1,
  recurringOccurrence: '2026-11-20',
  createdAt: '2026-11-10T12:00:00.000Z',
};

const current = () =>
  projectBalances({
    accounts: [account],
    balances: computeBalances([account], useTransactionsStore.getState().transactions),
    payments: useRecurringStore.getState().payments,
    today: TODAY,
    defaultCurrency: 'USD',
  }).perAccount[7];

// Records the projection at every notification of either store.
function record(): { seen: number[]; stop: () => void } {
  const seen: number[] = [];
  const push = () => seen.push(current());
  const stops = [useRecurringStore.subscribe(push), useTransactionsStore.subscribe(push)];
  return { seen, stop: () => stops.forEach((stop) => stop()) };
}

describe('projection while two stores change', () => {
  it('pay: never dips below the final value between the two updates', async () => {
    useTransactionsStore.setState({ transactions: [], status: 'ready' });
    useRecurringStore.setState({ payments: [payment()], status: 'ready' });
    (payOccurrence as jest.Mock).mockResolvedValue({
      transaction: expense,
      payment: payment({ lastConfirmedAt: '2026-11-20' }),
    });
    expect(current()).toBe(70000);

    const { seen, stop } = record();
    await useRecurringStore.getState().pay(1, '2026-11-20', 7);
    stop();

    expect(seen.length).toBe(2);
    expect(seen[seen.length - 1]).toBe(70000);
    expect(Math.min(...seen)).toBe(70000);
  });

  it('undo (delete a paid expense): never dips below the final value', async () => {
    useTransactionsStore.setState({ transactions: [expense], status: 'ready' });
    useRecurringStore.setState({
      payments: [payment({ lastConfirmedAt: '2026-11-20' })],
      status: 'ready',
    });
    (removeTransactionUndoing as jest.Mock).mockResolvedValue({
      undone: { paymentId: 1, lastConfirmedAt: null },
    });
    expect(current()).toBe(70000);

    const { seen, stop } = record();
    await useTransactionsStore
      .getState()
      .remove(900, (id, day) => useRecurringStore.getState().setLastConfirmed(id, day));
    stop();

    expect(seen.length).toBe(2);
    expect(seen[seen.length - 1]).toBe(70000);
    expect(Math.min(...seen)).toBe(70000);
  });
});
