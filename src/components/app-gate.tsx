import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { CapSnackbarHost } from '@/components/cap-snackbar-host';
import { CapsDialogHost } from '@/components/caps-exceeded-dialog';
import { LockHost } from '@/components/lock-host';
import { LockLoadError } from '@/components/lock-load-error';
import { NotificationHost } from '@/components/notification-host';
import { ErrorState, LoadingState, Screen, SuccessHost } from '@/components/ui';
import { useAppLockStore } from '@/stores/app-lock-store';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useLanguageStore } from '@/stores/language-store';
import { colors } from '@/theme';

export function AppGate() {
  const { t } = useTranslation();
  const ready = useLanguageStore((state) => state.ready);
  const error = useLanguageStore((state) => state.error);
  const init = useLanguageStore((state) => state.init);
  const lockLoaded = useAppLockStore((state) => state.loaded);
  const lockLoadError = useAppLockStore((state) => state.loadError);
  // Locked, or covered while in the background: the screens are hidden either way.
  const locked = useAppLockStore((state) => state.locked || state.covered);

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

  // The lock flags are read before anything renders, so the app never shows
  // content for a frame before the lock.
  useEffect(() => {
    void useAppLockStore.getState().load();
  }, []);

  if (lockLoadError) return <LockLoadError />;
  if (!ready || !lockLoaded) return <LoadingState />;
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
      {/* While locked the screens stay mounted (so the navigation state is kept)
          but are invisible, untouchable and hidden from screen readers, from the
          very first render: the lock overlay then covers the empty background. */}
      <View
        testID="app-screens"
        style={locked ? styles.hidden : styles.visible}
        pointerEvents={locked ? 'none' : 'auto'}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}
      >
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
      </View>
      {/* Nothing that can sit over the screens or navigate them (the success
          card, the cap snackbar and dialog) is mounted while locked. */}
      {locked ? null : (
        <>
          <SuccessHost />
          <CapSnackbarHost />
          <CapsDialogHost />
        </>
      )}
      <NotificationHost />
      <LockHost />
    </>
  );
}

const styles = StyleSheet.create({
  visible: { flex: 1 },
  hidden: { flex: 1, opacity: 0 },
});
