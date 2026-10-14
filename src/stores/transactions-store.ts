import { useEffect } from 'react';
import { create } from 'zustand';

import { createTransaction, listTransactions, sortTransactions } from '@/services/transactions';
import type { Transaction, TransactionInput } from '@/services/transactions';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type TransactionsState = {
  transactions: Transaction[];
  status: Status;
  load: () => Promise<void>;
  // Resolves true when saved. The form shows its own error on false.
  add: (input: TransactionInput) => Promise<boolean>;
};

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  transactions: [],
  status: 'idle',
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const loaded = await listTransactions();
      // A transaction added while this load was in flight may be missing from
      // the result. Load only runs from idle or error, when the list is empty,
      // so anything in the store now was added during the load: keep it.
      const loadedIds = new Set(loaded.map((item) => item.id));
      const added = get().transactions.filter((item) => !loadedIds.has(item.id));
      set({ transactions: sortTransactions([...loaded, ...added]), status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
  add: async (input) => {
    try {
      const created = await createTransaction(input);
      set((state) => ({
        transactions: sortTransactions([...state.transactions, created]),
      }));
      return true;
    } catch {
      return false;
    }
  },
}));

// Loads the transactions the first time a screen needs them. A failed load
// stays in the error state until the user retries, so it never loops.
export function useTransactions() {
  const transactions = useTransactionsStore((state) => state.transactions);
  const status = useTransactionsStore((state) => state.status);
  const load = useTransactionsStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { transactions, status, reload: load };
}
