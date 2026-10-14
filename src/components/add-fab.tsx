import { useIsFocused, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Fab } from '@/components/ui';

const noop = () => {};

export function AddFab() {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const router = useRouter();

  return (
    <Fab
      label={t('fab.open')}
      visible={focused}
      actions={[
        { key: 'transaction', label: t('fab.addTransaction'), icon: 'cash-plus', onPress: noop },
        { key: 'recurring', label: t('fab.addRecurring'), icon: 'calendar-sync', onPress: noop },
        {
          key: 'account',
          label: t('fab.addAccount'),
          icon: 'bank-plus',
          onPress: () => router.push('/account/new'),
        },
      ]}
    />
  );
}
