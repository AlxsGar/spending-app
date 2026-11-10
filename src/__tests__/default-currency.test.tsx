import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import NewAccountScreen from '@/app/account/new';
import RecurringListScreen from '@/app/recurring/index';
import { DefaultCurrencySetting } from '@/components/default-currency-setting';
import { GlobalCapSetting } from '@/components/global-cap-setting';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { listAccounts } from '@/services/accounts';
import { getSetting, setSetting } from '@/services/db';
import { formatMoney } from '@/services/money';
import { listRecurring } from '@/services/recurring';
import { requestReminderSync } from '@/services/reminders';
import type { RecurringPayment } from '@/services/recurring';
import { listCaps } from '@/services/soft-caps';
import { listTransactions } from '@/services/transactions';
import type { Transaction } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { beginCapWatch, finishCapWatch } from '@/stores/cap-crossing';
import { useCapSnackbarStore } from '@/stores/cap-snackbar-store';
import { useCapsStore } from '@/stores/caps-store';
import {
  rememberedDefaultCurrency,
  useDefaultCurrencyStore,
} from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
}));
jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  listTransactions: jest.fn(),
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
}));
jest.mock('@/services/soft-caps', () => ({
  ...jest.requireActual('@/services/soft-caps'),
  listCaps: jest.fn(),
}));
// An in-memory settings table, so the real accounts service reads and writes it.
jest.mock('@/services/db', () => ({ getSetting: jest.fn(), setSetting: jest.fn(), initDb: jest.fn() }));

let settings: Record<string, string> = {};

const account = (id: number, name: string, currency: 'USD' | 'MXN' | 'EUR') => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null as string | null,
});
const mxn = account(1, 'Cash', 'MXN');
const usd = account(2, 'Savings', 'USD');

const payment = (id: number, accountId: number | null, amountCents = 150000): RecurringPayment => ({
  id,
  accountId,
  name: `Payment ${id}`,
  amountCents,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-11-20',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const expense = (id: number, accountId: number, amountCents: number): Transaction => ({
  id,
  accountId,
  kind: 'expense',
  amountCents,
  date: new Date(2026, 10, 10, 9).toISOString(),
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: new Date(2026, 10, 10, 9).toISOString(),
});

const globalCap = { id: 1, accountId: null, period: 'month' as const, amountCents: 50000 };

// A projection figure below zero: the app writes it with a true minus sign.
const neg = (cents: number, currency: string) => `−${formatMoney(cents, currency)}`;

const change = (to: 'USD' | 'MXN' | 'EUR') =>
  act(async () => {
    await useDefaultCurrencyStore.getState().set(to);
  });

// Opens the currency picker in the Settings row and picks an option.
const pickCurrency = async (code: string) => {
  fireEvent.press(screen.getByLabelText(new RegExp(`^${en.settings.defaultCurrency}, `)));
  await act(async () => {});
  fireEvent.press(screen.getByText(code));
  await act(async () => {});
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.setSystemTime(new Date(2026, 10, 10, 12));
  await i18n.changeLanguage('en');
  settings = {};
  (getSetting as jest.Mock).mockImplementation(async (key: string) => settings[key] ?? null);
  (setSetting as jest.Mock).mockImplementation(async (key: string, value: string) => {
    settings[key] = value;
  });
  (listAccounts as jest.Mock).mockResolvedValue([mxn, usd]);
  (listTransactions as jest.Mock).mockResolvedValue([]);
  (listRecurring as jest.Mock).mockResolvedValue([]);
  (listCaps as jest.Mock).mockResolvedValue([]);
  useDefaultCurrencyStore.setState({ value: null, saveError: false, loading: false });
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
  useCapSnackbarStore.setState({ pending: null, current: null });
});

describe('default currency store', () => {
  it('loads the stored value once, falls back to MXN, and a set persists and survives a reload', async () => {
    await useDefaultCurrencyStore.getState().load();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');

    expect(await useDefaultCurrencyStore.getState().set('EUR')).toBe(true);
    expect(settings.default_currency).toBe('EUR');
    expect(useDefaultCurrencyStore.getState().value).toBe('EUR');

    // A fresh start reads what was saved.
    useDefaultCurrencyStore.setState({ value: null });
    await useDefaultCurrencyStore.getState().load();
    expect(useDefaultCurrencyStore.getState().value).toBe('EUR');
  });

  it('a failed save keeps the old value and sets the error; a later success clears it', async () => {
    settings.default_currency = 'USD';
    await useDefaultCurrencyStore.getState().load();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (setSetting as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    expect(await useDefaultCurrencyStore.getState().set('EUR')).toBe(false);
    expect(useDefaultCurrencyStore.getState().value).toBe('USD');
    expect(useDefaultCurrencyStore.getState().saveError).toBe(true);
    expect(settings.default_currency).toBe('USD');

    expect(await useDefaultCurrencyStore.getState().set('EUR')).toBe(true);
    expect(useDefaultCurrencyStore.getState().saveError).toBe(false);
    jest.restoreAllMocks();
  });

  it('a save that finishes while the first read is running is not overwritten by the read', async () => {
    let release: (value: string | null) => void = () => {};
    (getSetting as jest.Mock).mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (release = resolve)),
    );
    const reading = useDefaultCurrencyStore.getState().load();
    expect(useDefaultCurrencyStore.getState().loading).toBe(true);
    await useDefaultCurrencyStore.getState().set('EUR');
    release(null);
    await reading;
    expect(useDefaultCurrencyStore.getState().value).toBe('EUR');
    expect(useDefaultCurrencyStore.getState().loading).toBe(false);
  });

  it('a failed first read falls back to MXN', async () => {
    (getSetting as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await useDefaultCurrencyStore.getState().load();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');
  });

  it('the value outside components follows the store at once', async () => {
    await change('EUR');
    expect(rememberedDefaultCurrency()).toBe('EUR');
  });
});

describe('Settings default currency row', () => {
  it('applies directly when there is no global cap and no unassigned recurring payment', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([payment(1, 1)]);
    await renderWithProviders(<DefaultCurrencySetting />);
    expect(await screen.findByText(en.settings.defaultCurrency)).toBeTruthy();
    await pickCurrency('EUR');
    expect(screen.queryByText(en.settings.defaultCurrencyChangeTitle)).toBeNull();
    await waitFor(() => expect(settings.default_currency).toBe('EUR'));
    expect(useDefaultCurrencyStore.getState().value).toBe('EUR');
  });

  it.each([
    ['cap and payments', [globalCap], [payment(1, null), payment(2, null), payment(3, null)], 'Your global cap and 3 recurring payments with no account will switch to USD. Amounts aren\'t converted.'],
    ['cap and one payment', [globalCap], [payment(1, null)], 'Your global cap and 1 recurring payment with no account will switch to USD. Amounts aren\'t converted.'],
    ['cap only', [globalCap], [payment(1, 1)], 'Your global cap will switch to USD. Amounts aren\'t converted.'],
    ['payments only', [], [payment(1, null), payment(2, null)], '2 recurring payments with no account will switch to USD. Amounts aren\'t converted.'],
    ['one payment only', [], [payment(1, null)], '1 recurring payment with no account will switch to USD. Amounts aren\'t converted.'],
  ])('asks first (%s) in English', async (_name, caps, payments, message) => {
    (listCaps as jest.Mock).mockResolvedValue(caps);
    (listRecurring as jest.Mock).mockResolvedValue(payments);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    expect(await screen.findByText(message)).toBeTruthy();
    // Nothing saved yet.
    expect(settings.default_currency).toBeUndefined();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');
  });

  it.each([
    [[globalCap], [payment(1, null), payment(2, null), payment(3, null)], 'Tu límite global y 3 pagos recurrentes sin cuenta pasarán a USD. No se convierten los montos.'],
    [[globalCap], [payment(1, null)], 'Tu límite global y 1 pago recurrente sin cuenta pasarán a USD. No se convierten los montos.'],
    [[globalCap], [], 'Tu límite global pasará a USD. No se convierten los montos.'],
    [[], [payment(1, null)], '1 pago recurrente sin cuenta pasará a USD. No se convierten los montos.'],
    [[], [payment(1, null), payment(2, null)], '2 pagos recurrentes sin cuenta pasarán a USD. No se convierten los montos.'],
  ])('asks first in Spanish', async (caps, payments, message) => {
    await i18n.changeLanguage('es');
    (listCaps as jest.Mock).mockResolvedValue(caps);
    (listRecurring as jest.Mock).mockResolvedValue(payments);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(es.settings.defaultCurrency);
    fireEvent.press(screen.getByLabelText(new RegExp(`^${es.settings.defaultCurrency}, `)));
    await act(async () => {});
    fireEvent.press(screen.getByText('USD'));
    await act(async () => {});
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText(es.settings.defaultCurrencyChangeTitle)).toBeTruthy();
  });

  it('Confirm saves the new currency', async () => {
    (listCaps as jest.Mock).mockResolvedValue([globalCap]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    fireEvent.press(await screen.findByText(en.settings.defaultCurrencyChangeConfirm));
    await waitFor(() => expect(settings.default_currency).toBe('USD'));
    expect(useDefaultCurrencyStore.getState().value).toBe('USD');
    // The cap amount is not converted: nothing wrote the cap.
    expect(setSetting).toHaveBeenCalledTimes(1);
  });

  it('Cancel keeps the old currency and saves nothing', async () => {
    (listCaps as jest.Mock).mockResolvedValue([globalCap]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    fireEvent.press(await screen.findByText(en.common.cancel));
    await waitFor(() =>
      expect(screen.queryByText(en.settings.defaultCurrencyChangeTitle)).toBeNull(),
    );
    expect(setSetting).not.toHaveBeenCalled();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');
    expect(screen.getByDisplayValue('MXN', { includeHiddenElements: true })).toBeTruthy();
  });

  it('a failed save shows the row error and keeps the old value', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (setSetting as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('EUR');
    expect(await screen.findByText(en.settings.defaultCurrencySaveError)).toBeTruthy();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');
    jest.restoreAllMocks();
  });

  it('the picker is announced as "Default currency, <value>", not the account form label', async () => {
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    expect(screen.getByLabelText(`${en.settings.defaultCurrency}, MXN`)).toBeTruthy();
    expect(screen.queryByLabelText(`${en.accounts.currencyLabel}, MXN`)).toBeNull();
  });

  it('inactive unassigned payments count; finished ones do not', async () => {
    const finished = {
      ...payment(2, null),
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      lastConfirmedAt: '2026-01-01',
    };
    (listRecurring as jest.Mock).mockResolvedValue([
      { ...payment(1, null), active: false },
      finished,
    ]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    expect(
      await screen.findByText(
        "1 recurring payment with no account will switch to USD. Amounts aren't converted.",
      ),
    ).toBeTruthy();
  });

  it('with only finished unassigned payments the change applies directly', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      {
        ...payment(2, null),
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        lastConfirmedAt: '2026-01-01',
      },
    ]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    await waitFor(() => expect(settings.default_currency).toBe('USD'));
    expect(screen.queryByText(en.settings.defaultCurrencyChangeTitle)).toBeNull();
  });

  it.each([
    ['caps', () => (listCaps as jest.Mock).mockRejectedValue(new Error('db'))],
    ['recurring payments', () => (listRecurring as jest.Mock).mockRejectedValue(new Error('db'))],
  ])('when the %s cannot be read it says so and changes nothing', async (_name, fail) => {
    // The stores log a failed read; this test expects it.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fail();
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    expect(await screen.findByText(en.settings.defaultCurrencyCheckError)).toBeTruthy();
    expect(screen.queryByText(en.settings.defaultCurrencySaveError)).toBeNull();
    expect(setSetting).not.toHaveBeenCalled();
    expect(useDefaultCurrencyStore.getState().value).toBe('MXN');
  });

  it('every row string exists in both languages', () => {
    expect(Object.keys(en.settings).filter((key) => key.startsWith('defaultCurrency')).sort()).toEqual(
      Object.keys(es.settings).filter((key) => key.startsWith('defaultCurrency')).sort(),
    );
  });
});

describe('reminder sync after a change', () => {
  it('is requested once after a successful change', async () => {
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('EUR');
    await waitFor(() => expect(settings.default_currency).toBe('EUR'));
    expect(requestReminderSync).toHaveBeenCalledTimes(1);
  });

  it('is requested once after a confirmed change', async () => {
    (listCaps as jest.Mock).mockResolvedValue([globalCap]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    expect(requestReminderSync).not.toHaveBeenCalled();
    fireEvent.press(await screen.findByText(en.settings.defaultCurrencyChangeConfirm));
    await waitFor(() => expect(settings.default_currency).toBe('USD'));
    expect(requestReminderSync).toHaveBeenCalledTimes(1);
  });

  it('is not requested after a failed save', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (setSetting as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    expect(await useDefaultCurrencyStore.getState().set('EUR')).toBe(false);
    expect(requestReminderSync).not.toHaveBeenCalled();
  });

  it('is not requested when the dialog is cancelled', async () => {
    (listCaps as jest.Mock).mockResolvedValue([globalCap]);
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('USD');
    fireEvent.press(await screen.findByText(en.common.cancel));
    await waitFor(() =>
      expect(screen.queryByText(en.settings.defaultCurrencyChangeTitle)).toBeNull(),
    );
    expect(requestReminderSync).not.toHaveBeenCalled();
  });

  it('is not requested when the same currency is picked', async () => {
    await renderWithProviders(<DefaultCurrencySetting />);
    await screen.findByText(en.settings.defaultCurrency);
    await pickCurrency('MXN');
    expect(requestReminderSync).not.toHaveBeenCalled();
    // Nor by the store itself: nothing is saved or synced for the same value.
    expect(await useDefaultCurrencyStore.getState().set('MXN')).toBe(true);
    expect(setSetting).not.toHaveBeenCalled();
    expect(requestReminderSync).not.toHaveBeenCalled();
  });
});

describe('consumers follow a change without a remount', () => {
  it('the global cap row (hint and amount currency)', async () => {
    await renderWithProviders(<GlobalCapSetting />);
    expect(
      await screen.findByText(en.settings.globalCapHint.replace('{{currency}}', 'MXN')),
    ).toBeTruthy();
    await change('USD');
    expect(
      screen.getByText(en.settings.globalCapHint.replace('{{currency}}', 'USD')),
    ).toBeTruthy();
  });

  it('the account form switch and its reason', async () => {
    settings.default_currency = 'MXN';
    await renderWithProviders(<NewAccountScreen />);
    // The form starts in MXN, the default: the switch is enabled.
    const toggle = await screen.findByLabelText(en.caps.countsTowardGlobal);
    expect(toggle.props.accessibilityState?.disabled).toBeFalsy();
    expect(screen.queryByText(en.caps.globalCurrencyReason.replace('{{currency}}', 'USD'))).toBeNull();
    await change('USD');
    expect(
      screen.getByText(en.caps.globalCurrencyReason.replace('{{currency}}', 'USD')),
    ).toBeTruthy();
    expect(screen.getByLabelText(en.caps.countsTowardGlobal).props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it('a recurring payment with no account displays in the new currency', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([payment(1, null, 150000)]);
    await renderWithProviders(<RecurringListScreen />);
    expect(await screen.findByText(formatMoney(150000, 'MXN'))).toBeTruthy();
    await change('JPY' as never);
    expect(screen.getByText(formatMoney(150000, 'JPY'))).toBeTruthy();
    expect(screen.queryByText(formatMoney(150000, 'MXN'))).toBeNull();
  });

  it('Home: projection lines and their order, chart chip, and the cap banner', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([mxn, usd]);
    (listRecurring as jest.Mock).mockResolvedValue([payment(1, null, 5000)]);
    (listCaps as jest.Mock).mockResolvedValue([globalCap]);
    (listTransactions as jest.Mock).mockResolvedValue([
      expense(1, 1, 60000),
      expense(2, 2, 1000),
    ]);
    await renderWithProviders(<HomeScreen />);
    await screen.findByTestId('projection-summary');

    const lines = () =>
      screen
        .getAllByLabelText(/^End of month, /)
        .map((node) => (node.props.accessibilityLabel as string).slice(14, 17));
    expect(lines()).toEqual(['MXN', 'USD']);
    // The unassigned payment counts in the default currency.
    expect(screen.getByLabelText(`End of month, MXN: ${neg(65000, 'MXN')}`)).toBeTruthy();
    expect(screen.getByLabelText('MXN').props.accessibilityState.selected).toBe(true);
    // MXN spending is over the MXN-denominated global cap.
    expect(screen.getByText(/^Global cap: /)).toBeTruthy();

    await change('USD');
    expect(lines()).toEqual(['USD', 'MXN']);
    expect(screen.getByLabelText(`End of month, USD: ${neg(6000, 'USD')}`)).toBeTruthy();
    expect(screen.getByLabelText(`End of month, MXN: ${neg(60000, 'MXN')}`)).toBeTruthy();
    expect(screen.getByLabelText('USD').props.accessibilityState.selected).toBe(true);
    // The cap now counts the USD accounts only, which are under it.
    expect(screen.queryByText(/^Global cap: /)).toBeNull();
  });

  it('Home chart: a chip picked by hand stays selected after the default changes', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([
      expense(1, 1, 1000),
      expense(2, 2, 1000),
    ]);
    await renderWithProviders(<HomeScreen />);
    await screen.findByTestId('projection-summary');
    expect(screen.getByLabelText('MXN').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText('USD'));
    expect(screen.getByLabelText('USD').props.accessibilityState.selected).toBe(true);
    await change('MXN');
    await change('EUR');
    expect(screen.getByLabelText('USD').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('MXN').props.accessibilityState.selected).toBe(false);
  });
});

describe('cap-crossing snackbar check', () => {
  it('uses the new currency right after a change', async () => {
    await change('USD');
    useAccountsStore.setState({ accounts: [mxn, usd], status: 'ready' });
    useCapsStore.setState({ caps: [{ ...globalCap, period: 'day', amountCents: 10000 }], status: 'ready' });
    useTransactionsStore.setState({ transactions: [], status: 'ready' });

    // An MXN expense does not count toward a USD global cap.
    let watch = beginCapWatch();
    useTransactionsStore.setState({ transactions: [expense(1, 1, 20000)] });
    finishCapWatch(watch);
    expect(useCapSnackbarStore.getState().pending).toBeNull();

    // After switching to MXN the same kind of save crosses the cap.
    await change('MXN');
    useTransactionsStore.setState({ transactions: [], status: 'ready' });
    watch = beginCapWatch();
    useTransactionsStore.setState({ transactions: [expense(2, 1, 20000)] });
    finishCapWatch(watch);
    expect(useCapSnackbarStore.getState().pending).not.toBeNull();
  });
});
