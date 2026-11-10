import { act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { AppGate } from '@/components/app-gate';
import { NotificationHost } from '@/components/notification-host';
import { requestReminderSync } from '@/services/reminders';
import { useLanguageStore } from '@/stores/language-store';
import { useNotificationTapStore } from '@/stores/notification-taps';
import { renderWithProviders } from '@/test/render';

const mockNavigate = jest.fn();
let mockNavigationKey: string | undefined = 'root';
let mockLoadLanguage: () => Promise<void>;

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  function MockStack() {
    return <Text>app ready</Text>;
  }
  MockStack.Screen = function MockStackScreen() {
    return null;
  };
  return {
    Stack: MockStack,
    useRouter: () => ({ navigate: mockNavigate }),
    useRootNavigationState: () => ({ key: mockNavigationKey }),
  };
});
// AppGate reads the default currency at start; keep that read off the real db.
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  getDefaultCurrency: jest.fn().mockResolvedValue('MXN'),
}));
jest.mock('@/services/db', () => ({ initDb: jest.fn().mockResolvedValue(undefined) }));
// The gate's start waits for the old-language-setting cleanup; the test holds it
// open to keep the app "loading". The device language stays English.
jest.mock('@/services/language', () => ({
  getDeviceLanguage: () => 'en',
  removeLegacyLanguageSetting: () => mockLoadLanguage(),
}));

const sync = requestReminderSync as jest.Mock;
let appStateListener: (state: string) => void = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigationKey = 'root';
  mockLoadLanguage = () => Promise.resolve();
  useNotificationTapStore.setState({ pending: null });
  useLanguageStore.setState({ language: 'en', ready: false });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const tap = { recurringId: 7, occurrence: '2026-11-20' };

describe('NotificationHost: tap routing', () => {
  it('opens the Recurring payments screen with the payment, occurrence and a tap number', async () => {
    await renderWithProviders(<NotificationHost />);
    act(() => useNotificationTapStore.getState().push(tap));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    const { params, pathname } = mockNavigate.mock.calls[0][0];
    expect(pathname).toBe('/recurring');
    expect(params).toMatchObject({ open: '7', occ: '2026-11-20' });
    expect(Number(params.n)).toBeGreaterThan(0);
  });

  it('routes a tap that arrived before it was mounted (cold start), once', async () => {
    useNotificationTapStore.getState().push(tap);
    await renderWithProviders(<NotificationHost />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(useNotificationTapStore.getState().pending).toBeNull();
  });

  it('waits for the navigator to exist', async () => {
    mockNavigationKey = undefined;
    useNotificationTapStore.getState().push(tap);
    const view = await renderWithProviders(<NotificationHost />);
    expect(mockNavigate).not.toHaveBeenCalled();
    mockNavigationKey = 'root';
    await view.rerender(<NotificationHost />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });

  it('gives every tap its own number, so tapping the same reminder again routes again', async () => {
    await renderWithProviders(<NotificationHost />);
    act(() => useNotificationTapStore.getState().push(tap));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    act(() => useNotificationTapStore.getState().push(tap));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(2));
    expect(mockNavigate.mock.calls[0][0].params.n).not.toBe(mockNavigate.mock.calls[1][0].params.n);
  });

  it('on a cold start waits behind the gate until the app data is loaded', async () => {
    let finish: () => void = () => {};
    mockLoadLanguage = () => new Promise((resolve) => (finish = resolve));
    useNotificationTapStore.getState().push(tap);
    await renderWithProviders(<AppGate />);
    // Still loading: nothing may navigate yet, the tap is queued.
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useNotificationTapStore.getState().pending).not.toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });
});

describe('NotificationHost: keeping reminders in step', () => {
  it('syncs when the app opens', async () => {
    await renderWithProviders(<NotificationHost />);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('syncs when the app returns to the foreground, and not for other states', async () => {
    await renderWithProviders(<NotificationHost />);
    sync.mockClear();
    appStateListener('background');
    expect(sync).not.toHaveBeenCalled();
    appStateListener('active');
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('syncs when the language changes', async () => {
    await renderWithProviders(<NotificationHost />);
    sync.mockClear();
    act(() => useLanguageStore.setState({ language: 'es' }));
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
