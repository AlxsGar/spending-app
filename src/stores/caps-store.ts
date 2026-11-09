import { useEffect } from 'react';
import { create } from 'zustand';

import { listCaps, saveGlobalCap } from '@/services/soft-caps';
import type { CapInput, SoftCap } from '@/services/soft-caps';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type CapsState = {
  caps: SoftCap[];
  status: Status;
  saveError: boolean;
  load: () => Promise<void>;
  // Reads the caps again (after an account save wrote one). Keeps the current
  // caps on screen while it reads; the newest read wins. A failed read sets the
  // error state.
  refresh: () => Promise<void>;
  // Sets, changes or clears the global cap. Resolves false when saving failed.
  setGlobal: (input: CapInput, currency: string) => Promise<boolean>;
  // Drops an account's cap from memory after the account was deleted (the
  // database cascaded the delete).
  dropForAccount: (accountId: number) => void;
};

let readCount = 0;

export const useCapsStore = create<CapsState>((set, get) => {
  const read = async (initial: boolean) => {
    const mine = ++readCount;
    if (initial) set({ status: 'loading' });
    try {
      const caps = await listCaps();
      if (mine === readCount) set({ caps, status: 'ready' });
    } catch {
      // Any failed read, also a refresh after a save, puts the store in the
      // error state so the next retry (Home regaining focus) reloads it.
      if (mine === readCount) set({ status: 'error' });
    }
  };
  return {
    caps: [],
    status: 'idle',
    saveError: false,
    load: async () => {
      if (get().status === 'loading') return;
      await read(true);
    },
    refresh: () => read(false),
    setGlobal: async (input, currency) => {
      try {
        await saveGlobalCap(input, currency);
        set({ saveError: false });
        await read(false);
        return true;
      } catch {
        set({ saveError: true });
        return false;
      }
    },
    dropForAccount: (accountId) =>
      set((state) => ({ caps: state.caps.filter((cap) => cap.accountId !== accountId) })),
  };
});

// The caps, loaded the first time a screen needs them. A failed load stays in
// the error state until the user retries, so it never loops.
export function useCaps() {
  const caps = useCapsStore((state) => state.caps);
  const status = useCapsStore((state) => state.status);
  const load = useCapsStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { caps, status, reload: load };
}
