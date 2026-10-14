import { useTranslation } from 'react-i18next';

import { TabScreen } from '@/components/tab-screen';
import { EmptyState } from '@/components/ui';

const noop = () => {};

export default function MovementsScreen() {
  const { t } = useTranslation();

  return (
    <TabScreen>
      <EmptyState
        title={t('movements.emptyTitle')}
        description={t('movements.emptyDescription')}
        actionLabel={t('movements.emptyAction')}
        onAction={noop}
      />
    </TabScreen>
  );
}
