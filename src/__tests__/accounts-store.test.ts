import { useAccountsStore } from '@/stores/accounts-store';
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
