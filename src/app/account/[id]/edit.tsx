import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AccountForm } from '@/components/account-form';
import { AppText, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAccounts, useAccountsStore } from '@/stores/accounts-store';

export default function EditAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, status, reload } = useAccounts();
  const update = useAccountsStore((state) => state.update);
  const account = accounts.find((item) => item.id === Number(id));

  let body;
  if (status === 'idle' || status === 'loading') {
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
  } else if (!account) {
    body = (
      <Screen>
        <AppText color="textSecondary">{t('accounts.notFound')}</AppText>
      </Screen>
    );
  } else {
    body = (
      <AccountForm
        initial={{ name: account.name, icon: account.icon, currency: account.currency }}
        onSubmit={async (input) => {
          const ok = await update(account.id, input);
          if (ok) router.back();
          return ok;
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.editTitle') }} />
      {body}
    </>
  );
}
