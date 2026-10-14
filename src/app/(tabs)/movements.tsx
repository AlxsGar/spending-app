import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TabScreen } from '@/components/tab-screen';
import { TransactionList } from '@/components/transaction-list';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useLedger } from '@/stores/ledger';

export default function MovementsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts, transactions, status, reload } = useLedger();

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
  } else {
    body = (
      <TransactionList
        transactions={transactions}
        accounts={accounts}
        empty={
          <EmptyState
            title={t('movements.emptyTitle')}
            description={t('movements.emptyDescription')}
            actionLabel={t('movements.emptyAction')}
            onAction={() => router.push('/transaction/new')}
          />
        }
      />
    );
  }

  return <TabScreen>{body}</TabScreen>;
}
