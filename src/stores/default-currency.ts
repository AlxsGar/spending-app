import { useEffect } from 'react';
import { create } from 'zustand';

import { FALLBACK_CURRENCY, getDefaultCurrency, saveDefaultCurrency } from '@/services/accounts';
import type { Currency } from '@/services/accounts';
import { requestReminderSync } from '@/services/reminders';

type State = {
  // Null until read from the settings table (or seeded by a test).
  value: Currency | null;
  saveError: boolean;
  // Reads the setting once; a failed read falls back to MXN, like before.
  // True while a read is running, so the app gate and a screen never read twice.
  loading: boolean;
  load: () => Promise<void>;
  // Saves, then switches every consumer at once. A failed save keeps the old
  // value and sets saveError. Resolves true when saved.
  set: (currency: Currency) => Promise<boolean>;
};

export const useDefaultCurrencyStore = create<State>((set, get) => ({
  value: null,
  saveError: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      // If the initial read fails it falls back to MXN, as it did before this
      // became a store, so screens never wait forever.
      const value = await getDefaultCurrency().catch(() => FALLBACK_CURRENCY);
      // A save that finished while this read was running wins.
      set((state) => (state.value === null ? { value } : state));
    } finally {
      set({ loading: false });
    }
  },
  set: async (currency) => {
    // Picking the value already set changes nothing, so nothing to save or sync.
    if (get().value === currency) return true;
    try {
      await saveDefaultCurrency(currency);
    } catch (error) {
      console.error('[default currency] save failed:', error);
      set({ saveError: true });
      return false;
    }
    set({ value: currency, saveError: false });
    // Reminder texts for payments with no account show the amount in the default
    // currency, so reschedule them now (like a language change). Only after the
    // save succeeded.
    void requestReminderSync();
    return true;
  },
}));

// The current value for code outside a component (the cap-crossing check after a
// save). Reads the store directly, so it always sees the newest currency. Null
// until the value has been read (the app gate does it at start).
export function rememberedDefaultCurrency(): Currency | null {
  return useDefaultCurrencyStore.getState().value;
}

// Also the way tests seed or clear the value.
export function rememberDefaultCurrency(currency: Currency | null): void {
  useDefaultCurrencyStore.setState({ value: currency, saveError: false });
}

// The default currency (the setting, else MXN), used for recurring payments
// that have no account. Null until it has been read, so a screen can wait and
// never format an amount in the wrong currency. Re-renders when it changes.
export function useDefaultCurrency(): Currency | null {
  const value = useDefaultCurrencyStore((state) => state.value);
  const load = useDefaultCurrencyStore((state) => state.load);
  useEffect(() => {
    if (value === null) void load();
  }, [value, load]);
  return value;
}
