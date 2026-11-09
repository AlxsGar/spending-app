import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RecurringForm } from '@/components/recurring-form';
import { RecurringPayDialog } from '@/components/recurring-pay-dialog';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { toDay } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useDefaultReminders } from '@/stores/default-reminders';
import { useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';

export default function NewRecurringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts, status, reload } = useAccounts();
  const defaultCurrency = useDefaultCurrency();
  const defaultReminders = useDefaultReminders();
  const add = useRecurringStore((state) => state.add);
  // The payment just created that starts today, while the question is open.
  const [askAbout, setAskAbout] = useState<RecurringPayment | null>(null);

  // Shown over the screen we go back to, so it never sits on the form.
  const finish = (saved: RecurringPayment) => {
    showSuccess({
      icon: 'check',
      tone: 'neutral',
      message: t('recurring.created'),
      detail: saved.name,
    });
    router.back();
  };

  let body;
  if (
    status === 'idle' ||
    status === 'loading' ||
    defaultCurrency === null ||
    defaultReminders === null
  ) {
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
  } else {
    // A new payment starts with no account ("Not set"), also when there are none.
    body = (
      <Screen>
        <RecurringForm
          accounts={accounts}
          initialAccountId={null}
          defaultCurrency={defaultCurrency}
          initialReminders={defaultReminders}
          onSubmit={async (input) => {
            const saved = await add(input);
            if (!saved) return false;
            // An active payment that starts today may already be paid: ask
            // first, on this screen, instead of the "created" card. One modal
            // at a time; the answer then shows its own card over the screen
            // we go back to.
            if (saved.active && saved.startDate === toDay(new Date())) {
              setAskAbout(saved);
              return true;
            }
            finish(saved);
            return true;
          }}
        />
        {askAbout ? (
          <RecurringPayDialog
            mode="today"
            payment={askAbout}
            occurrence={askAbout.startDate}
            overdue={false}
            today={askAbout.startDate}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            onDone={(outcome) => {
              // Paid shows "Payment recorded" itself; otherwise the payment was
              // only created.
              if (outcome === 'paid') router.back();
              else finish(askAbout);
            }}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('recurring.newTitle') }} />
      {body}
    </>
  );
}
