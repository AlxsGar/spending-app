import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountForm } from '@/components/account-form';
import { AppText, ErrorState, LoadingState, Screen } from '@/components/ui';
import { computeBalances } from '@/services/transactions';
import { useAccounts, useAccountsStore } from '@/stores/accounts-store';
import { showSuccess } from '@/stores/success-store';
import { useTransactions } from '@/stores/transactions-store';

export default function EditAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, status, reload } = useAccounts();
  const update = useAccountsStore((state) => state.update);
  const {
    transactions,
    status: transactionsStatus,
    reload: reloadTransactions,
  } = useTransactions();
  const account = accounts.find((item) => item.id === Number(id));
  const balances = useMemo(() => computeBalances(accounts, transactions), [accounts, transactions]);

  let body;
  // The transactions decide the balance prefill and whether a currency change
  // needs confirming, so the form is shown only when both stores are ready.
  if (status === 'error' || transactionsStatus === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            if (status !== 'ready') void reload();
            if (transactionsStatus !== 'ready') void reloadTransactions();
          }}
        />
      </Screen>
    );
  } else if (status !== 'ready' || transactionsStatus !== 'ready') {
    body = <LoadingState />;
  } else if (!account) {
    body = (
      <Screen>
        <AppText color="textSecondary">{t('accounts.notFound')}</AppText>
      </Screen>
    );
  } else {
    body = (
      <AccountForm
        initial={{ name: account.name, icon: account.icon, currency: account.currency }}
        transactionCount={
          transactions.filter((item) => item.accountId === account.id).length
        }
        currentBalanceCents={balances[account.id] ?? 0}
        onSubmit={async (input) => {
          const ok = await update(account.id, input);
          if (ok) {
            showSuccess({
              icon: 'check',
              tone: 'neutral',
              message: t('accounts.updated'),
              detail: input.name.trim(),
            });
            router.back();
          }
          return ok;
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.editTitle') }} />
      {body}
    </>
  );
}
