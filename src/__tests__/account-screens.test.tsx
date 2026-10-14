import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewAccountScreen from '@/app/account/new';
import AccountDetailScreen from '@/app/account/[id]/index';
import EditAccountScreen from '@/app/account/[id]/edit';
import { en } from '@/i18n/en';
import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import { getSetting } from '@/services/db';
import { listTransactions } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { renderWithProviders } from '@/test/render';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({ id: '7' }),
}));

jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  removeAccount: jest.fn(),
}));

jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  listTransactions: jest.fn(),
}));

jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

const account = {
  id: 7,
  name: 'Savings',
  icon: 'wallet' as const,
  currency: 'EUR' as const,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (listAccounts as jest.Mock).mockResolvedValue([account]);
  (listTransactions as jest.Mock).mockResolvedValue([]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
});

describe('account detail screen', () => {
  const tx = (id: number, accountId: number, kind: 'expense' | 'income', amountCents: number) => ({
    id,
    accountId,
    kind,
    amountCents,
    date: new Date(Date.now() - id * 1000).toISOString(),
    note: null,
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('lists only this account transactions and shows its balance', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([
      tx(1, 7, 'income', 5000),
      tx(2, 9, 'income', 7777),
      tx(3, 7, 'expense', 1000),
    ]);
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(en.transactions.today)).toBeTruthy();
    expect(screen.getAllByText('€40.00').length).toBeGreaterThan(0);
    expect(screen.getByText('+€50.00')).toBeTruthy();
    expect(screen.getByText('−€10.00')).toBeTruthy();
    expect(screen.queryByText('+€77.77')).toBeNull();
  });

  it('opens the edit route when a transaction row is tapped', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([{ ...tx(3, 7, 'income', 5000), note: 'Pay' }]);
    await renderWithProviders(<AccountDetailScreen />);
    fireEvent.press(await screen.findByText('Pay'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transaction/[id]', params: { id: 3 } });
  });

  it('shows an empty message, an error with retry, and the add action', async () => {
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(en.transactions.accountEmpty)).toBeTruthy();
    fireEvent.press(screen.getByText(en.transactions.add));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/new',
      params: { accountId: 7 },
    });
  });

  it('shows a transactions error with retry', async () => {
    (listTransactions as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.transactions.accountEmpty)).toBeTruthy();
  });

  it('shows the account, and Cancel keeps it', async () => {
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull();

    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(await screen.findByText(en.accounts.deleteTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.cancel));

    await waitFor(() => expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull());
    expect(removeAccount).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useAccountsStore.getState().accounts).toHaveLength(1);
  });

  it('Confirm removes the account and navigates back', async () => {
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText('Savings');

    fireEvent.press(screen.getByText(en.accounts.delete));
    await screen.findByText(en.accounts.deleteTitle);
    // Both the button and the dialog confirm say "Delete"; the dialog one is last.
    const deletes = screen.getAllByText(en.accounts.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(removeAccount).toHaveBeenCalledWith(7));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
  });
});

describe('account delete with transactions', () => {
  const tx = (id: number) => ({
    id,
    accountId: 7,
    kind: 'expense' as const,
    amountCents: 100,
    date: new Date(Date.now() - id * 1000).toISOString(),
    note: null,
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('says how many transactions go with the account, and Cancel keeps everything', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([tx(1), tx(2)]);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText(en.transactions.today);
    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(
      await screen.findByText('This deletes the account and its 2 transactions. This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull());
    expect(removeAccount).not.toHaveBeenCalled();
    expect(useTransactionsStore.getState().transactions).toHaveLength(2);
  });

  it('keeps Delete disabled until the transactions have loaded', async () => {
    let finish: (rows: ReturnType<typeof tx>[]) => void = () => {};
    (listTransactions as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderWithProviders(<AccountDetailScreen />);
    const button = await screen.findByRole('button', { name: en.accounts.delete });
    expect(button.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull();

    await act(async () => {
      finish([tx(1)]);
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.accounts.delete }).props.accessibilityState
          ?.disabled,
      ).toBeFalsy(),
    );
    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(await screen.findByText(en.accounts.deleteTitle)).toBeTruthy();
  });

  it('uses the singular for one transaction', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([tx(1)]);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText(en.transactions.today);
    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(
      await screen.findByText('This deletes the account and its 1 transaction. This cannot be undone.'),
    ).toBeTruthy();
  });

  it('Confirm removes the account and its transactions from both stores', async () => {
    (listTransactions as jest.Mock).mockResolvedValue([tx(1), tx(2)]);
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText(en.transactions.today);
    fireEvent.press(screen.getByText(en.accounts.delete));
    await screen.findByText(en.accounts.deleteTitle);
    const deletes = screen.getAllByText(en.accounts.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
  });
});

describe('new account screen', () => {
  const save = async () => {
    fireEvent.changeText(await screen.findByLabelText(en.accounts.nameLabel), 'New');
    fireEvent.press(screen.getByText(en.accounts.save));
  };

  it.each([
    ['uses the default_currency setting', 'EUR', 'EUR'],
    ['falls back to MXN when the setting is missing', null, 'MXN'],
    ['falls back to MXN when the setting is not in the list', 'ZZZ', 'MXN'],
  ])('%s', async (_label, stored, expected) => {
    (getSetting as jest.Mock).mockResolvedValue(stored);
    (createAccount as jest.Mock).mockResolvedValue({ ...account, id: 8 });
    await renderWithProviders(<NewAccountScreen />);
    await save();

    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith({
        name: 'New',
        icon: 'bank',
        currency: expected,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('edit account screen', () => {
  it('is prefilled and saving updates the account', async () => {
    (updateAccount as jest.Mock).mockResolvedValue({ ...account, name: 'Renamed' });
    await renderWithProviders(<EditAccountScreen />);

    const field = await screen.findByLabelText(en.accounts.nameLabel);
    expect(field.props.value).toBe('Savings');
    expect(screen.getByDisplayValue('EUR', { includeHiddenElements: true })).toBeTruthy();

    fireEvent.changeText(field, 'Renamed');
    fireEvent.press(screen.getByText(en.accounts.save));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(7, {
        name: 'Renamed',
        icon: 'wallet',
        currency: 'EUR',
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useAccountsStore.getState().accounts[0].name).toBe('Renamed');
  });

  it('asks before changing the currency of an account with transactions, amounts untouched', async () => {
    const stored = {
      id: 1,
      accountId: 7,
      kind: 'expense' as const,
      amountCents: 1250,
      date: '2026-01-02T00:00:00.000Z',
      note: null,
      recurringId: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    (listTransactions as jest.Mock).mockResolvedValue([stored]);
    (updateAccount as jest.Mock).mockResolvedValue({ ...account, currency: 'USD' });
    await renderWithProviders(<EditAccountScreen />);

    fireEvent.press(await screen.findByLabelText(`${en.accounts.currencyLabel}, EUR`));
    fireEvent.press(await screen.findByText('USD'));
    await waitFor(() => expect(screen.queryByText('JPY')).toBeNull());
    fireEvent.press(screen.getByText(en.accounts.save));

    expect(await screen.findByText(en.accounts.currencyChangeTitle)).toBeTruthy();
    expect(updateAccount).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText(en.accounts.currencyChangeConfirm));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(7, {
        name: 'Savings',
        icon: 'wallet',
        currency: 'USD',
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useTransactionsStore.getState().transactions[0].amountCents).toBe(1250);
  });
});
