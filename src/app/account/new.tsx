import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AccountForm } from '@/components/account-form';
import { LoadingState } from '@/components/ui';
import { ACCOUNT_ICONS } from '@/services/accounts';
import { useAccountsStore } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { showSuccess } from '@/stores/success-store';

export default function NewAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const add = useAccountsStore((state) => state.add);
  const currency = useDefaultCurrency();

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.newTitle') }} />
      {currency === null ? (
        <LoadingState />
      ) : (
        <AccountForm
          initial={{ name: '', icon: ACCOUNT_ICONS[0], currency }}
          defaultCurrency={currency}
          onSubmit={async (input) => {
            const ok = await add(input);
            if (ok) {
              showSuccess({
                icon: 'check',
                tone: 'neutral',
                message: t('accounts.created'),
                detail: input.name.trim(),
              });
              router.back();
            }
            return ok;
          }}
        />
      )}
    </>
  );
}
