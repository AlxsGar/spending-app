import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import RecurringListScreen from '@/app/recurring/index';
import { en } from '@/i18n/en';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { dayToDate, listRecurring, occurrenceAt, toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { AlreadyHandledError, skipOccurrence } from '@/services/recurring-actions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useSuccessStore } from '@/stores/success-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { colors } from '@/theme';

fakeAnimationTimers();
const consoleError = silenceConsoleError();

const mockPush = jest.fn();
// The params a tapped reminder opens the screen with (see "tapped reminder").
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
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
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  skipOccurrence: jest.fn(),
}));
// The real icon needs the font; a stub exposes the name and color it was given.
jest.mock('@/components/ui/AppIcon', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    AppIcon: ({ name, color }: { name: string; color: string }) => (
      <Text>{`${name}|${color}`}</Text>
    ),
  };
});

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
  useDefaultCurrencyStore.setState({ value: null, saveError: false });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useSuccessStore.setState({ current: null });
  mockParams = {};
});

describe('tapped reminder', () => {
  const tapped = async (
    payments: RecurringPayment[],
    params: Record<string, string>,
  ) => {
    (listRecurring as jest.Mock).mockResolvedValue(payments);
    mockParams = params;
    await renderWithProviders(<RecurringListScreen />);
    // The dialog, when it opens, repeats the name.
    await screen.findAllByText('Rent');
  };

  it('opens the actions dialog of the tapped payment (Pay, Skip, Edit)', async () => {
    const day = inDays(2);
    await tapped(
      [payment(1, 'Rent', 100, { startDate: day }), payment(2, 'Gym', 100, { startDate: day })],
      { open: '1', occ: day, n: '1' },
    );
    expect(await screen.findByText(`Pay ${fmt(day)}`)).toBeTruthy();
    expect(screen.getByText(`Skip ${fmt(day)}`)).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    // Only one dialog, for the tapped payment.
    expect(screen.getAllByText(`Pay ${fmt(day)}`)).toHaveLength(1);
  });

  it('opens once: closing it does not bring it back', async () => {
    const day = inDays(2);
    await tapped([payment(1, 'Rent', 100, { startDate: day })], { open: '1', occ: day, n: '1' });
    await screen.findByText(`Pay ${fmt(day)}`);
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(`Pay ${fmt(day)}`)).toBeNull());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(`Pay ${fmt(day)}`)).toBeNull();
  });

  it('only shows the list when the payment no longer exists', async () => {
    const day = inDays(2);
    await tapped([payment(1, 'Rent', 100, { startDate: day })], { open: '99', occ: day, n: '1' });
    expect(screen.queryByText(`Pay ${fmt(day)}`)).toBeNull();
  });

  it('only shows the list when the payment is inactive', async () => {
    const day = inDays(2);
    await tapped([payment(1, 'Rent', 100, { startDate: day, active: false })], {
      open: '1',
      occ: day,
      n: '1',
    });
    expect(screen.queryByText(`Pay ${fmt(day)}`)).toBeNull();
  });

  it('only shows the list when the occurrence was already handled', async () => {
    const day = inDays(2);
    // Paid already: the next occurrence is a month on, and the tapped one is handled.
    await tapped([payment(1, 'Rent', 100, { startDate: day, lastConfirmedAt: day })], {
      open: '1',
      occ: day,
      n: '1',
    });
    expect(screen.queryByText(/^Pay /)).toBeNull();
  });

  it('shows no dialog without a tap (no params)', async () => {
    const day = inDays(2);
    await tapped([payment(1, 'Rent', 100, { startDate: day })], {});
    expect(screen.queryByText(`Pay ${fmt(day)}`)).toBeNull();
  });
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
    expect(screen.getAllByText('Savings')).toHaveLength(4);
    expect(screen.getByText(`Every 2 weeks · next ${fmt(inDays(3))}`)).toBeTruthy();
    expect(screen.getByText(`Ends ${fmt(inDays(100))}`)).toBeTruthy();
    expect(screen.getByText(`Every month · next ${fmt(inDays(1))}`)).toBeTruthy();
    expect(screen.getByText('Every month · Inactive')).toBeTruthy();
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
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
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

  describe('row states', () => {
    it('an overdue row says so in alert with the alert icon; a due-today row says "Due today"; others are plain', async () => {
      (listRecurring as jest.Mock).mockResolvedValue([
        payment(1, 'Late', 100, { startDate: inDays(-3), unit: 'week', interval: 2 }),
        payment(2, 'Now', 100, { startDate: inDays(0) }),
        payment(3, 'Soon', 100, { startDate: inDays(4) }),
      ]);
      await renderWithProviders(<RecurringListScreen />);
      await screen.findByText('Late');
      const overdue = screen.getByText(`Overdue · ${fmt(inDays(-3))}`);
      expect(StyleSheet.flatten(overdue.props.style).color).toBe(colors.alert);
      const dueToday = screen.getByText(en.recurring.card.dueToday);
      // accentSecondary, never accent (reserved for income and positive balances).
      expect(StyleSheet.flatten(dueToday.props.style).color).toBe(colors.accentSecondary);
      expect(screen.getByText(`Every month · next ${fmt(inDays(4))}`)).toBeTruthy();
      // The overdue row carries the icon as well as the color; only that row.
      expect(screen.getAllByText('alert-circle-outline|alert')).toHaveLength(1);
    });

    it('a finished row says Finished, is greyed, listed last and has only Edit in its menu', async () => {
      (listRecurring as jest.Mock).mockResolvedValue([
        payment(1, 'Done', 100, {
          startDate: inDays(-40),
          endDate: inDays(-10),
          lastConfirmedAt: inDays(-10),
        }),
        payment(2, 'Soon', 100, { startDate: inDays(30) }),
      ]);
      await renderWithProviders(<RecurringListScreen />);
      await screen.findByText('Done');
      const names = screen.getAllByText(/^(Done|Soon)$/).map((node) => node.props.children);
      expect(names).toEqual(['Soon', 'Done']);
      const finished = screen.getByText('Every month · Finished');
      expect(finished).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByText('Done').props.style).color).toBe(
        colors.textSecondary,
      );
      expect(StyleSheet.flatten(screen.getByText('Soon').props.style).color).toBe(colors.text);
      fireEvent.press(screen.getByLabelText(`Actions for Done`));
      expect(await screen.findByText(en.recurring.menu.edit)).toBeTruthy();
      expect(screen.queryByText(/^Pay /)).toBeNull();
      expect(screen.queryByText(/^Skip /)).toBeNull();
    });

    it('an inactive row has only Edit in its menu', async () => {
      (listRecurring as jest.Mock).mockResolvedValue([payment(1, 'Off', 100, { active: false })]);
      await renderWithProviders(<RecurringListScreen />);
      await screen.findByText('Off');
      fireEvent.press(screen.getByLabelText('Actions for Off'));
      expect(await screen.findByText(en.recurring.menu.edit)).toBeTruthy();
      expect(screen.queryByText(/^Pay /)).toBeNull();
    });
  });

  describe('row menu', () => {
    const open = async (extra: Partial<RecurringPayment> = {}) => {
      (listRecurring as jest.Mock).mockResolvedValue([payment(3, 'Rent', 120000, extra)]);
      await renderWithProviders(<RecurringListScreen />);
      await screen.findByText('Rent');
      fireEvent.press(screen.getByLabelText('Actions for Rent'));
    };

    it('names the occurrence in Pay and Skip: the current one, else the next', async () => {
      await open({ startDate: inDays(-3) });
      expect(await screen.findByText(`Pay ${fmt(inDays(-3))}`)).toBeTruthy();
      expect(screen.getByText(`Skip ${fmt(inDays(-3))}`)).toBeTruthy();
    });

    it('titles the dialog with the payment and says when it is due', async () => {
      await open({ startDate: inDays(-3) });
      // The row has the date line; the dialog adds a second one and the name.
      await waitFor(() =>
        expect(screen.getAllByText(`Overdue · ${fmt(inDays(-3))}`)).toHaveLength(2),
      );
      expect(screen.getAllByText('Rent')).toHaveLength(2);
    });

    it('Cancel closes the dialog and does nothing else', async () => {
      await open({ startDate: inDays(-3) });
      await screen.findByText(`Pay ${fmt(inDays(-3))}`);
      fireEvent.press(screen.getByText(en.common.cancel));
      await waitFor(() => expect(screen.queryByText(`Pay ${fmt(inDays(-3))}`)).toBeNull());
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('names the next occurrence when none is due yet', async () => {
      await open({ startDate: inDays(12) });
      expect(await screen.findByText(`Pay ${fmt(inDays(12))}`)).toBeTruthy();
    });

    it('Pay opens the Pay now screen', async () => {
      await open({ startDate: inDays(-3) });
      fireEvent.press(await screen.findByText(`Pay ${fmt(inDays(-3))}`));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/recurring/[id]/pay', params: { id: 3 } });
    });

    it('a double tap on Pay pushes the Pay now screen once, and a reopened dialog works again', async () => {
      await open({ startDate: inDays(-3) });
      const pay = await screen.findByText(`Pay ${fmt(inDays(-3))}`);
      fireEvent.press(pay);
      fireEvent.press(pay);
      expect(mockPush).toHaveBeenCalledTimes(1);
      fireEvent.press(screen.getByLabelText('Actions for Rent'));
      fireEvent.press(await screen.findByText(`Pay ${fmt(inDays(-3))}`));
      expect(mockPush).toHaveBeenCalledTimes(2);
    });

    it('Edit opens the edit form', async () => {
      await open();
      fireEvent.press(await screen.findByText(en.recurring.menu.edit));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 3 } });
    });

    it('Skip asks first; Cancel skips nothing', async () => {
      await open({ startDate: inDays(-3) });
      fireEvent.press(await screen.findByText(`Skip ${fmt(inDays(-3))}`));
      // Right after the press (no waiting): the confirmation is there and the
      // actions dialog is not.
      expect(screen.getByText(`Skip ${fmt(inDays(-3))}?`)).toBeTruthy();
      expect(screen.getByText(/Rent as handled/)).toBeTruthy();
      // Two dialogs are never on screen together: the actions dialog is gone
      // (no fade-out) by the time the confirmation exists, with no waiting.
      expect(screen.queryByText(`Skip ${fmt(inDays(-3))}`)).toBeNull();
      expect(screen.queryByText(en.recurring.menu.edit)).toBeNull();
      expect(skipOccurrence).not.toHaveBeenCalled();
      fireEvent.press(screen.getByText(en.common.cancel));
      expect(skipOccurrence).not.toHaveBeenCalled();
      expect(useSuccessStore.getState().current).toBeNull();
    });

    it('Skip confirmed marks the occurrence handled, moves the row on and shows the card', async () => {
      const occurrence = inDays(-3);
      (skipOccurrence as jest.Mock).mockResolvedValue({
        ...payment(3, 'Rent', 120000, { startDate: occurrence }),
        lastConfirmedAt: occurrence,
      });
      await open({ startDate: occurrence });
      fireEvent.press(await screen.findByText(`Skip ${fmt(occurrence)}`));
      await screen.findByText(`Skip ${fmt(occurrence)}?`);
      fireEvent.press(screen.getByText(en.recurring.skip.confirm));
      // A second tap before the dialog closes is ignored.
      fireEvent.press(screen.getByText(en.recurring.skip.confirm));
      await waitFor(() => expect(skipOccurrence).toHaveBeenCalledTimes(1));
      expect(skipOccurrence).toHaveBeenCalledWith(3, occurrence);
      await waitFor(() =>
        expect(useSuccessStore.getState().current).toMatchObject({
          icon: 'check',
          tone: 'neutral',
          message: en.recurring.skip.done,
          detail: 'Rent',
        }),
      );
      const following = occurrenceAt(
        { interval: 1, unit: 'month', startDate: occurrence, endDate: null },
        1,
      )!;
      expect(await screen.findByText(`Every month · next ${fmt(following)}`)).toBeTruthy();
      expect(screen.queryByText(en.recurring.skip.confirm)).toBeNull();
    });

    it('a stale Skip closes without the success card', async () => {
      const occurrence = inDays(-3);
      (skipOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(3, occurrence));
      await open({ startDate: occurrence });
      fireEvent.press(await screen.findByText(`Skip ${fmt(occurrence)}`));
      await screen.findByText(`Skip ${fmt(occurrence)}?`);
      fireEvent.press(screen.getByText(en.recurring.skip.confirm));
      await waitFor(() => expect(screen.queryByText(en.recurring.skip.confirm)).toBeNull());
      expect(useSuccessStore.getState().current).toBeNull();
    });

    it('a failed Skip keeps the dialog with an error and can be retried', async () => {
      const occurrence = inDays(-3);
      (skipOccurrence as jest.Mock).mockRejectedValueOnce(new Error('db'));
      await open({ startDate: occurrence });
      fireEvent.press(await screen.findByText(`Skip ${fmt(occurrence)}`));
      await screen.findByText(`Skip ${fmt(occurrence)}?`);
      fireEvent.press(screen.getByText(en.recurring.skip.confirm));
      expect(await screen.findByText(en.recurring.skip.error)).toBeTruthy();
      expect(useSuccessStore.getState().current).toBeNull();
      expect(consoleError()).toHaveBeenCalledWith('[recurring] skip failed:', expect.any(Error));
    });
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
