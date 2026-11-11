import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState, BackHandler } from 'react-native';

import { AppGate } from '@/components/app-gate';
import { en } from '@/i18n/en';
import { LockOverlay } from '@/components/ui';
import { enableLock } from '@/services/app-lock';
import { resetAppLockForTests, useAppLockStore } from '@/stores/app-lock-store';
import { useLanguageStore } from '@/stores/language-store';
import { renderWithProviders } from '@/test/render';
import { silenceConsoleError } from '@/test/console-error';

silenceConsoleError();

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
    useRouter: () => ({ navigate: jest.fn() }),
    useRootNavigationState: () => ({ key: 'root' }),
  };
});
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  getDefaultCurrency: jest.fn().mockResolvedValue('MXN'),
}));
jest.mock('@/services/db', () => ({ initDb: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/language', () => ({
  getDeviceLanguage: () => 'en',
  removeLegacyLanguageSetting: () => Promise.resolve(),
}));
jest.mock('@/services/erase-data', () => ({ eraseAllData: jest.fn() }));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn() }));

const secure = SecureStore as unknown as { __reset: () => void };

let appStateListeners: ((state: string) => void)[] = [];
let backHandlers: { handler: () => boolean; remove: jest.Mock }[] = [];
const emit = (state: string) => act(() => appStateListeners.forEach((listener) => listener(state)));
const NOW = 1_700_000_000_000;
let now = NOW;

beforeEach(() => {
  jest.clearAllMocks();
  secure.__reset();
  resetAppLockForTests();
  useLanguageStore.setState({ language: 'en', ready: false, error: false });
  appStateListeners = [];
  backHandlers = [];
  now = NOW;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListeners.push(listener);
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
    _type: string,
    handler: () => boolean,
  ) => {
    const entry = { handler, remove: jest.fn() };
    backHandlers.push(entry);
    return entry;
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const hiddenScreens = () => screen.queryByText('app ready');
// True while the screens' wrapper is untouchable (locked or covered).
const screensLocked = () =>
  screen.getByTestId('app-screens', { includeHiddenElements: true }).props.pointerEvents === 'none';

describe('AppGate with the app lock', () => {
  it('with the lock off shows the screens and no lock', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    expect(screen.queryByText(en.lock.title)).toBeNull();
    expect(screensLocked()).toBe(false);
    expect(backHandlers).toHaveLength(0);
  });

  it('a locked cold start shows the lock, with the screens hidden and untouchable', async () => {
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    expect(await screen.findByText(en.lock.title)).toBeTruthy();
    // Hidden from screen readers (not found by default), still mounted.
    expect(hiddenScreens()).toBeNull();
    expect(screen.getByText('app ready', { includeHiddenElements: true })).toBeTruthy();
    expect(screensLocked()).toBe(true);
    // Unlocking brings the screens back.
    act(() => useAppLockStore.setState({ locked: false }));
    await waitFor(() => expect(screen.queryByText(en.lock.title)).toBeNull());
    expect(hiddenScreens()).toBeTruthy();
    expect(screensLocked()).toBe(false);
  });

  it('swallows the Android back button while locked, and only then', async () => {
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.lock.title);
    expect(backHandlers).toHaveLength(1);
    expect(backHandlers[0].handler()).toBe(true);
    act(() => useAppLockStore.setState({ locked: false }));
    expect(backHandlers[0].remove).toHaveBeenCalled();
  });

  it('shows Retry when the lock settings cannot be read, and recovers', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    await renderWithProviders(<AppGate />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText('app ready')).toBeTruthy();
  });

  it('offers Erase all data only after a second failed load, and erasing opens the app unlocked', async () => {
    const { eraseAllData } = jest.requireMock('@/services/erase-data');
    (eraseAllData as jest.Mock).mockResolvedValue(undefined);
    // Each load reads 4 entries at once; two loads fail.
    for (let i = 0; i < 8; i += 1) {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    }
    await renderWithProviders(<AppGate />);

    // First failure: only Retry.
    expect(await screen.findByText(en.common.retry)).toBeTruthy();
    expect(screen.queryByText(en.lock.eraseConfirm)).toBeNull();

    // One failed Retry: Retry and Erase.
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.lock.eraseConfirm)).toBeTruthy();
    expect(screen.getByText(en.common.retry)).toBeTruthy();

    // The same confirmation as Forgot PIN, naming the backup file.
    fireEvent.press(screen.getByText(en.lock.eraseConfirm));
    expect(await screen.findByText(en.lock.eraseMessage)).toBeTruthy();
    expect(en.lock.eraseMessage).toContain('backup file');
    await act(async () => {
      fireEvent.press(screen.getAllByText(en.lock.eraseConfirm).at(-1) as never);
    });

    expect(await screen.findByText('app ready')).toBeTruthy();
    expect(eraseAllData).toHaveBeenCalledTimes(1);
    expect(useAppLockStore.getState()).toMatchObject({ enabled: false, locked: false, loadError: false });
    expect(screen.queryByText(en.lock.title)).toBeNull();
  });

  it('a failed erase from the error screen shows the error and stays on the error screen', async () => {
    const { eraseAllData } = jest.requireMock('@/services/erase-data');
    (eraseAllData as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    for (let i = 0; i < 8; i += 1) {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    }
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.common.retry);
    fireEvent.press(screen.getByText(en.common.retry));
    fireEvent.press(await screen.findByText(en.lock.eraseConfirm));
    await screen.findByText(en.lock.eraseMessage);
    await act(async () => {
      fireEvent.press(screen.getAllByText(en.lock.eraseConfirm).at(-1) as never);
    });

    expect(await screen.findByText(en.lock.eraseError)).toBeTruthy();
    expect(screen.getByText(en.common.loadError)).toBeTruthy();
    expect(screen.queryByText('app ready')).toBeNull();
    expect(useAppLockStore.getState().loadError).toBe(true);
  });

  it('a successful retry resets the failure count: a later single failure shows only Retry', async () => {
    // A failed load, then a failed Retry (Erase offered), then a Retry that works.
    for (let i = 0; i < 8; i += 1) {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    }
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.common.retry);
    fireEvent.press(screen.getByText(en.common.retry));
    await screen.findByText(en.lock.eraseConfirm);
    expect(useAppLockStore.getState().loadFailures).toBe(2);
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText('app ready')).toBeTruthy();
    expect(useAppLockStore.getState().loadFailures).toBe(0);

    // The gate shows the error screen again after one new failure: Retry only.
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
    await act(async () => {
      await useAppLockStore.getState().load();
    });
    expect(await screen.findByText(en.common.retry)).toBeTruthy();
    expect(useAppLockStore.getState().loadFailures).toBe(1);
    expect(screen.queryByText(en.lock.eraseConfirm)).toBeNull();
  });

  it('erase while covered or locked leaves the cover off', async () => {
    const { eraseAllData } = jest.requireMock('@/services/erase-data');
    (eraseAllData as jest.Mock).mockResolvedValue(undefined);
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.lock.title);
    act(() => useAppLockStore.setState({ locked: false }));
    emit('background');
    expect(useAppLockStore.getState().covered).toBe(true);
    await act(async () => {
      await useAppLockStore.getState().erase();
    });
    expect(useAppLockStore.getState()).toMatchObject({ covered: false, locked: false, enabled: false });

    // Locked and covered at once (set directly): erase clears both.
    act(() => useAppLockStore.setState({ locked: true, covered: true, enabled: true }));
    await act(async () => {
      await useAppLockStore.getState().erase();
    });
    expect(useAppLockStore.getState()).toMatchObject({ covered: false, locked: false });
    expect(await screen.findByText('app ready')).toBeTruthy();
    expect(screensLocked()).toBe(false);
  });

  it('covers the app at once in the background and removes the cover on a quick return, with no PIN', async () => {
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.lock.title);
    act(() => useAppLockStore.setState({ locked: false }));
    await screen.findByText('app ready');

    emit('inactive');
    expect(useAppLockStore.getState().covered).toBe(false);
    emit('background');
    expect(useAppLockStore.getState()).toMatchObject({ covered: true, locked: false });
    // Opaque cover, no PIN pad, screens hidden.
    expect(hiddenScreens()).toBeNull();
    expect(screen.queryByLabelText('5')).toBeNull();
    expect(screen.queryByText(en.lock.title)).toBeNull();
    expect(screen.UNSAFE_queryAllByType(LockOverlay)).toHaveLength(1);

    now += 60_000;
    emit('active');
    expect(useAppLockStore.getState()).toMatchObject({ covered: false, locked: false });
    expect(await screen.findByText('app ready')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(LockOverlay)).toHaveLength(0);
  });

  it('turns the cover into the lock after a long background', async () => {
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.lock.title);
    act(() => useAppLockStore.setState({ locked: false }));
    await screen.findByText('app ready');

    emit('background');
    expect(useAppLockStore.getState().covered).toBe(true);
    now += 60_001;
    emit('active');
    expect(useAppLockStore.getState()).toMatchObject({ covered: false, locked: true });
    expect(await screen.findByText(en.lock.title)).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(LockOverlay)).toHaveLength(1);
  });

  it('never covers when the lock is off', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    emit('background');
    expect(useAppLockStore.getState().covered).toBe(false);
    expect(screen.UNSAFE_queryAllByType(LockOverlay)).toHaveLength(0);
  });

  it('locks after more than 60 s in the background, not after less, and ignores inactive', async () => {
    await enableLock('1234');
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.lock.title);
    act(() => useAppLockStore.setState({ locked: false }));
    await screen.findByText('app ready');

    // Inactive alone (a system prompt, the app switcher) never locks.
    emit('inactive');
    now += 10 * 60_000;
    emit('active');
    expect(useAppLockStore.getState().locked).toBe(false);

    // Background for 30 s: no lock.
    emit('background');
    now += 30_000;
    emit('active');
    expect(useAppLockStore.getState().locked).toBe(false);

    // Inactive in the middle does not restart the clock.
    emit('inactive');
    emit('background');
    now += 61_000;
    emit('inactive');
    emit('active');
    expect(useAppLockStore.getState().locked).toBe(true);
    expect(await screen.findByText(en.lock.title)).toBeTruthy();
    expect(hiddenScreens()).toBeNull();
  });
});
