import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountForm } from '@/components/account-form';
import { LoadingState } from '@/components/ui';
import { ACCOUNT_ICONS, FALLBACK_CURRENCY, getDefaultCurrency } from '@/services/accounts';
import type { Currency } from '@/services/accounts';
import { useAccountsStore } from '@/stores/accounts-store';

export default function NewAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const add = useAccountsStore((state) => state.add);
  const [currency, setCurrency] = useState<Currency | null>(null);

  useEffect(() => {
    let active = true;
    getDefaultCurrency()
      .catch(() => FALLBACK_CURRENCY)
      .then((value) => {
        if (active) setCurrency(value);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.newTitle') }} />
      {currency === null ? (
        <LoadingState />
      ) : (
        <AccountForm
          initial={{ name: '', icon: ACCOUNT_ICONS[0], currency }}
          onSubmit={async (input) => {
            const ok = await add(input);
            if (ok) router.back();
            return ok;
          }}
        />
      )}
    </>
  );
}
