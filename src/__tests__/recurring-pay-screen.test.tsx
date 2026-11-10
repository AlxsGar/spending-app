import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import EditRecurringScreen from '@/app/recurring/[id]';
import PayRecurringScreen from '@/app/recurring/[id]/pay';
import { en } from '@/i18n/en';
import { listAccounts } from '@/services/accounts';
import { getSetting } from '@/services/db';
import { formatLongDate } from '@/services/format-date';
import { actionOccurrence, dayToDate, listRecurring, toDay, updateRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { AlreadyHandledError, payOccurrence } from '@/services/recurring-actions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();
const consoleError = silenceConsoleError();

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string } = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
  updateRecurring: jest.fn(),
}));
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

const account = (id: number, name: string, currency: 'USD' | 'JPY') => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
});
const checking = account(1, 'Checking', 'USD');
const yen = account(2, 'Yen wallet', 'JPY');

const stored: RecurringPayment = {
  id: 5,
  accountId: 1,
  name: 'Rent',
  amountCents: 120050,
  note: 'monthly',
  interval: 1,
  unit: 'month',
  startDate: '2026-01-07',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const today = () => toDay(new Date());
const inDays = (days: number) => {
  const now = new Date();
  return toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
};
const longDate = (day: string) => formatLongDate(dayToDate(day), 'en');

const pickDay = (label: string, day: string) => {
  fireEvent.press(screen.getByLabelText(label));
  const calls = (DateTimePickerAndroid.open as jest.Mock).mock.calls;
  const options = calls[calls.length - 1][0];
  act(() => {
    options.onChange({ type: 'set' }, dayToDate(day));
  });
  return options;
};

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockParams = { id: '5' };
  (getSetting as jest.Mock).mockResolvedValue(null);
  (listAccounts as jest.Mock).mockResolvedValue([checking, yen]);
  (listRecurring as jest.Mock).mockResolvedValue([stored]);
  (updateRecurring as jest.Mock).mockImplementation(async (_id: number, input) => ({
    ...stored,
    name: input.name.trim(),
  }));
  (payOccurrence as jest.Mock).mockImplementation(
    async ({
      paymentId,
      occurrence,
      accountId,
      amountCents,
    }: {
      paymentId: number;
      occurrence: string;
      accountId: number;
      amountCents: number;
    }) => ({
      transaction: {
        id: 700,
        accountId,
        kind: 'expense' as const,
        amountCents,
        date: new Date().toISOString(),
        note: null,
        recurringId: paymentId,
        recurringOccurrence: occurrence,
        createdAt: new Date().toISOString(),
      },
      payment: { ...stored, id: paymentId, lastConfirmedAt: occurrence },
    }),
  );
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useDefaultCurrencyStore.setState({ value: null, saveError: false, loading: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useSuccessStore.setState({ current: null });
});

const save = () => fireEvent.press(screen.getByText(en.recurring.payNow.save));

describe('Pay now screen', () => {
  it('shows the name and the occurrence date, the amount, the payment account and today', async () => {
    await renderWithProviders(<PayRecurringScreen />);
    expect(await screen.findByText('Rent')).toBeTruthy();
    const occurrence = actionOccurrence(stored, today())!;
    expect(screen.getByText(`Due ${longDate(occurrence)}`)).toBeTruthy();
    expect(screen.getByDisplayValue('1200.50')).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.getByLabelText(`${en.recurring.accountLabel}, Checking`)).toBeTruthy();
    // The date is shown, not editable: no date field.
    expect(screen.getByText(en.transactions.today)).toBeTruthy();
    expect(screen.queryByLabelText(en.transactions.dateLabel)).toBeNull();
  });

  it('pays the current occurrence with the edited amount from the chosen account, then goes back with the card', async () => {
    await renderWithProviders(<PayRecurringScreen />);
    fireEvent.changeText(await screen.findByDisplayValue('1200.50'), '50,25');
    save();

    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    expect(payOccurrence).toHaveBeenCalledWith({
      paymentId: 5,
      occurrence: actionOccurrence(stored, today()),
      accountId: 1,
      amountCents: 5025,
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'arrow-down',
      tone: 'negative',
      message: en.recurring.pay.recorded,
      detail: 'Rent',
    });
    // The expense is in the transactions store; the stored payment is unchanged.
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
    const [payment] = useRecurringStore.getState().payments;
    expect(payment).toMatchObject({ amountCents: 120050, accountId: 1 });
    expect(payment.lastConfirmedAt).toBe(actionOccurrence(stored, today()));
  });

  it('acts on the next occurrence when the current one was already handled', async () => {
    const handled = actionOccurrence(stored, today())!;
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, lastConfirmedAt: handled }]);
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    save();
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    const next = (payOccurrence as jest.Mock).mock.calls[0][0].occurrence;
    expect(next > handled).toBe(true);
  });

  it('changing the account re-validates the amount with its currency, and pays from it', async () => {
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    fireEvent.press(screen.getByLabelText(`${en.recurring.accountLabel}, Checking`));
    fireEvent.press(await screen.findByText('Yen wallet'));
    expect(screen.getByText('JPY')).toBeTruthy();
    save();
    expect(await screen.findByText(en.recurring.errors.amountDecimalsNotAllowed)).toBeTruthy();
    expect(payOccurrence).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByDisplayValue('1200.50'), '500');
    save();
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    expect(payOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2, amountCents: 50000 }),
    );
  });

  it('shows the amount errors and does not pay', async () => {
    await renderWithProviders(<PayRecurringScreen />);
    fireEvent.changeText(await screen.findByDisplayValue('1200.50'), '');
    save();
    expect(await screen.findByText(en.recurring.errors.amountRequired)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '0');
    expect(await screen.findByText(en.recurring.errors.amountNotPositive)).toBeTruthy();
    expect(payOccurrence).not.toHaveBeenCalled();
  });

  it('a payment with no account starts with an empty picker and requires a choice', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, accountId: null }]);
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    // The default currency (MXN without a setting) reads the amount.
    expect(screen.getByText('MXN')).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`^${en.recurring.accountLabel},`))).toBeTruthy();
    save();
    expect(await screen.findByText(en.transactions.errors.accountRequired)).toBeTruthy();
    expect(payOccurrence).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText(new RegExp(`^${en.recurring.accountLabel},`)));
    fireEvent.press(await screen.findByText('Checking'));
    save();
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    expect(payOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 1, amountCents: 120050 }),
    );
  });

  it('after the default currency changes, a payment with no account is read and paid in the new currency', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, accountId: null }]);
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    expect(screen.getByText('MXN')).toBeTruthy();

    // Changed in Settings while this screen is open: JPY has no decimals.
    act(() => useDefaultCurrencyStore.setState({ value: 'JPY' }));
    expect(screen.getByText('JPY')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '525.5');
    save();
    expect(await screen.findByText(en.recurring.errors.amountDecimalsNotAllowed)).toBeTruthy();
    expect(payOccurrence).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '525');
    fireEvent.press(screen.getByLabelText(new RegExp(`^${en.recurring.accountLabel},`)));
    fireEvent.press(await screen.findByText('Yen wallet'));
    save();
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    expect(payOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2, amountCents: 52500 }),
    );
  });

  it('a double tap pays once', async () => {
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    save();
    save();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(payOccurrence).toHaveBeenCalledTimes(1);
  });

  it('an occurrence handled elsewhere goes back without the success card and refreshes the payment', async () => {
    (payOccurrence as jest.Mock).mockRejectedValue(
      new AlreadyHandledError(5, actionOccurrence(stored, today())!),
    );
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    save();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useSuccessStore.getState().current).toBeNull();
    expect(consoleError()).not.toHaveBeenCalled();
  });

  it('shows an error and stays when the payment fails, and can be retried', async () => {
    (payOccurrence as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<PayRecurringScreen />);
    await screen.findByText('Rent');
    save();
    expect(await screen.findByText(en.recurring.pay.error)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] pay failed:', expect.any(Error));
    save();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(payOccurrence).toHaveBeenCalledTimes(2);
  });

  it('with no accounts explains and offers Add account', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([]);
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, accountId: null }]);
    await renderWithProviders(<PayRecurringScreen />);
    expect(await screen.findByText(en.recurring.pay.noAccounts)).toBeTruthy();
    fireEvent.press(screen.getByText(en.transactions.noAccountsAction));
    expect(mockPush).toHaveBeenCalledWith('/account/new');
  });

  it('says so for a finished payment and for one that no longer exists', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      { ...stored, endDate: '2026-01-07', lastConfirmedAt: '2026-01-07' },
    ]);
    await renderWithProviders(<PayRecurringScreen />);
    expect(await screen.findByText(en.recurring.payNow.nothingToPay)).toBeTruthy();
  });

  it('says so when the payment no longer exists', async () => {
    mockParams = { id: '99' };
    await renderWithProviders(<PayRecurringScreen />);
    expect(await screen.findByText(en.recurring.notFound)).toBeTruthy();
  });
});

describe('edit screen after a payment was paid or skipped', () => {
  // Monthly from Jan 7; the occurrence two days ago was handled.
  const handled = inDays(-2);
  const paid: RecurringPayment = { ...stored, startDate: '2026-01-07', lastConfirmedAt: handled };

  beforeEach(() => {
    (listRecurring as jest.Mock).mockResolvedValue([paid]);
  });

  it('shows the last handled occurrence as the start date, with a hint', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    expect(screen.getByText(longDate(handled))).toBeTruthy();
    expect(screen.getByText(en.recurring.startDateHandledHint)).toBeTruthy();
  });

  it('saves with that date untouched and no error, although it is in the past', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    fireEvent.changeText(await screen.findByDisplayValue('Rent'), 'Flat');
    fireEvent.changeText(screen.getByLabelText(en.recurring.intervalLabel), '3');
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0][1]).toMatchObject({
      name: 'Flat',
      interval: '3',
      startDate: handled,
    });
  });

  it('the picker starts today (the later of today and the day after the handled one)', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    const options = pickDay(en.recurring.startDateLabel, inDays(5));
    expect(options.minimumDate).toEqual(dayToDate(today()));
  });

  it('a handled occurrence in the future moves the minimum to the day after it', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...paid, lastConfirmedAt: inDays(6) }]);
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    const options = pickDay(en.recurring.startDateLabel, inDays(8));
    expect(options.minimumDate).toEqual(dayToDate(inDays(7)));
  });

  it('a start date on or before the handled one is an inline error and nothing is saved', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...paid, lastConfirmedAt: inDays(6) }]);
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    pickDay(en.recurring.startDateLabel, inDays(5));
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.startDateNotAfterHandled)).toBeTruthy();
    expect(updateRecurring).not.toHaveBeenCalled();
  });

  it('an end date before the shown start date is an inline error', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    pickDay(en.recurring.endDateLabel, inDays(-10));
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.endBeforeStart)).toBeTruthy();
    expect(updateRecurring).not.toHaveBeenCalled();
  });

  it('a never-paid payment shows its stored start date, without the hint', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([stored]);
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    expect(screen.getByText(longDate('2026-01-07'))).toBeTruthy();
    expect(screen.queryByText(en.recurring.startDateHandledHint)).toBeNull();
  });
});
