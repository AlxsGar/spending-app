import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();

jest.mock('@/services/accounts', () => ({
  listAccounts: () => mockList(),
  createAccount: (input: unknown) => mockCreate(input),
  updateAccount: (id: number, input: unknown) => mockUpdate(id, input),
  removeAccount: (id: number) => mockRemove(id),
}));

const make = (id: number, name: string) => ({
  id,
  name,
  icon: 'bank',
  currency: 'MXN',
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const input = { name: 'Main', icon: 'bank', currency: 'MXN' };

describe('accounts store', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  });

  it('loads accounts', async () => {
    mockList.mockResolvedValue([make(1, 'A')]);
    await useAccountsStore.getState().load();
    expect(useAccountsStore.getState().status).toBe('ready');
    expect(useAccountsStore.getState().accounts).toHaveLength(1);
  });

  it('ignores load() while a load is already running', async () => {
    let resolve: (value: unknown[]) => void = () => {};
    mockList.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = useAccountsStore.getState().load();
    await useAccountsStore.getState().load();
    expect(mockList).toHaveBeenCalledTimes(1);
    resolve([]);
    await first;
    expect(useAccountsStore.getState().status).toBe('ready');
  });

  it('sets the error state when loading fails and recovers on retry', async () => {
    mockList.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce([]);
    await useAccountsStore.getState().load();
    expect(useAccountsStore.getState().status).toBe('error');
    await useAccountsStore.getState().load();
    expect(useAccountsStore.getState().status).toBe('ready');
  });

  it('adds an account', async () => {
    mockCreate.mockResolvedValue(make(1, 'Main'));
    await expect(useAccountsStore.getState().add(input)).resolves.toBe(true);
    expect(useAccountsStore.getState().accounts.map((a) => a.name)).toEqual(['Main']);
  });

  it('updates an account in place', async () => {
    useAccountsStore.setState({ accounts: [make(1, 'A'), make(2, 'B')] as never });
    mockUpdate.mockResolvedValue(make(2, 'Renamed'));
    await expect(useAccountsStore.getState().update(2, input)).resolves.toBe(true);
    expect(useAccountsStore.getState().accounts.map((a) => a.name)).toEqual(['A', 'Renamed']);
  });

  it('removes an account', async () => {
    useAccountsStore.setState({ accounts: [make(1, 'A'), make(2, 'B')] as never });
    mockRemove.mockResolvedValue(undefined);
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(true);
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual([2]);
  });

  it('drops the removed account transactions from the transactions store, and only on success', async () => {
    const tx = (id: number, accountId: number) => ({
      id,
      accountId,
      kind: 'expense' as const,
      amountCents: 100,
      date: '2026-03-01T00:00:00.000Z',
      note: null,
      recurringId: null,
      recurringOccurrence: null,
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    useAccountsStore.setState({ accounts: [make(1, 'A'), make(2, 'B')] as never });
    useTransactionsStore.setState({
      transactions: [tx(1, 1), tx(2, 2), tx(3, 1)],
      status: 'ready',
    });
    mockRemove.mockRejectedValueOnce(new Error('disk'));
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(false);
    expect(useTransactionsStore.getState().transactions).toHaveLength(3);

    mockRemove.mockResolvedValue(undefined);
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(true);
    expect(useTransactionsStore.getState().transactions.map((item) => item.id)).toEqual([2]);
  });

  it('clears recurringId in memory on OTHER accounts transactions linked to the deleted account payments', async () => {
    const tx = (id: number, accountId: number, recurringId: number | null) => ({
      id,
      accountId,
      kind: 'expense' as const,
      amountCents: 100,
      date: '2026-03-01T00:00:00.000Z',
      note: null,
      recurringId,
      recurringOccurrence: recurringId === null ? null : '2026-03-15',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    const payment = (id: number, accountId: number | null) => ({
      id,
      accountId,
      name: `Payment ${id}`,
      amountCents: 100,
      note: null,
      interval: 1,
      unit: 'month' as const,
      startDate: '2026-01-15',
      endDate: null,
      notifyDaysBefore: '',
      active: true,
      lastConfirmedAt: null,
      dismissedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    useAccountsStore.setState({ accounts: [make(1, 'A'), make(2, 'B')] as never });
    // Payment 10 belongs to account 1 (deleted); 11 to account 2; 12 to none.
    useRecurringStore.setState({
      payments: [payment(10, 1), payment(11, 2), payment(12, null)],
      status: 'ready',
    });
    useTransactionsStore.setState({
      transactions: [tx(1, 2, 10), tx(2, 2, 11), tx(3, 2, 12), tx(4, 1, 10), tx(5, 2, null)],
      status: 'ready',
    });

    mockRemove.mockRejectedValueOnce(new Error('disk'));
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(false);
    // Nothing changed on failure.
    expect(useTransactionsStore.getState().transactions.map((item) => item.recurringId)).toEqual([
      10, 11, 12, 10, null,
    ]);

    mockRemove.mockResolvedValue(undefined);
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(true);
    // Account 1's own transaction (4) went with it; the database cleared the link
    // on transaction 1 and kept the occurrence, and so does the store.
    expect(
      useTransactionsStore
        .getState()
        .transactions.sort((a, b) => a.id - b.id)
        .map((item) => [item.id, item.recurringId, item.recurringOccurrence]),
    ).toEqual([
      [1, null, '2026-03-15'],
      [2, 11, '2026-03-15'],
      [3, 12, '2026-03-15'],
      [5, null, null],
    ]);
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([11, 12]);
  });

  it('flags saveError and keeps state when a write fails', async () => {
    useAccountsStore.setState({ accounts: [make(1, 'A')] as never });
    mockCreate.mockRejectedValue(new Error('disk'));
    mockUpdate.mockRejectedValue(new Error('disk'));
    mockRemove.mockRejectedValue(new Error('disk'));
    await expect(useAccountsStore.getState().add(input)).resolves.toBe(false);
    expect(useAccountsStore.getState().saveError).toBe(true);
    await expect(useAccountsStore.getState().update(1, input)).resolves.toBe(false);
    await expect(useAccountsStore.getState().remove(1)).resolves.toBe(false);
    expect(useAccountsStore.getState().accounts).toHaveLength(1);
  });
});
