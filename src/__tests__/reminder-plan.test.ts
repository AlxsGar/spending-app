import {
  DEFAULT_REMINDERS,
  formatReminders,
  parseReminders,
} from '@/services/reminder-offsets';
import {
  MAX_REMINDERS,
  isReminderActionable,
  planReminders,
  reminderId,
  reminderOccurrence,
} from '@/services/reminder-plan';
import type { RecurringPayment } from '@/services/recurring';

const make = (id: number, extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id,
  accountId: 1,
  name: `Payment ${id}`,
  amountCents: 1000,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-11-20',
  endDate: null,
  notifyDaysBefore: '3,2,1,0',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

// Local time: 2026-11-10 08:00.
const now = new Date(2026, 10, 10, 8, 0, 0);
const at = (month: number, day: number, hour = 9) => new Date(2026, month - 1, day, hour, 0, 0).getTime();
const times = (plan: ReturnType<typeof planReminders>) => plan.map((item) => item.fireAt.getTime());

describe('reminder offsets', () => {
  it('parses a stored value into the canonical order, dropping junk and repeats', () => {
    expect(parseReminders('0,3,3,x, 1,9')).toEqual([3, 1, 0]);
    expect(parseReminders('')).toEqual([]);
    expect(parseReminders(null)).toEqual([]);
    expect(parseReminders(undefined)).toEqual([]);
  });

  it('formats a selection in the canonical order', () => {
    expect(formatReminders([0, 2, 3])).toBe('3,2,0');
    expect(formatReminders([])).toBe('');
    expect(DEFAULT_REMINDERS).toBe('1,0');
  });
});

describe('planReminders', () => {
  it('fires at 09:00 local on occurrence minus each chosen offset, soonest first', () => {
    const plan = planReminders([make(1)], now);
    expect(plan.map((item) => item.offset)).toEqual([3, 2, 1, 0]);
    expect(times(plan)).toEqual([at(11, 17), at(11, 18), at(11, 19), at(11, 20)]);
    expect(plan[0]).toMatchObject({
      id: reminderId(1, '2026-11-20', 3),
      recurringId: 1,
      occurrence: '2026-11-20',
    });
    expect(plan[0].id).toBe('reminder:1:2026-11-20:3');
  });

  it('only plans the chosen offsets, and none for an empty choice', () => {
    expect(planReminders([make(1, { notifyDaysBefore: '1,0' })], now).map((i) => i.offset)).toEqual([
      1, 0,
    ]);
    expect(planReminders([make(1, { notifyDaysBefore: '' })], now)).toEqual([]);
  });

  it('skips reminders whose time is already past (not after now)', () => {
    // Due Nov 11: 3, 2 days before are Nov 8, 9 (past); 1 day before is Nov 10 09:00 (future).
    const plan = planReminders([make(1, { startDate: '2026-11-11' })], now);
    expect(plan.map((item) => item.offset)).toEqual([1, 0]);
    // Exactly at 09:00 is no longer in the future.
    const atNine = new Date(2026, 10, 10, 9, 0, 0);
    expect(planReminders([make(1, { startDate: '2026-11-11' })], atNine).map((i) => i.offset)).toEqual([0]);
  });

  it('plans only the current-or-next occurrence, never later ones', () => {
    const plan = planReminders([make(1, { notifyDaysBefore: '0' })], now);
    expect(plan).toHaveLength(1);
    expect(plan[0].occurrence).toBe('2026-11-20');
  });

  it('due today: the morning-of reminder still fires if 09:00 has not passed', () => {
    const plan = planReminders([make(1, { startDate: '2026-11-10' })], now);
    expect(plan.map((item) => item.offset)).toEqual([0]);
    expect(planReminders([make(1, { startDate: '2026-11-10' })], new Date(2026, 10, 10, 10, 0))).toEqual([]);
  });

  it('inactive payments get none', () => {
    expect(planReminders([make(1, { active: false })], now)).toEqual([]);
  });

  it('finished payments get none', () => {
    const finished = make(1, {
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      lastConfirmedAt: '2026-10-01',
    });
    expect(planReminders([finished], now)).toEqual([]);
  });

  it('overdue stays quiet and the next occurrence is planned ahead', () => {
    // Monthly from Oct 28, unpaid: the current occurrence is overdue (Oct 28).
    const overdue = make(1, { startDate: '2026-10-28', notifyDaysBefore: '3,2,1,0' });
    expect(reminderOccurrence(overdue, '2026-11-10')).toBe('2026-11-28');
    const plan = planReminders([overdue], now);
    expect(plan.every((item) => item.occurrence === '2026-11-28')).toBe(true);
    expect(times(plan)).toEqual([at(11, 25), at(11, 26), at(11, 27), at(11, 28)]);
  });

  it('overdue with no later occurrence plans nothing', () => {
    const last = make(1, { startDate: '2026-11-01', endDate: '2026-11-01' });
    expect(reminderOccurrence(last, '2026-11-10')).toBeNull();
    expect(planReminders([last], now)).toEqual([]);
  });

  it('paying or skipping moves the plan to the next occurrence', () => {
    const before = planReminders([make(1, { startDate: '2026-11-12' })], now);
    expect(before.every((item) => item.occurrence === '2026-11-12')).toBe(true);
    const after = planReminders(
      [make(1, { startDate: '2026-11-12', lastConfirmedAt: '2026-11-12' })],
      now,
    );
    expect(after.every((item) => item.occurrence === '2026-12-12')).toBe(true);
  });

  it('a dismissal changes nothing', () => {
    const base = planReminders([make(1)], now);
    const dismissed = planReminders([make(1, { dismissedAt: '2026-11-20' })], now);
    expect(dismissed).toEqual(base);
  });

  it('clamps a month-end occurrence: Jan 31 monthly reminds for Feb 28', () => {
    const jan = new Date(2026, 1, 1, 8, 0, 0);
    const plan = planReminders(
      [make(1, { startDate: '2026-01-31', lastConfirmedAt: '2026-01-31', notifyDaysBefore: '3,0' })],
      jan,
    );
    expect(plan.map((item) => item.occurrence)).toEqual(['2026-02-28', '2026-02-28']);
    expect(times(plan)).toEqual([at(2, 25), at(2, 28)]);
  });

  it('a reminder crossing a month boundary lands on the right day', () => {
    const plan = planReminders(
      [make(1, { startDate: '2026-12-01', notifyDaysBefore: '3' })],
      now,
    );
    expect(times(plan)).toEqual([at(11, 28)]);
  });

  it('orders several payments soonest first, then by payment, and keeps the soonest 60', () => {
    const a = make(1, { startDate: '2026-11-21', notifyDaysBefore: '0' });
    const b = make(2, { startDate: '2026-11-12', notifyDaysBefore: '0' });
    const c = make(3, { startDate: '2026-11-12', notifyDaysBefore: '0' });
    expect(planReminders([a, c, b], now).map((item) => item.recurringId)).toEqual([2, 3, 1]);

    const many = Array.from({ length: 30 }, (_, index) =>
      make(index + 1, { startDate: '2026-12-20', notifyDaysBefore: '3,2,1,0' }),
    );
    const plan = planReminders(many, now);
    expect(plan).toHaveLength(MAX_REMINDERS);
    expect(MAX_REMINDERS).toBe(60);
    // The cut takes the soonest: all the 3-day ones first (30), then the 2-day ones (30).
    expect(plan.slice(0, 30).every((item) => item.offset === 3)).toBe(true);
    expect(plan.slice(30).every((item) => item.offset === 2)).toBe(true);
  });

  it('plans a payment with no account like any other (currency is the caller\'s concern)', () => {
    expect(planReminders([make(1, { accountId: null })], now)).toHaveLength(4);
  });

  it('is pure: the same input gives the same plan', () => {
    expect(planReminders([make(1)], now)).toEqual(planReminders([make(1)], now));
  });
});

describe('isReminderActionable', () => {
  const today = '2026-11-10';
  it('is true for an active unfinished payment whose occurrence is not handled', () => {
    expect(isReminderActionable(make(1), '2026-11-20', today)).toBe(true);
  });
  it('is false for a missing, inactive, finished or already handled payment', () => {
    expect(isReminderActionable(undefined, '2026-11-20', today)).toBe(false);
    expect(isReminderActionable(make(1, { active: false }), '2026-11-20', today)).toBe(false);
    expect(
      isReminderActionable(
        make(1, { startDate: '2026-10-01', endDate: '2026-10-01', lastConfirmedAt: '2026-10-01' }),
        '2026-10-01',
        today,
      ),
    ).toBe(false);
    expect(isReminderActionable(make(1, { lastConfirmedAt: '2026-11-20' }), '2026-11-20', today)).toBe(
      false,
    );
  });
});
