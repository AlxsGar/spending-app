import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import {
  getNotificationPermission,
  requestNotificationPermission,
} from '@/services/notifications';
import type { PermissionState } from '@/services/notifications';
import { requestReminderSync } from '@/services/reminders';

type State = {
  // Null until first read.
  status: PermissionState | null;
  refresh: () => Promise<void>;
  // Asks when undecided, then re-syncs the reminders if it was just allowed.
  request: () => Promise<PermissionState>;
};

export const useNotificationPermissionStore = create<State>((set, get) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: await getNotificationPermission() });
    } catch (error) {
      console.error('[notifications] permission read failed:', error);
    }
  },
  request: async () => {
    const before = get().status;
    const status = await requestNotificationPermission();
    set({ status });
    if (status === 'granted' && before !== 'granted') void requestReminderSync();
    return status;
  },
}));

// The notification permission, read on mount and each time the app returns to
// the foreground (the user may have changed it in the system settings).
export function useNotificationPermission(): PermissionState | null {
  const status = useNotificationPermissionStore((state) => state.status);
  const refresh = useNotificationPermissionStore((state) => state.refresh);
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  return status;
}
