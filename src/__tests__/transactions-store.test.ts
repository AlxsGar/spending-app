import { createTransaction, listTransactions } from '@/services/transactions';
import type { Transaction, TransactionInput } from '@/services/transactions';
import { useTransactionsStore } from '@/stores/transactions-store';

jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  createTransaction: jest.fn(),
  listTransactions: jest.fn(),
}));

const make = (id: number, date: string): Transaction => ({
  id,
  accountId: 1,
  kind: 'expense',
  amountCents: 100,
  date,
  note: null,
  recurringId: null,
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
