// The only module that imports expo-notifications (like SQLite, screens and
// components never touch it). Everything platform-specific about local
// notifications lives here: the foreground handler, taps, permission, the
// Android channel, and scheduling.
import * as Notifications from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';

import { REMINDER_ID_PREFIX } from './reminder-plan';
import type { Day } from './recurring';

// ---- Taps -----------------------------------------------------------------

// What a reminder carries in its data, and what a tap hands to the app.
export type ReminderTap = {
  recurringId: number;
  occurrence: Day;
};

function readTap(response: Notifications.NotificationResponse): ReminderTap | null {
  const data = response.notification.request.content.data as
    | { recurringId?: unknown; occurrence?: unknown }
    | null
    | undefined;
  if (typeof data?.recurringId !== 'number' || typeof data.occurrence !== 'string') return null;
  return { recurringId: data.recurringId, occurrence: data.occurrence };
}

// A tap can reach us twice: through the response listener, and through the
// last-response check (at start and whenever the app comes to the foreground,
// which still sees a tap the listener already handled). A tap is identified by
// the notification's identifier, its fire date and the action, and handled once.
// Kept in memory only: the native last response also lives in memory, so a cold
// start can only see the tap that launched the app, never an old one; the
// handled response is also cleared natively. The set is capped so it cannot grow.
const HANDLED_LIMIT = 50;
const handled: string[] = [];

export function resetHandledTaps(): void {
  handled.length = 0;
}

// Handles a response once. Returns the tap when this call was the first to see
// it and it is one of ours, otherwise null.
export function takeTap(response: Notifications.NotificationResponse): ReminderTap | null {
  const key = [
    response.notification.request.identifier,
    response.notification.date,
    response.actionIdentifier,
  ].join('|');
  if (handled.includes(key)) return null;
  handled.push(key);
  if (handled.length > HANDLED_LIMIT) handled.shift();
  return readTap(response);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The channel reminders go through, when it could be created. Android Expo Go
// cannot create channels (setNotificationChannelAsync throws a
// NullPointerException); then channelId stays undefined, triggers leave it out
// and the default channel is used. Custom channels only work in a development
// build.
const CHANNEL_ID = 'reminders';
// How long scheduling waits for the channel before using the default one.
const CHANNEL_TIMEOUT_MS = 5000;
let channelId: string | undefined;
// Settles (never rejects) once channel setup has finished, whatever its outcome.
// Resolved from the start when setup has not begun or is not needed.
let channelReady: Promise<void> = Promise.resolve();

// Starts everything notifications need at app start, in an order that keeps
// each step from blocking the next: the foreground handler, the response
// listener (before anything that can fail), the last-response check (the tap
// that launched the app, also on every return to the foreground), and the
// Android channel last. onTap receives each reminder tap once. Returns the
// cleanup.
export function startNotifications(
  onTap: (tap: ReminderTap) => void,
  channelName: string,
): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  const handle = (response: Notifications.NotificationResponse) => {
    const tap = takeTap(response);
    if (tap) onTap(tap);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);

  const checkLast = () => {
    try {
      const last = Notifications.getLastNotificationResponse();
      if (!last) return;
      handle(last);
      Notifications.clearLastNotificationResponse();
    } catch (error) {
      console.error('[notifications] last response failed:', describeError(error));
    }
  };
  checkLast();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') checkLast();
  });

  if (Platform.OS === 'android') {
    // The name is always English: the channel is created at app start, before
    // the saved language has loaded (the user may see it in system settings).
    // Scheduling waits for this promise (see scheduleOne), so the first sync
    // never races it. It never rejects: a failure falls back to the default
    // channel.
    // If setup has not settled within CHANNEL_TIMEOUT_MS, the default channel is
    // used for this run; a channel that resolves later is ignored (it is tried
    // again at the next app start), so the outcome is deterministic.
    channelReady = new Promise<void>((resolve) => {
      let settled = false;
      const settle = (id: string | undefined, error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channelId = id;
        if (error !== undefined) {
          console.error('[notifications] channel failed, using the default one:', describeError(error));
        }
        resolve();
      };
      const timer = setTimeout(
        () => settle(undefined, `no answer after ${CHANNEL_TIMEOUT_MS} ms`),
        CHANNEL_TIMEOUT_MS,
      );
      // A synchronous throw must not reject channelReady or leave the timer armed.
      try {
        Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: channelName,
          importance: Notifications.AndroidImportance.HIGH,
        }).then(
          () => settle(CHANNEL_ID),
          (error) => settle(undefined, error ?? 'unknown error'),
        );
      } catch (error) {
        settle(undefined, error ?? 'unknown error');
      }
    });
  } else {
    channelReady = Promise.resolve();
  }

  return () => {
    subscription.remove();
    appState.remove();
  };
}

// ---- Permission -----------------------------------------------------------

export type PermissionState = 'granted' | 'denied' | 'undetermined';

function toState(permissions: Notifications.NotificationPermissionsStatus): PermissionState {
  if (permissions.granted) return 'granted';
  return permissions.status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function getNotificationPermission(): Promise<PermissionState> {
  return toState(await Notifications.getPermissionsAsync());
}

// Asks for permission when it has not been decided; otherwise just reports it.
// Never throws: a failure reads as denied.
export async function requestNotificationPermission(): Promise<PermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status !== 'undetermined' && !current.canAskAgain) return 'denied';
    return toState(await Notifications.requestPermissionsAsync());
  } catch (error) {
    console.error('[notifications] permission failed:', describeError(error));
    return 'denied';
  }
}

export function openNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}

// ---- Scheduling -----------------------------------------------------------

export type ScheduledReminder = {
  id: string;
  title: string;
  body: string;
  data: ReminderTap;
  fireAt: Date;
};

// Replaces every notification of ours with `items` (anything else scheduled is
// left alone: ours start with REMINDER_ID_PREFIX). Without permission only the
// cancelling happens. Returns how many were scheduled.
export async function replaceScheduledReminders(items: readonly ScheduledReminder[]): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.identifier.startsWith(REMINDER_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
  if (items.length === 0) return 0;
  if ((await getNotificationPermission()) !== 'granted') return 0;
  for (const item of items) await scheduleOne(item);
  return items.length;
}

// Schedules one notification of ours for the given moment, outside the plan (the
// dev-only test reminder). Its identifier must not start with REMINDER_ID_PREFIX
// if a sync should leave it alone.
export async function scheduleOne(item: ScheduledReminder): Promise<void> {
  // Wait for the channel decision, so the first sync at app start uses it.
  await channelReady;
  await Notifications.scheduleNotificationAsync({
    identifier: item.id,
    content: { title: item.title, body: item.body, data: item.data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: item.fireAt,
      ...(channelId ? { channelId } : {}),
    },
  });
}
