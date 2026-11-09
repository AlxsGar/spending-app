import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import EditRecurringScreen from '@/app/recurring/[id]';
import NewRecurringScreen from '@/app/recurring/new';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { listAccounts } from '@/services/accounts';
import { getSetting } from '@/services/db';
import { formatLongDate } from '@/services/format-date';
import {
  createRecurring,
  dayToDate,
  toDay,
  listRecurring,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { payOccurrence } from '@/services/recurring-actions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { useSuccessStore } from '@/stores/success-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();
// Failed saves and deletes are logged as "[recurring] <action> failed:".
const consoleError = silenceConsoleError();

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string; accountId?: string } = {};

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
  createRecurring: jest.fn(),
  listRecurring: jest.fn(),
  updateRecurring: jest.fn(),
  removeRecurring: jest.fn(),
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

const make = (id: number, name: string, currency: 'USD' | 'JPY') => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
});

const checking = make(1, 'Checking', 'USD');
const yen = make(2, 'Yen wallet', 'JPY');

const stored: RecurringPayment = {
  id: 5,
  accountId: 1,
  name: 'Rent',
  amountCents: 120050,
  note: 'monthly',
  interval: 2,
  unit: 'week',
  // In the past: an unchanged past start date must stay valid on edit.
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

// Opens a date field's Android dialog and picks a day in it.
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
  mockParams = {};
  (getSetting as jest.Mock).mockResolvedValue(null);
  (listAccounts as jest.Mock).mockResolvedValue([checking, yen]);
  (listRecurring as jest.Mock).mockResolvedValue([stored]);
  (createRecurring as jest.Mock).mockResolvedValue({ ...stored, id: 6, name: 'Gym' });
  (updateRecurring as jest.Mock).mockImplementation(async (_id: number, input) => ({
    ...stored,
    name: input.name.trim(),
  }));
  (removeRecurring as jest.Mock).mockResolvedValue(undefined);
  (payOccurrence as jest.Mock).mockImplementation(
    async ({ paymentId, occurrence, accountId }: { paymentId: number; occurrence: string; accountId: number }) => ({
      transaction: {
        id: 700,
        accountId,
        kind: 'expense' as const,
        amountCents: 100,
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
  useSuccessStore.setState({ current: null });
});

describe('new recurring payment screen', () => {
  it('opens with no account ("Not set"), every 1 month from today, no end, Active on, and saves', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    expect(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    ).toBeTruthy();
    // The default currency (MXN without a setting) is shown for the amount.
    expect(screen.getByText('MXN')).toBeTruthy();
    expect(screen.getByLabelText(en.recurring.intervalLabel).props.value).toBe('1');
    expect(screen.getByLabelText(`${en.recurring.unitLabel}, month`)).toBeTruthy();
    expect(screen.getByText(en.transactions.today)).toBeTruthy();
    expect(screen.getByText(en.recurring.noEndDate)).toBeTruthy();
    expect(screen.getByRole('switch', { name: en.recurring.activeLabel }).props.accessibilityState)
      .toMatchObject({ checked: true });

    fireEvent.changeText(screen.getByLabelText(en.recurring.nameLabel), '  Gym ');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '45,50');
    fireEvent.changeText(screen.getByLabelText(en.recurring.intervalLabel), '2');
    fireEvent.press(screen.getByLabelText(`${en.recurring.unitLabel}, months`));
    fireEvent.press(await screen.findByText('weeks'));
    fireEvent.changeText(screen.getByLabelText(en.recurring.noteLabel), 'Annual deal');
    fireEvent.press(screen.getByText(en.recurring.save));

    await waitFor(() => expect(createRecurring).toHaveBeenCalledTimes(1));
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toEqual({
      accountId: null,
      name: '  Gym ',
      amount: '45,50',
      interval: '2',
      unit: 'week',
      startDate: today(),
      endDate: null,
      note: 'Annual deal',
      active: true,
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([6]);
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'check',
      tone: 'neutral',
      message: en.recurring.created,
      detail: 'Gym',
    });
  });

  it('shows the Spanish success message', async () => {
    await i18n.changeLanguage('es');
    try {
      await renderWithProviders(<NewRecurringScreen />);
      fireEvent.changeText(await screen.findByLabelText(es.recurring.nameLabel), 'Gym');
      fireEvent.changeText(screen.getByLabelText(es.recurring.amountLabel), '10');
      fireEvent.press(screen.getByText(es.recurring.save));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      expect(useSuccessStore.getState().current?.message).toBe('Pago recurrente creado');
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('can save it as inactive', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.press(screen.getByRole('switch', { name: en.recurring.activeLabel }));
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toMatchObject({ active: false });
  });

  it('lists "Not set" first in the account picker, then the accounts', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.press(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    );
    expect(await screen.findByText('Checking')).toBeTruthy();
    expect(screen.getByText('Yen wallet')).toBeTruthy();
    const labels = screen
      .getAllByText(/^(Not set|Checking|Yen wallet)$/)
      .map((node) => node.props.children);
    // The first is the field's own value, the dialog list follows in order.
    expect(labels.slice(-3)).toEqual(['Not set', 'Checking', 'Yen wallet']);
  });

  it('shows "Sin definir" in Spanish', async () => {
    await i18n.changeLanguage('es');
    try {
      await renderWithProviders(<NewRecurringScreen />);
      expect(
        await screen.findByLabelText(`${es.recurring.accountLabel}, Sin definir`),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('changes the currency when the account changes, and back to the default for "Not set"', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.press(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    );
    fireEvent.press(await screen.findByText('Checking'));
    expect(await screen.findByText('USD')).toBeTruthy();
    expect(screen.queryByText('MXN')).toBeNull();

    fireEvent.press(screen.getByLabelText(`${en.recurring.accountLabel}, Checking`));
    fireEvent.press(await screen.findByText('Yen wallet'));
    expect(await screen.findByText('JPY')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(`${en.recurring.accountLabel}, Yen wallet`));
    const options = await screen.findAllByText(en.recurring.noAccount);
    fireEvent.press(options[options.length - 1]);
    expect(await screen.findByText('MXN')).toBeTruthy();
  });

  it('re-validates the amount against the new currency when the account changes', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10.5');
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalledTimes(1));
    jest.clearAllMocks();

    // Back on the form after a failed save: switch to the JPY account.
    (createRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    fireEvent.press(
      screen.getByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    );
    fireEvent.press(await screen.findByText('Yen wallet'));
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.amountDecimalsNotAllowed)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it('works with no accounts at all: "Not set" and the default currency', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([]);
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    expect(screen.getByText('MXN')).toBeTruthy();
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toMatchObject({ accountId: null });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a JPY default currency applies to a payment with no account', async () => {
    (getSetting as jest.Mock).mockResolvedValue('JPY');
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    expect(screen.getByText('JPY')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10.5');
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.amountDecimalsNotAllowed)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it('shows the validation errors and does not save', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    await screen.findByLabelText(en.recurring.nameLabel);
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.nameRequired)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText(en.recurring.nameLabel), 'Gym');
    expect(await screen.findByText(en.recurring.errors.amountRequired)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '1.234');
    expect(await screen.findByText(en.recurring.errors.amountTooManyDecimals)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '0');
    expect(await screen.findByText(en.recurring.errors.amountNotPositive)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it.each([
    ['0', 'intervalOutOfRange'],
    ['366', 'intervalOutOfRange'],
    ['1.5', 'intervalInvalid'],
    ['', 'intervalRequired'],
  ] as const)('interval %j shows an inline error and does not save', async (typed, code) => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.changeText(screen.getByLabelText(en.recurring.intervalLabel), typed);
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors[code])).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it.each(['1', '365'])('interval %s is accepted', async (typed) => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.changeText(screen.getByLabelText(en.recurring.intervalLabel), typed);
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
  });

  it('uses numeric input for the interval, and unit labels follow its plural', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    const interval = await screen.findByLabelText(en.recurring.intervalLabel);
    expect(interval.props.keyboardType).toBe('number-pad');
    expect(screen.getByLabelText(`${en.recurring.unitLabel}, month`)).toBeTruthy();
    fireEvent.changeText(interval, '3');
    expect(screen.getByLabelText(`${en.recurring.unitLabel}, months`)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`${en.recurring.unitLabel}, months`));
    for (const label of ['days', 'weeks', 'months', 'years']) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
  });

  it('shows the unit in Spanish with its plural', async () => {
    await i18n.changeLanguage('es');
    try {
      await renderWithProviders(<NewRecurringScreen />);
      const interval = await screen.findByLabelText(es.recurring.intervalLabel);
      expect(screen.getByLabelText(`${es.recurring.unitLabel}, mes`)).toBeTruthy();
      fireEvent.changeText(interval, '2');
      expect(screen.getByLabelText(`${es.recurring.unitLabel}, meses`)).toBeTruthy();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('the start date picker allows today and later, not earlier', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    await screen.findByLabelText(en.recurring.nameLabel);
    fireEvent.press(screen.getByLabelText(en.recurring.startDateLabel));
    const options = (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
    expect(options.minimumDate).toEqual(dayToDate(today()));
    expect(options.maximumDate).toBeUndefined();
  });

  it('a start date picked in the future is sent, and shown', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    pickDay(en.recurring.startDateLabel, inDays(7));
    expect(await screen.findByText(longDate(inDays(7)))).toBeTruthy();
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toMatchObject({ startDate: inDays(7) });
  });

  it('an end date can be set, cleared and is sent', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    expect(screen.queryByText(en.recurring.clearEndDate)).toBeNull();
    const options = pickDay(en.recurring.endDateLabel, inDays(90));
    // The end date can not be before the start date.
    expect(options.minimumDate).toEqual(dayToDate(today()));
    expect(await screen.findByText(longDate(inDays(90)))).toBeTruthy();

    fireEvent.press(screen.getByText(en.recurring.clearEndDate));
    expect(await screen.findByText(en.recurring.noEndDate)).toBeTruthy();

    pickDay(en.recurring.endDateLabel, inDays(60));
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toMatchObject({ endDate: inDays(60) });
  });

  it('an end date before the start date is an inline error', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    pickDay(en.recurring.startDateLabel, inDays(10));
    pickDay(en.recurring.endDateLabel, inDays(5));
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.endBeforeStart)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it('warns, without blocking, when the end date is before the second occurrence', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    expect(screen.queryByText(en.recurring.onceOnly)).toBeNull();

    // Every month: an end date a week out is before the second occurrence.
    pickDay(en.recurring.endDateLabel, inDays(7));
    expect(await screen.findByText(en.recurring.onceOnly)).toBeTruthy();

    // Every day: the second occurrence is tomorrow, so the warning goes away.
    fireEvent.press(screen.getByLabelText(`${en.recurring.unitLabel}, month`));
    fireEvent.press(await screen.findByText('day'));
    await waitFor(() => expect(screen.queryByText(en.recurring.onceOnly)).toBeNull());

    // Back to monthly and save: allowed.
    fireEvent.press(screen.getByLabelText(`${en.recurring.unitLabel}, day`));
    fireEvent.press(await screen.findByText('month'));
    expect(await screen.findByText(en.recurring.onceOnly)).toBeTruthy();
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(createRecurring).toHaveBeenCalled());
  });

  it('applies the JPY no-decimals rule to a JPY account', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.press(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    );
    fireEvent.press(await screen.findByText('Yen wallet'));
    fireEvent.changeText(screen.getByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10.5');
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.amountDecimalsNotAllowed)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it('counts the name characters, caps it at 40, and caps the note at 140', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    const name = await screen.findByLabelText(en.recurring.nameLabel);
    expect(name.props.maxLength).toBe(40);
    expect(screen.getByLabelText(en.recurring.noteLabel).props.maxLength).toBe(140);
    expect(screen.getByText('0/40 characters')).toBeTruthy();
    fireEvent.changeText(name, 'Gym');
    expect(screen.getByText('3/40 characters')).toBeTruthy();
  });

  it('rejects a name of only spaces', async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), '    ');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.nameRequired)).toBeTruthy();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it('shows a save error, no success card, and stays on the form when saving fails', async () => {
    (createRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.saveError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] create failed:', expect.any(Error));
    expect(mockBack).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('shows a load error with retry', async () => {
    (listAccounts as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<NewRecurringScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByLabelText(en.recurring.nameLabel)).toBeTruthy();
  });
});

describe('paid-today prompt after creating a payment', () => {
  const startsToday = (extra: Partial<RecurringPayment> = {}) => ({
    ...stored,
    id: 6,
    name: 'Gym',
    startDate: today(),
    ...extra,
  });

  const fillAndSave = async () => {
    await renderWithProviders(<NewRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '10');
    fireEvent.press(screen.getByText(en.recurring.save));
  };

  it('asks "Has this been paid today?" instead of the created card, and does not leave yet', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday());
    await fillAndSave();
    expect(await screen.findByText(en.recurring.pay.todayTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.recurring.pay.todayYes })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.recurring.pay.todayLater })).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
    expect(payOccurrence).not.toHaveBeenCalled();
  });

  it('"No, later" only creates: the created card shows and nothing is paid', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday());
    await fillAndSave();
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayLater }));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useSuccessStore.getState().current).toMatchObject({
      message: en.recurring.created,
      detail: 'Gym',
    });
    expect(payOccurrence).not.toHaveBeenCalled();
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBeNull();
  });

  it('"Yes" pays today\'s occurrence from the payment\'s account and shows the payment card', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday({ accountId: 1 }));
    await fillAndSave();
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayYes }));
    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 6,
        occurrence: today(),
        accountId: 1,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useSuccessStore.getState().current).toMatchObject({
      message: en.recurring.pay.recorded,
      detail: 'Gym',
    });
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe(today());
  });

  it('"Yes" on a payment with no account asks which account to pay from', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday({ accountId: null }));
    await fillAndSave();
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayYes }));
    expect(await screen.findByText(en.recurring.pay.accountTitle)).toBeTruthy();
    expect(payOccurrence).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Yen wallet'));
    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 6,
        occurrence: today(),
        accountId: 2,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('cancelling the account choice leaves the payment created and unpaid', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday({ accountId: null }));
    await fillAndSave();
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayYes }));
    await screen.findByText(en.recurring.pay.accountTitle);
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useSuccessStore.getState().current).toMatchObject({ message: en.recurring.created });
    expect(payOccurrence).not.toHaveBeenCalled();
  });

  it('is in Spanish', async () => {
    await i18n.changeLanguage('es');
    try {
      (createRecurring as jest.Mock).mockResolvedValue(startsToday());
      await renderWithProviders(<NewRecurringScreen />);
      fireEvent.changeText(await screen.findByLabelText(es.recurring.nameLabel), 'Gym');
      fireEvent.changeText(screen.getByLabelText(es.recurring.amountLabel), '10');
      fireEvent.press(screen.getByText(es.recurring.save));
      expect(await screen.findByText('¿Ya se pagó hoy?')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sí' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'No, después' })).toBeTruthy();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('is not asked for a payment that starts on another day', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday({ startDate: inDays(1) }));
    await fillAndSave();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(en.recurring.pay.todayTitle)).toBeNull();
    expect(useSuccessStore.getState().current).toMatchObject({ message: en.recurring.created });
  });

  it('is not asked for an inactive payment', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(startsToday({ active: false }));
    await fillAndSave();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(en.recurring.pay.todayTitle)).toBeNull();
  });

  it('is never asked when editing, even if the start date is today', async () => {
    mockParams = { id: '5' };
    (updateRecurring as jest.Mock).mockResolvedValue({ ...stored, startDate: today() });
    await renderWithProviders(<EditRecurringScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Rent 2');
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(en.recurring.pay.todayTitle)).toBeNull();
    expect(useSuccessStore.getState().current).toMatchObject({ message: en.recurring.updated });
  });
});

describe('edit recurring payment screen', () => {
  beforeEach(() => {
    mockParams = { id: '5' };
  });

  it('opens prefilled with the payment values', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    expect(await screen.findByDisplayValue('Rent')).toBeTruthy();
    expect(screen.getByDisplayValue('1200.50')).toBeTruthy();
    expect(screen.getByDisplayValue('monthly')).toBeTruthy();
    expect(screen.getByLabelText(en.recurring.intervalLabel).props.value).toBe('2');
    expect(screen.getByLabelText(`${en.recurring.unitLabel}, weeks`)).toBeTruthy();
    expect(screen.getByText(longDate('2026-01-07'))).toBeTruthy();
    expect(screen.getByText(en.recurring.noEndDate)).toBeTruthy();
    expect(screen.getByLabelText(`${en.recurring.accountLabel}, Checking`)).toBeTruthy();
    expect(screen.getByRole('switch', { name: en.recurring.activeLabel }).props.accessibilityState)
      .toMatchObject({ checked: true });
  });

  it('shows an inactive payment with the switch off', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, active: false }]);
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    expect(screen.getByRole('switch', { name: en.recurring.activeLabel }).props.accessibilityState)
      .toMatchObject({ checked: false });
  });

  it('saves the changes, shows the updated card with the name and goes back', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    fireEvent.changeText(await screen.findByDisplayValue('Rent'), 'Flat rent');
    fireEvent.press(screen.getByRole('switch', { name: en.recurring.activeLabel }));
    fireEvent.press(screen.getByText(en.recurring.save));

    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0]).toEqual([
      5,
      {
        accountId: 1,
        name: 'Flat rent',
        amount: '1200.50',
        interval: '2',
        unit: 'week',
        // The unchanged past start date is kept and valid.
        startDate: '2026-01-07',
        endDate: null,
        note: 'monthly',
        active: false,
      },
    ]);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'check',
      tone: 'neutral',
      message: en.recurring.updated,
      detail: 'Flat rent',
    });
  });

  it('a changed start date in the past is an inline error and nothing is saved', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    const options = pickDay(en.recurring.startDateLabel, '2026-01-08');
    // The picker never offers a past day: its minimum is today, not the kept
    // original date. (Picking one anyway is still rejected on save.)
    expect(options.minimumDate).toEqual(dayToDate(today()));
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.errors.startDateInPast)).toBeTruthy();
    expect(updateRecurring).not.toHaveBeenCalled();
  });

  it('keeps showing and saving the original past start date while it is unchanged', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    expect(screen.getByText(longDate('2026-01-07'))).toBeTruthy();
    // Opening the picker and cancelling (no change event) leaves it alone.
    fireEvent.press(screen.getByLabelText(en.recurring.startDateLabel));
    expect(screen.getByText(longDate('2026-01-07'))).toBeTruthy();
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0][1]).toMatchObject({
      startDate: '2026-01-07',
    });
  });

  it('opens a payment without an account as "Not set", amount in the default currency', async () => {
    (getSetting as jest.Mock).mockResolvedValue('JPY');
    (listRecurring as jest.Mock).mockResolvedValue([
      { ...stored, accountId: null, amountCents: 150000 },
    ]);
    await renderWithProviders(<EditRecurringScreen />);
    expect(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    ).toBeTruthy();
    // 1500 yen, no decimals.
    expect(screen.getByDisplayValue('1500')).toBeTruthy();
    expect(screen.getByText('JPY')).toBeTruthy();
  });

  it('switches a payment from an account to "Not set" and back', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.press(screen.getByLabelText(`${en.recurring.accountLabel}, Checking`));
    const unset = await screen.findAllByText(en.recurring.noAccount);
    fireEvent.press(unset[unset.length - 1]);
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0][1]).toMatchObject({ accountId: null });
  });

  it('switches a payment with no account to an account', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([{ ...stored, accountId: null }]);
    await renderWithProviders(<EditRecurringScreen />);
    fireEvent.press(
      await screen.findByLabelText(`${en.recurring.accountLabel}, ${en.recurring.noAccount}`),
    );
    fireEvent.press(await screen.findByText('Checking'));
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0][1]).toMatchObject({ accountId: 1 });
  });

  it('changing interval, unit and start date sends the new schedule', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.changeText(screen.getByLabelText(en.recurring.intervalLabel), '1');
    fireEvent.press(screen.getByLabelText(`${en.recurring.unitLabel}, week`));
    fireEvent.press(await screen.findByText('year'));
    pickDay(en.recurring.startDateLabel, inDays(10));
    fireEvent.press(screen.getByText(en.recurring.save));
    await waitFor(() => expect(updateRecurring).toHaveBeenCalledTimes(1));
    expect((updateRecurring as jest.Mock).mock.calls[0][1]).toMatchObject({
      interval: '1',
      unit: 'year',
      startDate: inDays(10),
    });
  });

  it('shows no card and stays when the update fails', async () => {
    (updateRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.press(screen.getByText(en.recurring.save));
    expect(await screen.findByText(en.recurring.saveError)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('says so when the payment no longer exists', async () => {
    mockParams = { id: '99' };
    await renderWithProviders(<EditRecurringScreen />);
    expect(await screen.findByText(en.recurring.notFound)).toBeTruthy();
  });

  it('Cancel keeps the payment', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.press(screen.getByText(en.recurring.delete));
    expect(await screen.findByText(en.recurring.deleteTitle)).toBeTruthy();
    expect(screen.getByText(en.recurring.deleteMessage)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(en.recurring.deleteTitle)).toBeNull());
    expect(removeRecurring).not.toHaveBeenCalled();
    expect(useRecurringStore.getState().payments).toHaveLength(1);
  });

  it('Confirm deletes, goes back and shows no success card', async () => {
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.press(screen.getByText(en.recurring.delete));
    await screen.findByText(en.recurring.deleteTitle);
    const deletes = screen.getAllByText(en.recurring.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(removeRecurring).toHaveBeenCalledWith(5));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useRecurringStore.getState().payments).toHaveLength(0);
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('shows an inline error and stays when the delete fails', async () => {
    (removeRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<EditRecurringScreen />);
    await screen.findByDisplayValue('Rent');
    fireEvent.press(screen.getByText(en.recurring.delete));
    await screen.findByText(en.recurring.deleteTitle);
    const deletes = screen.getAllByText(en.recurring.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    expect(await screen.findByText(en.recurring.deleteError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] delete failed:', expect.any(Error));
    expect(mockBack).not.toHaveBeenCalled();
    expect(useRecurringStore.getState().payments).toHaveLength(1);
  });
});
