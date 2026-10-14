import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AccountCards } from '@/components/account-cards';
import { TabScreen } from '@/components/tab-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useAccounts } from '@/stores/accounts-store';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts, status, reload } = useAccounts();

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <LoadingState />;
  } else if (status === 'error') {
    body = (
      <ErrorState
        message={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void reload()}
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
      <AccountCards
        accounts={accounts}
        onOpen={(id) => router.push({ pathname: '/account/[id]', params: { id } })}
      />
    );
  }

  return <TabScreen>{body}</TabScreen>;
}
