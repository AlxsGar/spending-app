import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TransactionForm } from '@/components/transaction-form';
import {
  AppButton,
  AppText,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { formatCentsForInput, formatSignedMoney } from '@/services/money';
import { useAccounts } from '@/stores/accounts-store';
import { showSuccess } from '@/stores/success-store';
import { useTransactions, useTransactionsStore } from '@/stores/transactions-store';

export default function EditTransactionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountsState = useAccounts();
  const transactionsState = useTransactions();
  const update = useTransactionsStore((state) => state.update);
  const remove = useTransactionsStore((state) => state.remove);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const { accounts } = accountsState;
  const transaction = transactionsState.transactions.find((item) => item.id === Number(id));
  const hasAccount = transaction
    ? accounts.some((item) => item.id === transaction.accountId)
    : false;

  const confirmDelete = async () => {
    if (!transaction) return;
    setConfirming(false);
    setDeleting(true);
    const ok = await remove(transaction.id);
    if (ok) {
      router.back();
    } else {
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  let body;
  if (
    accountsState.status === 'idle' ||
    accountsState.status === 'loading' ||
    transactionsState.status === 'idle' ||
    transactionsState.status === 'loading'
  ) {
    body = <LoadingState />;
  } else if (accountsState.status === 'error' || transactionsState.status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            if (accountsState.status === 'error') void accountsState.reload();
            if (transactionsState.status === 'error') void transactionsState.reload();
          }}
        />
      </Screen>
    );
  } else if (!transaction || !hasAccount) {
    // While a delete is finishing the transaction disappears before we go back.
    body = (
      <Screen>
        {deleting ? null : (
          <AppText color="textSecondary">{t('transactions.notFound')}</AppText>
        )}
      </Screen>
    );
  } else {
    body = (
      <Screen>
        <TransactionForm
          accounts={accounts}
          initialAccountId={transaction.accountId}
          initial={{
            kind: transaction.kind,
            amount: formatCentsForInput(
              transaction.amountCents,
              accounts.find((item) => item.id === transaction.accountId)?.currency ?? '',
            ),
            date: new Date(transaction.date),
            note: transaction.note ?? '',
          }}
          onSubmit={async (input) => {
            const saved = await update(transaction.id, input);
            if (!saved) return false;
            // Shown over the screen we go back to, so it never sits on the form.
            // The amount comes from what was stored, not from the typed text.
            const currency = accounts.find((item) => item.id === saved.accountId)?.currency;
            const income = saved.kind === 'income';
            showSuccess({
              icon: income ? 'arrow-up' : 'arrow-down',
              tone: income ? 'positive' : 'negative',
              message: t(income ? 'transactions.updatedIncome' : 'transactions.updatedExpense'),
              amountText: currency
                ? formatSignedMoney(income ? saved.amountCents : -saved.amountCents, currency, {
                    showPlus: true,
                  })
                : undefined,
            });
            router.back();
            return true;
          }}
        >
          {deleteFailed ? <AppText color="alert">{t('transactions.deleteError')}</AppText> : null}
          <AppButton
            label={t('transactions.delete')}
            variant="destructive"
            disabled={deleting}
            onPress={() => {
              setDeleteFailed(false);
              setConfirming(true);
            }}
          />
        </TransactionForm>
        <ConfirmDialog
          visible={confirming}
          title={t('transactions.deleteTitle')}
          message={t('transactions.deleteMessage')}
          confirmLabel={t('transactions.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('transactions.editTitle') }} />
      {body}
    </>
  );
}
