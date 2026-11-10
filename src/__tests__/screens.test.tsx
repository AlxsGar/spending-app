import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import AccountsScreen from '@/app/(tabs)/accounts';
import HomeScreen from '@/app/(tabs)/index';
import MovementsScreen from '@/app/(tabs)/movements';
import SettingsScreen from '@/app/(tabs)/settings';
import i18n from '@/i18n';
import { CapsDialogHost } from '@/components/caps-exceeded-dialog';
import { en } from '@/i18n/en';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import { listCaps, saveGlobalCap } from '@/services/soft-caps';
import { dayToDate, listRecurring, toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { listTransactions } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';
import { useCapsStore } from '@/stores/caps-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { colors } from '@/theme';

fakeAnimationTimers();
// A failed recurring load is logged as "[recurring] list failed:".
const consoleError = silenceConsoleError();

const mockPush = jest.fn();
let mockFocused = true;

jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/services/accounts', () => ({
  // CURRENCIES feeds the Settings default currency picker.
  CURRENCIES: jest.requireActual('@/services/accounts').CURRENCIES,
  listAccounts: jest.fn().mockResolvedValue([]),
  getDefaultCurrency: jest.fn().mockResolvedValue('MXN'),
  FALLBACK_CURRENCY: 'MXN',
}));
jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  listTransactions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/soft-caps', () => ({
  ...jest.requireActual('@/services/soft-caps'),
  listCaps: jest.fn().mockResolvedValue([]),
  saveGlobalCap: jest.fn().mockResolvedValue(undefined),
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

const payment = (
  id: number,
  name: string,
  amountCents: number,
  extra: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id,
  accountId: 7 as number | null,
  name,
  amountCents,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-01-15',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

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
  recurringOccurrence: null,
  createdAt: new Date(2026, 0, 1, 0, 0, id).toISOString(),
});

describe('tab screens', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (listAccounts as jest.Mock).mockResolvedValue([]);
    (listTransactions as jest.Mock).mockResolvedValue([]);
    useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
    useDefaultCurrencyStore.setState({ value: null, saveError: false });
    useTransactionsStore.setState({ transactions: [], status: 'idle' });
    (listRecurring as jest.Mock).mockResolvedValue([]);
    useRecurringStore.setState({ payments: [], status: 'idle' });
    (listCaps as jest.Mock).mockResolvedValue([]);
    useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
  });

  it('Movements lists recurring payments above the transactions with account, amount and next due date', async () => {
    const now = new Date();
    const inDays = (days: number) => toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
    const fmt = (day: string) =>
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(dayToDate(day));
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([tx(1, 'income', 10000, 'Pay')]);
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(1, 'Rent', 120000, {
        interval: 2,
        unit: 'week',
        startDate: inDays(3),
        endDate: inDays(100),
      }),
      payment(2, 'Gym', 4500, { active: false, startDate: inDays(5) }),
      payment(3, 'Phone', 1000, { startDate: inDays(1) }),
    ]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.recurring.sectionTitle)).toBeTruthy();
    // Phone is due tomorrow, Rent in 3 days, Gym is inactive: two cards, the
    // soonest on top with its account, amount and due date.
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('$10.00')).toBeTruthy();
    expect(screen.getByText(`Savings · Due ${fmt(inDays(1))}`)).toBeTruthy();
    expect(screen.getByLabelText(`Phone, $10.00, Savings, Due ${fmt(inDays(1))}`)).toBeTruthy();
    expect(screen.queryByText('Gym')).toBeNull();
    expect(screen.getByLabelText('2 payments due soon')).toBeTruthy();
    // The transactions are still there, and the stack comes first.
    expect(screen.getByText('Pay')).toBeTruthy();
    const order = screen.getAllByText(/^(Recurring payments|Today)$/).map((node) => node.props.children);
    expect(order).toEqual([en.recurring.sectionTitle, en.transactions.today]);
  });

  it('Movements shows "Not set" for a payment without an account, in the default currency', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(2, 'Loose', 4500, { accountId: null, startDate: toDay(new Date()) }),
    ]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText('Loose')).toBeTruthy();
    // The default currency is MXN here.
    expect(screen.getByText(`${en.recurring.noAccount} · ${en.recurring.card.dueToday}`)).toBeTruthy();
    expect(screen.getByText(/^MX\$45\.00$/)).toBeTruthy();
  });

  it('Movements formats a payment without an account in a JPY default currency', async () => {
    (getDefaultCurrency as jest.Mock).mockResolvedValueOnce('JPY');
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(2, 'Loose', 150000, { accountId: null, startDate: toDay(new Date()) }),
    ]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText('Loose')).toBeTruthy();
    expect(screen.getByText('¥1,500')).toBeTruthy();
  });

  it('Movements opens the Recurring payments screen from See all', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listRecurring as jest.Mock).mockResolvedValue([payment(3, 'Rent', 120000)]);
    await renderWithProviders(<MovementsScreen />);
    fireEvent.press(await screen.findByText(en.recurring.card.seeAll));
    expect(mockPush).toHaveBeenCalledWith('/recurring');
  });

  it('Movements hides the recurring section when there are none, and keeps the empty state', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.movements.emptyTitle)).toBeTruthy();
    expect(screen.queryByText(en.recurring.sectionTitle)).toBeNull();
  });

  it('Movements shows only the recurring section, without the empty state, when it has payments but no transactions', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listRecurring as jest.Mock).mockResolvedValue([payment(3, 'Rent', 120000)]);
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.queryByText(en.movements.emptyTitle)).toBeNull();
  });

  it('Movements shows an error with retry when the recurring payments fail to load', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<MovementsScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] list failed:', expect.any(Error));
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.movements.emptyTitle)).toBeTruthy();
  });

  it('the FAB recurring action opens the new recurring form', async () => {
    await renderWithProviders(<MovementsScreen />);
    fireEvent.press(await screen.findByLabelText(en.fab.open));
    await screen.findByLabelText(en.fab.addRecurring);
    fireEvent.press(screen.getByText(en.fab.addRecurring, { includeHiddenElements: true }));
    expect(mockPush).toHaveBeenCalledWith('/recurring/new');
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

  it('Home shows the recurring stack between the account cards and the latest transactions', async () => {
    const soon = toDay(new Date(Date.now() + 2 * 86_400_000));
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    (listTransactions as jest.Mock).mockResolvedValue([tx(1, 'income', 10000, 'Pay')]);
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(1, 'Rent', 120000, { startDate: soon }),
    ]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('Rent')).toBeTruthy();
    // One card: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
    const order = screen
      .getAllByText(/^(Savings|Recurring payments|Latest transactions)$/)
      .map((node) => node.props.children);
    // The account card first, then the stack (header, its card), then the latest.
    expect(order[0]).toBe('Savings');
    expect(order.indexOf(en.recurring.sectionTitle)).toBeGreaterThan(0);
    expect(order.indexOf(en.recurring.sectionTitle)).toBeLessThan(
      order.indexOf(en.transactions.latest),
    );
    expect(screen.getByText('Pay')).toBeTruthy();
  });

  it('Home hides the stack when there are no recurring payments', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(en.transactions.latestEmpty)).toBeTruthy();
    expect(screen.queryByText(en.recurring.sectionTitle)).toBeNull();
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
    // The balance, and its end-of-month line (equal with nothing due).
    expect(screen.getByText('End of month: $0.00')).toBeTruthy();
    expect(within(screen.getByTestId('account-card-7')).getByText('$0.00')).toBeTruthy();
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

describe('spending caps on Home and Settings', () => {
  const mxn = { ...account, id: 8, name: 'Cash', currency: 'MXN' as const };
  const expense = (id: number, accountId: number, amountCents: number, date = new Date()) => ({
    ...tx(id, 'expense', amountCents, null, date.toISOString()),
    accountId,
  });
  const capRow = (id: number, accountId: number | null, period: 'day' | 'week' | 'month', amountCents: number) => ({
    id,
    accountId,
    period,
    amountCents,
  });
  const loadHome = async (
    accounts: unknown[],
    transactions: unknown[],
    caps: unknown[],
  ) => {
    (listAccounts as jest.Mock).mockResolvedValue(accounts);
    (listTransactions as jest.Mock).mockResolvedValue(transactions);
    (listCaps as jest.Mock).mockResolvedValue(caps);
    // The dialog the banner opens is mounted once at the root in the app.
    await renderWithProviders(
      <>
        <HomeScreen />
        <CapsDialogHost />
      </>,
    );
    // Everything the banner reads is in, so "no banner" below is a real result.
    await waitFor(() => {
      expect(useCapsStore.getState().status).toBe('ready');
      expect(useAccountsStore.getState().status).toBe('ready');
      expect(useTransactionsStore.getState().status).toBe('ready');
    });
    await act(async () => {});
  };

  beforeEach(() => {
    mockFocused = true;
    mockPush.mockClear();
    (listAccounts as jest.Mock).mockResolvedValue([]);
    (listTransactions as jest.Mock).mockResolvedValue([]);
    (listRecurring as jest.Mock).mockResolvedValue([]);
    (listCaps as jest.Mock).mockReset().mockResolvedValue([]);
    (saveGlobalCap as jest.Mock).mockReset().mockResolvedValue(undefined);
    useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
    useDefaultCurrencyStore.setState({ value: null, saveError: false });
    useTransactionsStore.setState({ transactions: [], status: 'idle' });
    useRecurringStore.setState({ payments: [], status: 'idle' });
    useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
    useCapsDialogStore.setState({ open: false });
  });

  describe('Home banner', () => {
    const bannerButtons = () => screen.queryAllByLabelText(en.caps.bannerHint, { exact: false });
    const money = (cents: number, currency = 'MXN') => formatMoney(cents, currency);

    it('one exceeded cap: a single line with spent, cap and period, no "more" line, not dismissable', async () => {
      await loadHome([mxn], [expense(1, 8, 530000)], [capRow(1, null, 'week', 500000)]);
      expect(
        await screen.findByText(`Global cap: ${money(530000)} of ${money(500000)} this week`),
      ).toBeTruthy();
      expect(screen.queryByText(/more cap/)).toBeNull();
      expect(screen.queryByText(en.common.done)).toBeNull();
      // One banner, a button with a label covering the summary and a hint.
      const button = screen.getByRole('button', { name: /^Global cap: / });
      expect(button.props.accessibilityHint).toBe(en.caps.bannerHint);
    });

    it('one exceeded cap still opens the list dialog, with the amount over', async () => {
      await loadHome([mxn], [expense(1, 8, 530000)], [capRow(1, null, 'week', 500000)]);
      fireEvent.press(await screen.findByRole('button', { name: /^Global cap: / }));
      expect(await screen.findByText(en.caps.listTitle)).toBeTruthy();
      expect(
        screen.getByText(
          `${money(530000)} of ${money(500000)} this week · over by ${money(30000)}`,
        ),
      ).toBeTruthy();
    });

    it('two exceeded: the global cap is the headline, plus "and 1 more cap exceeded", in one banner', async () => {
      await loadHome(
        [account, mxn],
        [expense(1, 7, 120000), expense(2, 8, 530000)],
        [capRow(1, 7, 'day', 100000), capRow(2, null, 'week', 500000)],
      );
      expect(
        await screen.findByText(`Global cap: ${money(530000)} of ${money(500000)} this week`),
      ).toBeTruthy();
      expect(screen.getByText('and 1 more cap exceeded')).toBeTruthy();
      // The account line is only in the dialog, not in the banner.
      expect(screen.queryByText(/^Savings: /)).toBeNull();
      expect(screen.getAllByRole('button', { name: /^Global cap: / })).toHaveLength(1);
    });

    describe('four exceeded caps', () => {
      // No global cap, so the headline is the one furthest over by percentage:
      // Savings 120%, Cash 300%, Wallet 150%, Card 110%.
      const wallet = { ...mxn, id: 9, name: 'Wallet' };
      const card = { ...mxn, id: 10, name: 'Card' };
      const rows = () =>
        loadHome(
          [account, mxn, wallet, card],
          [
            expense(1, 7, 120000),
            expense(2, 8, 300000),
            expense(3, 9, 150000),
            expense(4, 10, 110000),
          ],
          [
            capRow(1, 7, 'day', 100000),
            capRow(2, 8, 'day', 100000),
            capRow(3, 9, 'day', 100000),
            capRow(4, 10, 'day', 100000),
          ],
        );

      it('shows the furthest-over cap and "and 3 more caps exceeded" in a single banner', async () => {
        await rows();
        expect(
          await screen.findByText(`Cash: ${money(300000)} of ${money(100000)} today`),
        ).toBeTruthy();
        expect(screen.getByText('and 3 more caps exceeded')).toBeTruthy();
        expect(screen.queryByText(/^Wallet: /)).toBeNull();
        expect(screen.getAllByRole('button', { name: /^Cash: / })).toHaveLength(1);
      });

      it('the dialog lists every cap with its amount over; an account row opens that account', async () => {
        await rows();
        fireEvent.press(await screen.findByRole('button', { name: /^Cash: / }));
        expect(await screen.findByText(en.caps.listTitle)).toBeTruthy();
        const label = (name: string, spent: number, over: number) =>
          `${name}, ${money(spent)} of ${money(100000)} today, over by ${money(over)}`;
        expect(screen.getByLabelText(label('Cash', 300000, 200000))).toBeTruthy();
        expect(screen.getByLabelText(label('Wallet', 150000, 50000))).toBeTruthy();
        expect(screen.getByLabelText(label('Card', 110000, 10000))).toBeTruthy();
        expect(
          screen.getByLabelText(`Savings, ${money(120000, 'USD')} of ${money(100000, 'USD')} today, over by ${money(20000, 'USD')}`),
        ).toBeTruthy();

        fireEvent.press(screen.getByLabelText(label('Wallet', 150000, 50000)));
        expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: 9 } });
        await waitFor(() => expect(screen.queryByText(en.caps.listTitle)).toBeNull());
      });

      it('Done closes the dialog without navigating', async () => {
        await rows();
        fireEvent.press(await screen.findByRole('button', { name: /^Cash: / }));
        fireEvent.press(await screen.findByText(en.common.done));
        await waitFor(() => expect(screen.queryByText(en.caps.listTitle)).toBeNull());
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    it('the global row in the dialog opens the Settings tab', async () => {
      await loadHome(
        [account, mxn],
        [expense(1, 7, 120000), expense(2, 8, 530000)],
        [capRow(1, 7, 'day', 100000), capRow(2, null, 'week', 500000)],
      );
      fireEvent.press(await screen.findByRole('button', { name: /^Global cap: / }));
      await screen.findByText(en.caps.listTitle);
      fireEvent.press(
        screen.getByLabelText(
          `Global cap, ${money(530000)} of ${money(500000)} this week, over by ${money(30000)}`,
        ),
      );
      expect(mockPush).toHaveBeenCalledWith('/settings');
    });

    it('the list closes when nothing is exceeded and does not reopen by itself when a cap is exceeded again', async () => {
      await loadHome([mxn], [expense(1, 8, 600000)], [capRow(1, null, 'month', 500000)]);
      fireEvent.press(await screen.findByRole('button', { name: /^Global cap: / }));
      expect(await screen.findByText(en.caps.listTitle)).toBeTruthy();

      await act(async () => {
        useCapsStore.setState({ caps: [capRow(1, null, 'month', 700000)] });
      });
      expect(screen.queryByText(en.caps.listTitle)).toBeNull();
      expect(bannerButtons()).toHaveLength(0);

      await act(async () => {
        useCapsStore.setState({ caps: [capRow(1, null, 'month', 500000)] });
      });
      // The banner is back, but the dialog stays closed until tapped.
      const button = await screen.findByRole('button', { name: /^Global cap: / });
      expect(screen.queryByText(en.caps.listTitle)).toBeNull();
      fireEvent.press(button);
      expect(await screen.findByText(en.caps.listTitle)).toBeTruthy();
    });

    it('is not shown with zero exceeded caps', async () => {
      await loadHome([mxn], [expense(1, 8, 100)], [capRow(1, null, 'week', 500000)]);
      await screen.findAllByText('Cash');
      expect(bannerButtons()).toHaveLength(0);
    });

    it('shows nothing when the total is equal to the cap, and appears one cent over', async () => {
      await loadHome([mxn], [expense(1, 8, 500000)], [capRow(1, null, 'month', 500000)]);
      await screen.findAllByText('Cash');
      expect(screen.queryByText(/Global cap:/)).toBeNull();
      await act(async () => {
        useTransactionsStore.setState({
          transactions: [expense(1, 8, 500000), expense(2, 8, 1)],
        });
      });
      expect(
        await screen.findByText(
          `Global cap: ${formatMoney(500001, 'MXN')} of ${formatMoney(500000, 'MXN')} this month`,
        ),
      ).toBeTruthy();
    });

    it('goes away when the expense is deleted, the cap is raised or the cap is removed', async () => {
      await loadHome([mxn], [expense(1, 8, 600000)], [capRow(1, null, 'month', 500000)]);
      expect(await screen.findByText(/Global cap:/)).toBeTruthy();

      await act(async () => {
        useCapsStore.setState({ caps: [capRow(1, null, 'month', 700000)] });
      });
      expect(screen.queryByText(/Global cap:/)).toBeNull();

      await act(async () => {
        useCapsStore.setState({ caps: [capRow(1, null, 'month', 500000)] });
      });
      expect(await screen.findByText(/Global cap:/)).toBeTruthy();

      await act(async () => {
        useCapsStore.setState({ caps: [] });
      });
      expect(screen.queryByText(/Global cap:/)).toBeNull();

      await act(async () => {
        useCapsStore.setState({ caps: [capRow(1, null, 'month', 500000)] });
      });
      expect(await screen.findByText(/Global cap:/)).toBeTruthy();
      await act(async () => {
        useTransactionsStore.setState({ transactions: [] });
      });
      expect(screen.queryByText(/Global cap:/)).toBeNull();
    });

    it('the global cap leaves out accounts that opted out and accounts in another currency', async () => {
      await loadHome(
        [{ ...mxn, inGlobalCap: false }, account, { ...mxn, id: 9, name: 'Wallet' }],
        [expense(1, 8, 900000), expense(2, 7, 900000), expense(3, 9, 400000)],
        [capRow(1, null, 'month', 500000)],
      );
      await screen.findAllByText('Wallet');
      expect(screen.queryByText(/Global cap:/)).toBeNull();
    });

    it('income never offsets, and an expense in an earlier period does not count', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1, 1);
      await loadHome(
        [mxn],
        [
          expense(1, 8, 400000),
          { ...tx(2, 'income', 900000, null), accountId: 8 },
          expense(3, 8, 900000, lastMonth),
        ],
        [capRow(1, null, 'month', 500000)],
      );
      await screen.findAllByText('Cash');
      expect(screen.queryByText(/Global cap:/)).toBeNull();
    });

    it('goes away when the local day changes under a daily cap', async () => {
      await loadHome([mxn], [expense(1, 8, 600000)], [capRow(1, 8, 'day', 500000)]);
      expect(await screen.findByText(/Cash: /)).toBeTruthy();
      await act(async () => {
        jest.setSystemTime(Date.now() + 36 * 3600 * 1000);
        jest.advanceTimersByTime(36 * 3600 * 1000);
      });
      expect(screen.queryByText(/Cash: /)).toBeNull();
    });

    it('stays hidden while the caps failed to load, and appears when Home regains focus and the reload works', async () => {
      (listAccounts as jest.Mock).mockResolvedValue([mxn]);
      (listTransactions as jest.Mock).mockResolvedValue([expense(1, 8, 600000)]);
      (listCaps as jest.Mock).mockRejectedValueOnce(new Error('db'));
      const { rerender } = await renderWithProviders(<HomeScreen />);
      await waitFor(() => expect(useCapsStore.getState().status).toBe('error'));
      await screen.findAllByText('Cash');
      expect(screen.queryByText(/Global cap:/)).toBeNull();
      expect(listCaps).toHaveBeenCalledTimes(1);

      // Losing focus does not retry; regaining it does.
      (listCaps as jest.Mock).mockResolvedValue([capRow(1, null, 'month', 500000)]);
      mockFocused = false;
      rerender(<HomeScreen />);
      await act(async () => {});
      expect(listCaps).toHaveBeenCalledTimes(1);
      mockFocused = true;
      rerender(<HomeScreen />);
      expect(await screen.findByText(/Global cap:/)).toBeTruthy();
      expect(listCaps).toHaveBeenCalledTimes(2);
    });

    it('a failed refresh hides the banner while the caps are in error', async () => {
      await loadHome([mxn], [expense(1, 8, 600000)], [capRow(1, null, 'month', 500000)]);
      expect(await screen.findByText(/Global cap:/)).toBeTruthy();
      (listCaps as jest.Mock).mockRejectedValueOnce(new Error('db'));
      await act(async () => {
        await useCapsStore.getState().refresh();
      });
      expect(useCapsStore.getState().status).toBe('error');
      expect(screen.queryByText(/Global cap:/)).toBeNull();
    });

    it('is in Spanish too', async () => {
      await i18n.changeLanguage('es');
      try {
        await loadHome([mxn], [expense(1, 8, 600000)], [capRow(1, null, 'day', 500000)]);
        expect(
          await screen.findByText(
            `Límite global: ${formatMoney(600000, 'MXN')} de ${formatMoney(500000, 'MXN')} hoy`,
          ),
        ).toBeTruthy();
      } finally {
        await i18n.changeLanguage('en');
      }
    });
  });

  describe('Settings global cap', () => {
    const amountField = () => screen.findByLabelText(en.caps.amountLabel);

    it('is empty with the monthly period when there is no cap', async () => {
      await renderWithProviders(<SettingsScreen />);
      expect(await screen.findByText(en.settings.globalCap)).toBeTruthy();
      expect((await amountField()).props.value).toBe('');
      expect(screen.getByText('MXN')).toBeTruthy();
      expect(
        screen.getByText(en.settings.globalCapHint.replace('{{currency}}', 'MXN')),
      ).toBeTruthy();
    });

    it('shows the stored cap in the default currency', async () => {
      (listCaps as jest.Mock).mockResolvedValue([capRow(1, null, 'week', 520050)]);
      await renderWithProviders(<SettingsScreen />);
      expect((await amountField()).props.value).toBe('5200.50');
    });

    it('shows its error with Retry when the caps fail to load, and Retry shows the stored cap and period', async () => {
      (listCaps as jest.Mock).mockRejectedValueOnce(new Error('db'));
      await renderWithProviders(<SettingsScreen />);
      expect(await screen.findByText(en.common.loadError)).toBeTruthy();
      expect(screen.queryByLabelText(en.caps.amountLabel)).toBeNull();

      (listCaps as jest.Mock).mockResolvedValue([capRow(1, null, 'week', 520050)]);
      fireEvent.press(screen.getByText(en.common.retry));

      expect((await amountField()).props.value).toBe('5200.50');
      expect(screen.queryByText(en.common.loadError)).toBeNull();
      const state = (label: string) =>
        screen.getByRole('button', { name: label }).props.accessibilityState;
      expect(state(en.caps.periodWeek)).toMatchObject({ checked: true });
      expect(state(en.caps.periodMonth)).toMatchObject({ checked: false });
    });

    it('saves the typed amount and period, then shows what is stored', async () => {
      await renderWithProviders(<SettingsScreen />);
      fireEvent.changeText(await amountField(), '5000');
      fireEvent.press(screen.getByText(en.caps.periodWeek));
      (listCaps as jest.Mock).mockResolvedValue([capRow(1, null, 'week', 500000)]);
      fireEvent.press(screen.getByText(en.settings.globalCapSave));
      await waitFor(() =>
        expect(saveGlobalCap).toHaveBeenCalledWith({ amount: '5000', period: 'week' }, 'MXN'),
      );
      await waitFor(() => expect(screen.getByLabelText(en.caps.amountLabel).props.value).toBe('5000.00'));
    });

    it('clearing the amount saves an empty cap, which removes it', async () => {
      (listCaps as jest.Mock).mockResolvedValue([capRow(1, null, 'day', 1000)]);
      await renderWithProviders(<SettingsScreen />);
      fireEvent.changeText(await amountField(), '');
      (listCaps as jest.Mock).mockResolvedValue([]);
      fireEvent.press(screen.getByText(en.settings.globalCapSave));
      await waitFor(() =>
        expect(saveGlobalCap).toHaveBeenCalledWith({ amount: '', period: 'day' }, 'MXN'),
      );
      await waitFor(() => expect(useCapsStore.getState().caps).toEqual([]));
    });

    it('an invalid amount shows an error and saves nothing', async () => {
      await renderWithProviders(<SettingsScreen />);
      fireEvent.changeText(await amountField(), '-5');
      fireEvent.press(screen.getByText(en.settings.globalCapSave));
      expect(await screen.findByText(en.caps.errors.capNotPositive)).toBeTruthy();
      expect(saveGlobalCap).not.toHaveBeenCalled();
    });

    it('a failed save shows an error and keeps what was typed', async () => {
      (saveGlobalCap as jest.Mock).mockRejectedValue(new Error('db'));
      await renderWithProviders(<SettingsScreen />);
      fireEvent.changeText(await amountField(), '100');
      fireEvent.press(screen.getByText(en.settings.globalCapSave));
      expect(await screen.findByText(en.settings.globalCapSaveError)).toBeTruthy();
      expect(screen.getByLabelText(en.caps.amountLabel).props.value).toBe('100');
    });
  });
});
