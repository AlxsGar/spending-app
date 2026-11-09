import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { RecurringSection } from '@/components/recurring-section';
import { RecurringSkipDialog } from '@/components/recurring-skip-dialog';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { actionOccurrence } from '@/services/recurring';
import type { Day } from '@/services/recurring';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring } from '@/stores/recurring-store';
import { useToday } from '@/stores/today';

// Every recurring payment, soonest due first. Tap a row to edit it; its ⋮ menu
// has Pay now, Skip and Edit.
export default function RecurringListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accountsState = useAccounts();
  const recurring = useRecurring();
  const defaultCurrency = useDefaultCurrency();
  const today = useToday();
  // The occurrence a Skip question is open for.
  const [skipping, setSkipping] = useState<{ id: number; occurrence: Day } | null>(null);
  const skipPayment = skipping
    ? recurring.payments.find((item) => item.id === skipping.id)
    : undefined;

  const askSkip = (id: number) => {
    const payment = recurring.payments.find((item) => item.id === id);
    const occurrence = payment ? actionOccurrence(payment, today) : null;
    if (occurrence !== null) setSkipping({ id, occurrence });
  };

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
            onPay={(id) => router.push({ pathname: '/recurring/[id]/pay', params: { id } })}
            onSkip={askSkip}
          />
        </ScrollView>
        {skipping && skipPayment ? (
          <RecurringSkipDialog
            payment={skipPayment}
            occurrence={skipping.occurrence}
            onDone={() => setSkipping(null)}
          />
        ) : null}
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
