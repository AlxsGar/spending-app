import '@/test/pin-timezone';

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DateField } from '@/components/ui/DateField';
import { renderWithProviders } from '@/test/render';

let mockPickerProps: Record<string, unknown> = {};

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockPickerProps = props;
      return <View testID="date-picker" />;
    },
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const NOW = new Date(2026, 2, 10, 15, 20);
const TODAY = new Date(2026, 2, 10);

function setup(onChange = jest.fn()) {
  return {
    onChange,
    ui: (
      <DateField
        value={TODAY}
        onChange={onChange}
        locale="es"
        accessibilityLabel="Date"
        displayValue="Today"
        confirmLabel="Done"
        cancelLabel="Cancel"
      />
    ),
  };
}

const openCall = () => (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockPickerProps = {};
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('DateField on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('shows the given text and opens the native dialog at the current value', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    expect(screen.getByText('Today')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Date'));
    expect(openCall()).toMatchObject({ mode: 'date', value: TODAY });
  });

  it('blocks future days with maximumDate at the end of today, local', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    expect(openCall().maximumDate).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));
  });

  it('follows the clock past midnight each time it opens', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    jest.setSystemTime(new Date(2026, 2, 10, 23, 59));
    fireEvent.press(screen.getByLabelText('Date'));
    expect(openCall().maximumDate).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));

    jest.setSystemTime(new Date(2026, 2, 11, 0, 1));
    fireEvent.press(screen.getByLabelText('Date'));
    const second = (DateTimePickerAndroid.open as jest.Mock).mock.calls[1][0];
    expect(second.maximumDate).toEqual(new Date(2026, 2, 11, 23, 59, 59, 999));
  });

  it('confirming calls onChange with the picked local day', async () => {
    const { ui, onChange } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    act(() => {
      openCall().onChange({ type: 'set' }, new Date(2026, 2, 9, 17, 45));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 2, 9));
  });

  it('dismissing does not call onChange', async () => {
    const { ui, onChange } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    act(() => {
      openCall().onChange({ type: 'dismissed' }, undefined);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateField on iOS', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  it('opens a dark spinner limited to the end of today, starting on the value', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    expect(screen.queryByTestId('date-picker')).toBeNull();
    fireEvent.press(screen.getByLabelText('Date'));
    expect(await screen.findByTestId('date-picker')).toBeTruthy();
    expect(mockPickerProps).toMatchObject({
      mode: 'date',
      display: 'spinner',
      themeVariant: 'dark',
      locale: 'es',
      value: TODAY,
    });
    expect(mockPickerProps.maximumDate).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));
    expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  });

  it('Done calls onChange with the picked local day', async () => {
    const { ui, onChange } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    await screen.findByTestId('date-picker');
    act(() => {
      (mockPickerProps.onChange as (e: unknown, d: Date) => void)(
        { type: 'set' },
        new Date(2026, 2, 9, 22, 10),
      );
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Done'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 2, 9));
  });

  it('Cancel after picking does not call onChange', async () => {
    const { ui, onChange } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    await screen.findByTestId('date-picker');
    act(() => {
      (mockPickerProps.onChange as (e: unknown, d: Date) => void)(
        { type: 'set' },
        new Date(2026, 2, 5),
      );
    });
    fireEvent.press(screen.getByText('Cancel'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a reopened picker starts from the unchanged value, not the cancelled draft', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    fireEvent.press(screen.getByLabelText('Date'));
    await screen.findByTestId('date-picker');
    act(() => {
      (mockPickerProps.onChange as (e: unknown, d: Date) => void)({ type: 'set' }, new Date(2026, 2, 5));
    });
    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByLabelText('Date'));
    await screen.findByTestId('date-picker');
    expect(mockPickerProps.value).toEqual(TODAY);
  });
});
