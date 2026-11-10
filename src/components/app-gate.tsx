import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { CapSnackbarHost } from '@/components/cap-snackbar-host';
import { CapsDialogHost } from '@/components/caps-exceeded-dialog';
import { NotificationHost } from '@/components/notification-host';
import { ErrorState, LoadingState, Screen, SuccessHost } from '@/components/ui';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
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

  // The app follows the device language: re-check when it returns to the
  // foreground (the user may have changed it in the system settings).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      useLanguageStore
        .getState()
        .syncWithDevice()
        .catch((error) => console.warn('[language] could not apply the device language:', error));
    });
    return () => subscription.remove();
  }, []);

  // Read once at start, in the background; consumers wait or use the MXN
  // fallback until it arrives (see useDefaultCurrency).
  useEffect(() => {
    void useDefaultCurrencyStore.getState().load();
  }, []);

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
    <>
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
      <SuccessHost />
      <CapSnackbarHost />
      <CapsDialogHost />
      <NotificationHost />
    </>
  );
}
