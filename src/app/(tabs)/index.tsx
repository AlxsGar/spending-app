import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { AccountCards } from '@/components/account-cards';
import { TabScreen } from '@/components/tab-screen';
import { TransactionRow } from '@/components/transaction-row';
import {
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
} from '@/components/ui';
import type { Account } from '@/services/accounts';
import { latestRecorded } from '@/services/transactions';
import { useLedger } from '@/stores/ledger';

const LATEST_COUNT = 3;

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts, transactions, balances, status, reload } = useLedger();

  // The last three RECORDED (not the last three by date), so a backdated
  // entry shows up. Rows of deleted accounts are skipped.
  const latest = useMemo(() => {
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return latestRecorded(transactions, LATEST_COUNT, (item) => byId.has(item.accountId)).map(
      (item) => ({ item, account: byId.get(item.accountId) as Account }),
    );
  }, [accounts, transactions]);

  let body;
  if (status === 'loading') {
    body = <LoadingState />;
  } else if (status === 'error') {
    body = (
      <ErrorState
        message={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={reload}
      />
    );
  } else if (accounts.length === 0) {
    body = (
      <EmptyState
        title={t('home.emptyTitle')}
        description={t('home.emptyDescription')}
        actionLabel={t('home.emptyAction')}
        onAction={() => router.push('/account/new')}
      />
    );
  } else {
    body = (
      <ScrollView>
        <AccountCards
          accounts={accounts}
          balances={balances}
          onOpen={(id) => router.push({ pathname: '/account/[id]', params: { id } })}
        />
        <SectionHeader title={t('transactions.latest')} />
        {latest.length === 0 ? (
          <AppText color="textSecondary">{t('transactions.latestEmpty')}</AppText>
        ) : (
          latest.map(({ item, account }) => (
            <TransactionRow key={item.id} transaction={item} account={account} showDate />
          ))
        )}
      </ScrollView>
    );
  }

  return <TabScreen>{body}</TabScreen>;
}
