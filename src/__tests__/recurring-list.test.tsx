import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import RecurringListScreen from '@/app/recurring/index';
import { en } from '@/i18n/en';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { dayToDate, listRecurring, toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();
const consoleError = silenceConsoleError();

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/services/accounts', () => ({
  listAccounts: jest.fn(),
  getDefaultCurrency: jest.fn(),
  FALLBACK_CURRENCY: 'MXN',
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
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

const inDays = (days: number) => {
  const now = new Date();
  return toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
};
const fmt = (day: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(dayToDate(day));

beforeEach(() => {
  jest.clearAllMocks();
  (listAccounts as jest.Mock).mockResolvedValue([account]);
  (getDefaultCurrency as jest.Mock).mockResolvedValue('MXN');
  (listRecurring as jest.Mock).mockResolvedValue([]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useRecurringStore.setState({ payments: [], status: 'idle' });
});

describe('Recurring payments screen', () => {
  it('lists every payment, soonest first, with account, schedule, next date and end date', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(1, 'Rent', 120000, {
        interval: 2,
        unit: 'week',
        startDate: inDays(3),
        endDate: inDays(100),
      }),
      payment(2, 'Gym', 4500, { active: false, startDate: inDays(5) }),
      payment(3, 'Phone', 1000, { startDate: inDays(1) }),
      // Far in the future: not on any card, but on this list.
      payment(4, 'Insurance', 9900, { startDate: inDays(60) }),
    ]);
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.getByText('$1,200.00')).toBeTruthy();
    expect(screen.getByText('$45.00')).toBeTruthy();
    expect(
      screen.getByText(`Savings\nEvery 2 weeks · next ${fmt(inDays(3))}\nEnds ${fmt(inDays(100))}`),
    ).toBeTruthy();
    expect(screen.getByText(`Savings\nEvery month · next ${fmt(inDays(1))}`)).toBeTruthy();
    expect(screen.getByText('Savings\nEvery month · Inactive')).toBeTruthy();
    const names = screen
      .getAllByText(/^(Rent|Gym|Phone|Insurance)$/)
      .map((node) => node.props.children);
    expect(names).toEqual(['Phone', 'Rent', 'Insurance', 'Gym']);
    // The screen title says what it is: no extra section header.
    expect(screen.queryByText(en.recurring.sectionTitle)).toBeNull();
  });

  it('shows "Not set" for a payment without an account, in the default currency', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(1, 'Linked', 120000),
      payment(2, 'Loose', 4500, { accountId: null }),
    ]);
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText('Loose')).toBeTruthy();
    expect(screen.getByText(/^Not set Every month/)).toBeTruthy();
    expect(screen.getByText(/^Savings Every month/)).toBeTruthy();
    expect(screen.getByText('$1,200.00')).toBeTruthy();
    expect(screen.getByText(/^MX\$45\.00$/)).toBeTruthy();
  });

  it('formats a payment without an account in a JPY default currency', async () => {
    (getDefaultCurrency as jest.Mock).mockResolvedValue('JPY');
    (listRecurring as jest.Mock).mockResolvedValue([
      payment(2, 'Loose', 150000, { accountId: null }),
    ]);
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText('¥1,500')).toBeTruthy();
  });

  it('opens the edit form when a row is tapped', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([payment(3, 'Rent', 120000)]);
    await renderWithProviders(<RecurringListScreen />);
    fireEvent.press(await screen.findByText('Rent'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 3 } });
  });

  it('shows an empty state that offers to add one', async () => {
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText(en.recurring.listEmptyTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.recurring.listEmptyAction));
    expect(mockPush).toHaveBeenCalledWith('/recurring/new');
  });

  it('shows an error with retry', async () => {
    (listRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] list failed:', expect.any(Error));
    (listRecurring as jest.Mock).mockResolvedValue([payment(1, 'Rent', 100)]);
    fireEvent.press(screen.getByText(en.common.retry));
    await waitFor(() => expect(screen.getByText('Rent')).toBeTruthy());
  });
});
