import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import NewTransactionScreen from '@/app/transaction/new';
import { en } from '@/i18n/en';
import { listAccounts } from '@/services/accounts';
import { createTransaction } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { renderWithProviders } from '@/test/render';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { accountId?: string } = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
}));

jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  createTransaction: jest.fn(),
  listTransactions: jest.fn().mockResolvedValue([]),
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
});

const checking = make(1, 'Checking', 'USD');
const yen = make(2, 'Yen wallet', 'JPY');

const created = {
  id: 1,
  accountId: 1,
  kind: 'expense' as const,
  amountCents: 1250,
  date: new Date().toISOString(),
  note: null,
  recurringId: null,
  createdAt: new Date().toISOString(),
};

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  (listAccounts as jest.Mock).mockResolvedValue([checking, yen]);
  (createTransaction as jest.Mock).mockResolvedValue(created);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'ready' });
  useSuccessStore.setState({ current: null });
});

describe('new transaction screen', () => {
  it('opens with the first account, Expense and today, and saves', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    expect(
      await screen.findByLabelText(`${en.transactions.accountLabel}, Checking`),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('Checking', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(en.transactions.today)).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText(en.transactions.amountLabel), '12,50');
    fireEvent.press(screen.getByText(en.transactions.save));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    const input = (createTransaction as jest.Mock).mock.calls[0][0];
    expect(input).toMatchObject({ accountId: 1, kind: 'expense', amount: '12,50', note: '' });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
    // The success card is requested for the screen we return to.
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'arrow-down',
      tone: 'negative',
      message: en.transactions.savedExpense,
      detail: '−$12.50',
    });
  });

  it('shows the income success card with a plus amount', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    fireEvent.press(await screen.findByText(en.transactions.income));
    fireEvent.changeText(screen.getByLabelText(en.transactions.amountLabel), '100');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'arrow-up',
      tone: 'positive',
      message: en.transactions.savedIncome,
      detail: '+$100.00',
    });
  });

  it('shows no success card when validation or saving fails', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.save));
    await screen.findByText(en.transactions.errors.amountRequired);
    expect(useSuccessStore.getState().current).toBeNull();

    (createTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    fireEvent.changeText(screen.getByLabelText(en.transactions.amountLabel), '3');
    fireEvent.press(screen.getByText(en.transactions.save));
    await screen.findByText(en.transactions.saveError);
    expect(useSuccessStore.getState().current).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('preselects the account from the accountId param', async () => {
    mockParams = { accountId: '2' };
    await renderWithProviders(<NewTransactionScreen />);
    expect(
      await screen.findByLabelText(`${en.transactions.accountLabel}, Yen wallet`),
    ).toBeTruthy();
    expect(screen.getByText('JPY')).toBeTruthy();
  });

  it('can switch to income', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    fireEvent.press(await screen.findByText(en.transactions.income));
    fireEvent.changeText(screen.getByLabelText(en.transactions.amountLabel), '5');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(createTransaction).toHaveBeenCalled());
    expect((createTransaction as jest.Mock).mock.calls[0][0]).toMatchObject({ kind: 'income' });
  });

  it('changes the currency when the account changes', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    fireEvent.press(await screen.findByLabelText(`${en.transactions.accountLabel}, Checking`));
    fireEvent.press(await screen.findByText('Yen wallet'));
    expect(await screen.findByText('JPY')).toBeTruthy();
    expect(screen.queryByText('USD')).toBeNull();
  });

  it('shows the validation error and does not save', async () => {
    await renderWithProviders(<NewTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.save));
    expect(await screen.findByText(en.transactions.errors.amountRequired)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(en.transactions.amountLabel), '1.234');
    expect(await screen.findByText(en.transactions.errors.amountTooManyDecimals)).toBeTruthy();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('shows a save error and stays on the form when saving fails', async () => {
    (createTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<NewTransactionScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '3');
    fireEvent.press(screen.getByText(en.transactions.save));
    expect(await screen.findByText(en.transactions.saveError)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('follows the clock past midnight: the picker and the validation accept the new day', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date(2026, 2, 10, 23, 59));
    try {
      await renderWithProviders(<NewTransactionScreen />);
      fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '4');

      // The form stays open past midnight.
      jest.setSystemTime(new Date(2026, 2, 11, 0, 1));
      fireEvent.press(screen.getByLabelText(en.transactions.dateLabel));
      const options = (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
      expect(options.maximumDate).toEqual(new Date(2026, 2, 11, 23, 59, 59, 999));
      act(() => {
        options.onChange({ type: 'set' }, new Date(2026, 2, 11));
      });

      fireEvent.press(screen.getByText(en.transactions.save));
      await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
      expect((createTransaction as jest.Mock).mock.calls[0][0].date).toEqual(new Date(2026, 2, 11));
      expect(screen.queryByText(en.transactions.errors.dateInFuture)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('still rejects a negative amount and keeps the decimal keypad', async () => {
    (createTransaction as jest.Mock).mockClear();
    await renderWithProviders(<NewTransactionScreen />);
    const field = await screen.findByLabelText(en.transactions.amountLabel);
    expect(field.props.keyboardType).toBe('decimal-pad');
    fireEvent.changeText(field, '-5');
    fireEvent.press(screen.getByText(en.transactions.save));
    expect(await screen.findByText(en.transactions.errors.amountNotPositive)).toBeTruthy();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('asks to create an account first when there are none', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([]);
    await renderWithProviders(<NewTransactionScreen />);
    expect(await screen.findByText(en.transactions.noAccountsTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.transactions.noAccountsAction));
    expect(mockPush).toHaveBeenCalledWith('/account/new');
  });

  it('shows an error with retry when the accounts fail to load', async () => {
    (listAccounts as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<NewTransactionScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByLabelText(en.transactions.amountLabel)).toBeTruthy();
  });
});
