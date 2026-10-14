import { useMemo } from 'react';

import { computeBalances } from '@/services/transactions';

import { useAccounts } from './accounts-store';
import { useTransactions } from './transactions-store';

// Accounts and their transactions together, for screens that show balances or
// activity. Any error wins, then any load in progress.
export function useLedger() {
  const accounts = useAccounts();
  const transactions = useTransactions();

  const balances = useMemo(
    () => computeBalances(transactions.transactions),
    [transactions.transactions],
  );

  let status: 'loading' | 'error' | 'ready' = 'ready';
  if (accounts.status === 'error' || transactions.status === 'error') {
    status = 'error';
  } else if (accounts.status !== 'ready' || transactions.status !== 'ready') {
    status = 'loading';
  }

  const reload = () => {
    if (accounts.status !== 'ready') void accounts.reload();
    if (transactions.status !== 'ready') void transactions.reload();
  };

  return {
    accounts: accounts.accounts,
    transactions: transactions.transactions,
    balances,
    status,
    reload,
  };
}
