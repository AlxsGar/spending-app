import { create } from 'zustand';

import { startNotifications } from '@/services/notifications';
import type { ReminderTap } from '@/services/notifications';

// A tap waiting to be routed. A tap can arrive before the app is ready (a cold
// start: the app launched by the notification, DB and language not loaded yet),
// so it waits here until the NotificationHost, which only exists once the app is
// ready, takes it. `nonce` makes every tap distinct, so tapping the same
// reminder twice routes twice.
export type PendingTap = ReminderTap & { nonce: number };

type State = {
  pending: PendingTap | null;
  push: (tap: ReminderTap) => void;
  // Takes the pending tap (clears it) if it is still the given one.
  consume: (nonce: number) => void;
};

let counter = 0;

export const useNotificationTapStore = create<State>((set, get) => ({
  pending: null,
  push: (tap) => set({ pending: { ...tap, nonce: ++counter } }),
  consume: (nonce) => {
    if (get().pending?.nonce === nonce) set({ pending: null });
  },
}));

// Called once from the root layout: starts notification handling and queues
// every reminder tap. Returns the cleanup.
export function startReminderNotifications(channelName: string): () => void {
  return startNotifications((tap) => useNotificationTapStore.getState().push(tap), channelName);
}
