import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { enableLock } from '@/services/app-lock';
import { setScreenPrivacy } from '@/services/screen-privacy';
import { resetAppLockForTests, useAppLockStore } from '@/stores/app-lock-store';
import { silenceConsoleError } from '@/test/console-error';

silenceConsoleError();

jest.mock('@/services/erase-data', () => ({ eraseAllData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn().mockResolvedValue(undefined) }));

const secure = SecureStore as unknown as { __reset: () => void };
const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;
const blurOn = ScreenCapture.enableAppSwitcherProtectionAsync as jest.Mock;
const blurOff = ScreenCapture.disableAppSwitcherProtectionAsync as jest.Mock;
const state = () => useAppLockStore.getState();
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const originalOS = Platform.OS;
const setOS = (os: 'android' | 'ios') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

beforeEach(() => {
  secure.__reset();
  resetAppLockForTests();
  jest.clearAllMocks();
});
afterEach(() => {
  prevent.mockReset().mockResolvedValue(undefined);
  allow.mockReset().mockResolvedValue(undefined);
  blurOn.mockReset().mockResolvedValue(undefined);
  blurOff.mockReset().mockResolvedValue(undefined);
});
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
});

describe('Android', () => {
  beforeEach(() => setOS('android'));

  it('prevents capture on enable and allows it on disable', async () => {
    await state().load();
    await state().enable('1234');
    await flush();
    expect(prevent).toHaveBeenCalledWith('app-lock');
    await state().disable('1234');
    await flush();
    expect(allow).toHaveBeenCalledWith('app-lock');
    expect(blurOn).not.toHaveBeenCalled();
  });

  it('applies the protection at startup when the lock is on', async () => {
    await enableLock('1234');
    await state().load();
    await flush();
    expect(prevent).toHaveBeenCalledTimes(1);
    expect(allow).not.toHaveBeenCalled();
  });

  it('applies the allowed state at startup when the lock is off', async () => {
    await state().load();
    await flush();
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).toHaveBeenCalledWith('app-lock');
  });

  it('allows capture again after erase', async () => {
    await enableLock('1234');
    await state().load();
    await flush();
    await state().erase();
    await flush();
    expect(allow).toHaveBeenCalledWith('app-lock');
  });

  it('catches a rejected native call, logs it and leaves the lock alone', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prevent.mockRejectedValueOnce(new Error('MissingActivity'));
    await expect(setScreenPrivacy(true)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[screen-privacy]'),
      expect.anything(),
    );
    await state().load();
    prevent.mockRejectedValueOnce(new Error('MissingActivity'));
    await state().enable('1234');
    await flush();
    expect(state()).toMatchObject({ enabled: true, loaded: true, loadError: false });
    expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    errorSpy.mockRestore();
  });

  it('retries a failed call when the app becomes active', async () => {
    await state().load();
    allow.mockClear();
    prevent.mockRejectedValueOnce(new Error('MissingActivity'));
    await state().enable('1234');
    await flush();
    expect(prevent).toHaveBeenCalledTimes(1);
    state().handleAppState('active');
    await flush();
    expect(prevent).toHaveBeenCalledTimes(2);
    state().handleAppState('active');
    await flush();
    expect(prevent).toHaveBeenCalledTimes(2);
  });

  it('a quick enable then disable ends with allow as the last call', async () => {
    await state().load();
    allow.mockClear();
    const order: string[] = [];
    prevent.mockImplementationOnce(async () => {
      await flush();
      order.push('prevent');
    });
    allow.mockImplementation(async () => {
      order.push('allow');
    });
    await state().enable('1234');
    await state().disable('1234');
    await flush();
    await flush();
    expect(order).toEqual(['prevent', 'allow']);
  });

  it('does not retry on other store changes after a failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await state().load();
    prevent.mockRejectedValue(new Error('MissingActivity'));
    await state().enable('1234');
    await flush();
    useAppLockStore.setState({ covered: true });
    useAppLockStore.setState({ waitUntil: 5 });
    await flush();
    expect(prevent).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    prevent.mockReset().mockResolvedValue(undefined);
    errorSpy.mockRestore();
  });

  it('an active event before the flags load does nothing', async () => {
    state().handleAppState('active');
    await flush();
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
  });

  it('erase from the lock-read error screen allows capture', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    await state().load();
    expect(state().loadError).toBe(true);
    await state().erase();
    await flush();
    expect(allow).toHaveBeenCalledWith('app-lock');
    expect(prevent).not.toHaveBeenCalled();
  });

  it('a load error then a successful retry applies the state once', async () => {
    await enableLock('1234');
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    await state().load();
    await flush();
    expect(prevent).not.toHaveBeenCalled();
    await state().load();
    await flush();
    expect(prevent).toHaveBeenCalledTimes(1);
  });
});

describe('iOS', () => {
  beforeEach(() => setOS('ios'));

  it('blurs on enable and stops on disable, never preventing capture', async () => {
    await state().load();
    blurOn.mockClear();
    blurOff.mockClear();
    await state().enable('1234');
    await flush();
    expect(blurOn).toHaveBeenCalledWith(1);
    await state().disable('1234');
    await flush();
    expect(blurOff).toHaveBeenCalled();
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
  });

  it('applies the right state at startup, in both states', async () => {
    await enableLock('1234');
    await state().load();
    await flush();
    expect(blurOn).toHaveBeenCalledWith(1);
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
    resetAppLockForTests();
    secure.__reset();
    blurOff.mockClear();
    await state().load();
    await flush();
    expect(blurOff).toHaveBeenCalledTimes(1);
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
  });

  it('turns the blur off after erase', async () => {
    await enableLock('1234');
    await state().load();
    await flush();
    await state().erase();
    await flush();
    expect(blurOff).toHaveBeenCalled();
    expect(prevent).not.toHaveBeenCalled();
  });

  it('catches a rejected native call', async () => {
    blurOn.mockRejectedValueOnce(new Error('NoKeyWindowException'));
    await expect(setScreenPrivacy(true)).resolves.toBe(false);
  });
});
