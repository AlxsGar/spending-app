import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import EditTransactionScreen from '@/app/transaction/[id]';
import { en } from '@/i18n/en';
import { listAccounts } from '@/services/accounts';
import {
  listTransactions,
  removeTransaction,
  updateTransaction,
} from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { renderWithProviders } from '@/test/render';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({ id: '5' }),
}));

jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
}));

jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  listTransactions: jest.fn(),
  updateTransaction: jest.fn(),
  removeTransaction: jest.fn(),
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

const stored = {
  id: 5,
  accountId: 1,
  kind: 'expense' as const,
  amountCents: 1250,
  date: new Date(2026, 0, 5, 14, 30).toISOString(),
  note: 'Lunch',
  recurringId: null,
  createdAt: '2026-01-05T20:30:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (listAccounts as jest.Mock).mockResolvedValue([checking, yen]);
  (listTransactions as jest.Mock).mockResolvedValue([stored]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useSuccessStore.setState({ current: null });
});

describe('edit transaction screen', () => {
  it('opens prefilled with the transaction values', async () => {
    await renderWithProviders(<EditTransactionScreen />);
    const amount = await screen.findByLabelText(en.transactions.amountLabel);
    expect(amount.props.value).toBe('12.50');
    expect(screen.getByLabelText(en.transactions.noteLabel).props.value).toBe('Lunch');
    expect(screen.getByLabelText(`${en.transactions.accountLabel}, Checking`)).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
  });

  it('saves the edit, updates the store, shows the updated card and goes back', async () => {
    (updateTransaction as jest.Mock).mockResolvedValue({ ...stored, amountCents: 3000 });
    await renderWithProviders(<EditTransactionScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '30');
    fireEvent.press(screen.getByText(en.transactions.save));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1));
    expect((updateTransaction as jest.Mock).mock.calls[0][0]).toBe(5);
    expect((updateTransaction as jest.Mock).mock.calls[0][1]).toMatchObject({
      accountId: 1,
      kind: 'expense',
      amount: '30',
      note: 'Lunch',
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useTransactionsStore.getState().transactions[0].amountCents).toBe(3000);
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'arrow-down',
      tone: 'negative',
      message: 'Expense updated',
      amountText: '−$30.00',
    });
  });

  it('shows the income updated card', async () => {
    (updateTransaction as jest.Mock).mockResolvedValue({ ...stored, kind: 'income' });
    await renderWithProviders(<EditTransactionScreen />);
    fireEvent.press(await screen.findByText(en.transactions.income));
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'arrow-up',
      tone: 'positive',
      message: 'Income updated',
      amountText: '+$12.50',
    });
  });

  it('shows the decimals error when switching to a JPY account with 12.50', async () => {
    await renderWithProviders(<EditTransactionScreen />);
    fireEvent.press(await screen.findByLabelText(`${en.transactions.accountLabel}, Checking`));
    fireEvent.press(await screen.findByText('Yen wallet'));
    fireEvent.press(screen.getByText(en.transactions.save));
    expect(
      await screen.findByText(en.transactions.errors.amountDecimalsNotAllowed),
    ).toBeTruthy();
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('shows an inline error and no success card when the save fails', async () => {
    (updateTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<EditTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.save));
    expect(await screen.findByText(en.transactions.saveError)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('Cancel keeps the transaction', async () => {
    await renderWithProviders(<EditTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.delete));
    expect(await screen.findByText(en.transactions.deleteTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(en.transactions.deleteTitle)).toBeNull());
    expect(removeTransaction).not.toHaveBeenCalled();
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
  });

  it('Confirm deletes, goes back and shows no success card', async () => {
    (removeTransaction as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<EditTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.delete));
    await screen.findByText(en.transactions.deleteTitle);
    const deletes = screen.getAllByText(en.transactions.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(removeTransaction).toHaveBeenCalledWith(5));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('shows an inline error and stays when the delete fails', async () => {
    (removeTransaction as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<EditTransactionScreen />);
    await screen.findByLabelText(en.transactions.amountLabel);
    fireEvent.press(screen.getByText(en.transactions.delete));
    await screen.findByText(en.transactions.deleteTitle);
    const deletes = screen.getAllByText(en.transactions.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    expect(await screen.findByText(en.transactions.deleteError)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
    expect(screen.getByLabelText(en.transactions.amountLabel)).toBeTruthy();
  });
});
