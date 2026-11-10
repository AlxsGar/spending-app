import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import ChartRangeScreen from '@/app/chart-range';
import { useChartRangeStore } from '@/stores/chart-range-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
const mockScreenOptions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      mockScreenOptions(options);
      return null;
    },
  },
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

beforeEach(() => {
  jest.setSystemTime(new Date(2026, 10, 11, 12, 0, 0));
  jest.replaceProperty(Platform, 'OS', 'android');
  (DateTimePickerAndroid.open as jest.Mock).mockClear();
  mockBack.mockClear();
  mockScreenOptions.mockClear();
  mockParams = { chart: 'home', from: '2026-11-05', to: '2026-11-11' };
  useChartRangeStore.setState({ pending: null });
});

const pickDate = (field: 'From' | 'To', date: Date) => {
  fireEvent.press(screen.getByLabelText(field));
  const calls = (DateTimePickerAndroid.open as jest.Mock).mock.calls;
  const options = calls[calls.length - 1][0];
  act(() => {
    options.onChange({ type: 'set' }, date);
  });
};

describe('Custom range screen', () => {
  it('is a normal stack screen titled Custom range, prefilled with the range it was opened with', async () => {
    await renderWithProviders(<ChartRangeScreen />);
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: 'Custom range' });
    expect(screen.getByLabelText('From')).toHaveTextContent(/Nov 5, 2026$/);
    expect(screen.getByLabelText('To')).toHaveTextContent(/Nov 11, 2026$/);
  });

  const lastOpen = () => {
    const calls = (DateTimePickerAndroid.open as jest.Mock).mock.calls;
    return calls[calls.length - 1][0];
  };
  const openField = (field: 'From' | 'To') => {
    fireEvent.press(screen.getByLabelText(field));
    return lastOpen();
  };
  const endOf = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999);

  it('bounds From to [To minus a year, To] and To to [From, today]', async () => {
    await renderWithProviders(<ChartRangeScreen />);
    // Range Nov 5 to Nov 11 2026, today Nov 11.
    const from = openField('From');
    expect(from.minimumDate).toEqual(new Date(2025, 10, 11));
    expect(from.maximumDate).toEqual(endOf(2026, 10, 11));
    const to = openField('To');
    expect(to.minimumDate).toEqual(new Date(2026, 10, 5));
    expect(to.maximumDate).toEqual(endOf(2026, 10, 11));
  });

  it('the bounds follow the other field: a far-back From caps To at one year after it', async () => {
    jest.setSystemTime(new Date(2027, 5, 1, 12));
    mockParams = { chart: 'home', from: '2026-01-10', to: '2026-01-20' };
    await renderWithProviders(<ChartRangeScreen />);
    // To may reach one year after From (Jan 10 2027), which is before today.
    expect(openField('To').maximumDate).toEqual(endOf(2027, 0, 10));
    // From may go back one year before To.
    expect(openField('From').minimumDate).toEqual(new Date(2025, 0, 20));
    pickDate('To', new Date(2027, 0, 10));
    // With To at that edge, From can no longer move earlier than Jan 10 2026.
    expect(openField('From').minimumDate).toEqual(new Date(2026, 0, 10));
  });

  it('counts a Feb 29 in the one-year edge', async () => {
    jest.setSystemTime(new Date(2025, 5, 1, 12));
    mockParams = { chart: 'home', from: '2025-02-01', to: '2025-03-01' };
    await renderWithProviders(<ChartRangeScreen />);
    // Feb 29 2024 plus a year is Mar 1 2025, so it is still allowed; Feb 28 is not.
    expect(openField('From').minimumDate).toEqual(new Date(2024, 1, 29));
  });

  it('from a Feb 29 From, To may reach Mar 1 of the next year', async () => {
    jest.setSystemTime(new Date(2025, 5, 1, 12));
    mockParams = { chart: 'home', from: '2024-02-29', to: '2024-03-10' };
    await renderWithProviders(<ChartRangeScreen />);
    expect(openField('To').maximumDate).toEqual(endOf(2025, 2, 1));
  });

  it('ignores a value outside the bounds and keeps the last valid one', async () => {
    await renderWithProviders(<ChartRangeScreen />);
    pickDate('From', new Date(2026, 10, 12));
    expect(screen.getByLabelText('From')).toHaveTextContent(/Nov 5, 2026$/);
    pickDate('From', new Date(2025, 10, 10));
    expect(screen.getByLabelText('From')).toHaveTextContent(/Nov 5, 2026$/);
    pickDate('To', new Date(2026, 10, 4));
    expect(screen.getByLabelText('To')).toHaveTextContent(/Nov 11, 2026$/);
    pickDate('To', new Date(2026, 10, 12));
    expect(screen.getByLabelText('To')).toHaveTextContent(/Nov 11, 2026$/);
    // The edges themselves are allowed.
    pickDate('From', new Date(2025, 10, 11));
    expect(screen.getByLabelText('From')).toHaveTextContent(/Nov 11, 2025$/);
    // No error text exists any more.
    expect(screen.queryByText(/must not be after|cannot be in the future|at most one year/)).toBeNull();
    fireEvent.press(screen.getByText('Apply'));
    expect(useChartRangeStore.getState().pending).toEqual({
      chartId: 'home',
      from: '2025-11-11',
      to: '2026-11-11',
    });
  });

  it('a valid range is handed to the chart that opened it and the screen closes', async () => {
    mockParams = { chart: 'account-7', from: '2026-11-05', to: '2026-11-11' };
    await renderWithProviders(<ChartRangeScreen />);
    pickDate('From', new Date(2026, 9, 20));
    pickDate('To', new Date(2026, 10, 1));
    fireEvent.press(screen.getByText('Apply'));
    expect(useChartRangeStore.getState().pending).toEqual({
      chartId: 'account-7',
      from: '2026-10-20',
      to: '2026-11-01',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('without a chart param Apply only goes back', async () => {
    mockParams = { from: '2026-11-05', to: '2026-11-11' };
    await renderWithProviders(<ChartRangeScreen />);
    fireEvent.press(screen.getByText('Apply'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(useChartRangeStore.getState().pending).toBeNull();
  });

  it('Cancel goes back and changes nothing', async () => {
    await renderWithProviders(<ChartRangeScreen />);
    pickDate('From', new Date(2026, 9, 1));
    fireEvent.press(screen.getByText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(useChartRangeStore.getState().pending).toBeNull();
  });

  it('falls back to today when the params are missing', async () => {
    mockParams = {};
    await renderWithProviders(<ChartRangeScreen />);
    expect(screen.getByLabelText('From')).toHaveTextContent(/Nov 11, 2026$/);
    expect(screen.getByLabelText('To')).toHaveTextContent(/Nov 11, 2026$/);
  });
});
