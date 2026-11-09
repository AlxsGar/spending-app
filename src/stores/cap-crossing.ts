import type { Account } from '@/services/accounts';
import { crossedCaps, exceededCaps, headlineCap } from '@/services/soft-caps';
import type { ExceededCap } from '@/services/soft-caps';
import type { Transaction } from '@/services/transactions';

import { useAccountsStore } from './accounts-store';
import { useCapSnackbarStore } from './cap-snackbar-store';
import type { CapNotice } from './cap-snackbar-store';
import { useCapsStore } from './caps-store';
import { rememberedDefaultCurrency } from './default-currency';
import { useTransactionsStore } from './transactions-store';

// The transactions as they were before a save; null when they were not all
// loaded yet (a cold start), which means the check does nothing.
export type CapWatch = {
  before: Transaction[] | null;
};

// Call right before a save that creates or edits an expense (add, edit, Pay now,
// quick Paid). Reads memory only, so it never delays the save.
export function beginCapWatch(): CapWatch {
  const { transactions, status } = useTransactionsStore.getState();
  return { before: status === 'ready' ? transactions : null };
}

function noticeFrom(crossed: ExceededCap[], accounts: readonly Account[]): CapNotice | null {
  const headline = headlineCap(crossed);
  if (headline === null) return null;
  const name =
    headline.accountId === null
      ? ''
      : (accounts.find((item) => item.id === headline.accountId)?.name ?? '');
  return { cap: headline, name, more: crossed.length - 1 };
}

// Whether everything the check reads is loaded; the default currency comes from
// memory. Not ready means the check does nothing at all.
function readInputs() {
  const caps = useCapsStore.getState();
  const accounts = useAccountsStore.getState();
  const transactions = useTransactionsStore.getState();
  const defaultCurrency = rememberedDefaultCurrency();
  if (
    caps.status !== 'ready' ||
    accounts.status !== 'ready' ||
    transactions.status !== 'ready' ||
    defaultCurrency === null
  ) {
    return null;
  }
  return {
    caps: caps.caps,
    accounts: accounts.accounts,
    transactions: transactions.transactions,
    defaultCurrency,
  };
}

// Call after the save succeeded, next to showSuccess (and only then: a failed
// save or an "already handled" one never calls it). Finds the caps the save
// pushed from at or under to strictly over and queues one notice. A newer
// crossing replaces an older notice; a save that crosses nothing, or a check
// that cannot run (data not loaded, no default currency, any error), leaves any
// pending or showing notice alone. Synchronous and never throws, so it cannot
// delay or fail a save.
export function finishCapWatch(watch: CapWatch): void {
  try {
    if (watch.before === null) return;
    const inputs = readInputs();
    if (inputs === null) return;
    const crossed = crossedCaps({
      caps: inputs.caps,
      accounts: inputs.accounts,
      before: watch.before,
      after: inputs.transactions,
      defaultCurrency: inputs.defaultCurrency,
      now: new Date(),
    });
    const notice = noticeFrom(crossed, inputs.accounts);
    if (notice === null) return;
    useCapSnackbarStore
      .getState()
      .replace({ notice, crossed: crossed.map((item) => item.accountId) });
  } catch {
    // Caps never affect a save.
  }
}

// Called by the host when the saved card has closed and a notice is about to
// show. Re-checks which of its caps are still exceeded (the user may have edited
// or deleted since). Caps that no longer are exceeded are left out, and the
// headline and "and N more" are recomputed from the rest, with current amounts;
// with none left the notice is dropped. The remaining caps were crossed by that
// save and are still over, so they are still worth telling. If the check cannot
// run, the notice shows as it was.
export function showPendingCapNotice(): void {
  const store = useCapSnackbarStore.getState();
  const pending = store.pending;
  if (pending === null) return;
  let notice: CapNotice | null = pending.notice;
  try {
    const inputs = readInputs();
    if (inputs !== null) {
      const stillOver = exceededCaps({ ...inputs, now: new Date() }).filter((item) =>
        pending.crossed.includes(item.accountId),
      );
      notice = noticeFrom(stillOver, inputs.accounts);
    }
  } catch {
    // Show it as it was.
  }
  store.promote(notice);
}
