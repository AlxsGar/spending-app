import { useMemo } from 'react';

import { dayToDate } from '@/services/recurring';
import { exceededCaps } from '@/services/soft-caps';
import { useAccounts } from '@/stores/accounts-store';
import { useCaps } from '@/stores/caps-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useToday } from '@/stores/today';
import { useTransactions } from '@/stores/transactions-store';

// The caps exceeded right now. Recomputes when the transactions, accounts or
// caps change, and when the local day changes (a new day, week or month can
// clear a cap). Empty while anything is unread or the caps failed to load.
export function useExceededCaps() {
  const { accounts } = useAccounts();
  const { transactions } = useTransactions();
  const { caps, status, reload } = useCaps();
  const defaultCurrency = useDefaultCurrency();
  const today = useToday();

  const exceeded = useMemo(() => {
    if (defaultCurrency === null || status === 'error') return [];
    return exceededCaps({
      caps,
      accounts,
      transactions,
      defaultCurrency,
      now: dayToDate(today),
    });
  }, [caps, status, accounts, transactions, defaultCurrency, today]);

  // False until the default currency is read; "nothing exceeded" is not an
  // answer yet.
  return { exceeded, accounts, reload, ready: defaultCurrency !== null };
}
