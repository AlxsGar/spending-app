import * as Notifications from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';

import {
  getNotificationPermission,
  openNotificationSettings,
  replaceScheduledReminders,
  requestNotificationPermission,
  resetHandledTaps,
  startNotifications,
  takeTap,
} from '@/services/notifications';
import { silenceConsoleError } from '@/test/console-error';

const consoleError = silenceConsoleError();

const mocks = Notifications as unknown as Record<string, jest.Mock>;

const response = (
  identifier = 'reminder:1:2026-11-20:1',
  data: Record<string, unknown> = { recurringId: 1, occurrence: '2026-11-20' },
  date = 1000,
  actionIdentifier = 'default',
) =>
  ({
    actionIdentifier,
    notification: { date, request: { identifier, content: { data } } },
  }) as unknown as Notifications.NotificationResponse;

let appStateListener: (state: string) => void = () => {};
let removeAppState: jest.Mock;
let removeResponse: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetHandledTaps();
  removeAppState = jest.fn();
  removeResponse = jest.fn();
  mocks.addNotificationResponseReceivedListener.mockReturnValue({ remove: removeResponse });
  mocks.getLastNotificationResponse.mockReturnValue(null);
  mocks.setNotificationChannelAsync.mockResolvedValue(null);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void,
  ) => {
    appStateListener = listener;
    return { remove: removeAppState };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('takeTap (dedupe)', () => {
  it('returns the tap data of one of our reminders', () => {
    expect(takeTap(response())).toEqual({ recurringId: 1, occurrence: '2026-11-20' });
  });

  it('handles the same tap once, however many times it is seen', () => {
    expect(takeTap(response())).not.toBeNull();
    expect(takeTap(response())).toBeNull();
    expect(takeTap(response())).toBeNull();
  });

  it('treats a different fire of the same identifier, or another action, as another tap', () => {
    expect(takeTap(response('a', undefined, 1))).not.toBeNull();
    expect(takeTap(response('a', undefined, 2))).not.toBeNull();
    expect(takeTap(response('a', undefined, 2, 'other'))).not.toBeNull();
    expect(takeTap(response('b', undefined, 2))).not.toBeNull();
  });

  it('ignores a notification that is not ours (no tap data), still counting it handled', () => {
    expect(takeTap(response('x', {}))).toBeNull();
    expect(takeTap(response('y', { recurringId: 'one', occurrence: '2026-11-20' }))).toBeNull();
  });
});

describe('startNotifications', () => {
  it('starts in order: handler, response listener, last response, then the Android channel', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    startNotifications(jest.fn(), 'Reminders');
    const order = [
      mocks.setNotificationHandler,
      mocks.addNotificationResponseReceivedListener,
      mocks.getLastNotificationResponse,
      mocks.setNotificationChannelAsync,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order.every((value) => value !== undefined)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shows notifications in the foreground', async () => {
    startNotifications(jest.fn(), 'Reminders');
    const handler = mocks.setNotificationHandler.mock.calls[0][0];
    expect(await handler.handleNotification()).toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('delivers a tap from the listener', () => {
    const onTap = jest.fn();
    startNotifications(onTap, 'Reminders');
    mocks.addNotificationResponseReceivedListener.mock.calls[0][0](response());
    expect(onTap).toHaveBeenCalledWith({ recurringId: 1, occurrence: '2026-11-20' });
  });

  it('delivers the tap that launched the app (cold start) from the last response, and clears it', () => {
    mocks.getLastNotificationResponse.mockReturnValue(response());
    const onTap = jest.fn();
    startNotifications(onTap, 'Reminders');
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(mocks.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it('does not act twice when the listener and the last-response check see one tap', () => {
    const onTap = jest.fn();
    startNotifications(onTap, 'Reminders');
    mocks.addNotificationResponseReceivedListener.mock.calls[0][0](response());
    // Back to the foreground: the native last response is still the same tap.
    mocks.getLastNotificationResponse.mockReturnValue(response());
    appStateListener('active');
    appStateListener('active');
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('checks the last response on every return to the foreground, not on other states', () => {
    const onTap = jest.fn();
    startNotifications(onTap, 'Reminders');
    mocks.getLastNotificationResponse.mockClear();
    appStateListener('background');
    expect(mocks.getLastNotificationResponse).not.toHaveBeenCalled();
    mocks.getLastNotificationResponse.mockReturnValue(response('later', undefined, 5));
    appStateListener('active');
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('keeps the listener when the last-response check throws', () => {
    mocks.getLastNotificationResponse.mockImplementation(() => {
      throw new Error('boom');
    });
    startNotifications(jest.fn(), 'Reminders');
    expect(mocks.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(consoleError()).toHaveBeenCalledWith(
      '[notifications] last response failed:',
      'boom',
    );
  });

  it('cleans up the listener and the app state subscription', () => {
    const stop = startNotifications(jest.fn(), 'Reminders');
    stop();
    expect(removeResponse).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  it('only creates the channel on Android', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    startNotifications(jest.fn(), 'Reminders');
    expect(mocks.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('a failing channel (Android Expo Go) is logged once, never throws, and the listener works', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mocks.setNotificationChannelAsync.mockRejectedValue(new Error('NullPointerException'));
    const onTap = jest.fn();
    expect(() => startNotifications(onTap, 'Reminders')).not.toThrow();
    await flush();
    expect(consoleError()).toHaveBeenCalledTimes(1);
    expect(consoleError()).toHaveBeenCalledWith(
      '[notifications] channel failed, using the default one:',
      'NullPointerException',
    );
    mocks.addNotificationResponseReceivedListener.mock.calls[0][0](response());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('uses the default channel when the channel failed, and ours when it was created', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mocks.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    const item = {
      id: 'reminder:1:2026-11-20:0',
      title: 't',
      body: 'b',
      data: { recurringId: 1, occurrence: '2026-11-20' },
      fireAt: new Date(2026, 10, 20, 9),
    };

    mocks.setNotificationChannelAsync.mockRejectedValue(new Error('NullPointerException'));
    startNotifications(jest.fn(), 'Reminders');
    await flush();
    await replaceScheduledReminders([item]);
    expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: 'date',
      date: item.fireAt,
    });

    mocks.scheduleNotificationAsync.mockClear();
    mocks.setNotificationChannelAsync.mockResolvedValue(null);
    startNotifications(jest.fn(), 'Reminders');
    await flush();
    await replaceScheduledReminders([item]);
    expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: 'date',
      date: item.fireAt,
      channelId: 'reminders',
    });
  });
});

describe('scheduling waits for the Android channel', () => {
  const item = {
    id: 'reminder:1:2026-11-20:0',
    title: 't',
    body: 'b',
    data: { recurringId: 1, occurrence: '2026-11-20' },
    fireAt: new Date(2026, 10, 20, 9),
  };
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mocks.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
  });

  it('a sync that starts before the channel resolves still uses the channel', async () => {
    let resolveChannel: () => void = () => {};
    mocks.setNotificationChannelAsync.mockReturnValue(
      new Promise<void>((resolve) => (resolveChannel = resolve)),
    );
    startNotifications(jest.fn(), 'Reminders');
    // The first sync runs right away, while the channel is still being created.
    const sync = replaceScheduledReminders([item]);
    await flush();
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
    resolveChannel();
    await sync;
    expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toMatchObject({
      channelId: 'reminders',
    });
  });

  it('a channel that never settles: after 5 s scheduling proceeds on the default channel, logged once', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      let resolveLate: () => void = () => {};
      mocks.setNotificationChannelAsync.mockReturnValue(
        new Promise<void>((resolve) => (resolveLate = resolve)),
      );
      startNotifications(jest.fn(), 'Reminders');
      const sync = replaceScheduledReminders([item]);
      await jest.advanceTimersByTimeAsync(4999);
      expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await expect(sync).resolves.toBe(1);
      expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
        type: 'date',
        date: item.fireAt,
      });
      expect(consoleError()).toHaveBeenCalledTimes(1);
      // The channel resolving late changes nothing for this run.
      resolveLate();
      await jest.advanceTimersByTimeAsync(0);
      mocks.scheduleNotificationAsync.mockClear();
      await replaceScheduledReminders([item]);
      expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
        type: 'date',
        date: item.fireAt,
      });
      expect(consoleError()).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a channel call that throws synchronously: default channel, sync resolves, logged once, no timer left', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      mocks.setNotificationChannelAsync.mockImplementation(() => {
        throw new Error('sync boom');
      });
      expect(() => startNotifications(jest.fn(), 'Reminders')).not.toThrow();
      expect(jest.getTimerCount()).toBe(0);
      await expect(replaceScheduledReminders([item])).resolves.toBe(1);
      expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
        type: 'date',
        date: item.fireAt,
      });
      await jest.advanceTimersByTimeAsync(6000);
      expect(consoleError()).toHaveBeenCalledTimes(1);
      expect(consoleError()).toHaveBeenCalledWith(
        '[notifications] channel failed, using the default one:',
        'sync boom',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('a channel that settles first clears the timer (no log, no pending timer)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      mocks.setNotificationChannelAsync.mockResolvedValue(null);
      startNotifications(jest.fn(), 'Reminders');
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(6000);
      expect(consoleError()).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('when the channel setup throws, scheduling still happens, on the default channel', async () => {
    let rejectChannel: (error: Error) => void = () => {};
    mocks.setNotificationChannelAsync.mockReturnValue(
      new Promise<void>((_resolve, reject) => (rejectChannel = reject)),
    );
    startNotifications(jest.fn(), 'Reminders');
    const sync = replaceScheduledReminders([item]);
    await flush();
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
    rejectChannel(new Error('NullPointerException'));
    await expect(sync).resolves.toBe(1);
    expect(mocks.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: 'date',
      date: item.fireAt,
    });
  });
});

describe('permission', () => {
  it('reads granted, denied and undetermined', async () => {
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: true, status: 'granted' });
    expect(await getNotificationPermission()).toBe('granted');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied' });
    expect(await getNotificationPermission()).toBe('denied');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'undetermined' });
    expect(await getNotificationPermission()).toBe('undetermined');
  });

  it('asks while undecided and reports the answer', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'undetermined',
      canAskAgain: true,
    });
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    expect(await requestNotificationPermission()).toBe('granted');
    expect(mocks.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    expect(await requestNotificationPermission()).toBe('denied');
  });

  it('does not ask again when already allowed, nor when the system will not show the prompt', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    expect(await requestNotificationPermission()).toBe('granted');
    mocks.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });
    expect(await requestNotificationPermission()).toBe('denied');
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reads a failure as denied, never throws', async () => {
    mocks.getPermissionsAsync.mockRejectedValue(new Error('native'));
    expect(await requestNotificationPermission()).toBe('denied');
  });

  it('opens the system settings', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await openNotificationSettings();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
