import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useLanguageStore } from '@/stores/language-store';
import { colors } from '@/theme';

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
  // Tabs are the root; account screens are stack routes pushed above them.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
