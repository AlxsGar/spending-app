import { useEffect } from 'react';
import { create } from 'zustand';

import {
  createRecurring,
  dismissRecurring,
  getRecurring,
  listRecurring,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { Day, RecurringInput, RecurringPayment } from '@/services/recurring';
import { requestReminderSync } from '@/services/reminders';
import { AlreadyHandledError, payOccurrence, skipOccurrence } from '@/services/recurring-actions';

import { useTransactionsStore } from './transactions-store';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export type PayOutcome = 'paid' | 'already' | 'failed';
export type SkipOutcome = 'skipped' | 'already' | 'failed';

type RecurringState = {
  payments: RecurringPayment[];
  status: Status;
  load: () => Promise<void>;
  // Resolves the saved payment, or null when saving failed.
  add: (input: RecurringInput) => Promise<RecurringPayment | null>;
  update: (id: number, input: RecurringInput) => Promise<RecurringPayment | null>;
  remove: (id: number) => Promise<boolean>;
  // Hides one occurrence's card. Resolves true when saved.
  dismiss: (id: number, occurrence: Day) => Promise<boolean>;
  // Quick Paid: records the expense and confirms the occurrence (one database
  // transaction), then updates this store and the transactions store.
  // - paid: saved.
  // - already: the occurrence had already been paid (a stale card, or another
  //   call won); nothing was written, the payment was refreshed.
  // - failed: could not be saved.
  // Pay now passes amountCents (the amount entered); quick Paid leaves it out and
  // the payment's stored amount is used.
  pay: (
    id: number,
    occurrence: Day,
    accountId: number,
    amountCents?: number,
  ) => Promise<PayOutcome>;
  // Skip: confirms the occurrence without an expense. Same outcomes as pay:
  // skipped, already (nothing written, payment refreshed), failed.
  skip: (id: number, occurrence: Day) => Promise<SkipOutcome>;
  // Sets last_confirmed_at in memory (after the database changed it).
  setLastConfirmed: (id: number, day: Day | null) => void;
  // Drops an account's payments from memory after the account was deleted.
  dropForAccount: (accountId: number) => void;
};

// Brings one payment up to date from the database (after a stale pay or skip).
async function refreshOne(id: number): Promise<void> {
  try {
    const fresh = await getRecurring(id);
    if (fresh) {
      useRecurringStore.setState((state) => ({
        payments: state.payments.map((item) => (item.id === id ? fresh : item)),
      }));
    }
  } catch {
    // Only a refresh; the next load fixes it.
  }
}

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
      void requestReminderSync();
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
      // Covers a schedule, reminder or active change.
      void requestReminderSync();
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
      void requestReminderSync();
      return true;
    } catch (error) {
      // Diagnostic, like the list failure above.
      console.error('[recurring] delete failed:', error);
      return false;
    }
  },
  dismiss: async (id, occurrence) => {
    try {
      await dismissRecurring(id, occurrence);
      set((state) => ({
        payments: state.payments.map((item) =>
          item.id === id ? { ...item, dismissedAt: occurrence } : item,
        ),
      }));
      return true;
    } catch (error) {
      // Diagnostic, like the list failure above.
      console.error('[recurring] dismiss failed:', error);
      return false;
    }
  },
  pay: async (id, occurrence, accountId, amountCents) => {
    try {
      const { transaction, payment } = await payOccurrence({
        paymentId: id,
        occurrence,
        accountId,
        ...(amountCents === undefined ? {} : { amountCents }),
      });
      useTransactionsStore.getState().addExisting(transaction);
      set((state) => ({
        payments: state.payments.map((item) =>
          item.id === id ? { ...item, lastConfirmedAt: payment.lastConfirmedAt } : item,
        ),
      }));
      // The paid occurrence's reminders go; the next occurrence's are planned.
      void requestReminderSync();
      return 'paid';
    } catch (error) {
      // Already paid (an overlapping call, or a stale card): nothing was written.
      // Not a failure, not logged. Bring this payment up to date from the
      // database, so a stale card goes away.
      if (error instanceof AlreadyHandledError) {
        await refreshOne(id);
        return 'already';
      }
      // Diagnostic, like the list failure above.
      console.error('[recurring] pay failed:', error);
      return 'failed';
    }
  },
  skip: async (id, occurrence) => {
    try {
      const payment = await skipOccurrence(id, occurrence);
      set((state) => ({
        payments: state.payments.map((item) =>
          item.id === id ? { ...item, lastConfirmedAt: payment.lastConfirmedAt } : item,
        ),
      }));
      void requestReminderSync();
      return 'skipped';
    } catch (error) {
      if (error instanceof AlreadyHandledError) {
        await refreshOne(id);
        return 'already';
      }
      // Diagnostic, like the list failure above.
      console.error('[recurring] skip failed:', error);
      return 'failed';
    }
  },
  setLastConfirmed: (id, day) => {
    set((state) => ({
      payments: state.payments.map((item) =>
        item.id === id ? { ...item, lastConfirmedAt: day } : item,
      ),
    }));
    // Undoing a payment (deleting its expense) brings its reminders back.
    void requestReminderSync();
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
