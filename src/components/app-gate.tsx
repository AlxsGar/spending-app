import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useLanguageStore } from '@/stores/language-store';

export function AppGate() {
  const { t } = useTranslation();
  const ready = useLanguageStore((state) => state.ready);
  const error = useLanguageStore((state) => state.error);
  const init = useLanguageStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return <LoadingState />;
  if (error) {
    return (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void init()}
        />
      </Screen>
    );
  }
  return <Slot />;
}
