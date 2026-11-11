import { useEffect } from 'react';
import { AppState, BackHandler } from 'react-native';

import { LockScreen } from '@/components/lock-screen';
import { LockOverlay } from '@/components/ui';
import { useAppLockStore } from '@/stores/app-lock-store';

// Mounted once by AppGate, after the screens. Locks the app when it comes back
// from more than a minute in the background, and covers everything with the
// lock screen while it is locked. It also swallows the Android back button, so
// the screens behind cannot be navigated.
export function LockHost() {
  const locked = useAppLockStore((state) => state.locked);
  const covered = useAppLockStore((state) => state.covered);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      useAppLockStore.getState().handleAppState(state),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!locked) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [locked]);

  if (locked) {
    return (
      <LockOverlay>
        <LockScreen />
      </LockOverlay>
    );
  }
  // In the background with the lock on: a plain opaque cover (no PIN pad) that
  // guards against a flash of content on return. It may also hide the
  // app-switcher preview, but the OS can take its snapshot before this renders
  // (to be checked on a device). It goes away on return within the timeout.
  return covered ? <LockOverlay>{null}</LockOverlay> : null;
}
