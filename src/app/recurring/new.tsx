import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RecurringForm } from '@/components/recurring-form';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';

export default function NewRecurringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts, status, reload } = useAccounts();
  const defaultCurrency = useDefaultCurrency();
  const add = useRecurringStore((state) => state.add);

  let body;
  if (status === 'idle' || status === 'loading' || defaultCurrency === null) {
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
          onSubmit={async (input) => {
            const saved = await add(input);
            if (!saved) return false;
            // Shown over the screen we go back to, so it never sits on the form.
            showSuccess({
              icon: 'check',
              tone: 'neutral',
              message: t('recurring.created'),
              detail: saved.name,
            });
            router.back();
            return true;
          }}
        />
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
