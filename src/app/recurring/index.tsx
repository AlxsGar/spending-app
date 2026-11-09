import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { RecurringSection } from '@/components/recurring-section';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring } from '@/stores/recurring-store';

// Every recurring payment, soonest due first. Tap a row to edit it.
export default function RecurringListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accountsState = useAccounts();
  const recurring = useRecurring();
  const defaultCurrency = useDefaultCurrency();

  let body;
  if (accountsState.status === 'error' || recurring.status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            if (accountsState.status === 'error') void accountsState.reload();
            if (recurring.status === 'error') void recurring.reload();
          }}
        />
      </Screen>
    );
  } else if (
    accountsState.status !== 'ready' ||
    recurring.status !== 'ready' ||
    defaultCurrency === null
  ) {
    body = <LoadingState />;
  } else if (recurring.payments.length === 0) {
    body = (
      <Screen>
        <EmptyState
          title={t('recurring.listEmptyTitle')}
          description={t('recurring.listEmptyDescription')}
          actionLabel={t('recurring.listEmptyAction')}
          onAction={() => router.push('/recurring/new')}
        />
      </Screen>
    );
  } else {
    body = (
      <Screen>
        <ScrollView>
          <RecurringSection
            hideHeader
            payments={recurring.payments}
            accounts={accountsState.accounts}
            defaultCurrency={defaultCurrency}
            onOpen={(id) => router.push({ pathname: '/recurring/[id]', params: { id } })}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('recurring.listTitle') }} />
      {body}
    </>
  );
}
