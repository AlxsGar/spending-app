import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TransactionForm } from '@/components/transaction-form';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { formatSignedMoney, parseAmountToCents } from '@/services/money';
import { useAccounts } from '@/stores/accounts-store';
import { showSuccess } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';

export default function NewTransactionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const { accounts, status, reload } = useAccounts();
  const add = useTransactionsStore((state) => state.add);

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <LoadingState />;
  } else if (status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void reload()}
        />
      </Screen>
    );
  } else if (accounts.length === 0) {
    body = (
      <Screen>
        <EmptyState
          title={t('transactions.noAccountsTitle')}
          description={t('transactions.noAccountsDescription')}
          actionLabel={t('transactions.noAccountsAction')}
          onAction={() => router.push('/account/new')}
        />
      </Screen>
    );
  } else {
    // The param preselects an account; otherwise (or if it is gone) the first by id.
    const requested = accounts.find((item) => item.id === Number(accountId));
    body = (
      <Screen>
        <TransactionForm
          accounts={accounts}
          initialAccountId={(requested ?? accounts[0]).id}
          onSubmit={async (input) => {
            const ok = await add(input);
            if (ok) {
              // Shown over the screen we go back to, so it never sits on the form.
              const currency = accounts.find((item) => item.id === input.accountId)?.currency;
              const parsed = currency ? parseAmountToCents(input.amount, currency) : null;
              const income = input.kind === 'income';
              showSuccess({
                icon: income ? 'arrow-up' : 'arrow-down',
                tone: income ? 'positive' : 'negative',
                message: t(income ? 'transactions.savedIncome' : 'transactions.savedExpense'),
                amountText:
                  currency && parsed?.ok
                    ? formatSignedMoney(income ? parsed.cents : -parsed.cents, currency, {
                        showPlus: true,
                      })
                    : undefined,
              });
              router.back();
            }
            return ok;
          }}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('transactions.newTitle') }} />
      {body}
    </>
  );
}
