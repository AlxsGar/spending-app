import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import NewAccountScreen from '@/app/account/new';
import AccountDetailScreen from '@/app/account/[id]/index';
import EditAccountScreen from '@/app/account/[id]/edit';
import { AccountCards } from '@/components/account-cards';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { listRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { formatMoney } from '@/services/money';
import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import { getSetting } from '@/services/db';
import { computeBalances, listTransactions } from '@/services/transactions';
import { listCaps } from '@/services/soft-caps';
import { useAccountsStore } from '@/stores/accounts-store';
import { useCapsStore } from '@/stores/caps-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { colors } from '@/theme';

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

jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
}));

jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

jest.mock('@/services/soft-caps', () => ({
  ...jest.requireActual('@/services/soft-caps'),
  listCaps: jest.fn(),
}));

// What the forms send for the cap fields when the user leaves them alone.
const capFields = { inGlobalCap: true, cap: { amount: '', period: 'month' } };

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
  (listRecurring as jest.Mock).mockResolvedValue([]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useDefaultCurrencyStore.setState({ value: null, saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  (listCaps as jest.Mock).mockResolvedValue([]);
  useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
});

const recurringPayment = (
  id: number,
  accountId: number | null,
  name: string,
  extra: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id,
  accountId,
  name,
  amountCents: 150000,
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

describe('account detail recurring payments', () => {
  it('lists only this account recurring payments, with amount and next due date', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      recurringPayment(1, 7, 'Rent'),
      recurringPayment(2, 9, 'Other account'),
      recurringPayment(3, 7, 'Gym', { active: false, amountCents: 4500 }),
    ]);
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(en.recurring.sectionTitle)).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('€1,500.00')).toBeTruthy();
    expect(screen.getByText('Gym')).toBeTruthy();
    expect(screen.getByText(/Every month · Inactive/)).toBeTruthy();
    // Rent started in the past and was never paid: overdue, in its own line.
    expect(screen.getByText(/Overdue · /)).toBeTruthy();
    // Account detail rows have no ⋮ menu: they only open the edit form.
    expect(screen.queryByLabelText(en.recurring.menu.label.replace('{{name}}', 'Rent'))).toBeNull();
    expect(screen.queryByText('Other account')).toBeNull();
  });

  it('ignores unassigned payments: not listed, not counted, not removed with the account', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      recurringPayment(1, 7, 'Linked A'),
      recurringPayment(2, null, 'Loose'),
      recurringPayment(3, 7, 'Linked B'),
      recurringPayment(4, 9, 'Elsewhere'),
    ]);
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText('Linked A')).toBeTruthy();
    expect(screen.getByText('Linked B')).toBeTruthy();
    expect(screen.queryByText('Loose')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.accounts.delete }).props.accessibilityState
          ?.disabled,
      ).toBeFalsy(),
    );
    fireEvent.press(screen.getByText(en.accounts.delete));
    // Two linked payments; the unassigned one is not counted.
    expect(
      await screen.findByText(
        'This deletes the account along with 2 recurring payments. This cannot be undone.',
      ),
    ).toBeTruthy();
    const deletes = screen.getAllByText(en.accounts.delete);
    fireEvent.press(deletes[deletes.length - 1]);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([2, 4]);
  });

  it('hides the section when the account has none', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([recurringPayment(2, 9, 'Other account')]);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText(en.transactions.accountEmpty);
    expect(screen.queryByText(en.recurring.sectionTitle)).toBeNull();
  });

  it('opens the recurring edit route when a row is tapped', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([recurringPayment(5, 7, 'Rent')]);
    await renderWithProviders(<AccountDetailScreen />);
    fireEvent.press(await screen.findByText('Rent'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/recurring/[id]', params: { id: 5 } });
  });

  it('keeps Delete disabled until the recurring payments have loaded', async () => {
    let finish: (rows: RecurringPayment[]) => void = () => {};
    (listRecurring as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderWithProviders(<AccountDetailScreen />);
    const button = await screen.findByRole('button', { name: en.accounts.delete });
    expect(button.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      finish([]);
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.accounts.delete }).props.accessibilityState
          ?.disabled,
      ).toBeFalsy(),
    );
  });

  const txRow = (id: number) => ({
    id,
    accountId: 7,
    kind: 'expense' as const,
    amountCents: 100,
    date: new Date(Date.now() - id * 1000).toISOString(),
    note: null,
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it.each([
    ['one recurring payment', 0, 1, 'This deletes the account along with 1 recurring payment. This cannot be undone.'],
    ['several recurring payments', 0, 3, 'This deletes the account along with 3 recurring payments. This cannot be undone.'],
    ['transactions and recurring payments', 2, 1, 'This deletes the account along with 2 transactions and 1 recurring payment. This cannot be undone.'],
    ['one of each', 1, 2, 'This deletes the account along with 1 transaction and 2 recurring payments. This cannot be undone.'],
  ])('the delete confirmation counts %s', async (_label, transactions, payments, message) => {
    (listTransactions as jest.Mock).mockResolvedValue(
      Array.from({ length: transactions }, (_, index) => txRow(index + 1)),
    );
    (listRecurring as jest.Mock).mockResolvedValue(
      Array.from({ length: payments }, (_, index) => recurringPayment(index + 1, 7, `Pay ${index}`)),
    );
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText('Pay 0');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.accounts.delete }).props.accessibilityState
          ?.disabled,
      ).toBeFalsy(),
    );
    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('Spanish plurals for the delete confirmation', async () => {
    await i18n.changeLanguage('es');
    try {
      (listTransactions as jest.Mock).mockResolvedValue([txRow(1)]);
      (listRecurring as jest.Mock).mockResolvedValue([
        recurringPayment(1, 7, 'Renta'),
        recurringPayment(2, 7, 'Gimnasio'),
      ]);
      await renderWithProviders(<AccountDetailScreen />);
      await screen.findByText('Renta');
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: es.accounts.delete }).props.accessibilityState
            ?.disabled,
        ).toBeFalsy(),
      );
      fireEvent.press(screen.getByText(es.accounts.delete));
      expect(
        await screen.findByText(
          'Esto elimina la cuenta junto con 1 transacción y 2 pagos recurrentes. No se puede deshacer.',
        ),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('Confirm removes the account and its recurring payments from the stores', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      recurringPayment(1, 7, 'Rent'),
      recurringPayment(2, 9, 'Elsewhere'),
    ]);
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText('Rent');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.accounts.delete }).props.accessibilityState
          ?.disabled,
      ).toBeFalsy(),
    );
    fireEvent.press(screen.getByText(en.accounts.delete));
    await screen.findByText(en.accounts.deleteTitle);
    const deletes = screen.getAllByText(en.accounts.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([2]);
  });
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

describe('account detail cap line', () => {
  const spend = (cents: number, accountId = 7, kind: 'expense' | 'income' = 'expense') => ({
    id: Math.floor(Math.random() * 1e6),
    accountId,
    kind,
    amountCents: cents,
    date: new Date().toISOString(),
    note: null,
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const money = (cents: number) => formatMoney(cents, 'EUR');
  const cap = (accountId: number | null, amountCents: number, period = 'day') => ({
    id: Math.floor(Math.random() * 1e6),
    accountId,
    period,
    amountCents,
  });
  const show = async (transactions: unknown[], caps: unknown[], addLabel = en.transactions.add) => {
    (listTransactions as jest.Mock).mockResolvedValue(transactions);
    (listCaps as jest.Mock).mockResolvedValue(caps);
    await renderWithProviders(<AccountDetailScreen />);
    await waitFor(() => expect(useCapsStore.getState().status).toBe('ready'));
    await screen.findByText(addLabel);
    // Let the other stores the screen reads finish, so no update lands later.
    await waitFor(() => expect(useRecurringStore.getState().status).toBe('ready'));
    await act(async () => {});
  };

  it('shows nothing without a cap, and never the global cap', async () => {
    await show([spend(900000)], [cap(null, 100)]);
    expect(screen.queryByText(/ today/)).toBeNull();
    expect(screen.queryByText(/Cap exceeded/)).toBeNull();
  });

  it('under the cap: one quiet secondary line, no banner', async () => {
    await show([spend(80000), spend(500000, 7, 'income')], [cap(7, 100000)]);
    const line = await screen.findByText(`${money(80000)} of ${money(100000)} today`);
    expect(StyleSheet.flatten(line.props.style).color).toBe(colors.textSecondary);
    expect(screen.queryByText(/Cap exceeded/)).toBeNull();
  });

  it('exactly at the cap it is still the quiet line', async () => {
    await show([spend(100000)], [cap(7, 100000, 'week')]);
    expect(await screen.findByText(`${money(100000)} of ${money(100000)} this week`)).toBeTruthy();
    expect(screen.queryByText(/Cap exceeded/)).toBeNull();
  });

  it('over the cap the line becomes an alert banner', async () => {
    await show([spend(120000)], [cap(7, 100000, 'month')]);
    const banner = await screen.findByText(
      `Cap exceeded: ${money(120000)} of ${money(100000)} this month`,
    );
    expect(StyleSheet.flatten(banner.props.style).color).toBe(colors.alert);
    expect(screen.queryByText(`${money(120000)} of ${money(100000)} this month`)).toBeNull();
  });

  it('follows the transactions and the caps, and hides while the caps are in error', async () => {
    await show([spend(120000)], [cap(7, 100000)]);
    expect(await screen.findByText(/Cap exceeded/)).toBeTruthy();
    await act(async () => {
      useCapsStore.setState({ caps: [{ id: 1, accountId: 7, period: 'day', amountCents: 200000 }] });
    });
    expect(screen.queryByText(/Cap exceeded/)).toBeNull();
    expect(screen.getByText(`${money(120000)} of ${money(200000)} today`)).toBeTruthy();
    await act(async () => {
      useCapsStore.setState({ status: 'error' });
    });
    // The cap progress line ("$X of $Y this month"); the projection line also has " of ".
    expect(screen.queryByText(/\d of /)).toBeNull();
  });

  it('is in Spanish', async () => {
    await i18n.changeLanguage('es');
    try {
      await show([spend(120000)], [cap(7, 100000)], es.transactions.add);
      expect(
        await screen.findByText(`Límite excedido: ${money(120000)} de ${money(100000)} hoy`),
      ).toBeTruthy();
    } finally {
      // Inside act: the mounted screen re-renders for the language change.
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
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
        ...capFields,
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
        ...capFields,
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
      ...capFields,
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
        ...capFields,
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
      ...capFields,
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
        ...capFields,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useAccountsStore.getState().accounts[0].name).toBe('Renamed');
  });

  it('prefills the account cap and switch, and a save sends the changed cap and refreshes the caps', async () => {
    (getSetting as jest.Mock).mockResolvedValue('EUR');
    (listAccounts as jest.Mock).mockResolvedValue([{ ...account, inGlobalCap: false }]);
    (listCaps as jest.Mock).mockResolvedValue([
      { id: 1, accountId: 7, period: 'week', amountCents: 25050 },
      { id: 2, accountId: 9, period: 'day', amountCents: 100 },
    ]);
    (updateAccount as jest.Mock).mockResolvedValue({ ...account, inGlobalCap: false });
    await renderWithProviders(<EditAccountScreen />);

    const amount = await screen.findByLabelText(en.caps.amountLabel);
    expect(amount.props.value).toBe('250.50');
    expect(
      screen.getByRole('switch', { name: en.caps.countsTowardGlobal }).props.accessibilityState,
    ).toMatchObject({ checked: false, disabled: false });

    (listCaps as jest.Mock).mockResolvedValue([
      { id: 1, accountId: 7, period: 'month', amountCents: 30000 },
    ]);
    fireEvent.changeText(amount, '300');
    fireEvent.press(screen.getByText(en.caps.periodMonth));
    fireEvent.press(screen.getByText(en.accounts.save));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(7, {
        name: 'Savings',
        icon: 'wallet',
        currency: 'EUR',
        balance: undefined,
        inGlobalCap: false,
        cap: { amount: '300', period: 'month' },
      }),
    );
    await waitFor(() =>
      expect(useCapsStore.getState().caps).toEqual([
        { id: 1, accountId: 7, period: 'month', amountCents: 30000 },
      ]),
    );
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
        ...capFields,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useTransactionsStore.getState().transactions[0].amountCents).toBe(1250);
  });
});
