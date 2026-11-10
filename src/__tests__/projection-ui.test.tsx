import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { useProjection } from '@/components/use-projection';
import { payOccurrence, skipOccurrence } from '@/services/recurring-actions';
import { useLedger } from '@/stores/ledger';
import { colors, sizes } from '@/theme';

import AccountDetailScreen from '@/app/account/[id]/index';
import HomeScreen from '@/app/(tabs)/index';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import { listRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { listCaps } from '@/services/soft-caps';
import { listTransactions } from '@/services/transactions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useCapsStore } from '@/stores/caps-store';
import { rememberDefaultCurrency } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
  getDefaultCurrency: jest.fn(),
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
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
  skipOccurrence: jest.fn(),
}));
jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

const account = (id: number, name: string, currency: 'USD' | 'MXN', balanceAnchorCents: number) => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents,
  balanceAnchorAt: null as string | null,
});

const usd = account(7, 'Savings', 'USD', 100000);
const mxn = account(8, 'Cash', 'MXN', 50000);

const payment = (
  id: number,
  accountId: number | null,
  amountCents: number,
  extra: Partial<RecurringPayment> = {},
): RecurringPayment => ({
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
  ...extra,
});

const money = (cents: number, currency: string) => formatMoney(cents, currency);

const load = async (
  accounts: ReturnType<typeof account>[],
  payments: RecurringPayment[],
  screenElement: React.ReactElement = <HomeScreen />,
) => {
  (listAccounts as jest.Mock).mockResolvedValue(accounts);
  (listRecurring as jest.Mock).mockResolvedValue(payments);
  return renderWithProviders(screenElement);
};

beforeEach(async () => {
  jest.setSystemTime(new Date(2026, 10, 10, 12));
  rememberDefaultCurrency(null);
  await i18n.changeLanguage('en');
  (getDefaultCurrency as jest.Mock).mockResolvedValue('MXN');
  (listTransactions as jest.Mock).mockResolvedValue([]);
  (listCaps as jest.Mock).mockResolvedValue([]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
});

describe('Home projection summary', () => {
  it('shows one line per currency, default currency first, between the chart and the cards', async () => {
    await load(
      [usd, mxn],
      [payment(1, 7, 30000), payment(2, 8, 10000), payment(3, null, 5000)],
    );
    expect(await screen.findByTestId('projection-summary')).toBeTruthy();
    // MXN (default): 500.00 - 100.00 - 50.00; USD: 1000.00 - 300.00.
    expect(screen.getByLabelText(`End of month, MXN: ${money(35000, 'MXN')}`)).toBeTruthy();
    expect(screen.getByLabelText(`End of month, USD: ${money(70000, 'USD')}`)).toBeTruthy();
    const codes = screen.getAllByText(/^(MXN|USD)$/).map((node) => node.props.children);
    // The summary's two codes come before the cards' own currency captions.
    expect(codes.slice(0, 2)).toEqual(['MXN', 'USD']);
    const order = screen
      .getAllByText(/^(End of month balance projection|Savings|Cash)$/)
      .map((node) => node.props.children);
    expect(order).toEqual(['End of month balance projection', 'Savings', 'Cash']);
  });

  it('shows the lines even when nothing is due (projection equals the balance)', async () => {
    await load([usd], []);
    expect(
      await screen.findByLabelText(`End of month, USD: ${money(100000, 'USD')}`),
    ).toBeTruthy();
  });

  it('shows a default-currency line when only unassigned payments are due and no account uses it', async () => {
    await load([usd], [payment(1, null, 5000)]);
    expect(
      await screen.findByLabelText(`End of month, MXN: −${money(5000, 'MXN')}`),
    ).toBeTruthy();
  });

  it('shows nothing until the recurring payments load, and nothing when they fail to', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([usd]);
    (listRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.queryByTestId('projection-summary')).toBeNull();
    expect(screen.queryByText(/^End of month:/)).toBeNull();
    spy.mockRestore();
  });

  it('is translated to Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([usd], []);
    expect(await screen.findByText(es.projection.title)).toBeTruthy();
    expect(screen.getByText(`Fin de mes: ${money(100000, 'USD')}`)).toBeTruthy();
  });

  it('updates after a payment change', async () => {
    await load([usd], [payment(1, 7, 30000)]);
    expect(await screen.findByLabelText(`End of month, USD: ${money(70000, 'USD')}`)).toBeTruthy();
    act(() => {
      useRecurringStore.setState({ payments: [payment(1, 7, 30000, { lastConfirmedAt: '2026-11-20' })] });
    });
    expect(screen.getByLabelText(`End of month, USD: ${money(100000, 'USD')}`)).toBeTruthy();
  });

  it('updates after a transaction change', async () => {
    await load([usd], [payment(1, 7, 30000)]);
    expect(await screen.findByLabelText(`End of month, USD: ${money(70000, 'USD')}`)).toBeTruthy();
    act(() => {
      useTransactionsStore.getState().addExisting({
        id: 1,
        accountId: 7,
        kind: 'expense',
        amountCents: 20000,
        date: new Date(2026, 10, 10, 11).toISOString(),
        note: null,
        recurringId: null,
        recurringOccurrence: null,
        createdAt: new Date(2026, 10, 10, 11).toISOString(),
      });
    });
    expect(screen.getByLabelText(`End of month, USD: ${money(50000, 'USD')}`)).toBeTruthy();
  });

  it('rolls the window over when the month changes', async () => {
    jest.setSystemTime(new Date(2026, 10, 30, 23, 59));
    // Paid on Nov 20: nothing due in November, the Dec 20 one is due in December.
    await load([usd], [payment(1, 7, 30000, { lastConfirmedAt: '2026-11-20' })]);
    expect(await screen.findByLabelText(`End of month, USD: ${money(100000, 'USD')}`)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(screen.getByLabelText(`End of month, USD: ${money(70000, 'USD')}`)).toBeTruthy();
  });
});

describe('Home summary info button', () => {
  it('has the new title in English', async () => {
    await load([usd], []);
    expect(await screen.findByText('End of month balance projection')).toBeTruthy();
  });

  it('has the new title in Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([usd], []);
    expect(await screen.findByText('Proyección del saldo a fin de mes')).toBeTruthy();
  });

  it('has an (i) button with a label and a 48 px target', async () => {
    await load([usd], []);
    const button = await screen.findByLabelText('About the end of month projection');
    // The sized element is the button itself or one of its host wrappers.
    let node: typeof button | null = button;
    let style = StyleSheet.flatten(node.props.style);
    while (node && style?.width === undefined) {
      node = node.parent;
      style = node ? StyleSheet.flatten(node.props.style) : style;
    }
    expect(style.width).toBe(sizes.touchTarget);
    expect(style.height).toBe(sizes.touchTarget);
    expect(sizes.touchTarget).toBe(48);
  });

  it('opens the dialog with the title and the explanation, and Got it closes it', async () => {
    await load([usd], []);
    fireEvent.press(await screen.findByLabelText(en.projection.infoLabel));
    expect(await screen.findByText(en.projection.infoIntro)).toBeTruthy();
    // The title shows in the summary and in the dialog.
    expect(screen.getAllByText(en.projection.title)).toHaveLength(2);
    expect(screen.getByText(en.projection.infoHow)).toBeTruthy();
    expect(screen.getByText(en.projection.infoCounts)).toBeTruthy();
    expect(screen.getByText(en.projection.infoNotCounts)).toBeTruthy();
    expect(screen.getByText(en.projection.infoAccounts)).toBeTruthy();
    expect(screen.getByText(en.projection.infoCurrencies)).toBeTruthy();
    expect(screen.getByText(en.projection.infoOnlyRecurring)).toBeTruthy();
    // Literal wording, so a drift in the copy fails here. No "card": it could be
    // read as a credit or debit card.
    expect(
      screen.getByText(
        'Counts: overdue payments that are still unpaid, and every remaining occurrence this month (a weekly payment can count several times).',
      ),
    ).toBeTruthy();
    expect(en.projection.infoCounts.toLowerCase()).not.toContain('card');
    expect(es.projection.infoCounts.toLowerCase()).not.toContain('tarjeta');
    expect(screen.getAllByText('End of month balance projection')).toHaveLength(2);
    expect(
      screen.getByText('Only recurring payments are projected; one-off spending isn’t.'),
    ).toBeTruthy();
    // The bullet glyphs are hidden from screen readers.
    const glyphs = screen.getAllByText('•', { includeHiddenElements: true });
    expect(glyphs).toHaveLength(5);
    expect(screen.queryAllByText('•')).toHaveLength(0);
    fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByText(en.projection.infoIntro)).toBeNull());
  });

  it('shows the explanation in Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([usd], []);
    fireEvent.press(await screen.findByLabelText('Acerca de la proyección a fin de mes'));
    expect(await screen.findByText(es.projection.infoIntro)).toBeTruthy();
    expect(screen.getByText(es.projection.infoHow)).toBeTruthy();
    expect(screen.getByText(es.projection.infoOnlyRecurring)).toBeTruthy();
    expect(screen.getByText('Entendido')).toBeTruthy();
  });
});

describe('account card and account detail lines', () => {
  it('the Home card shows the account line', async () => {
    await load([usd], [payment(1, 7, 30000), payment(2, null, 99900)]);
    expect(
      await screen.findByText(`End of month: ${money(70000, 'USD')}`),
    ).toBeTruthy();
  });

  it('a negative projection carries a minus sign', async () => {
    await load([usd], [payment(1, 7, 130000)]);
    expect(
      await screen.findByText(`End of month: −${money(30000, 'USD')}`),
    ).toBeTruthy();
  });

  it('account detail shows the line for that account only, under the balance', async () => {
    await load([usd, mxn], [payment(1, 7, 30000), payment(2, 8, 10000)], <AccountDetailScreen />);
    expect(await screen.findByText(`End of month: ${money(70000, 'USD')}`)).toBeTruthy();
    expect(screen.queryByText(`End of month: ${money(40000, 'MXN')}`)).toBeNull();
  });

  it('account detail orders the balance, the projection line, then the cap line', async () => {
    (listCaps as jest.Mock).mockResolvedValue([
      { id: 1, accountId: 7, period: 'day', amountCents: 200000 },
    ]);
    await load([usd], [payment(1, 7, 30000)], <AccountDetailScreen />);
    await screen.findByText(`End of month: ${money(70000, 'USD')}`);
    await screen.findByText(/\d of /);
    const order = screen
      .getAllByText(/^\$1,000\.00$|^End of month: |\d of /)
      .map((node) => node.props.children);
    expect(order).toEqual([
      money(100000, 'USD'),
      `End of month: ${money(70000, 'USD')}`,
      `${money(0, 'USD')} of ${money(200000, 'USD')} today`,
    ]);
  });

  it('account detail hides the line while the recurring payments load', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([usd]);
    (listRecurring as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(money(100000, 'USD'))).toBeTruthy();
    expect(screen.queryByText(/^End of month:/)).toBeNull();
  });

  it('account detail hides the line when the recurring payments fail to load', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (listAccounts as jest.Mock).mockResolvedValue([usd]);
    (listRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText(money(100000, 'USD'))).toBeTruthy();
    await screen.findByText(en.common.loadError);
    expect(screen.queryByText(/^End of month:/)).toBeNull();
    spy.mockRestore();
  });

  it('account detail line is in Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([usd], [payment(1, 7, 30000)], <AccountDetailScreen />);
    expect(await screen.findByText(`Fin de mes: ${money(70000, 'USD')}`)).toBeTruthy();
  });

  it('the card label includes the projection', async () => {
    await load([usd], [payment(1, 7, 30000)]);
    expect(
      await screen.findByLabelText(
        `Savings, balance ${money(100000, 'USD')}, end of month ${money(70000, 'USD')}, currency USD`,
      ),
    ).toBeTruthy();
  });

  it('the card label includes the projection in Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([usd], [payment(1, 7, 30000)]);
    expect(
      await screen.findByLabelText(
        `Savings, saldo ${money(100000, 'USD')}, fin de mes ${money(70000, 'USD')}, moneda USD`,
      ),
    ).toBeTruthy();
  });

  it('the Home summary amounts are secondary text, not colored', async () => {
    await load([usd], [payment(1, 7, 130000)]);
    const line = await screen.findByLabelText(`End of month, USD: −${money(30000, 'USD')}`);
    const amount = within(line).getByText(`−${money(30000, 'USD')}`);
    expect(StyleSheet.flatten(amount.props.style).color).toBe(colors.textSecondary);
  });
});

// Only claims that no intermediate value is RENDERED. React batches the two store
// updates of a pay into one render, so this passes in either update order; the
// order itself is pinned by projection-order.test.ts.
describe('rendered projection while paying a recurring payment', () => {
  const Probe = ({ record }: { record: (cents: number | undefined) => void }) => {
    const { accounts, balances } = useLedger();
    const { perAccount } = useProjection(accounts, balances);
    record(perAccount?.[7]);
    return null;
  };

  it('renders no intermediate value below the final one while the pay lands', async () => {
    (payOccurrence as jest.Mock).mockResolvedValue({
      transaction: {
        id: 900,
        accountId: 7,
        kind: 'expense',
        amountCents: 30000,
        date: new Date(2026, 10, 10, 12).toISOString(),
        note: null,
        recurringId: 1,
        recurringOccurrence: '2026-11-20',
        createdAt: new Date(2026, 10, 10, 12).toISOString(),
      },
      payment: payment(1, 7, 30000, { lastConfirmedAt: '2026-11-20' }),
    });
    const seen: number[] = [];
    await load(
      [usd],
      [payment(1, 7, 30000)],
      <Probe record={(cents) => cents !== undefined && seen.push(cents)} />,
    );
    await waitFor(() => expect(seen).toContain(70000));
    seen.length = 0;
    await act(async () => {
      await useRecurringStore.getState().pay(1, '2026-11-20', 7);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(70000);
    // Final is 70000: nothing lower (a double subtraction would show 40000).
    expect(Math.min(...seen)).toBe(70000);
  });

  it('skipping changes only the payment, so the projection goes up once', async () => {
    (skipOccurrence as jest.Mock).mockResolvedValue(
      payment(1, 7, 30000, { lastConfirmedAt: '2026-11-20' }),
    );
    const seen: number[] = [];
    await load(
      [usd],
      [payment(1, 7, 30000)],
      <Probe record={(cents) => cents !== undefined && seen.push(cents)} />,
    );
    await waitFor(() => expect(seen).toContain(70000));
    seen.length = 0;
    await act(async () => {
      await useRecurringStore.getState().skip(1, '2026-11-20');
    });
    expect(Math.min(...seen)).toBe(100000);
  });
});
