/**
 * New York: spring forward on 2026-03-08 and fall back on 2026-11-01. Occurrences
 * are calendar days computed from whole day counts, so a daylight saving change
 * inside the month cannot add, drop or move one.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { dueOccurrencesThisMonth, projectBalances } from '@/services/projection';
import type { RecurringPayment } from '@/services/recurring';

const pay = (extra: Partial<RecurringPayment>): RecurringPayment => ({
  id: 1,
  accountId: 1,
  name: 'Gym',
  amountCents: 100,
  note: null,
  interval: 1,
  unit: 'day',
  startDate: '2026-03-01',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('projection across a daylight saving change', () => {
  it('counts every day of March from Mar 5 on (spring forward on the 8th)', () => {
    // Mar 5 to Mar 31 is 27 days.
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-03-05' }), '2026-03-05')).toBe(27);
  });

  it('counts weekly occurrences that straddle the change', () => {
    // Mar 6, 13, 20, 27.
    expect(
      dueOccurrencesThisMonth(pay({ unit: 'week', startDate: '2026-03-06' }), '2026-03-02'),
    ).toBe(4);
  });

  it('counts every day of November from the 1st (fall back day)', () => {
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-11-01' }), '2026-11-01')).toBe(30);
  });

  it('projects the balance with the 25-hour day inside the month', () => {
    const result = projectBalances({
      accounts: [{ id: 1, currency: 'USD' }],
      balances: { 1: 10000 },
      payments: [pay({ startDate: '2026-11-01', unit: 'week' })],
      today: '2026-10-31',
      defaultCurrency: 'USD',
    });
    // Oct 31 is in October: the weekly one starts Nov 1, so it is not due in October.
    expect(result.perAccount[1]).toBe(10000);
    const nov = projectBalances({
      accounts: [{ id: 1, currency: 'USD' }],
      balances: { 1: 10000 },
      payments: [pay({ startDate: '2026-11-01', unit: 'week' })],
      today: '2026-11-01',
      defaultCurrency: 'USD',
    });
    // Nov 1, 8, 15, 22, 29.
    expect(nov.perAccount[1]).toBe(10000 - 500);
  });
});
