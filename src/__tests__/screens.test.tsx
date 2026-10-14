import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import AccountsScreen from '@/app/(tabs)/accounts';
import HomeScreen from '@/app/(tabs)/index';
import MovementsScreen from '@/app/(tabs)/movements';
import SettingsScreen from '@/app/(tabs)/settings';
import { en } from '@/i18n/en';
import { listAccounts } from '@/services/accounts';
import { listTransactions } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { colors } from '@/theme';

fakeAnimationTimers();

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/services/accounts', () => ({
  listAccounts: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  listTransactions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/language', () => ({
  loadLanguage: jest.fn(),
  saveLanguage: jest.fn(),
}));

const account = {
  id: 7,
  name: 'Savings',
  icon: 'bank' as const,
  currency: 'USD' as const,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
};

// A higher id was recorded later. The date defaults to just before now
// (newer id = older date, to prove Home does not order by date).
const tx = (
  id: number,
  kind: 'expense' | 'income',
  amountCents: number,
  note: string | null,
  date = new Date(Date.now() - id * 1000).toISOString(),
) => ({
  id,
  accountId: 7,
  kind,
  amountCents,
  date,
  note,
  recurringId: null,
  createdAt: new Date(2026, 0, 1, 0, 0, id).toISOString(),
});

describe('tab screens', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (listAccounts as jest.Mock).mockResolvedValue([]);
    (listTransactions as jest.Mock).mockResolvedValue([]);
    useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
    useTransactionsStore.setState({ transactions: [], status: 'idle' });
  });

  it('Movements groups transactions under Today, signed, with balances on Accounts', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 'income', 10000, 'Pay'),
      tx(2, 'expense', 2550, null),
    ]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.transactions.today)).toBeTruthy();
    expect(screen.getByText('+$100.00')).toBeTruthy();
    expect(screen.getByText('−$25.50')).toBeTruthy();
    expect(screen.getByText('Pay')).toBeTruthy();
    expect(screen.getByText(en.transactions.expense)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(en.fab.open));
    await screen.findByLabelText(en.fab.addTransaction);
    fireEvent.press(screen.getByText(en.fab.addTransaction, { includeHiddenElements: true }));
    expect(mockPush).toHaveBeenCalledWith('/transaction/new');
  });

  it('Movements opens the edit route when a row is tapped', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([tx(4, 'income', 100, 'tap me')]);
    await renderWithProviders(<MovementsScreen />);
    fireEvent.press(await screen.findByText('tap me'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transaction/[id]', params: { id: 4 } });
  });

  it('Home opens the edit route when a latest row is tapped', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([tx(6, 'expense', 100, 'tap me')]);
    await renderWithProviders(<HomeScreen />);
    fireEvent.press(await screen.findByText('tap me'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transaction/[id]', params: { id: 6 } });
  });

  it('Accounts shows the balance computed from transactions', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 'income', 10000, null),
      tx(2, 'expense', 12550, null),
    ]);
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText('−$25.50')).toBeTruthy();
  });

  it('Accounts and Home count only transactions after the balance was set', async () => {
    const anchor = new Date(Date.now() - 60_000).toISOString();
    (listAccounts as jest.Mock).mockResolvedValue([
      { ...account, balanceAnchorCents: 50000, balanceAnchorAt: anchor },
    ]);
    (listTransactions as jest.Mock).mockResolvedValue([
      // Now: after the anchor, counts.
      tx(1, 'expense', 2500, 'after', new Date().toISOString()),
      // Dated before the anchor (even if recorded later): does not count.
      tx(2, 'expense', 99999, 'before', new Date(Date.now() - 120_000).toISOString()),
    ]);
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText('$475.00')).toBeTruthy();
    expect(screen.queryByText('$-499.99')).toBeNull();

    const home = await renderWithProviders(<HomeScreen />);
    expect((await screen.findAllByText('$475.00')).length).toBeGreaterThan(0);
    home.unmount();
  });

  it('Accounts shows a negative initial balance in red with a minus', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([
      { ...account, balanceAnchorCents: -20000, balanceAnchorAt: '2026-01-01T00:00:00.000Z' },
    ]);
    await renderWithProviders(<AccountsScreen />);
    const amount = await screen.findByText('−$200.00');
    expect(StyleSheet.flatten(amount.props.style).color).toBe(colors.alert);
  });

  it('Home shows the three most recently RECORDED transactions, not the newest by date', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    // Listed by date desc (as the service returns them): n1 has the newest date
    // but was recorded first, so Home drops it.
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 'income', 100, 'n1'),
      tx(2, 'income', 200, 'n2'),
      tx(3, 'income', 300, 'n3'),
      tx(4, 'income', 400, 'n4'),
    ]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('n4')).toBeTruthy();
    expect(screen.getByText('n3')).toBeTruthy();
    expect(screen.getByText('n2')).toBeTruthy();
    expect(screen.queryByText('n1')).toBeNull();
    expect(screen.getByText(en.transactions.latest)).toBeTruthy();
  });

  it('Home shows a backdated transaction recorded last, first, with its date', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const old = new Date(2020, 4, 17, 12);
    const today = new Date().toISOString();
    // Service order (date desc): three from today, then the backdated ones.
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 'income', 100, 'today 1', today),
      tx(2, 'income', 200, 'today 2', today),
      tx(3, 'income', 300, 'today 3', today),
      tx(5, 'expense', 500, 'backdated yesterday', yesterday.toISOString()),
      tx(6, 'expense', 600, 'backdated long ago', old.toISOString()),
    ]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('backdated long ago')).toBeTruthy();
    expect(screen.getByText('backdated yesterday')).toBeTruthy();
    expect(screen.getByText('today 3')).toBeTruthy();
    expect(screen.queryByText('today 2')).toBeNull();

    // Each row carries its date as secondary text.
    expect(screen.getByText(en.transactions.yesterday)).toBeTruthy();
    expect(screen.getByText(en.transactions.today)).toBeTruthy();
    expect(
      screen.getByText(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(old)),
    ).toBeTruthy();

    // Newest recorded first.
    const notes = screen
      .getAllByText(/backdated|today/)
      .map((node) => node.props.children as string);
    expect(notes).toEqual(['backdated long ago', 'backdated yesterday', 'today 3']);
  });

  it('Movements keeps ordering by transaction date, not by when it was recorded', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    const recent = new Date(2026, 2, 10, 12);
    const older = new Date(2026, 2, 1, 12);
    // Recorded last (id 2) but dated earlier: the service returns it second.
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 'income', 100, 'by date first', recent.toISOString()),
      tx(2, 'income', 200, 'recorded last', older.toISOString()),
    ]);
    await renderWithProviders(<MovementsScreen />);
    await screen.findByText('by date first');
    const notes = screen.getAllByText(/by date first|recorded last/).map((n) => n.props.children);
    expect(notes).toEqual(['by date first', 'recorded last']);
  });

  it('Home says there are no transactions yet', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(en.transactions.latestEmpty)).toBeTruthy();
  });

  it('Movements shows an error with retry when transactions fail to load', async () => {
    (listTransactions as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.movements.emptyTitle)).toBeTruthy();
  });

  it('Movements empty action opens the transaction form', async () => {
    await renderWithProviders(<MovementsScreen />);
    fireEvent.press(await screen.findByText(en.movements.emptyAction));
    expect(mockPush).toHaveBeenCalledWith('/transaction/new');
  });

  it('Home renders its empty state', async () => {
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(en.home.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.home.emptyAction)).toBeTruthy();
  });

  it('Accounts renders its empty state and its action opens the form', async () => {
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText(en.accounts.emptyTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.accounts.emptyAction));
    expect(mockPush).toHaveBeenCalledWith('/account/new');
  });

  it('Accounts lists accounts with a zero balance and opens the detail', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    fireEvent.press(screen.getByText('Savings'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: 7 } });
  });

  it('Home shows an account card with its balance', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.queryByText(en.home.emptyTitle)).toBeNull();
    expect(screen.getByText('Savings').props.numberOfLines).toBe(1);
  });

  it('Accounts shows an error with retry when loading fails', async () => {
    (listAccounts as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.accounts.emptyTitle)).toBeTruthy();
  });

  it('Movements renders its empty state', async () => {
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.movements.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.movements.emptyAction)).toBeTruthy();
  });

  it('FAB menu shows three options when opened', async () => {
    await renderWithProviders(<MovementsScreen />);
    expect(screen.queryByLabelText(en.fab.addRecurring)).toBeNull();
    fireEvent.press(screen.getByLabelText(en.fab.open));
    expect(await screen.findByLabelText(en.fab.addRecurring)).toBeTruthy();
    expect(screen.getByLabelText(en.fab.addAccount)).toBeTruthy();
    expect(screen.getByLabelText(en.fab.addTransaction)).toBeTruthy();
  });

  it('Home, Accounts and Movements show the FAB', async () => {
    for (const Screen of [HomeScreen, AccountsScreen, MovementsScreen]) {
      const { unmount } = await renderWithProviders(<Screen />);
      expect(screen.getByLabelText(en.fab.open)).toBeTruthy();
      unmount();
    }
  });

  it('Settings has no FAB', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText(en.settings.language)).toBeTruthy();
    expect(screen.queryByLabelText(en.fab.open)).toBeNull();
  });
});
