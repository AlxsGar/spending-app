import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { HomeChart } from '@/components/home-chart';
import { AccountRangeChart } from '@/components/range-chart';
import { pointY } from '@/components/ui/LineChart';
import { getDefaultCurrency } from '@/services/accounts';
import type { Account } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import type { Transaction } from '@/services/transactions';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { chart } from '@/theme';

fakeAnimationTimers();

jest.mock('@/services/accounts', () => ({
  getDefaultCurrency: jest.fn().mockResolvedValue('MXN'),
  FALLBACK_CURRENCY: 'MXN',
}));

const account = (id: number, currency: 'USD' | 'MXN' | 'EUR'): Account => ({
  id,
  name: `Account ${id}`,
  icon: 'bank',
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
});

const tx = (
  id: number,
  accountId: number,
  kind: 'income' | 'expense',
  amountCents: number,
  date: Date,
): Transaction => ({
  id,
  accountId,
  kind,
  amountCents,
  date: date.toISOString(),
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: date.toISOString(),
});

// Today is Wednesday Nov 11 2026: the window is Nov 5 through Nov 11 (index 6 is today).
const TODAY = 6;
const nov = (day: number) => new Date(2026, 10, day, 12);

const usd = (cents: number) => formatMoney(cents, 'USD');
const mxn = (cents: number) => formatMoney(cents, 'MXN');

// Locales may use thin or no-break spaces.
const normalizer = (text: string) => text.replace(/\s/g, ' ');
const text = (value: string) => screen.getByText(value, { normalizer });

const accounts = [account(1, 'MXN'), account(2, 'USD')];

const selectedOf = (index: number) =>
  screen.getByTestId(`chart-day-${index}`).props.accessibilityState?.selected;

beforeEach(() => {
  jest.setSystemTime(new Date(2026, 10, 11, 12, 0, 0));
  (getDefaultCurrency as jest.Mock).mockResolvedValue('MXN');
});

describe('HomeChart', () => {
  it('shows the title and the empty line, no chart and no chips, with no movements in the range', async () => {
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        // Before the range, and a deleted account's movement.
        transactions={[
          tx(1, 1, 'expense', 100, nov(4)),
          tx(2, 99, 'expense', 100, nov(8)),
        ]}
      />,
    );
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    expect(screen.getByText('No movements in the last 7 days')).toBeTruthy();
    expect(screen.queryByTestId('chart-day-0')).toBeNull();
    expect(screen.queryByText('MXN')).toBeNull();
    expect(screen.queryByText('USD')).toBeNull();
  });

  it('with one currency shows its totals and legend, without chips', async () => {
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        transactions={[
          tx(1, 2, 'income', 500000, nov(8)),
          tx(2, 2, 'expense', 120000, nov(9)),
        ]}
      />,
    );
    expect(text(`Income ${usd(500000)} · Expenses ${usd(120000)}`)).toBeTruthy();
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.queryByText('USD')).toBeNull();
    expect(screen.queryByText('MXN')).toBeNull();
    // All seven day labels: 5 through 11.
    for (const day of [5, 6, 7, 8, 9, 10, 11]) {
      expect(screen.getByText(String(day))).toBeTruthy();
    }
  });

  it('with two currencies selects the default first, and chips switch totals and points', async () => {
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        transactions={[
          tx(1, 1, 'expense', 90000, nov(10)),
          tx(2, 2, 'income', 20000, nov(7)),
          tx(3, 2, 'expense', 5000, nov(7)),
        ]}
      />,
    );
    expect(await screen.findByText(`Income ${mxn(0)} · Expenses ${mxn(90000)}`)).toBeTruthy();
    expect(screen.getByLabelText('MXN').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('chart-day-5').props.accessibilityLabel).toBe(
      `Nov 10: income ${mxn(0)}, expenses ${mxn(90000)}`,
    );

    fireEvent.press(screen.getByLabelText('USD'));
    expect(screen.getByText(`Income ${usd(20000)} · Expenses ${usd(5000)}`)).toBeTruthy();
    expect(screen.getByLabelText('USD').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('chart-day-2').props.accessibilityLabel).toBe(
      `Nov 7: income ${usd(20000)}, expenses ${usd(5000)}`,
    );
    expect(screen.getByTestId('chart-day-5').props.accessibilityLabel).toBe(
      `Nov 10: income ${usd(0)}, expenses ${usd(0)}`,
    );

    // Tapping the selected chip keeps it.
    fireEvent.press(screen.getByLabelText('USD'));
    expect(screen.getByText(`Income ${usd(20000)} · Expenses ${usd(5000)}`)).toBeTruthy();
  });

  it('counts currencies from the range only: a currency used earlier gets no chip', async () => {
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        transactions={[tx(1, 1, 'expense', 100, nov(10)), tx(2, 2, 'expense', 200, nov(3))]}
      />,
    );
    expect(await screen.findByText(`Income ${mxn(0)} · Expenses ${mxn(100)}`)).toBeTruthy();
    expect(screen.queryByText('USD')).toBeNull();
  });

  it('without the default among them picks the first currency alphabetically', async () => {
    (getDefaultCurrency as jest.Mock).mockResolvedValue('EUR');
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        transactions={[tx(1, 1, 'expense', 100, nov(10)), tx(2, 2, 'expense', 200, nov(10))]}
      />,
    );
    expect(await screen.findByText(`Income ${mxn(0)} · Expenses ${mxn(100)}`)).toBeTruthy();
  });

  it('shifts the window at the day change', async () => {
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      type: string,
      handler: (state: string) => void,
    ) => {
      if (type === 'change') handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
    await renderWithProviders(
      <HomeChart accounts={accounts} transactions={[tx(1, 2, 'expense', 100, nov(5))]} />,
    );
    expect(screen.getByText(`Income ${usd(0)} · Expenses ${usd(100)}`)).toBeTruthy();

    // The phone slept past midnight: Nov 5 is no longer in the last 7 days.
    jest.setSystemTime(new Date(2026, 10, 12, 9, 0, 0));
    await act(async () => {
      handlers.forEach((handler) => handler('active'));
    });
    expect(screen.getByText('No movements in the last 7 days')).toBeTruthy();
    jest.restoreAllMocks();
  });
});

describe('AccountRangeChart', () => {
  const transactions = [
    tx(1, 1, 'income', 300000, nov(8)),
    tx(2, 1, 'expense', 40000, nov(11)),
    tx(3, 2, 'expense', 777700, nov(11)),
  ];

  it('charts only that account, in its currency, with no chips', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    expect(text(`Income ${mxn(300000)} · Expenses ${mxn(40000)}`)).toBeTruthy();
    expect(screen.queryByText('MXN')).toBeNull();
  });

  it('selects today first and reads out the tapped day', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    expect(selectedOf(TODAY)).toBe(true);
    expect(selectedOf(3)).toBe(false);
    expect(text(`Nov 11: income ${mxn(0)}, expenses ${mxn(40000)}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId('chart-day-3'));
    expect(selectedOf(3)).toBe(true);
    expect(selectedOf(TODAY)).toBe(false);
    expect(text(`Nov 8: income ${mxn(300000)}, expenses ${mxn(0)}`)).toBeTruthy();
  });

  it('gives each day one button with its label and selected state', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    const day = screen.getByTestId('chart-day-3');
    expect(day.props.accessibilityRole).toBe('button');
    expect(day.props.accessibilityLabel).toBe(
      `Nov 8: income ${mxn(300000)}, expenses ${mxn(0)}`,
    );
    expect(screen.getByTestId('chart-day-0').props.accessibilityLabel).toBe(
      `Nov 5: income ${mxn(0)}, expenses ${mxn(0)}`,
    );
    expect(screen.queryByTestId('chart-day-7')).toBeNull();
  });

  it('draws the lines once it has a width', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    // Before layout only the two legend samples exist: no lines are drawn yet.
    expect(screen.UNSAFE_getAllByType(Svg)).toHaveLength(2);
    expect(screen.UNSAFE_queryAllByType(Path)).toHaveLength(0);
    await act(async () => {
      fireEvent(screen.getByTestId('line-chart'), 'layout', {
        nativeEvent: { layout: { width: 350, height: 160, x: 0, y: 0 } },
      });
    });
    expect(screen.UNSAFE_getAllByType(Svg)).toHaveLength(3);
    const [income, expenses] = screen.UNSAFE_getAllByType(Path);
    expect(screen.UNSAFE_getAllByType(Path)).toHaveLength(2);

    // 350 px wide, 7 days: points at 25, 75, ... 325. The largest value (the
    // 300000 income on day 3) is at the top inset, zero at the bottom inset.
    const top = chart.plotInset;
    const bottom = chart.plotHeight - chart.plotInset;
    expect(income.props.d).toBe(
      `M25 ${bottom} L75 ${bottom} L125 ${bottom} L175 ${top} L225 ${bottom} L275 ${bottom} L325 ${bottom}`,
    );
    expect(income.props.strokeDasharray).toBeUndefined();
    // Expenses are dashed; today's 40000 sits at 40000 / 300000 of the height.
    expect(expenses.props.strokeDasharray).toEqual([...chart.dashArray]);
    expect(expenses.props.d.endsWith(`L325 ${pointY(40000, 300000)}`)).toBe(true);

    const circles = screen.UNSAFE_getAllByType(Circle);
    expect(circles).toHaveLength(14);
    // Income dot of day 3, then the expense dot of today (the selected one is bigger).
    expect(circles[3].props.cx).toBe(175);
    expect(circles[3].props.cy).toBe(top);
    expect(circles[13].props.cx).toBe(325);
    expect(circles[13].props.cy).toBe(pointY(40000, 300000));
    expect(circles[13].props.r).toBe(chart.selectedDotRadius);
    expect(circles[12].props.r).toBe(chart.dotRadius);
  });

  it('announces the readout as a polite live region', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    const readout = text(`Nov 11: income ${mxn(0)}, expenses ${mxn(40000)}`);
    expect(readout.props.accessibilityLiveRegion).toBe('polite');
    fireEvent.press(screen.getByTestId('chart-day-3'));
    expect(
      text(`Nov 8: income ${mxn(300000)}, expenses ${mxn(0)}`).props.accessibilityLiveRegion,
    ).toBe('polite');
  });

  it('shows the empty line for an account with no movements', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={5} currency="MXN" transactions={transactions} />,
    );
    expect(screen.getByText('No movements in the last 7 days')).toBeTruthy();
  });
});
