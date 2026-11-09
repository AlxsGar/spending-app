import { removeTransactionUndoing } from '@/services/recurring-actions';
import {
  createTransaction,
  listTransactions,
  updateTransaction,
} from '@/services/transactions';
import type { Transaction, TransactionInput } from '@/services/transactions';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';

jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  createTransaction: jest.fn(),
  listTransactions: jest.fn(),
  updateTransaction: jest.fn(),
}));

jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  removeTransactionUndoing: jest.fn(),
}));

const removeTransaction = removeTransactionUndoing;

const make = (id: number, date: string): Transaction => ({
  id,
  accountId: 1,
  kind: 'expense',
  amountCents: 100,
  date,
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: date,
});

const input: TransactionInput = {
  accountId: 1,
  kind: 'expense',
  amount: '1',
  date: new Date(),
  note: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
});

describe('transactions store', () => {
  it('loads newest first', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([
      make(2, '2026-03-02T00:00:00.000Z'),
      make(1, '2026-03-01T00:00:00.000Z'),
    ]);
    await useTransactionsStore.getState().load();
    expect(useTransactionsStore.getState().status).toBe('ready');
    expect(useTransactionsStore.getState().transactions.map((item) => item.id)).toEqual([2, 1]);
  });

  it('goes to error when loading fails, and retry recovers', async () => {
    (listTransactions as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await useTransactionsStore.getState().load();
    expect(useTransactionsStore.getState().status).toBe('error');
    (listTransactions as jest.Mock).mockResolvedValue([]);
    await useTransactionsStore.getState().load();
    expect(useTransactionsStore.getState().status).toBe('ready');
  });

  it('adds in order and reports failure as false', async () => {
    useTransactionsStore.setState({
      transactions: [make(1, '2026-03-01T00:00:00.000Z')],
      status: 'ready',
    });
    (createTransaction as jest.Mock).mockResolvedValue(make(2, '2026-03-02T00:00:00.000Z'));
    expect(await useTransactionsStore.getState().add(input)).toBe(true);
    expect(useTransactionsStore.getState().transactions.map((item) => item.id)).toEqual([2, 1]);

    (createTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    expect(await useTransactionsStore.getState().add(input)).toBe(false);
    expect(useTransactionsStore.getState().transactions).toHaveLength(2);
  });

  it('updates a row in place, re-sorts, and reports failure as false', async () => {
    useTransactionsStore.setState({
      transactions: [make(2, '2026-03-02T00:00:00.000Z'), make(1, '2026-03-01T00:00:00.000Z')],
      status: 'ready',
    });
    // Row 1 moves to a later date, so it becomes the first.
    const saved = {
      ...make(1, '2026-03-05T00:00:00.000Z'),
      amountCents: 999,
      createdAt: '2026-03-01T00:00:00.000Z',
    };
    (updateTransaction as jest.Mock).mockResolvedValue(saved);
    expect(await useTransactionsStore.getState().update(1, input)).toEqual(saved);
    const list = useTransactionsStore.getState().transactions;
    expect(list.map((item) => item.id)).toEqual([1, 2]);
    expect(list[0].amountCents).toBe(999);

    (updateTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    expect(await useTransactionsStore.getState().update(1, input)).toBeNull();
    expect(useTransactionsStore.getState().transactions).toHaveLength(2);
  });

  it('removes a row, and keeps it when the delete fails', async () => {
    useTransactionsStore.setState({
      transactions: [make(2, '2026-03-02T00:00:00.000Z'), make(1, '2026-03-01T00:00:00.000Z')],
      status: 'ready',
    });
    (removeTransaction as jest.Mock).mockRejectedValueOnce(new Error('db'));
    expect(await useTransactionsStore.getState().remove(2)).toBe(false);
    expect(useTransactionsStore.getState().transactions).toHaveLength(2);

    (removeTransaction as jest.Mock).mockResolvedValue({ undone: null });
    expect(await useTransactionsStore.getState().remove(2)).toBe(true);
    expect(useTransactionsStore.getState().transactions.map((item) => item.id)).toEqual([1]);
  });

  it('steps the recurring payment back in memory when the delete undid a payment', async () => {
    useTransactionsStore.setState({
      transactions: [make(2, '2026-03-02T00:00:00.000Z')],
      status: 'ready',
    });
    useRecurringStore.setState({
      payments: [
        {
          id: 9,
          accountId: 1,
          name: 'Rent',
          amountCents: 100,
          note: null,
          interval: 1,
          unit: 'month',
          startDate: '2026-01-15',
          endDate: null,
          notifyDaysBefore: '',
          active: true,
          lastConfirmedAt: '2026-03-15',
          dismissedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      status: 'ready',
    });
    (removeTransaction as jest.Mock).mockResolvedValue({
      undone: { paymentId: 9, lastConfirmedAt: '2026-02-15' },
    });
    const onUndone = jest.fn((id: number, day: string | null) =>
      useRecurringStore.getState().setLastConfirmed(id, day),
    );
    expect(await useTransactionsStore.getState().remove(2, onUndone)).toBe(true);
    expect(onUndone).toHaveBeenCalledWith(9, '2026-02-15');
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe('2026-02-15');
    // Nothing undone: the callback is not called.
    onUndone.mockClear();
    (removeTransaction as jest.Mock).mockResolvedValue({ undone: null });
    useTransactionsStore.setState({ transactions: [make(3, '2026-03-03T00:00:00.000Z')] });
    expect(await useTransactionsStore.getState().remove(3, onUndone)).toBe(true);
    expect(onUndone).not.toHaveBeenCalled();
  });

  it('addExisting inserts a transaction the database already has, once, in order', () => {
    useTransactionsStore.setState({
      transactions: [make(1, '2026-03-01T00:00:00.000Z')],
      status: 'ready',
    });
    useTransactionsStore.getState().addExisting(make(2, '2026-03-02T00:00:00.000Z'));
    useTransactionsStore.getState().addExisting(make(2, '2026-03-02T00:00:00.000Z'));
    expect(useTransactionsStore.getState().transactions.map((item) => item.id)).toEqual([2, 1]);
  });

  it('keeps a transaction added while a load is in flight', async () => {
    // The load reads the table before the insert, so its result misses the new row.
    let finishLoad: (rows: Transaction[]) => void = () => {};
    (listTransactions as jest.Mock).mockReturnValue(
      new Promise<Transaction[]>((resolve) => {
        finishLoad = resolve;
      }),
    );
    const loading = useTransactionsStore.getState().load();
    expect(useTransactionsStore.getState().status).toBe('loading');

    const added = make(5, '2026-03-05T00:00:00.000Z');
    (createTransaction as jest.Mock).mockResolvedValue(added);
    await useTransactionsStore.getState().add(input);

    finishLoad([make(4, '2026-03-04T00:00:00.000Z')]);
    await loading;

    const state = useTransactionsStore.getState();
    expect(state.status).toBe('ready');
    expect(state.transactions.map((item) => item.id)).toEqual([5, 4]);
  });

  it('does not duplicate a row that both the load and the add returned', async () => {
    let finishLoad: (rows: Transaction[]) => void = () => {};
    (listTransactions as jest.Mock).mockReturnValue(
      new Promise<Transaction[]>((resolve) => {
        finishLoad = resolve;
      }),
    );
    const loading = useTransactionsStore.getState().load();
    const row = make(5, '2026-03-05T00:00:00.000Z');
    (createTransaction as jest.Mock).mockResolvedValue(row);
    await useTransactionsStore.getState().add(input);
    finishLoad([row]);
    await loading;
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
  });
});
