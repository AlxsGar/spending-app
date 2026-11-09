import * as Notifications from 'expo-notifications';

import i18n from '@/i18n';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import { listRecurring } from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { silenceConsoleError } from '@/test/console-error';

// The global setup replaces requestReminderSync with a mock; this file tests the real one.
const { requestReminderSync, runReminderSync, reminderBody } = jest.requireActual(
  '@/services/reminders',
) as typeof import('@/services/reminders');
const consoleError = silenceConsoleError();

jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
  getDefaultCurrency: jest.fn(),
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
}));

const scheduled = Notifications.scheduleNotificationAsync as jest.Mock;
const cancelled = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const allScheduled = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const permissions = Notifications.getPermissionsAsync as jest.Mock;

const make = (id: number, extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id,
  accountId: 1,
  name: `Payment ${id}`,
  amountCents: 500000,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-11-20',
  endDate: null,
  notifyDaysBefore: '3,0',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const now = new Date(2026, 10, 10, 8, 0, 0);

beforeEach(async () => {
  jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  await i18n.changeLanguage('en');
  (listAccounts as jest.Mock).mockResolvedValue([
    { id: 1, currency: 'MXN' },
    { id: 2, currency: 'USD' },
  ]);
  (getDefaultCurrency as jest.Mock).mockResolvedValue('JPY');
  (listRecurring as jest.Mock).mockResolvedValue([]);
  allScheduled.mockResolvedValue([]);
  scheduled.mockResolvedValue('id');
  cancelled.mockResolvedValue(undefined);
  permissions.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('reminder text', () => {
  it('says due in N days, tomorrow, today (English)', () => {
    expect(reminderBody(3, 'MX$5,000.00')).toBe('Due in 3 days · MX$5,000.00');
    expect(reminderBody(2, 'x')).toBe('Due in 2 days · x');
    expect(reminderBody(1, 'x')).toBe('Due tomorrow · x');
    expect(reminderBody(0, 'x')).toBe('Due today · x');
  });

  it('is translated to Spanish', async () => {
    await i18n.changeLanguage('es');
    expect(reminderBody(3, 'x')).toBe('Vence en 3 días · x');
    expect(reminderBody(1, 'x')).toBe('Vence mañana · x');
    expect(reminderBody(0, 'x')).toBe('Vence hoy · x');
  });
});

describe('runReminderSync', () => {
  it('schedules the plan with the name, text, amount and tap data, on a DATE trigger', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([make(1)]);
    const count = await runReminderSync(now);
    expect(count).toBe(2);
    expect(scheduled).toHaveBeenCalledTimes(2);
    expect(scheduled.mock.calls[0][0]).toEqual({
      identifier: 'reminder:1:2026-11-20:3',
      content: {
        title: 'Payment 1',
        body: 'Due in 3 days · MX$5,000.00',
        data: { recurringId: 1, occurrence: '2026-11-20' },
      },
      trigger: { type: 'date', date: new Date(2026, 10, 17, 9, 0, 0) },
    });
    expect(scheduled.mock.calls[1][0].identifier).toBe('reminder:1:2026-11-20:0');
    expect(scheduled.mock.calls[1][0].content.body).toBe('Due today · MX$5,000.00');
  });

  it('uses the account currency, and the default currency when there is no account', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([
      make(1, { accountId: 2, notifyDaysBefore: '0' }),
      make(2, { accountId: null, notifyDaysBefore: '0' }),
    ]);
    await runReminderSync(now);
    const bodies = scheduled.mock.calls.map((call) => call[0].content.body);
    // Account 2 is USD; the payment without an account uses the default (JPY).
    expect(bodies[0]).toBe('Due today · $5,000.00');
    expect(bodies[1]).toMatch(/^Due today · (JP)?¥5,000$/);
  });

  it('cancels only our scheduled notifications and leaves others alone', async () => {
    allScheduled.mockResolvedValue([
      { identifier: 'reminder:1:2026-11-20:3' },
      { identifier: 'reminder:9:2026-12-01:0' },
      { identifier: 'something-else' },
      { identifier: 'dev-test:1:123' },
    ]);
    await runReminderSync(now);
    expect(cancelled.mock.calls.map((call) => call[0])).toEqual([
      'reminder:1:2026-11-20:3',
      'reminder:9:2026-12-01:0',
    ]);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it('replaces the plan: cancels first, then schedules the new one', async () => {
    allScheduled.mockResolvedValue([{ identifier: 'reminder:1:2026-11-20:3' }]);
    (listRecurring as jest.Mock).mockResolvedValue([make(1, { notifyDaysBefore: '0' })]);
    await runReminderSync(now);
    expect(cancelled.mock.invocationCallOrder[0]).toBeLessThan(scheduled.mock.invocationCallOrder[0]);
    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  it('schedules nothing without permission, but still cancels ours', async () => {
    permissions.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    allScheduled.mockResolvedValue([{ identifier: 'reminder:1:2026-11-20:3' }]);
    (listRecurring as jest.Mock).mockResolvedValue([make(1)]);
    expect(await runReminderSync(now)).toBe(0);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it('skips a payment whose account is gone', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([make(1, { accountId: 99 })]);
    expect(await runReminderSync(now)).toBe(0);
  });

  it('existing payments with no reminders stay silent', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([make(1, { notifyDaysBefore: '' })]);
    expect(await runReminderSync(now)).toBe(0);
    expect(scheduled).not.toHaveBeenCalled();
  });
});

describe('requestReminderSync', () => {
  it('runs one sync for one request', async () => {
    await requestReminderSync();
    expect(listRecurring).toHaveBeenCalledTimes(1);
  });

  it('never overlaps: a request during a run waits for it', async () => {
    let running = 0;
    let overlapped = false;
    (listRecurring as jest.Mock).mockImplementation(async () => {
      running++;
      if (running > 1) overlapped = true;
      await Promise.resolve();
      await Promise.resolve();
      running--;
      return [];
    });
    const first = requestReminderSync();
    const second = requestReminderSync();
    await Promise.all([first, second]);
    expect(overlapped).toBe(false);
  });

  it('coalesces a burst into one run plus one follow-up', async () => {
    let release: () => void = () => {};
    (listRecurring as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );
    const first = requestReminderSync();
    // Five more requests while the first is still running.
    const rest = [1, 2, 3, 4, 5].map(() => requestReminderSync());
    await Promise.resolve();
    release();
    await Promise.all([first, ...rest]);
    expect(listRecurring).toHaveBeenCalledTimes(2);
  });

  it('a request after the run finished starts a new run', async () => {
    await requestReminderSync();
    await requestReminderSync();
    expect(listRecurring).toHaveBeenCalledTimes(2);
  });

  it('logs a failure and never throws, and the next request still works', async () => {
    (listRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await expect(requestReminderSync()).resolves.toBeUndefined();
    expect(consoleError()).toHaveBeenCalledWith('[reminders] sync failed:', expect.any(Error));
    await requestReminderSync();
    expect(listRecurring).toHaveBeenCalledTimes(2);
  });
});
