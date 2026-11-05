import { useEffect } from 'react';
import { create } from 'zustand';

import {
  createRecurring,
  listRecurring,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { RecurringInput, RecurringPayment } from '@/services/recurring';

import { useTransactionsStore } from './transactions-store';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type RecurringState = {
  payments: RecurringPayment[];
  status: Status;
  load: () => Promise<void>;
  // Resolves the saved payment, or null when saving failed.
  add: (input: RecurringInput) => Promise<RecurringPayment | null>;
  update: (id: number, input: RecurringInput) => Promise<RecurringPayment | null>;
  remove: (id: number) => Promise<boolean>;
  // Drops an account's payments from memory after the account was deleted.
  dropForAccount: (accountId: number) => void;
};

export const useRecurringStore = create<RecurringState>((set, get) => ({
  payments: [],
  status: 'idle',
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const loaded = await listRecurring();
      // Load only runs from idle or error, when the list is empty, so anything
      // in the store now was added while this load was in flight: keep it.
      const loadedIds = new Set(loaded.map((item) => item.id));
      const added = get().payments.filter((item) => !loadedIds.has(item.id));
      set({ payments: [...loaded, ...added].sort((a, b) => a.id - b.id), status: 'ready' });
    } catch (error) {
      // Diagnostic: the screens only show a generic message.
      console.error('[recurring] list failed:', error);
      set({ status: 'error' });
    }
  },
  add: async (input) => {
    try {
      const created = await createRecurring(input);
      set((state) => ({ payments: [...state.payments, created] }));
      return created;
    } catch (error) {
      // Diagnostic, like the list failure above.
      console.error('[recurring] create failed:', error);
      return null;
    }
  },
  update: async (id, input) => {
    try {
      const updated = await updateRecurring(id, input);
      set((state) => ({
        payments: state.payments.map((item) => (item.id === id ? updated : item)),
      }));
      return updated;
    } catch (error) {
      // Diagnostic, like the list failure above.
      console.error('[recurring] update failed:', error);
      return null;
    }
  },
  remove: async (id) => {
    try {
      await removeRecurring(id);
      // The database set the linked transactions' recurring_id to NULL.
      useTransactionsStore.getState().unlinkRecurring(id);
      set((state) => ({ payments: state.payments.filter((item) => item.id !== id) }));
      return true;
    } catch (error) {
      // Diagnostic, like the list failure above.
      console.error('[recurring] delete failed:', error);
      return false;
    }
  },
  dropForAccount: (accountId) =>
    set((state) => ({
      payments: state.payments.filter((item) => item.accountId !== accountId),
    })),
}));

// Loads the recurring payments the first time a screen needs them. A failed
// load stays in the error state until the user retries, so it never loops.
export function useRecurring() {
  const payments = useRecurringStore((state) => state.payments);
  const status = useRecurringStore((state) => state.status);
  const load = useRecurringStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { payments, status, reload: load };
}
