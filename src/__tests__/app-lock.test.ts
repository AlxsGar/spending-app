import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import {
  DELAYS_MS,
  delayForFailures,
  enableLock,
  hashPin,
  isValidPin,
  LOCK_TIMEOUT_MS,
  readLockFlags,
  remainingWaitMs,
  setPin,
  shouldLockAfterBackground,
  verifyPin,
} from '@/services/app-lock';
import { resetAppLockForTests, useAppLockStore } from '@/stores/app-lock-store';

jest.mock('@/services/erase-data', () => ({ eraseAllData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn().mockResolvedValue(undefined) }));

const secure = SecureStore as unknown as { __items: Map<string, string>; __reset: () => void };
const authenticate = LocalAuthentication.authenticateAsync as jest.Mock;
const hasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const isEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;

const NOW = 1_700_000_000_000;
const state = () => useAppLockStore.getState();

beforeEach(() => {
  secure.__reset();
  resetAppLockForTests();
  jest.clearAllMocks();
  hasHardware.mockResolvedValue(true);
  isEnrolled.mockResolvedValue(true);
  authenticate.mockResolvedValue({ success: true });
});

describe('PIN validation', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(['1234', '123456', '0000'].every(isValidPin)).toBe(true);
    expect(['', '123', '1234567', '12a4', '12 34', '١٢٣٤'].some(isValidPin)).toBe(false);
  });
});

describe('PIN hashing and verify', () => {
  it('hashes with the salt: same input same hash, other salt or PIN another hash', async () => {
    const a = await hashPin('1234', 'salt-a');
    expect(await hashPin('1234', 'salt-a')).toBe(a);
    expect(await hashPin('1234', 'salt-b')).not.toBe(a);
    expect(await hashPin('1235', 'salt-a')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores only a salt and a hash, never the PIN', async () => {
    await enableLock('4821');
    const stored = [...secure.__items.entries()];
    expect(stored.map(([key]) => key).sort()).toEqual([
      'applock.enabled',
      'applock.hash',
      'applock.salt',
    ]);
    expect(stored.some(([, value]) => value.includes('4821'))).toBe(false);
    expect(secure.__items.get('applock.hash')).toBe(
      await hashPin('4821', secure.__items.get('applock.salt') as string),
    );
  });

  it('uses a new random salt each time the PIN is set', async () => {
    await enableLock('1234');
    const first = secure.__items.get('applock.salt');
    await setPin('1234');
    expect(secure.__items.get('applock.salt')).not.toBe(first);
  });

  it('verifies the right PIN and rejects a wrong one', async () => {
    await enableLock('1234');
    expect(await verifyPin('1234', NOW)).toEqual({ result: 'ok' });
    expect(await verifyPin('9999', NOW)).toEqual({ result: 'wrong', waitMs: 0 });
  });

  it('refuses to enable with an invalid PIN', async () => {
    await expect(enableLock('12')).rejects.toThrow();
    expect(secure.__items.size).toBe(0);
  });

  it('treats a flag without a hash as off', async () => {
    secure.__items.set('applock.enabled', '1');
    expect((await readLockFlags()).enabled).toBe(false);
  });
});

describe('wrong PIN delay', () => {
  it('follows the schedule: 5 free, then 30 s, 1 min, 5 min, 15 min, capped', () => {
    expect([1, 2, 3, 4].map(delayForFailures)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 20].map(delayForFailures)).toEqual([
      30_000,
      60_000,
      300_000,
      900_000,
      900_000,
      900_000,
    ]);
    expect(DELAYS_MS).toEqual([30_000, 60_000, 300_000, 900_000]);
  });

  it('applies the delay after the fifth wrong PIN and refuses attempts during it', async () => {
    await enableLock('1234');
    for (let i = 0; i < 4; i += 1) {
      expect(await verifyPin('0000', NOW)).toEqual({ result: 'wrong', waitMs: 0 });
    }
    expect(await verifyPin('0000', NOW)).toEqual({ result: 'wrong', waitMs: 30_000 });
    // Even the right PIN is not checked while waiting.
    expect(await verifyPin('1234', NOW + 10_000)).toEqual({ result: 'waiting', waitMs: 20_000 });
    expect(await remainingWaitMs(NOW + 10_000)).toBe(20_000);
  });

  it('grows with each further wrong PIN once the wait is over', async () => {
    await enableLock('1234');
    let now = NOW;
    const waits: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      const result = await verifyPin('0000', now);
      if (result.result !== 'wrong') throw new Error('expected a wrong result');
      waits.push(result.waitMs);
      now += result.waitMs + 1;
    }
    expect(waits).toEqual([0, 0, 0, 0, 30_000, 60_000, 300_000, 900_000, 900_000]);
  });

  it('survives a restart: the count and the until-time are read from secure store', async () => {
    await enableLock('1234');
    for (let i = 0; i < 5; i += 1) await verifyPin('0000', NOW);
    // A restart: nothing in memory, only secure store.
    resetAppLockForTests();
    expect(await remainingWaitMs(NOW + 1000)).toBe(29_000);
    expect(await verifyPin('1234', NOW + 1000)).toEqual({ result: 'waiting', waitMs: 29_000 });
    // After the wait the failure count continues: the next wrong PIN waits 1 min.
    expect(await verifyPin('0000', NOW + 31_000)).toEqual({ result: 'wrong', waitMs: 60_000 });
  });

  it('shows the remaining wait after a restart through the store', async () => {
    await enableLock('1234');
    for (let i = 0; i < 5; i += 1) await verifyPin('0000', Date.now());
    resetAppLockForTests();
    await state().load();
    expect(state().waitUntil).not.toBeNull();
    expect((state().waitUntil as number) - Date.now()).toBeGreaterThan(25_000);
  });

  it('resets after a correct PIN', async () => {
    await enableLock('1234');
    for (let i = 0; i < 3; i += 1) await verifyPin('0000', NOW);
    expect(await verifyPin('1234', NOW)).toEqual({ result: 'ok' });
    expect(secure.__items.has('applock.failures')).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      expect(await verifyPin('0000', NOW)).toEqual({ result: 'wrong', waitMs: 0 });
    }
  });

  it('does not let a clock moved far back stretch the wait past 15 minutes', async () => {
    secure.__items.set('applock.until', String(NOW + 24 * 3600 * 1000));
    expect(await remainingWaitMs(NOW)).toBe(900_000);
  });
});

describe('lock timeout', () => {
  it('locks only after MORE than a minute in the background', () => {
    expect(LOCK_TIMEOUT_MS).toBe(60_000);
    expect(shouldLockAfterBackground(NOW, NOW + 59_999)).toBe(false);
    expect(shouldLockAfterBackground(NOW, NOW + 60_000)).toBe(false);
    expect(shouldLockAfterBackground(NOW, NOW + 60_001)).toBe(true);
  });

  it('does not lock when the app was never backgrounded, and locks if the clock went back', () => {
    expect(shouldLockAfterBackground(null, NOW)).toBe(false);
    expect(shouldLockAfterBackground(NOW, NOW - 5000)).toBe(true);
  });

  it('the store locks on return after a long background and not after a short one', async () => {
    await enableLock('1234');
    await state().load();
    expect(state().locked).toBe(true); // opens locked
    await state().unlockWithPin('1234');
    expect(state().locked).toBe(false);

    state().handleAppState('inactive', NOW);
    state().handleAppState('background', NOW);
    state().handleAppState('active', NOW + 30_000);
    expect(state().locked).toBe(false);

    state().handleAppState('background', NOW + 100_000);
    state().handleAppState('active', NOW + 100_000 + 61_000);
    expect(state().locked).toBe(true);
  });

  it('never locks when the lock is off', async () => {
    await state().load();
    state().handleAppState('background', NOW);
    state().handleAppState('active', NOW + 10 * 60_000);
    expect(state().locked).toBe(false);
  });
});

describe('enable, change and disable (store)', () => {
  it('is off by default and opens unlocked', async () => {
    await state().load();
    expect(state()).toMatchObject({ loaded: true, enabled: false, locked: false });
  });

  it('enable turns the lock on; a restart opens locked', async () => {
    await state().load();
    await state().enable('1234');
    expect(state().enabled).toBe(true);
    expect(secure.__items.get('applock.enabled')).toBe('1');
    resetAppLockForTests();
    await state().load();
    expect(state()).toMatchObject({ enabled: true, locked: true });
  });

  it('unlocks with the right PIN only', async () => {
    await state().enable('1234');
    await state().load();
    expect((await state().unlockWithPin('0000')).result).toBe('wrong');
    expect(state().locked).toBe(true);
    expect((await state().unlockWithPin('1234')).result).toBe('ok');
    expect(state().locked).toBe(false);
  });

  it('change PIN needs the current PIN and then the new one works', async () => {
    await state().enable('1234');
    expect((await state().changePin('0000', '5678')).result).toBe('wrong');
    expect(await verifyPin('1234', NOW)).toEqual({ result: 'ok' });
    expect((await state().changePin('1234', '5678')).result).toBe('ok');
    expect(await verifyPin('1234', NOW)).toEqual({ result: 'wrong', waitMs: 0 });
    expect(await verifyPin('5678', NOW)).toEqual({ result: 'ok' });
  });

  it('disable needs the current PIN and removes every lock entry', async () => {
    await state().enable('1234');
    await state().setBiometrics(true, 'p', 'c');
    expect((await state().disable('0000')).result).toBe('wrong');
    expect(state().enabled).toBe(true);
    expect((await state().disable('1234')).result).toBe('ok');
    expect(state()).toMatchObject({ enabled: false, biometrics: false });
    expect(secure.__items.size).toBe(0);
  });

  it('only offers biometrics on a device that has them enrolled', async () => {
    isEnrolled.mockResolvedValue(false);
    await state().enable('1234');
    await state().load();
    expect(state().biometricsAvailable).toBe(false);
    expect(await state().setBiometrics(true, 'p', 'c')).toBe(false);
    expect(secure.__items.has('applock.biometrics')).toBe(false);
  });

  it('turning biometrics on needs a successful prompt', async () => {
    await state().enable('1234');
    await state().load();
    authenticate.mockResolvedValueOnce({ success: false });
    expect(await state().setBiometrics(true, 'p', 'c')).toBe(false);
    expect(state().biometrics).toBe(false);
    expect(await state().setBiometrics(true, 'p', 'c')).toBe(true);
    expect(state().biometrics).toBe(true);
    expect(await state().setBiometrics(false, 'p', 'c')).toBe(true);
    expect(secure.__items.has('applock.biometrics')).toBe(false);
  });

  it('biometrics unlock; a cancelled prompt leaves it locked', async () => {
    await state().enable('1234');
    await state().load();
    await state().setBiometrics(true, 'p', 'c');
    state().handleAppState('background', NOW);
    state().handleAppState('active', NOW + 120_000);
    authenticate.mockResolvedValueOnce({ success: false });
    expect(await state().unlockWithBiometrics('p', 'c')).toBe(false);
    expect(state().locked).toBe(true);
    expect(await state().unlockWithBiometrics('p', 'c')).toBe(true);
    expect(state().locked).toBe(false);
  });

  it('forgot PIN with biometrics: a new PIN is only allowed after a biometric check', async () => {
    await state().enable('1234');
    await state().load();
    await state().setBiometrics(true, 'p', 'c');
    resetAppLockForTests();
    await state().load();
    await expect(state().resetPin('5678')).rejects.toThrow();
    authenticate.mockResolvedValueOnce({ success: false });
    expect(await state().checkBiometricsForReset('p', 'c')).toBe(false);
    await expect(state().resetPin('5678')).rejects.toThrow();
    expect(await state().checkBiometricsForReset('p', 'c')).toBe(true);
    await state().resetPin('5678');
    expect(state().locked).toBe(false);
    expect(await verifyPin('5678', NOW)).toEqual({ result: 'ok' });
    await expect(state().resetPin('1111')).rejects.toThrow();
  });

  it('the permission to reset the PIN is dropped by cancel and needs a locked app with biometrics', async () => {
    await state().enable('1234');
    await state().load();
    await state().setBiometrics(true, 'p', 'c');
    resetAppLockForTests();
    await state().load();
    expect(await state().checkBiometricsForReset('p', 'c')).toBe(true);
    state().cancelReset();
    await expect(state().resetPin('5678')).rejects.toThrow();

    // Granted, but the app is no longer locked: still refused.
    expect(await state().checkBiometricsForReset('p', 'c')).toBe(true);
    useAppLockStore.setState({ locked: false });
    await expect(state().resetPin('5678')).rejects.toThrow();
    // Granted, but biometrics are no longer on: still refused.
    useAppLockStore.setState({ locked: true, canResetPin: true, biometrics: false });
    await expect(state().resetPin('5678')).rejects.toThrow();
    expect(await verifyPin('1234', NOW)).toEqual({ result: 'ok' });
  });

  it('change PIN does nothing while a wrong-PIN wait is running', async () => {
    await state().enable('1234');
    for (let i = 0; i < 5; i += 1) await verifyPin('0000', Date.now());
    const result = await state().changePin('1234', '5678');
    expect(result.result).toBe('waiting');
    expect((await state().verifyCurrentPin('1234')).result).toBe('waiting');
    expect(secure.__items.get('applock.hash')).toBe(
      await hashPin('1234', secure.__items.get('applock.salt') as string),
    );
  });

  it('passes the this-device-only keychain options on every secure-store call', async () => {
    const calls = () =>
      [
        SecureStore.getItemAsync,
        SecureStore.setItemAsync,
        SecureStore.deleteItemAsync,
      ] as unknown as jest.Mock[];
    await state().enable('1234');
    await state().load();
    await state().setBiometrics(true, 'p', 'c');
    await verifyPin('0000', NOW);
    await state().changePin('1234', '5678');
    await state().setBiometrics(false, 'p', 'c');
    await state().disable('5678');
    for (const mock of calls()) {
      expect(mock.mock.calls.length).toBeGreaterThan(0);
      for (const call of mock.mock.calls) {
        expect(call[call.length - 1]).toEqual({
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
    }
    expect(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY).toBeDefined();
  });

  it('never logs the PIN', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    await enableLock('4821');
    await verifyPin('4821', NOW);
    await verifyPin('9999', NOW);
    await state().changePin('4821', '1357');
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/4821|9999|1357/);
    }
    spies.forEach((spy) => spy.mockRestore());
  });

  it('erase leaves the app unlocked with the lock off', async () => {
    const { eraseAllData } = jest.requireMock('@/services/erase-data');
    const { reloadAllStores } = jest.requireMock('@/stores/reload-all');
    await state().enable('1234');
    await state().load();
    await state().erase();
    expect(eraseAllData).toHaveBeenCalledTimes(1);
    expect(reloadAllStores).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ enabled: false, locked: false, biometrics: false });
  });

  it('a failed erase keeps the lock', async () => {
    const { eraseAllData } = jest.requireMock('@/services/erase-data');
    eraseAllData.mockRejectedValueOnce(new Error('disk'));
    await state().enable('1234');
    await state().load();
    await expect(state().erase()).rejects.toThrow('disk');
    expect(state()).toMatchObject({ enabled: true, locked: true });
  });
});
