import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RecurringStack } from '@/components/recurring-stack';
import { TabScreen } from '@/components/tab-screen';
import { TransactionList } from '@/components/transaction-list';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useLedger } from '@/stores/ledger';
import { useRecurring } from '@/stores/recurring-store';

export default function MovementsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ledger = useLedger();
  const recurring = useRecurring();
  const { accounts, transactions } = ledger;

  let status = ledger.status;
  if (recurring.status === 'error') {
    status = 'error';
  } else if (status !== 'error' && recurring.status !== 'ready') {
    status = 'loading';
  }
  const reload = () => {
    ledger.reload();
    if (recurring.status !== 'ready') void recurring.reload();
  };

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
        header={<RecurringStack />}
        onOpen={(id) => router.push({ pathname: '/transaction/[id]', params: { id } })}
        // With recurring payments above, the page is not empty.
        empty={
          recurring.payments.length > 0 ? null : (
            <EmptyState
              title={t('movements.emptyTitle')}
              description={t('movements.emptyDescription')}
              actionLabel={t('movements.emptyAction')}
              onAction={() => router.push('/transaction/new')}
            />
          )
        }
      />
    );
  }

  return <TabScreen>{body}</TabScreen>;
}
