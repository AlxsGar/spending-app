import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { requestReminderSync } from '@/services/reminders';
import { useLanguageStore } from '@/stores/language-store';
import { useNotificationTapStore } from '@/stores/notification-taps';

// Mounted once the app is ready (the database and language are loaded, the
// navigator exists). Renders nothing. It does two jobs:
// - keeps the scheduled reminders in step: a sync when the app opens, when it
//   returns to the foreground (which covers a new day) and when the language
//   changes (the notification text is translated when it is scheduled);
// - routes a tapped reminder to the Recurring payments screen with that
//   payment's actions dialog open. A tap that arrived earlier (the app was
//   launched by it) waits in the tap store until this is mounted.
export function NotificationHost() {
  const router = useRouter();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pending = useNotificationTapStore((state) => state.pending);
  const consume = useNotificationTapStore((state) => state.consume);
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    void requestReminderSync();
  }, [language]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void requestReminderSync();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pending || !navigationReady) return;
    consume(pending.nonce);
    router.navigate({
      pathname: '/recurring',
      params: {
        open: String(pending.recurringId),
        occ: pending.occurrence,
        n: String(pending.nonce),
      },
    });
  }, [pending, navigationReady, consume, router]);

  return null;
}
