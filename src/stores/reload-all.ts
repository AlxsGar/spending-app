import { useAccountsStore } from './accounts-store';
import { useCapSnackbarStore } from './cap-snackbar-store';
import { useCapsDialogStore } from './caps-dialog-store';
import { useCapsStore } from './caps-store';
import { useChartRangeStore } from './chart-range-store';
import { useDefaultCurrencyStore } from './default-currency';
import { useDefaultRemindersStore } from './default-reminders';
import { useRecurringStore } from './recurring-store';
import { useTransactionsStore } from './transactions-store';

// Re-reads every store from the database after a backup import replaced it.
// The lists are emptied and set back to idle first, because their load only
// runs from idle and would otherwise keep rows that no longer exist.
//
// Other state that points at old data is cleared too:
// - chart-range-store: a pending custom range can name a chart for an account
//   id ('account-<id>') that no longer exists, so it is dropped.
// - cap snackbar and its pending notice: they name caps and accounts of the old
//   data, so they are cleared.
// - caps dialog: it lists the old exceeded caps, so it is closed.
// The success-store card only holds text, so it is safe.
export async function reloadAllStores(): Promise<void> {
  useChartRangeStore.setState({ pending: null });
  useCapSnackbarStore.setState({ pending: null, current: null });
  useCapsDialogStore.setState({ open: false });
  useAccountsStore.setState({ accounts: [], status: 'idle' });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useDefaultCurrencyStore.setState({ value: null, loading: false, saveError: false });
  await Promise.all([
    useAccountsStore.getState().load(),
    useTransactionsStore.getState().load(),
    useRecurringStore.getState().load(),
    useCapsStore.getState().refresh(),
    useDefaultCurrencyStore.getState().load(),
    useDefaultRemindersStore.getState().load(),
  ]);
}
