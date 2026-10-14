import { useTranslation } from 'react-i18next';

import { TabScreen } from '@/components/tab-screen';
import { EmptyState } from '@/components/ui';

const noop = () => {};

export default function AccountsScreen() {
  const { t } = useTranslation();

  return (
    <TabScreen>
      <EmptyState
        title={t('accounts.emptyTitle')}
        description={t('accounts.emptyDescription')}
        actionLabel={t('accounts.emptyAction')}
        onAction={noop}
      />
    </TabScreen>
  );
}
