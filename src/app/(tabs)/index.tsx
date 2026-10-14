import { useTranslation } from 'react-i18next';

import { TabScreen } from '@/components/tab-screen';
import { EmptyState } from '@/components/ui';

const noop = () => {};

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <TabScreen>
      <EmptyState
        title={t('home.emptyTitle')}
        description={t('home.emptyDescription')}
        actionLabel={t('home.emptyAction')}
        onAction={noop}
      />
    </TabScreen>
  );
}
