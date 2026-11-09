import { useEffect } from 'react';
import { create } from 'zustand';

import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import type { Account, AccountInput } from '@/services/accounts';
import { requestReminderSync } from '@/services/reminders';

import { useCapsStore } from './caps-store';
import { useRecurringStore } from './recurring-store';
import { useTransactionsStore } from './transactions-store';

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
      // The account and its cap are already saved. If this re-read fails, the
      // caps store goes to its error state and the save still succeeds: Home's
      // banner may lag until the next focus retries the load. Accepted, because
      // reporting a failed save for data that was written would be wrong.
      if (input.cap) void useCapsStore.getState().refresh();
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
      // Same as in add: a failed caps re-read does not fail the saved update.
      if (input.cap) void useCapsStore.getState().refresh();
      // A reminder's amount is shown in the account's currency.
      void requestReminderSync();
      return true;
    } catch {
      set({ saveError: true });
      return false;
    }
  },
  remove: async (id) => {
    try {
      await removeAccount(id);
      // The service deleted the account's transactions with it.
      useTransactionsStore.getState().dropForAccount(id);
      // The cascade deleted the account's recurring payments, and the database
      // cleared recurring_id on other accounts' transactions linked to them.
      const transactionsStore = useTransactionsStore.getState();
      for (const payment of useRecurringStore.getState().payments) {
        if (payment.accountId === id) transactionsStore.unlinkRecurring(payment.id);
      }
      useRecurringStore.getState().dropForAccount(id);
      // The cascade deleted the account's cap.
      useCapsStore.getState().dropForAccount(id);
      set((state) => ({
        accounts: state.accounts.filter((item) => item.id !== id),
        saveError: false,
      }));
      // The cascade deleted the account's recurring payments and their reminders.
      void requestReminderSync();
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
