import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AccountCapLine } from '@/components/account-cap-line';
import { AccountRangeChart } from '@/components/range-chart';
import { RecurringSection } from '@/components/recurring-section';
import { TransactionList } from '@/components/transaction-list';
import {
  AmountText,
  AppButton,
  AppIcon,
  AppText,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { formatShortDate } from '@/services/format-date';
import { computeBalances } from '@/services/transactions';
import { useAccounts, useAccountsStore } from '@/stores/accounts-store';
import { useRecurring } from '@/stores/recurring-store';
import { useTransactions } from '@/stores/transactions-store';
import { sizes, spacing } from '@/theme';

// What the delete confirmation says goes with the account. Transactions alone
// keep their own message; recurring payments (alone or with transactions) list
// each count with its own plural.
function deleteMessage(t: TFunction, transactions: number, recurring: number): string {
  if (recurring === 0) {
    return transactions > 0
      ? t('accounts.deleteMessageWithTransactions', { count: transactions })
      : t('accounts.deleteMessage');
  }
  const recurringText = t('accounts.deleteItemRecurring', { count: recurring });
  const items =
    transactions > 0
      ? t('accounts.deleteItemsJoin', {
          first: t('accounts.deleteItemTransactions', { count: transactions }),
          second: recurringText,
        })
      : recurringText;
  return t('accounts.deleteMessageWithItems', { items });
}

export default function AccountDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, status, reload } = useAccounts();
  const remove = useAccountsStore((state) => state.remove);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const {
    transactions,
    status: transactionsStatus,
    reload: reloadTransactions,
  } = useTransactions();
  const {
    payments,
    status: recurringStatus,
    reload: reloadRecurring,
  } = useRecurring();
  const account = accounts.find((item) => item.id === Number(id));
  const accountPayments = useMemo(
    () => payments.filter((item) => item.accountId === Number(id)),
    [payments, id],
  );
  const balances = useMemo(() => computeBalances(accounts, transactions), [accounts, transactions]);
  const accountTransactions = useMemo(
    () => transactions.filter((item) => item.accountId === Number(id)),
    [transactions, id],
  );

  const confirmDelete = async () => {
    if (!account) return;
    setConfirming(false);
    setDeleting(true);
    const ok = await remove(account.id);
    if (ok) {
      router.back();
    } else {
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

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
  } else if (!account) {
    // While a delete is finishing the account disappears before we navigate back.
    body = (
      <Screen>
        {deleting ? null : <AppText color="textSecondary">{t('accounts.notFound')}</AppText>}
      </Screen>
    );
  } else {
    let empty;
    if (transactionsStatus === 'idle' || transactionsStatus === 'loading') {
      empty = <LoadingState />;
    } else if (transactionsStatus === 'error') {
      empty = (
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void reloadTransactions()}
        />
      );
    } else {
      empty = <AppText color="textSecondary">{t('transactions.accountEmpty')}</AppText>;
    }

    const header = (
      <>
        <View style={styles.header}>
          <AppIcon name={account.icon} size={sizes.iconLarge} />
          <AppText variant="title">{account.name}</AppText>
          <AppText color="textSecondary">{account.currency}</AppText>
          <AmountText
            cents={balances[account.id] ?? 0}
            currency={account.currency}
            variant="title"
            align="left"
            colored
          />
          <AccountCapLine accountId={account.id} currency={account.currency} />
          {account.balanceAnchorAt ? (
            <AppText variant="caption" color="textSecondary">
              {t('accounts.balanceSetOn', {
                date: formatShortDate(new Date(account.balanceAnchorAt), i18n.language),
              })}
            </AppText>
          ) : null}
        </View>
        {deleteFailed ? <AppText color="alert">{t('accounts.deleteError')}</AppText> : null}
        <View style={styles.actions}>
          <AppButton
            label={t('transactions.add')}
            onPress={() =>
              router.push({ pathname: '/transaction/new', params: { accountId: account.id } })
            }
          />
          <AppButton
            label={t('accounts.edit')}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/account/[id]/edit', params: { id: account.id } })
            }
          />
          <AppButton
            label={t('accounts.delete')}
            variant="destructive"
            // The confirmation states how many transactions and recurring
            // payments go too, so wait for them.
            disabled={transactionsStatus !== 'ready' || recurringStatus !== 'ready'}
            onPress={() => {
              setDeleteFailed(false);
              setConfirming(true);
            }}
          />
        </View>
        {transactionsStatus === 'ready' ? (
          <AccountRangeChart
            accountId={account.id}
            currency={account.currency}
            transactions={transactions}
          />
        ) : null}
        {recurringStatus === 'error' ? (
          <ErrorState
            message={t('common.loadError')}
            retryLabel={t('common.retry')}
            onRetry={() => void reloadRecurring()}
          />
        ) : (
          <RecurringSection
            payments={accountPayments}
            accounts={accounts}
            // Only payments linked to this account are listed, so its own
            // currency is never used as a fallback.
            defaultCurrency={account.currency}
            onOpen={(paymentId) =>
              router.push({ pathname: '/recurring/[id]', params: { id: paymentId } })
            }
          />
        )}
      </>
    );

    body = (
      <Screen>
        <TransactionList
          transactions={accountTransactions}
          accounts={accounts}
          header={header}
          empty={empty}
          onOpen={(transactionId) =>
            router.push({ pathname: '/transaction/[id]', params: { id: transactionId } })
          }
        />
        <ConfirmDialog
          visible={confirming}
          title={t('accounts.deleteTitle')}
          message={deleteMessage(t, accountTransactions.length, accountPayments.length)}
          confirmLabel={t('accounts.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.detailTitle') }} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
});
