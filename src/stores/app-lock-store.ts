import { create } from 'zustand';

import {
  authenticateWithBiometrics,
  clearLockStorage,
  enableLock,
  isBiometricsAvailable,
  readLockFlags,
  remainingWaitMs,
  setBiometricsFlag,
  setPin,
  shouldLockAfterBackground,
  verifyPin,
} from '@/services/app-lock';
import type { VerifyResult } from '@/services/app-lock';
import { eraseAllData } from '@/services/erase-data';
import { setScreenPrivacy } from '@/services/screen-privacy';

import { reloadAllStores } from './reload-all';

type State = {
  // The flags are read from secure store once at start. Nothing renders behind
  // the lock until this is true, so there is no flash of content.
  loaded: boolean;
  loadError: boolean;
  enabled: boolean;
  // The biometrics switch is on AND the device still has enrolled biometrics.
  biometrics: boolean;
  // The device has hardware and an enrolled fingerprint or face (the Settings
  // switch is only offered then).
  biometricsAvailable: boolean;
  locked: boolean;
  // An opaque cover with no PIN pad, shown while the app is in the background
  // with the lock on. It is removed on return within the timeout.
  covered: boolean;
  // How many lock-flag loads in a row failed (the gate offers Erase from 2).
  loadFailures: number;
  // Epoch ms until which PIN attempts are refused (the wrong-PIN delay), or null.
  waitUntil: number | null;
  // Set by a successful biometric check from "Forgot PIN?"; allows resetPin once.
  canResetPin: boolean;
  load: () => Promise<void>;
  handleAppState: (state: string, now?: number) => void;
  unlockWithPin: (pin: string) => Promise<VerifyResult>;
  unlockWithBiometrics: (prompt: string, cancel: string) => Promise<boolean>;
  checkBiometricsForReset: (prompt: string, cancel: string) => Promise<boolean>;
  // Drops the permission given by checkBiometricsForReset (cancel, or the lock screen closing).
  cancelReset: () => void;
  resetPin: (pin: string) => Promise<void>;
  enable: (pin: string) => Promise<void>;
  // Checks a PIN for Change PIN and Turn off (same attempts and delay as unlocking).
  verifyCurrentPin: (pin: string) => Promise<VerifyResult>;
  changePin: (current: string, next: string) => Promise<VerifyResult>;
  disable: (current: string) => Promise<VerifyResult>;
  setBiometrics: (on: boolean, prompt: string, cancel: string) => Promise<boolean>;
  erase: () => Promise<void>;
};

// When the app went to the background, or null while it is in the foreground.
let backgroundedAt: number | null = null;

// The screen-protection state last asked for, or null when none is applied (not
// yet, or the last native call failed, so it is retried when the app is active).
// Native calls run one after another, so a quick on then off cannot land reversed.
let appliedPrivacy: boolean | null = null;
let privacyChain: Promise<void> = Promise.resolve();
function applyPrivacy(on: boolean): void {
  appliedPrivacy = on;
  privacyChain = privacyChain.then(async () => {
    const ok = await setScreenPrivacy(on);
    if (!ok && appliedPrivacy === on) appliedPrivacy = null;
  });
}

export const useAppLockStore = create<State>((set, get) => {
  const noteWait = (result: VerifyResult, now = Date.now()) => {
    if (result.result !== 'ok' && result.waitMs > 0) set({ waitUntil: now + result.waitMs });
    else if (result.result === 'ok') set({ waitUntil: null });
  };

  return {
    loaded: false,
    loadError: false,
    loadFailures: 0,
    enabled: false,
    biometrics: false,
    biometricsAvailable: false,
    locked: false,
    covered: false,
    waitUntil: null,
    canResetPin: false,

    load: async () => {
      set({ loadError: false });
      try {
        const [flags, available, wait] = await Promise.all([
          readLockFlags(),
          isBiometricsAvailable(),
          remainingWaitMs(),
        ]);
        set({
          loaded: true,
          loadFailures: 0,
          enabled: flags.enabled,
          biometrics: flags.enabled && flags.biometrics && available,
          biometricsAvailable: available,
          // The app opens behind the lock.
          locked: flags.enabled,
          waitUntil: wait > 0 ? Date.now() + wait : null,
        });
      } catch (failure) {
        console.error('[app-lock] could not read the lock settings:', failure);
        set({ loadError: true, loadFailures: get().loadFailures + 1 });
      }
    },

    handleAppState: (state, now = Date.now()) => {
      // Only 'background' and 'active' count. 'inactive' (the Face ID prompt, the
      // app switcher opening, a system dialog) is ignored for lock decisions and
      // for the cover, so returning from the biometric prompt cannot loop or flicker.
      if (state === 'background') {
        backgroundedAt ??= now;
        // Cover at once, so there is no flash of content on return. It may also
        // hide the app-switcher preview, but the OS can take its snapshot before
        // the cover renders: that needs checking on a device.
        const { enabled, locked } = get();
        if (enabled && !locked) set({ covered: true });
        return;
      }
      if (state !== 'active') return;
      // Retry a screen-protection call that failed earlier.
      if (get().loaded && appliedPrivacy === null) applyPrivacy(get().enabled);
      const away = backgroundedAt;
      backgroundedAt = null;
      const { enabled, locked } = get();
      // More than a minute away: the cover becomes the lock. Otherwise it goes
      // away with no PIN.
      if (enabled && !locked && shouldLockAfterBackground(away, now)) set({ locked: true });
      set({ covered: false });
    },

    unlockWithPin: async (pin) => {
      const result = await verifyPin(pin);
      noteWait(result);
      if (result.result === 'ok') set({ locked: false });
      return result;
    },

    unlockWithBiometrics: async (prompt, cancel) => {
      if (!get().biometrics) return false;
      const ok = await authenticateWithBiometrics(prompt, cancel);
      if (ok) set({ locked: false });
      return ok;
    },

    checkBiometricsForReset: async (prompt, cancel) => {
      if (!get().biometrics) return false;
      const ok = await authenticateWithBiometrics(prompt, cancel);
      set({ canResetPin: ok });
      return ok;
    },

    cancelReset: () => set({ canResetPin: false }),

    resetPin: async (pin) => {
      const { canResetPin, locked, biometrics } = get();
      if (!canResetPin || !locked || !biometrics) {
        throw new Error('Not allowed: biometrics were not confirmed');
      }
      await setPin(pin);
      set({ canResetPin: false, waitUntil: null, locked: false });
    },

    enable: async (pin) => {
      await enableLock(pin);
      set({ enabled: true, waitUntil: null });
    },

    verifyCurrentPin: async (pin) => {
      const result = await verifyPin(pin);
      noteWait(result);
      return result;
    },

    changePin: async (current, next) => {
      const result = await verifyPin(current);
      noteWait(result);
      if (result.result === 'ok') await setPin(next);
      return result;
    },

    disable: async (current) => {
      const result = await verifyPin(current);
      noteWait(result);
      if (result.result === 'ok') {
        await clearLockStorage();
        set({ enabled: false, biometrics: false, locked: false });
      }
      return result;
    },

    // Turning it on asks for one biometric check first, so a switch that does
    // not work is never left on. Turning it off needs nothing (the PIN is the
    // stronger factor and the lock itself is still on).
    setBiometrics: async (on, prompt, cancel) => {
      if (!on) {
        await setBiometricsFlag(false);
        set({ biometrics: false });
        return true;
      }
      if (!get().biometricsAvailable) return false;
      if (!(await authenticateWithBiometrics(prompt, cancel))) return false;
      await setBiometricsFlag(true);
      set({ biometrics: true });
      return true;
    },

    // Wipes the data, the reminders and the lock, then reloads the (now empty)
    // stores. If the wipe fails it throws and nothing changed.
    erase: async () => {
      await eraseAllData();
      set({
        // Also the way out of a lock-settings read error: the lock is off and
        // known, so the app opens.
        loaded: true,
        loadError: false,
        loadFailures: 0,
        covered: false,
        enabled: false,
        biometrics: false,
        locked: false,
        waitUntil: null,
        canResetPin: false,
      });
      try {
        await reloadAllStores();
      } catch (failure) {
        console.error('[app-lock] reload after erase failed:', failure);
      }
    },
  };
});

// Screen protection follows the lock: applied once the flags have loaded, then on
// every change of `enabled` (turn on, turn off, erase).
// A failed call is retried only on resume (handleAppState), never on other store changes.
useAppLockStore.subscribe((state, previous) => {
  const changed = state.enabled !== previous.enabled || state.loaded !== previous.loaded;
  if (changed && state.loaded && state.enabled !== appliedPrivacy) applyPrivacy(state.enabled);
});

export function resetAppLockForTests(): void {
  appliedPrivacy = null;
  privacyChain = Promise.resolve();
  backgroundedAt = null;
  useAppLockStore.setState({
    loaded: false,
    loadError: false,
    enabled: false,
    biometrics: false,
    biometricsAvailable: false,
    locked: false,
    covered: false,
    loadFailures: 0,
    waitUntil: null,
    canResetPin: false,
  });
}
