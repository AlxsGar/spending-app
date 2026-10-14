import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewAccountScreen from '@/app/account/new';
import AccountDetailScreen from '@/app/account/[id]/index';
import EditAccountScreen from '@/app/account/[id]/edit';
import { AccountCards } from '@/components/account-cards';
import { en } from '@/i18n/en';
import { formatMoney } from '@/services/money';
import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import { getSetting } from '@/services/db';
import { computeBalances, listTransactions } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

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
  balanceAnchorCents: 0,
  balanceAnchorAt: null as string | null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSuccessStore.setState({ current: null });
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

  it('shows "Balance set on <date>" only when an anchor exists', async () => {
    const anchorAt = '2026-03-05T12:00:00.000Z';
    (listAccounts as jest.Mock).mockResolvedValue([
      { ...account, balanceAnchorCents: 10000, balanceAnchorAt: anchorAt },
    ]);
    (listTransactions as jest.Mock).mockResolvedValue([
      { ...tx(1, 7, 'income', 500), date: '2026-04-01T00:00:00.000Z' },
    ]);
    await renderWithProviders(<AccountDetailScreen />);
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(anchorAt));
    expect(await screen.findByText(`Balance set on ${date}`)).toBeTruthy();
    // 100.00 anchor + 5.00 after it.
    expect(screen.getAllByText('€105.00').length).toBeGreaterThan(0);
  });

  it('shows no "Balance set on" line without an anchor', async () => {
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText('Savings');
    expect(screen.queryByText(/Balance set on/)).toBeNull();
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
    // No success card on delete.
    expect(useSuccessStore.getState().current).toBeNull();
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

  it('shows the success card (check, neutral, name as second line) right before going back', async () => {
    (getSetting as jest.Mock).mockResolvedValue(null);
    (createAccount as jest.Mock).mockResolvedValue({ ...account, id: 8 });
    mockBack.mockImplementation(() => {
      // The card is already queued when the screen navigates away.
      expect(useSuccessStore.getState().current).not.toBeNull();
    });
    await renderWithProviders(<NewAccountScreen />);
    await save();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'check',
      tone: 'neutral',
      message: en.accounts.created,
      detail: 'New',
    });
  });

  it('shows no success card when the save fails', async () => {
    (getSetting as jest.Mock).mockResolvedValue(null);
    (createAccount as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<NewAccountScreen />);
    await save();
    expect(await screen.findByText(en.accounts.saveError)).toBeTruthy();
    expect(useSuccessStore.getState().current).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('sends an initial balance typed with a minus sign', async () => {
    (getSetting as jest.Mock).mockResolvedValue('USD');
    (createAccount as jest.Mock).mockResolvedValue({ ...account, id: 8 });
    await renderWithProviders(<NewAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.initialBalanceLabel), '-200');
    await save();
    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith({
        name: 'New',
        icon: 'bank',
        currency: 'USD',
        balance: '-200',
      }),
    );
  });
});

describe('edit account screen', () => {
  const stored = (id: number, kind: 'expense' | 'income', amountCents: number, date: string) => ({
    id,
    accountId: 7,
    kind,
    amountCents,
    date,
    note: null,
    recurringId: null,
    createdAt: date,
  });
  // 100.00 set at the anchor; +25.00 after it, an expense before it ignored.
  const anchored = {
    ...account,
    balanceAnchorCents: 10000,
    balanceAnchorAt: '2026-03-01T00:00:00.000Z',
  };
  const withBalance = () => {
    (listAccounts as jest.Mock).mockResolvedValue([anchored]);
    (listTransactions as jest.Mock).mockResolvedValue([
      stored(1, 'income', 2500, '2026-03-02T00:00:00.000Z'),
      stored(2, 'expense', 99999, '2026-02-01T00:00:00.000Z'),
    ]);
  };

  it('relabels a 12.50 balance to JPY and back: no error, no balance sent, display follows the currency', async () => {
    const mxn = {
      ...account,
      currency: 'MXN' as const,
      balanceAnchorCents: 1250,
      balanceAnchorAt: '2026-03-01T00:00:00.000Z',
    };
    (listAccounts as jest.Mock).mockResolvedValue([mxn]);
    // One transaction before the anchor: it does not count, but it makes the
    // currency change ask for confirmation.
    (listTransactions as jest.Mock).mockResolvedValue([
      stored(1, 'expense', 999, '2026-02-01T00:00:00.000Z'),
    ]);

    const switchCurrency = async (from: string, to: string, result: typeof mxn) => {
      (updateAccount as jest.Mock).mockResolvedValue(result);
      const edit = await renderWithProviders(<EditAccountScreen />);
      expect((await screen.findByLabelText(en.accounts.currentBalanceLabel)).props.value).toBe(
        '12.50',
      );
      fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, ${from}`));
      fireEvent.press(await screen.findByText(to));
      await screen.findByLabelText(`${en.accounts.currencyLabel}, ${to}`);
      fireEvent.press(screen.getByText(en.accounts.save));
      fireEvent.press(await screen.findByText(en.accounts.currencyChangeConfirm));
      await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
      // Relabel only: no balance is sent, so the anchor is untouched, and no error shows.
      const [, input] = (updateAccount as jest.Mock).mock.calls[0];
      expect(input).toMatchObject({ currency: to });
      expect(input.balance).toBeUndefined();
      expect(screen.queryByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeNull();
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      edit.unmount();
      (updateAccount as jest.Mock).mockClear();
      mockBack.mockClear();
    };

    // Intl rounds the half up: 12.50 JPY displays as ¥13 (pinned from the real formatter).
    expect(formatMoney(1250, 'JPY')).toBe('¥13');

    await switchCurrency('MXN', 'JPY', { ...mxn, currency: 'JPY' as never });
    const asJpy = useAccountsStore.getState().accounts[0];
    expect(asJpy).toMatchObject({ currency: 'JPY', balanceAnchorCents: 1250 });
    expect(asJpy.balanceAnchorAt).toBe(mxn.balanceAnchorAt);
    expect(useTransactionsStore.getState().transactions[0].amountCents).toBe(999);

    const detail = await renderWithProviders(<AccountDetailScreen />);
    expect((await screen.findAllByText('¥13')).length).toBeGreaterThan(0);
    detail.unmount();
    const cards = await renderWithProviders(
      <AccountCards
        accounts={[asJpy]}
        balances={computeBalances([asJpy], useTransactionsStore.getState().transactions)}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getAllByText('¥13').length).toBeGreaterThan(0);
    cards.unmount();

    await switchCurrency('JPY', 'MXN', mxn);
    const back = useAccountsStore.getState().accounts[0];
    expect(back).toMatchObject({ currency: 'MXN', balanceAnchorCents: 1250 });
    const detailAgain = await renderWithProviders(<AccountDetailScreen />);
    expect((await screen.findAllByText(formatMoney(1250, 'MXN'))).length).toBeGreaterThan(0);
    detailAgain.unmount();
  });

  it('never shows the form when the transactions fail to load; Retry reloads and prefills correctly', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([anchored]);
    (listTransactions as jest.Mock)
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue([stored(1, 'income', 2500, '2026-03-02T00:00:00.000Z')]);
    await renderWithProviders(<EditAccountScreen />);

    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    expect(screen.queryByLabelText(en.accounts.currentBalanceLabel)).toBeNull();
    expect(screen.queryByLabelText(en.accounts.nameLabel)).toBeNull();

    fireEvent.press(screen.getByText(en.common.retry));
    const field = await screen.findByLabelText(en.accounts.currentBalanceLabel);
    expect(field.props.value).toBe('125.00');
    expect(screen.queryByText(en.common.loadError)).toBeNull();
  });

  it('prefills the current balance, the same as the one shown', async () => {
    withBalance();
    await renderWithProviders(<EditAccountScreen />);
    const field = await screen.findByLabelText(en.accounts.currentBalanceLabel);
    expect(field.props.value).toBe('125.00');
  });

  it('prefills a negative balance with a leading minus', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([
      { ...account, balanceAnchorCents: -20050, balanceAnchorAt: '2026-03-01T00:00:00.000Z' },
    ]);
    await renderWithProviders(<EditAccountScreen />);
    const field = await screen.findByLabelText(en.accounts.currentBalanceLabel);
    expect(field.props.value).toBe('-200.50');
    // Saving unchanged sends no balance.
    (updateAccount as jest.Mock).mockResolvedValue(account);
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
    expect((updateAccount as jest.Mock).mock.calls[0][1].balance).toBeUndefined();
  });

  it('waits for the transactions before showing the form', async () => {
    let finish: (rows: ReturnType<typeof stored>[]) => void = () => {};
    (listAccounts as jest.Mock).mockResolvedValue([anchored]);
    (listTransactions as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderWithProviders(<EditAccountScreen />);
    expect(screen.queryByLabelText(en.accounts.currentBalanceLabel)).toBeNull();
    await act(async () => {
      finish([stored(1, 'income', 2500, '2026-03-02T00:00:00.000Z')]);
    });
    expect((await screen.findByLabelText(en.accounts.currentBalanceLabel)).props.value).toBe(
      '125.00',
    );
  });

  it('saving unchanged sends no balance, so the anchor stays; the card says Account updated', async () => {
    withBalance();
    (updateAccount as jest.Mock).mockResolvedValue({ ...anchored, name: 'Renamed' });
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.nameLabel), 'Renamed');
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(updateAccount).toHaveBeenCalledWith(7, {
      name: 'Renamed',
      icon: 'wallet',
      currency: 'EUR',
      balance: undefined,
    });
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'check',
      tone: 'neutral',
      message: en.accounts.updated,
      detail: 'Renamed',
    });
  });

  it('writing the same value in another form ("125") is not a change', async () => {
    withBalance();
    (updateAccount as jest.Mock).mockResolvedValue(anchored);
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.currentBalanceLabel), '125');
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
    expect((updateAccount as jest.Mock).mock.calls[0][1].balance).toBeUndefined();
  });

  it('a changed balance is sent as typed, with its minus sign', async () => {
    withBalance();
    (updateAccount as jest.Mock).mockResolvedValue(anchored);
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.currentBalanceLabel), '-30');
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(7, {
        name: 'Savings',
        icon: 'wallet',
        currency: 'EUR',
        balance: '-30',
      }),
    );
  });

  it('changing the balance to 0 is a change', async () => {
    withBalance();
    (updateAccount as jest.Mock).mockResolvedValue(anchored);
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.currentBalanceLabel), '0');
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    expect((updateAccount as jest.Mock).mock.calls[0][1].balance).toBe('0');
  });

  it('typing -0 over a balance of 0 sends nothing', async () => {
    (updateAccount as jest.Mock).mockResolvedValue(account);
    await renderWithProviders(<EditAccountScreen />);
    const field = await screen.findByLabelText(en.accounts.currentBalanceLabel);
    expect(field.props.value).toBe('0.00');
    fireEvent.changeText(field, '-0');
    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
    expect((updateAccount as jest.Mock).mock.calls[0][1].balance).toBeUndefined();
  });

  it('an invalid balance shows an inline error, saves nothing and shows no card', async () => {
    withBalance();
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.currentBalanceLabel), 'abc');
    fireEvent.press(screen.getByText(en.accounts.save));
    expect(await screen.findByText(en.accounts.errors.balanceInvalid)).toBeTruthy();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('currency and balance changed together: confirm first, then ONE update with both', async () => {
    withBalance();
    (updateAccount as jest.Mock).mockResolvedValue({ ...anchored, currency: 'USD' });
    await renderWithProviders(<EditAccountScreen />);
    fireEvent.changeText(await screen.findByLabelText(en.accounts.currentBalanceLabel), '80');
    fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, EUR`));
    fireEvent.press(await screen.findByText('USD'));
    await waitFor(() => expect(screen.queryByText('JPY')).toBeNull());
    fireEvent.press(screen.getByText(en.accounts.save));

    expect(await screen.findByText(en.accounts.currencyChangeTitle)).toBeTruthy();
    expect(updateAccount).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText(en.accounts.currencyChangeConfirm));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(updateAccount).toHaveBeenCalledTimes(1);
    expect(updateAccount).toHaveBeenCalledWith(7, {
      name: 'Savings',
      icon: 'wallet',
      currency: 'USD',
      balance: '80',
    });
  });

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
