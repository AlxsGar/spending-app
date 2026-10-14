import { useEffect } from 'react';
import { create } from 'zustand';

import {
  createTransaction,
  listTransactions,
  removeTransaction,
  sortTransactions,
  updateTransaction,
} from '@/services/transactions';
import type { Transaction, TransactionInput } from '@/services/transactions';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type TransactionsState = {
  transactions: Transaction[];
  status: Status;
  load: () => Promise<void>;
  // Resolves true when saved. The form shows its own error on false.
  add: (input: TransactionInput) => Promise<boolean>;
  // Replaces the row and re-sorts. Resolves the saved transaction, or null
  // when saving failed.
  update: (id: number, input: TransactionInput) => Promise<Transaction | null>;
  remove: (id: number) => Promise<boolean>;
  // Drops an account's transactions from memory after the account was deleted.
  dropForAccount: (accountId: number) => void;
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
  update: async (id, input) => {
    try {
      const updated = await updateTransaction(id, input);
      set((state) => ({
        transactions: sortTransactions(
          state.transactions.map((item) => (item.id === id ? updated : item)),
        ),
      }));
      return updated;
    } catch {
      return null;
    }
  },
  remove: async (id) => {
    try {
      await removeTransaction(id);
      set((state) => ({
        transactions: state.transactions.filter((item) => item.id !== id),
      }));
      return true;
    } catch {
      return false;
    }
  },
  dropForAccount: (accountId) =>
    set((state) => ({
      transactions: state.transactions.filter((item) => item.accountId !== accountId),
    })),
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
