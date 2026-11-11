import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { RecurringSection } from '@/components/recurring-section';
import { RecurringSkipDialog } from '@/components/recurring-skip-dialog';
import { EmptyState, ErrorState, LoadingState, Screen, ScreenScroll } from '@/components/ui';
import { isReminderActionable } from '@/services/reminder-plan';
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
  // A tapped reminder opens here with the payment (open), its occurrence (occ)
  // and a number that is new for every tap (n).
  const params = useLocalSearchParams<{ open?: string; occ?: string; n?: string }>();
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
    // The dialog opens only for a payment that can still be acted on; a deleted,
    // finished, inactive or already handled one just leaves the list showing.
    // The row opens it when the signal first appears, so it opens once per tap.
    const signal = Number(params.n);
    const tapped = recurring.payments.find((item) => item.id === Number(params.open));
    const openRequest =
      params.open !== undefined &&
      Number.isFinite(signal) &&
      isReminderActionable(tapped, params.occ ?? '', today)
        ? { id: tapped.id, signal }
        : undefined;
    body = (
      <Screen>
        <ScreenScroll>
          <RecurringSection
            hideHeader
            openRequest={openRequest}
            payments={recurring.payments}
            accounts={accountsState.accounts}
            defaultCurrency={defaultCurrency}
            onOpen={(id) => router.push({ pathname: '/recurring/[id]', params: { id } })}
            onPay={(id) => router.push({ pathname: '/recurring/[id]/pay', params: { id } })}
            onSkip={askSkip}
          />
        </ScreenScroll>
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
