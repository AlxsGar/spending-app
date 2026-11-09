import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

import EditTransactionScreen from '@/app/transaction/[id]';
import NewTransactionScreen from '@/app/transaction/new';
import NewRecurringScreen from '@/app/recurring/new';
import PayRecurringScreen from '@/app/recurring/[id]/pay';
import { CapSnackbarHost } from '@/components/cap-snackbar-host';
import { CapsDialogHost } from '@/components/caps-exceeded-dialog';
import { RecurringPayDialog } from '@/components/recurring-pay-dialog';
import { SuccessHost } from '@/components/ui';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { getSetting } from '@/services/db';
import { createRecurring, listRecurring, toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { payOccurrence } from '@/services/recurring-actions';
import { listCaps } from '@/services/soft-caps';
import { createTransaction, listTransactions, updateTransaction } from '@/services/transactions';
import type { Transaction } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { beginCapWatch, finishCapWatch } from '@/stores/cap-crossing';
import { useCapSnackbarStore } from '@/stores/cap-snackbar-store';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';
import { useCapsStore } from '@/stores/caps-store';
import { rememberDefaultCurrency } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { showSuccess, useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { motion } from '@/theme';

fakeAnimationTimers();

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: { id?: string; accountId?: string } = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
  getDefaultCurrency: jest.fn(),
}));
jest.mock('@/services/transactions', () => ({
  ...jest.requireActual('@/services/transactions'),
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  listTransactions: jest.fn(),
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  createRecurring: jest.fn(),
  listRecurring: jest.fn(),
}));
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
}));
jest.mock('@/services/soft-caps', () => ({
  ...jest.requireActual('@/services/soft-caps'),
  listCaps: jest.fn(),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

const checking = {
  id: 1,
  name: 'Checking',
  icon: 'bank' as const,
  currency: 'USD' as const,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
};
const bbva = { ...checking, id: 2, name: 'BBVA' };

const expense = (id: number, accountId: number, amountCents: number): Transaction => ({
  id,
  accountId,
  kind: 'expense',
  amountCents,
  date: new Date().toISOString(),
  note: id === 5 ? 'Lunch' : null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: new Date().toISOString(),
});

// $100 a day, global; $90 already spent today.
const globalCap = { id: 1, accountId: null, period: 'day' as const, amountCents: 10000 };
const accountCap = { id: 2, accountId: 2, period: 'day' as const, amountCents: 3000 };

const rent: RecurringPayment = {
  id: 5,
  accountId: 1,
  name: 'Rent',
  amountCents: 2000,
  note: null,
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

const seed = (options: {
  accounts?: unknown[];
  transactions?: Transaction[];
  caps?: unknown[];
  payments?: RecurringPayment[];
}) => {
  useAccountsStore.setState({
    accounts: (options.accounts ?? [checking]) as never,
    status: 'ready',
    saveError: false,
  });
  useTransactionsStore.setState({
    transactions: options.transactions ?? [expense(1, 1, 9000)],
    status: 'ready',
  });
  useCapsStore.setState({ caps: (options.caps ?? [globalCap]) as never, status: 'ready' });
  useRecurringStore.setState({ payments: options.payments ?? [rent], status: 'ready' });
};

const withHosts = (ui: ReactElement | null) => (
  <>
    {ui}
    <SuccessHost />
    <CapSnackbarHost />
    <CapsDialogHost />
  </>
);

const GLOBAL_TEXT = (over: string) => `Global cap exceeded: ${over} over today`;
const anySnackbar = () => screen.queryByText(/cap exceeded:/);

// The saved card auto-dismisses; wait it out, then let the snackbar show.
const closeCard = async () => {
  await act(async () => {
    jest.advanceTimersByTime(motion.successDuration + 50);
  });
};
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockParams = {};
  void i18n.changeLanguage('en');
  (getSetting as jest.Mock).mockResolvedValue(null);
  (getDefaultCurrency as jest.Mock).mockResolvedValue('USD');
  // The check reads the in-memory value that a screen remembered.
  rememberDefaultCurrency('USD');
  (listAccounts as jest.Mock).mockResolvedValue([checking, bbva]);
  (listTransactions as jest.Mock).mockResolvedValue([]);
  (listCaps as jest.Mock).mockResolvedValue([]);
  (listRecurring as jest.Mock).mockResolvedValue([rent]);
  (payOccurrence as jest.Mock).mockImplementation(
    async ({ paymentId, occurrence, accountId, amountCents }) => ({
      transaction: {
        ...expense(700, accountId, amountCents ?? 2000),
        recurringId: paymentId,
        recurringOccurrence: occurrence,
      },
      payment: { ...rent, id: paymentId, lastConfirmedAt: occurrence },
    }),
  );
  useSuccessStore.setState({ current: null });
  useCapSnackbarStore.setState({ pending: null, current: null });
  useCapsDialogStore.setState({ open: false });
  seed({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cap-crossing snackbar: entry points', () => {
  it('add: waits for the saved card to close, then names the cap and the amount over', async () => {
    (createTransaction as jest.Mock).mockResolvedValue(expense(2, 1, 2000));
    await renderWithProviders(withHosts(<NewTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '20');
    fireEvent.press(screen.getByText(en.transactions.save));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    // The card is up, the snackbar waits behind it.
    expect(useSuccessStore.getState().current).not.toBeNull();
    expect(useCapSnackbarStore.getState().pending).not.toBeNull();
    expect(anySnackbar()).toBeNull();

    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('add: a tap on the card closes it and the snackbar shows then', async () => {
    (createTransaction as jest.Mock).mockResolvedValue(expense(2, 1, 2000));
    await renderWithProviders(withHosts(<NewTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '20');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    expect(anySnackbar()).toBeNull();
    act(() => useSuccessStore.getState().hide());
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
  });

  it('add: no snackbar when the expense stays under, or reaches exactly the cap', async () => {
    (createTransaction as jest.Mock).mockResolvedValue(expense(2, 1, 1000));
    await renderWithProviders(withHosts(<NewTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '10');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
    expect(useCapSnackbarStore.getState().pending).toBeNull();
  });

  it('add: no snackbar for income, or when the cap was already over', async () => {
    seed({ transactions: [expense(1, 1, 12000)] });
    (createTransaction as jest.Mock).mockResolvedValue(expense(2, 1, 500));
    await renderWithProviders(withHosts(<NewTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '5');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
  });

  it('edit: raising the amount over the cap shows it', async () => {
    mockParams = { id: '5' };
    seed({ transactions: [expense(1, 1, 9000), expense(5, 1, 500)] });
    (updateTransaction as jest.Mock).mockResolvedValue(expense(5, 1, 3000));
    await renderWithProviders(withHosts(<EditTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '30');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$20.00'))).toBeTruthy();
  });

  it('edit: an unchanged-over save, or a delete, shows none', async () => {
    mockParams = { id: '5' };
    seed({ transactions: [expense(1, 1, 12000), expense(5, 1, 500)] });
    (updateTransaction as jest.Mock).mockResolvedValue(expense(5, 1, 800));
    await renderWithProviders(withHosts(<EditTransactionScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.transactions.amountLabel), '8');
    fireEvent.press(screen.getByText(en.transactions.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
  });

  it('Pay now: shows it', async () => {
    mockParams = { id: '5' };
    await renderWithProviders(withHosts(<PayRecurringScreen />));
    fireEvent.press(await screen.findByText(en.recurring.payNow.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
  });

  it('Pay now: none when it does not cross', async () => {
    mockParams = { id: '5' };
    seed({ transactions: [expense(1, 1, 1000)] });
    await renderWithProviders(withHosts(<PayRecurringScreen />));
    fireEvent.press(await screen.findByText(en.recurring.payNow.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
  });

  it('quick Paid: shows it, and none when under', async () => {
    const onDone = jest.fn();
    const day = toDay(new Date());
    await renderWithProviders(
      withHosts(
        <RecurringPayDialog
          mode="card"
          payment={rent}
          occurrence="2026-01-07"
          overdue
          today={day}
          accounts={[checking]}
          defaultCurrency="USD"
          onDone={onDone}
        />,
      ),
    );
    fireEvent.press(screen.getByRole('button', { name: en.recurring.card.paid }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('paid'));
    await settle();
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
  });

  it('quick Paid: none when under the cap', async () => {
    seed({ transactions: [] });
    const onDone = jest.fn();
    await renderWithProviders(
      withHosts(
        <RecurringPayDialog
          mode="card"
          payment={rent}
          occurrence="2026-01-07"
          overdue
          today={toDay(new Date())}
          accounts={[checking]}
          defaultCurrency="USD"
          onDone={onDone}
        />,
      ),
    );
    fireEvent.press(screen.getByRole('button', { name: en.recurring.card.paid }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('paid'));
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
  });

  it('"Paid today" on create: shows it; creating without paying shows none', async () => {
    const startsToday = { ...rent, id: 6, name: 'Gym', startDate: toDay(new Date()) };
    (createRecurring as jest.Mock).mockResolvedValue(startsToday);
    const fillAndSave = async () => {
      await renderWithProviders(withHosts(<NewRecurringScreen />));
      fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
      fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '20');
      fireEvent.press(screen.getByText(en.recurring.save));
    };

    await fillAndSave();
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayLater }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(anySnackbar()).toBeNull();
  });

  it('"Paid today" Yes crosses the cap and shows it', async () => {
    const startsToday = { ...rent, id: 6, name: 'Gym', startDate: toDay(new Date()) };
    (createRecurring as jest.Mock).mockResolvedValue(startsToday);
    await renderWithProviders(withHosts(<NewRecurringScreen />));
    fireEvent.changeText(await screen.findByLabelText(en.recurring.nameLabel), 'Gym');
    fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '20');
    fireEvent.press(screen.getByText(en.recurring.save));
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.pay.todayYes }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await settle();
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
  });
});

describe('cap-crossing snackbar: content, View, replacement', () => {
  // A save made without a screen: the stores change between begin and finish.
  const save = async (added: Transaction[]) => {
    await act(async () => {
      const watch = beginCapWatch();
      useTransactionsStore.setState((state) => ({
        transactions: [...state.transactions, ...added],
      }));
      finishCapWatch(watch);
    });
  };

  it('an account cap and the global cap crossed at once: one snackbar, global headline, "and 1 more"', async () => {
    seed({
      accounts: [checking, bbva],
      transactions: [expense(1, 1, 8000), expense(2, 2, 1000)],
      caps: [globalCap, accountCap],
    });
    await renderWithProviders(withHosts(null));
    await save([expense(3, 2, 3000)]);
    expect(await screen.findByText(`${GLOBAL_TEXT('$20.00')} and 1 more`)).toBeTruthy();
    expect(screen.getAllByText(/cap exceeded:/)).toHaveLength(1);
  });

  it('names an account cap with its name when the global cap is not crossed', async () => {
    seed({
      accounts: [checking, bbva],
      transactions: [expense(1, 2, 1000)],
      caps: [{ ...globalCap, amountCents: 999999 }, accountCap],
    });
    await renderWithProviders(withHosts(null));
    await save([expense(3, 2, 22000)]);
    expect(await screen.findByText('BBVA cap exceeded: $200.00 over today')).toBeTruthy();
  });

  it('is in Spanish', async () => {
    await i18n.changeLanguage('es');
    await renderWithProviders(withHosts(null));
    await save([expense(3, 1, 2000)]);
    expect(await screen.findByText('Límite global excedido: $10.00 de más hoy')).toBeTruthy();
    expect(screen.getByLabelText(es.caps.crossedViewLabel)).toBeTruthy();
  });

  it('View opens the Caps exceeded dialog; a row navigates as from Home', async () => {
    await renderWithProviders(withHosts(null));
    await save([expense(3, 1, 2000)]);
    await screen.findByText(GLOBAL_TEXT('$10.00'));
    fireEvent.press(screen.getByLabelText(en.caps.crossedViewLabel));
    expect(await screen.findByText(en.caps.listTitle)).toBeTruthy();

    fireEvent.press(
      screen.getByLabelText('Global cap, $110.00 of $100.00 today, over by $10.00'),
    );
    expect(mockPush).toHaveBeenCalledWith('/settings');
    await waitFor(() => expect(screen.queryByText(en.caps.listTitle)).toBeNull());
  });

  it('an account row in the dialog opens that account', async () => {
    seed({
      accounts: [checking, bbva],
      transactions: [expense(1, 2, 1000)],
      caps: [accountCap],
    });
    await renderWithProviders(withHosts(null));
    await save([expense(3, 2, 3000)]);
    await screen.findByText('BBVA cap exceeded: $10.00 over today');
    fireEvent.press(screen.getByLabelText(en.caps.crossedViewLabel));
    await screen.findByText(en.caps.listTitle);
    fireEvent.press(screen.getByLabelText('BBVA, $40.00 of $30.00 today, over by $10.00'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: 2 } });
  });

  it('a newer save replaces a pending snackbar', async () => {
    seed({
      accounts: [checking, bbva],
      transactions: [expense(1, 1, 9000)],
      caps: [globalCap, accountCap],
    });
    await renderWithProviders(withHosts(null));
    // A card is showing, so the notice stays pending.
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(2, 1, 2000)]);
    expect(useCapSnackbarStore.getState().pending?.notice.cap.accountId).toBeNull();
    // A newer save crosses the account cap only (the global cap is over already).
    await save([expense(3, 2, 4000)]);
    expect(useCapSnackbarStore.getState().pending?.notice).toMatchObject({
      cap: { accountId: 2 },
      name: 'BBVA',
      more: 0,
    });
    await closeCard();
    expect(await screen.findByText('BBVA cap exceeded: $10.00 over today')).toBeTruthy();
    expect(screen.queryByText(/^Global cap exceeded/)).toBeNull();
  });

  it('a newer save that crosses nothing leaves a pending snackbar alone, and it shows after the card', async () => {
    await renderWithProviders(withHosts(null));
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(2, 1, 2000)]);
    await save([expense(3, 1, 100)]);
    expect(useCapSnackbarStore.getState().pending).not.toBeNull();
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$11.00'))).toBeTruthy();
  });

  it('a newer save that crosses nothing leaves a showing snackbar alone', async () => {
    await renderWithProviders(withHosts(null));
    await save([expense(2, 1, 2000)]);
    await screen.findByText(GLOBAL_TEXT('$10.00'));
    await save([expense(3, 1, 100)]);
    expect(screen.getByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
    expect(useCapSnackbarStore.getState().current).not.toBeNull();
  });

  it('an edit that lowers the total under the cap before the card closes: no snackbar', async () => {
    await renderWithProviders(withHosts(null));
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(2, 1, 2000)]);
    expect(useCapSnackbarStore.getState().pending).not.toBeNull();
    // The edit: the new expense is lowered to 500 (total 9500, under 10000).
    act(() =>
      useTransactionsStore.setState((state) => ({
        transactions: state.transactions.map((item) =>
          item.id === 2 ? { ...item, amountCents: 500 } : item,
        ),
      })),
    );
    await save([]);
    await closeCard();
    expect(anySnackbar()).toBeNull();
    expect(useCapSnackbarStore.getState().pending).toBeNull();
    expect(useCapSnackbarStore.getState().current).toBeNull();
  });

  it('when only some caps are still exceeded at show time, the rest are shown, recomputed', async () => {
    seed({
      accounts: [checking, bbva],
      transactions: [expense(1, 1, 8000), expense(2, 2, 1000)],
      caps: [globalCap, accountCap],
    });
    await renderWithProviders(withHosts(null));
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(3, 2, 3000)]);
    expect(useCapSnackbarStore.getState().pending?.notice.more).toBe(1);
    // The global cap drops back under (an old expense is deleted); BBVA stays over.
    act(() =>
      useTransactionsStore.setState((state) => ({
        transactions: state.transactions.filter((item) => item.id !== 1),
      })),
    );
    await closeCard();
    expect(await screen.findByText('BBVA cap exceeded: $10.00 over today')).toBeTruthy();
    expect(screen.queryByText(/and 1 more/)).toBeNull();
  });

  it('a check that cannot run leaves existing notices alone: cold start, no default currency, caps not loaded', async () => {
    await renderWithProviders(withHosts(null));
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(2, 1, 2000)]);
    const pending = useCapSnackbarStore.getState().pending;
    expect(pending).not.toBeNull();

    // Transactions not loaded when the save began: partial "before".
    useTransactionsStore.setState({ status: 'loading' });
    const cold = beginCapWatch();
    expect(cold.before).toBeNull();
    useTransactionsStore.setState({ status: 'ready' });
    finishCapWatch(cold);
    expect(useCapSnackbarStore.getState().pending).toBe(pending);

    // Not loaded by the time it finishes.
    const watch = beginCapWatch();
    useTransactionsStore.setState({ status: 'loading' });
    finishCapWatch(watch);
    useTransactionsStore.setState({ status: 'ready' });
    expect(useCapSnackbarStore.getState().pending).toBe(pending);

    // No default currency in memory yet.
    rememberDefaultCurrency(null);
    await save([expense(9, 1, 5000)]);
    expect(useCapSnackbarStore.getState().pending).toBe(pending);
    rememberDefaultCurrency('USD');

    useCapsStore.setState({ status: 'error' });
    await save([expense(10, 1, 5000)]);
    expect(useCapSnackbarStore.getState().pending).toBe(pending);
  });

  it('a cold start never makes an already-over cap look newly crossed', async () => {
    seed({ transactions: [] });
    await renderWithProviders(withHosts(null));
    // Add screen opened before the list loaded: before is partial.
    useTransactionsStore.setState({ status: 'loading' });
    const watch = beginCapWatch();
    useTransactionsStore.setState({
      transactions: [expense(1, 1, 12000), expense(2, 1, 500)],
      status: 'ready',
    });
    finishCapWatch(watch);
    expect(useCapSnackbarStore.getState().pending).toBeNull();
  });

  it('a save that fails or was already handled never calls finish, so an older notice survives', async () => {
    await renderWithProviders(withHosts(null));
    act(() => showSuccess({ icon: 'check', tone: 'neutral', message: 'Saved' }));
    await save([expense(2, 1, 2000)]);
    const pending = useCapSnackbarStore.getState().pending;
    // A failed save: begin was called, finish never is.
    beginCapWatch();
    expect(useCapSnackbarStore.getState().pending).toBe(pending);
    await closeCard();
    expect(await screen.findByText(GLOBAL_TEXT('$10.00'))).toBeTruthy();
  });
});
