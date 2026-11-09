/**
 * New York: spring forward 2026-03-08 (02:00 EST -> 03:00 EDT, UTC-5 -> UTC-4)
 * and fall back 2026-11-01 (02:00 EDT -> 01:00 EST, UTC-4 -> UTC-5). A reminder
 * is 09:00 on the wall clock whatever the offset, and "3 days before" counts
 * calendar days, not 72 hours.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { planReminders } from '@/services/reminder-plan';
import type { RecurringPayment } from '@/services/recurring';

const make = (extra: Partial<RecurringPayment>): RecurringPayment => ({
  id: 1,
  accountId: 1,
  name: 'Rent',
  amountCents: 1000,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-03-10',
  endDate: null,
  notifyDaysBefore: '3,2,1,0',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const wall = (date: Date) => [date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];

describe('reminder times across daylight saving', () => {
  it('spring forward: due Mar 10, the reminders are Mar 7 to 10 at 09:00 local', () => {
    const plan = planReminders([make({})], new Date(2026, 2, 1, 8, 0));
    expect(plan.map((item) => wall(item.fireAt))).toEqual([
      [3, 7, 9, 0],
      [3, 8, 9, 0],
      [3, 9, 9, 0],
      [3, 10, 9, 0],
    ]);
    // Mar 7 09:00 is EST (UTC-5) and Mar 9 09:00 is EDT (UTC-4): 47 hours apart.
    const [first, , third] = plan;
    expect((third.fireAt.getTime() - first.fireAt.getTime()) / 3_600_000).toBe(47);
  });

  it('spring forward on the reminder day itself: 09:00 exists and is local', () => {
    const plan = planReminders([make({ notifyDaysBefore: '0', startDate: '2026-03-08' })], new Date(2026, 2, 1));
    expect(wall(plan[0].fireAt)).toEqual([3, 8, 9, 0]);
    expect(plan[0].fireAt.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('fall back: due Nov 3, the reminders are Oct 31 to Nov 3 at 09:00 local', () => {
    const plan = planReminders(
      [make({ startDate: '2026-11-03' })],
      new Date(2026, 9, 25, 8, 0),
    );
    expect(plan.map((item) => wall(item.fireAt))).toEqual([
      [10, 31, 9, 0],
      [11, 1, 9, 0],
      [11, 2, 9, 0],
      [11, 3, 9, 0],
    ]);
    // Oct 31 09:00 is EDT, Nov 1 09:00 is EST: 25 hours apart.
    expect((plan[1].fireAt.getTime() - plan[0].fireAt.getTime()) / 3_600_000).toBe(25);
  });
});
