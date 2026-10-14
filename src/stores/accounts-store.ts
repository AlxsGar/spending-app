import { useEffect } from 'react';
import { create } from 'zustand';

import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import type { Account, AccountInput } from '@/services/accounts';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type AccountsState = {
  accounts: Account[];
  status: Status;
  saveError: boolean;
  load: () => Promise<void>;
  add: (input: AccountInput) => Promise<boolean>;
  update: (id: number, input: AccountInput) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
};

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  status: 'idle',
  saveError: false,
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const accounts = await listAccounts();
      set({ accounts, status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
  add: async (input) => {
    try {
      const account = await createAccount(input);
      set((state) => ({ accounts: [...state.accounts, account], saveError: false }));
      return true;
    } catch {
      set({ saveError: true });
      return false;
    }
  },
  update: async (id, input) => {
    try {
      const account = await updateAccount(id, input);
      set((state) => ({
        accounts: state.accounts.map((item) => (item.id === id ? account : item)),
        saveError: false,
      }));
      return true;
    } catch {
      set({ saveError: true });
      return false;
    }
  },
  remove: async (id) => {
    try {
      await removeAccount(id);
      set((state) => ({
        accounts: state.accounts.filter((item) => item.id !== id),
        saveError: false,
      }));
      return true;
    } catch {
      set({ saveError: true });
      return false;
    }
  },
}));

// Loads the accounts the first time a screen needs them. A failed load stays
// in the error state until the user retries, so it never loops.
export function useAccounts() {
  const accounts = useAccountsStore((state) => state.accounts);
  const status = useAccountsStore((state) => state.status);
  const load = useAccountsStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { accounts, status, reload: load };
}
