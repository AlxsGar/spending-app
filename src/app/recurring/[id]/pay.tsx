import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RecurringPayForm } from '@/components/recurring-pay-form';
import { AppText, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { formatShortDate } from '@/services/format-date';
import { actionOccurrence, dayToDate } from '@/services/recurring';
import type { Account } from '@/services/accounts';
import type { RecurringPayment } from '@/services/recurring';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring, useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';
import { useToday } from '@/stores/today';

type BodyProps = {
  payment: RecurringPayment;
  accounts: Account[];
  defaultCurrency: string;
};

// Mounted once the payment is loaded. The occurrence is fixed when the screen
// opens, so it does not jump to the next one while the screen closes after a
// payment.
function PayNowBody({ payment, accounts, defaultCurrency }: BodyProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const today = useToday();
  const pay = useRecurringStore((state) => state.pay);
  const [occurrence] = useState(() => actionOccurrence(payment, today));

  if (occurrence === null) {
    return (
      <>
        <Stack.Screen options={{ title: t('recurring.payNow.titleDefault') }} />
        <Screen>
          <AppText color="textSecondary">{t('recurring.payNow.nothingToPay')}</AppText>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('recurring.payNow.title', {
            date: formatShortDate(dayToDate(occurrence), i18n.language),
          }),
        }}
      />
      <Screen>
        <RecurringPayForm
          payment={payment}
          occurrence={occurrence}
          accounts={accounts}
          defaultCurrency={defaultCurrency}
          onSubmit={async (accountId, amountCents) => {
            const outcome = await pay(payment.id, occurrence, accountId, amountCents);
            if (outcome === 'failed') return false;
            // Already handled elsewhere (a stale screen): nothing was recorded
            // here, so no success card. The payment was refreshed.
            // Shown over the screen we go back to, so it never sits on the form.
            if (outcome === 'paid') {
              showSuccess({
                icon: 'arrow-down',
                tone: 'negative',
                message: t('recurring.pay.recorded'),
                detail: payment.name,
              });
            }
            router.back();
            return true;
          }}
        />
      </Screen>
    </>
  );
}

export default function PayRecurringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountsState = useAccounts();
  const recurringState = useRecurring();
  const defaultCurrency = useDefaultCurrency();

  const payment = recurringState.payments.find((item) => item.id === Number(id));

  let body;
  // The form sets its own title ("Pay Nov 1"); every other state uses this one.
  let defaultTitle = true;
  if (
    accountsState.status === 'idle' ||
    accountsState.status === 'loading' ||
    recurringState.status === 'idle' ||
    recurringState.status === 'loading' ||
    defaultCurrency === null
  ) {
    body = <LoadingState />;
  } else if (accountsState.status === 'error' || recurringState.status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            if (accountsState.status === 'error') void accountsState.reload();
            if (recurringState.status === 'error') void recurringState.reload();
          }}
        />
      </Screen>
    );
  } else if (!payment) {
    body = (
      <Screen>
        <AppText color="textSecondary">{t('recurring.notFound')}</AppText>
      </Screen>
    );
  } else if (accountsState.accounts.length === 0) {
    body = (
      <Screen>
        <EmptyState
          title={t('transactions.noAccountsTitle')}
          description={t('recurring.pay.noAccounts')}
          actionLabel={t('transactions.noAccountsAction')}
          onAction={() => router.push('/account/new')}
        />
      </Screen>
    );
  } else {
    defaultTitle = false;
    body = (
      <PayNowBody
        payment={payment}
        accounts={accountsState.accounts}
        defaultCurrency={defaultCurrency}
      />
    );
  }

  return (
    <>
      {defaultTitle ? <Stack.Screen options={{ title: t('recurring.payNow.titleDefault') }} /> : null}
      {body}
    </>
  );
}
