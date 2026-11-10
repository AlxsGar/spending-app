import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import Svg, { Circle, Path } from 'react-native-svg';

import { HomeChart } from '@/components/home-chart';
import { AccountRangeChart } from '@/components/range-chart';
import { pointY } from '@/components/ui/LineChart';
import { getDefaultCurrency } from '@/services/accounts';
import type { Account } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import { useChartRangeStore } from '@/stores/chart-range-store';
import type { Transaction } from '@/services/transactions';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { chart } from '@/theme';

fakeAnimationTimers();

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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

// The range dropdown is its own title: its accessible label is "Range, <title>".
const rangeFields = () => screen.getAllByLabelText(/^Range, /);
const titleOf = (index = 0) =>
  (rangeFields()[index].props.accessibilityLabel as string)
    .replace('Range, ', '')
    .replace(/\s/g, ' ');
const choose = async (option: string, index = 0) => {
  fireEvent.press(rangeFields()[index]);
  await act(async () => {});
  fireEvent.press(screen.getByText(option));
  await act(async () => {});
};
const filterButtons = () => screen.getAllByLabelText('Custom range');
const chartElement = () => screen.getByTestId('line-chart');
const valueOf = () => chartElement().props.accessibilityValue.text as string;
const adjust = (actionName: 'increment' | 'decrement') =>
  act(() => {
    fireEvent(chartElement(), 'accessibilityAction', { nativeEvent: { actionName } });
  });
const layoutChart = (width = 350) =>
  act(async () => {
    fireEvent(chartElement(), 'layout', {
      nativeEvent: { layout: { width, height: 160, x: 0, y: 0 } },
    });
  });
const tapAt = (x: number) =>
  act(() => {
    fireGestureHandler(getByGestureTestId('chart-tap'), [
      { state: State.BEGAN, x },
      { state: State.ACTIVE, x },
      { state: State.END, x },
    ]);
  });
const dragTo = (...xs: number[]) =>
  act(() => {
    fireGestureHandler(getByGestureTestId('chart-pan'), [
      { state: State.BEGAN, x: xs[0] },
      ...xs.map((x) => ({ state: State.ACTIVE, x })),
      { state: State.END, x: xs[xs.length - 1] },
    ]);
  });
const labelsShown = () =>
  screen.queryAllByTestId(/^chart-label-/).map((node) => Number(node.props.testID.split('-')[2]));

beforeEach(() => {
  mockPush.mockClear();
  useChartRangeStore.setState({ pending: null });
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
    expect(titleOf()).toBe('Last 7 days');
    expect(screen.getByText('No movements in this period')).toBeTruthy();
    expect(filterButtons()).toHaveLength(1);
    expect(screen.queryByTestId('line-chart')).toBeNull();
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
    adjust('decrement');
    expect(valueOf()).toBe(`Nov 10: income ${mxn(0)}, expenses ${mxn(90000)}`);

    fireEvent.press(screen.getByLabelText('USD'));
    expect(screen.getByText(`Income ${usd(20000)} · Expenses ${usd(5000)}`)).toBeTruthy();
    expect(screen.getByLabelText('USD').props.accessibilityState.selected).toBe(true);
    // The selected day stays (the range did not change).
    expect(valueOf()).toBe(`Nov 10: income ${usd(0)}, expenses ${usd(0)}`);
    adjust('decrement');
    adjust('decrement');
    adjust('decrement');
    expect(valueOf()).toBe(`Nov 7: income ${usd(20000)}, expenses ${usd(5000)}`);

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
    expect(screen.getByText('No movements in this period')).toBeTruthy();
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
    await layoutChart();
    // Today's label is bold; the others are not.
    expect(text('11')).toBeTruthy();
    expect(text(`Nov 11: income ${mxn(0)}, expenses ${mxn(40000)}`)).toBeTruthy();

    // 350 px, 7 days: 50 px per day, so x 160 is day 3 (Nov 8).
    await tapAt(160);
    expect(text(`Nov 8: income ${mxn(300000)}, expenses ${mxn(0)}`)).toBeTruthy();
    const circles = screen.UNSAFE_getAllByType(Circle);
    expect(circles[3].props.r).toBe(chart.selectedDotRadius);
    expect(circles[TODAY].props.r).toBe(chart.dotRadius);
  });

  it('a press or move selects the nearest day for 7 days and clamps at the edges', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    await layoutChart();
    await tapAt(10);
    expect(valueOf()).toMatch(/^Nov 5:/);
    await tapAt(-40);
    expect(valueOf()).toMatch(/^Nov 5:/);
    await tapAt(1000);
    expect(valueOf()).toMatch(/^Nov 11:/);
    await dragTo(30, 120, 260);
    expect(valueOf()).toMatch(/^Nov 10:/);
    await dragTo(30, 120);
    expect(valueOf()).toMatch(/^Nov 7:/);
  });

  it('is one adjustable element with the title as label and the day as value', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    const element = chartElement();
    expect(element.props.accessibilityRole).toBe('adjustable');
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityLabel).toBe('Last 7 days');
    expect(valueOf()).toBe(`Nov 11: income ${mxn(0)}, expenses ${mxn(40000)}`);
    expect(element.props.accessibilityActions).toEqual([
      { name: 'increment' },
      { name: 'decrement' },
    ]);
    // No per-day buttons remain.
    expect(screen.queryByTestId('chart-day-0')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Nov \d+:/ })).toHaveLength(0);
  });

  it('increment and decrement move one day and clamp at the ends', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
    adjust('increment');
    expect(valueOf()).toMatch(/^Nov 11:/);
    adjust('decrement');
    expect(valueOf()).toMatch(/^Nov 10:/);
    for (let i = 0; i < 10; i++) adjust('decrement');
    expect(valueOf()).toBe(`Nov 5: income ${mxn(0)}, expenses ${mxn(0)}`);
    adjust('increment');
    expect(valueOf()).toMatch(/^Nov 6:/);
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
    adjust('decrement');
    adjust('decrement');
    adjust('decrement');
    expect(
      text(`Nov 8: income ${mxn(300000)}, expenses ${mxn(0)}`).props.accessibilityLiveRegion,
    ).toBe('polite');
  });

  it('shows the empty line for an account with no movements, with the range header', async () => {
    await renderWithProviders(
      <AccountRangeChart accountId={5} currency="MXN" transactions={transactions} />,
    );
    expect(screen.getByText('No movements in this period')).toBeTruthy();
    await choose('Last 30 days');
    expect(titleOf()).toBe('Last 30 days');
    expect(screen.getByText('No movements in this period')).toBeTruthy();
  });
});

describe('range chips', () => {
  // Nov 11 is today. Movements: Oct 10 (outside 30 days), Oct 20, Nov 1, Nov 11.
  const oct = (day: number) => new Date(2026, 9, day, 12);
  const transactions = [
    tx(1, 1, 'expense', 1000, oct(10)),
    tx(2, 1, 'expense', 2000, oct(20)),
    tx(3, 1, 'income', 30000, nov(1)),
    tx(4, 1, 'expense', 400000, nov(11)),
  ];
  const show = () =>
    renderWithProviders(
      <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />,
    );
  it('starts on 7 days with the dropdown as the title and an unselected filter button', async () => {
    await show();
    expect(titleOf()).toBe('Last 7 days');
    expect(filterButtons()[0].props.accessibilityState.selected).toBe(false);
    expect(text(`Income ${mxn(0)} · Expenses ${mxn(400000)}`)).toBeTruthy();
    // No separate title text and no range chips.
    expect(screen.queryByText('Last 7 days')).toBeNull();
    expect(screen.queryByLabelText('30 days')).toBeNull();
  });

  it('the dropdown lists the three presets with the current one checked', async () => {
    await show();
    fireEvent.press(rangeFields()[0]);
    await act(async () => {});
    expect(screen.getByText('Date range')).toBeTruthy();
    for (const label of ['Last 7 days', 'Last 30 days', 'This month']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Custom')).toBeNull();
  });

  it('lays out the header row, currency chips, totals, legend, chart, readout in order', async () => {
    await renderWithProviders(
      <HomeChart
        accounts={accounts}
        transactions={[tx(1, 1, 'expense', 90000, nov(10)), tx(2, 2, 'income', 20000, nov(7))]}
      />,
    );
    await screen.findByText(`Income ${mxn(0)} · Expenses ${mxn(90000)}`);
    const order = [
      rangeFields()[0],
      screen.getByLabelText('MXN'),
      text(`Income ${mxn(0)} · Expenses ${mxn(90000)}`),
      screen.getByText('Expenses'),
      chartElement(),
      text(`Nov 11: income ${mxn(0)}, expenses ${mxn(0)}`),
    ];
    const json = JSON.stringify(screen.toJSON());
    const positions = [
      json.indexOf('"Range, Last 7 days"'),
      json.indexOf('"MXN"'),
      json.indexOf('Income MX'),
      json.indexOf('"Expenses"'),
      json.indexOf('"line-chart"'),
      json.indexOf('Nov 11: income'),
    ];
    expect(order).toHaveLength(6);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // The filter button sits in the header row, right after the dropdown.
    expect(json.indexOf('"Custom range"')).toBeGreaterThan(positions[0]);
    expect(json.indexOf('"Custom range"')).toBeLessThan(positions[1]);
  });

  it('30 days: title, totals, thinned labels, selection reset to the last day', async () => {
    await show();
    await layoutChart();
    await tapAt(10);
    expect(valueOf()).toMatch(/^Nov 5:/);

    await choose('Last 30 days');
    expect(titleOf()).toBe('Last 30 days');
    expect(chartElement().props.accessibilityLabel).toBe('Last 30 days');
    expect(text(`Income ${mxn(30000)} · Expenses ${mxn(402000)}`)).toBeTruthy();
    expect(valueOf()).toBe(`Nov 11: income ${mxn(0)}, expenses ${mxn(400000)}`);
    expect(screen.UNSAFE_getAllByType(Circle)).toHaveLength(60);
    // 30 days thin out to every 5th day, starting with the first (Oct 13).
    expect(labelsShown()).toEqual([0, 5, 10, 15, 20, 25]);
    expect(text('13')).toBeTruthy();
    expect(screen.getByTestId('chart-label-5')).toBeTruthy();

    // 350 px / 30 days: x 0 is the first day, x 349 the last, x 175 the 15th.
    await tapAt(0);
    expect(valueOf()).toMatch(/^Oct 13:/);
    await tapAt(349);
    expect(valueOf()).toMatch(/^Nov 11:/);
    await tapAt(175);
    expect(valueOf()).toMatch(/^Oct 28:/);
    await dragTo(100, 130, 400);
    expect(valueOf()).toMatch(/^Nov 11:/);
  });

  it('a tap or pan that fails or never activates leaves the selection alone', async () => {
    await show();
    await layoutChart();
    await tapAt(10);
    expect(valueOf()).toMatch(/^Nov 5:/);
    act(() => {
      fireGestureHandler(getByGestureTestId('chart-tap'), [
        { state: State.BEGAN, x: 300 },
        { state: State.FAILED, x: 300 },
      ]);
      fireGestureHandler(getByGestureTestId('chart-pan'), [
        { state: State.BEGAN, x: 300 },
        { state: State.FAILED, x: 300 },
      ]);
      fireGestureHandler(getByGestureTestId('chart-pan'), [
        { state: State.BEGAN, x: 300 },
        { state: State.END, x: 300 },
      ]);
    });
    expect(valueOf()).toMatch(/^Nov 5:/);
  });

  it('switching back to 7 days selects today again', async () => {
    await show();
    await layoutChart();
    await tapAt(10);
    await choose('Last 30 days');
    await choose('Last 7 days');
    expect(valueOf()).toMatch(/^Nov 11:/);
  });

  it('this month runs from the 1st to today', async () => {
    await show();
    await layoutChart();
    await choose('This month');
    expect(titleOf()).toBe('This month');
    expect(text(`Income ${mxn(30000)} · Expenses ${mxn(400000)}`)).toBeTruthy();
    // 11 days: Nov 1 through Nov 11, labels thinned to every 2nd.
    expect(labelsShown()).toEqual([0, 2, 4, 6, 8, 10]);
    await tapAt(0);
    expect(valueOf()).toMatch(/^Nov 1: income/);
  });

  it('this month on the 1st is a single day', async () => {
    jest.setSystemTime(new Date(2026, 10, 1, 12));
    await show();
    await choose('This month');
    expect(valueOf()).toBe(`Nov 1: income ${mxn(30000)}, expenses ${mxn(0)}`);
    expect(labelsShown()).toEqual([0]);
  });

  describe('Custom (the screen hands its result over through the store)', () => {
    const apply = (chartId: string, from: string, to: string) =>
      act(async () => {
        useChartRangeStore.getState().apply({ chartId, from, to });
      });

    it('opens the Custom range screen prefilled with the current range', async () => {
      await show();
      fireEvent.press(filterButtons()[0]);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/chart-range',
        params: { chart: 'account-1', from: '2026-11-05', to: '2026-11-11' },
      });
      // Nothing changes until the screen applies something.
      expect(titleOf()).toBe('Last 7 days');
      expect(filterButtons()[0].props.accessibilityState.selected).toBe(false);
    });

    it('an applied range shows its dates in the dropdown with no preset checked, and the filter button selected', async () => {
      await show();
      await layoutChart();
      await apply('account-1', '2026-10-20', '2026-11-01');
      expect(filterButtons()[0].props.accessibilityState.selected).toBe(true);
      expect(titleOf()).toBe('Oct 20 – Nov 1');
      expect(normalizer(chartElement().props.accessibilityLabel)).toBe('Oct 20 – Nov 1');
      fireEvent.press(rangeFields()[0]);
      await act(async () => {});
      expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(3);
      for (const radio of screen.getAllByRole('radio')) {
        expect(radio.props.accessibilityState?.checked).toBeFalsy();
      }
      fireEvent.press(screen.getByText('Cancel'));
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      expect(text(`Income ${mxn(30000)} · Expenses ${mxn(2000)}`)).toBeTruthy();
      expect(valueOf()).toMatch(/^Nov 1:/);
      expect(useChartRangeStore.getState().pending).toBeNull();

      // The filter button reopens the screen, prefilled with this range.
      fireEvent.press(filterButtons()[0]);
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/chart-range',
        params: { chart: 'account-1', from: '2026-10-20', to: '2026-11-01' },
      });
    });

    it('picking a preset from a custom range switches back to it', async () => {
      await show();
      await apply('account-1', '2026-10-20', '2026-11-01');
      await choose('Last 30 days');
      expect(titleOf()).toBe('Last 30 days');
      expect(filterButtons()[0].props.accessibilityState.selected).toBe(false);
    });

    it('applying the same dates again resets the selection', async () => {
      await show();
      await layoutChart();
      await apply('account-1', '2026-10-20', '2026-11-01');
      await tapAt(0);
      expect(valueOf()).toMatch(/^Oct 20:/);
      await apply('account-1', '2026-10-20', '2026-11-01');
      expect(valueOf()).toMatch(/^Nov 1:/);
    });

    it('a range for another chart is ignored; Home and an account keep their own range', async () => {
      await renderWithProviders(
        <>
          <HomeChart accounts={accounts} transactions={transactions} />
          <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />
        </>,
      );
      // Home is first, the account second.
      expect([titleOf(0), titleOf(1)]).toEqual(['Last 7 days', 'Last 7 days']);
      await apply('account-1', '2026-10-20', '2026-11-01');
      expect([titleOf(0), titleOf(1)]).toEqual(['Last 7 days', 'Oct 20 – Nov 1']);
      await apply('home', '2026-10-01', '2026-10-31');
      expect([titleOf(0), titleOf(1)]).toEqual(['Oct 1 – 31', 'Oct 20 – Nov 1']);
    });

    it('a result nobody consumed is never replayed to a chart mounted later', async () => {
      await apply('account-1', '2026-10-20', '2026-11-01');
      expect(useChartRangeStore.getState().pending).not.toBeNull();
      await show();
      expect(titleOf()).toBe('Last 7 days');
      expect(filterButtons()[0].props.accessibilityState.selected).toBe(false);
    });

    it('a full year thins its labels to about seven', async () => {
      await show();
      await layoutChart();
      await apply('account-1', '2025-11-11', '2026-11-11');
      expect(labelsShown()).toEqual([0, 53, 106, 159, 212, 265, 318]);
      // 366 days: too narrow for dots, so only the selected day keeps its two.
      expect(screen.UNSAFE_getAllByType(Circle)).toHaveLength(2);
      // Under a pixel per day: the right edge clamps to the last day.
      await tapAt(350);
      expect(valueOf()).toMatch(/^Nov 11:/);
    });
  });

  it('each chart keeps its own range', async () => {
    await renderWithProviders(
      <>
        <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />
        <AccountRangeChart accountId={1} currency="MXN" transactions={transactions} />
      </>,
    );
    await choose('Last 30 days', 0);
    expect(titleOf(0)).toBe('Last 30 days');
    expect(titleOf(1)).toBe('Last 7 days');
  });
});
