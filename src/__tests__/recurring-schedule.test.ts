/**
 * New York: spring forward 2026-03-08, fall back 2026-11-01. Occurrences are
 * calendar days, so neither may shift them.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import {
  actionOccurrence,
  dayToDate,
  effectiveStartDate,
  isDay,
  isOnceOnly,
  nextDueDay,
  occurrenceAt,
  parseInterval,
  scheduleState,
  sortRecurring,
  startDateFloor,
  toDay,
  validateRecurringInput,
} from '@/services/recurring';
import type { RecurringInput, RecurringPayment, Unit } from '@/services/recurring';

type Sched = {
  interval: number;
  unit: Unit;
  startDate: string;
  endDate: string | null;
  lastConfirmedAt: string | null;
};
const sched = (extra: Partial<Sched> = {}): Sched => ({
  interval: 1,
  unit: 'month',
  startDate: '2026-01-01',
  endDate: null,
  lastConfirmedAt: null,
  ...extra,
});

// The first n occurrences.
const list = (schedule: Sched, n: number) =>
  Array.from({ length: n }, (_, k) => occurrenceAt(schedule, k));

describe('occurrences', () => {
  it('every 10 days counts calendar days across a month end and a year end', () => {
    expect(list(sched({ interval: 10, unit: 'day', startDate: '2026-12-15' }), 5)).toEqual([
      '2026-12-15',
      '2026-12-25',
      '2027-01-04',
      '2027-01-14',
      '2027-01-24',
    ]);
  });

  it('every day crosses February in a leap and a non-leap year', () => {
    expect(list(sched({ unit: 'day', startDate: '2028-02-28' }), 3)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(list(sched({ unit: 'day', startDate: '2026-02-28' }), 2)).toEqual([
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('every 2 weeks keeps the weekday', () => {
    const items = list(sched({ interval: 2, unit: 'week', startDate: '2026-10-14' }), 4);
    expect(items).toEqual(['2026-10-14', '2026-10-28', '2026-11-11', '2026-11-25']);
    for (const item of items) expect(dayToDate(item!).getDay()).toBe(3);
  });

  it('every month on the 15th; every 3 months', () => {
    expect(list(sched({ startDate: '2026-11-15' }), 4)).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
    expect(list(sched({ interval: 3, startDate: '2026-11-30' }), 4)).toEqual([
      '2026-11-30',
      '2027-02-28',
      '2027-05-30',
      '2027-08-30',
    ]);
  });

  it('month-end fallback does not drift: Jan 31 to Feb 28 to Mar 31 to Apr 30', () => {
    expect(list(sched({ startDate: '2026-01-31' }), 5)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(occurrenceAt(sched({ startDate: '2028-01-31' }), 1)).toBe('2028-02-29');
    expect(occurrenceAt(sched({ startDate: '2026-01-29' }), 1)).toBe('2026-02-28');
    expect(occurrenceAt(sched({ startDate: '2026-01-30' }), 1)).toBe('2026-02-28');
    // Every 2 months from Dec 31: Feb 28, Apr 30, Jun 30, Aug 31.
    expect(list(sched({ interval: 2, startDate: '2025-12-31' }), 5)).toEqual([
      '2025-12-31',
      '2026-02-28',
      '2026-04-30',
      '2026-06-30',
      '2026-08-31',
    ]);
  });

  it('every year, and every 2 years, including Feb 29', () => {
    expect(list(sched({ unit: 'year', startDate: '2026-10-14' }), 3)).toEqual([
      '2026-10-14',
      '2027-10-14',
      '2028-10-14',
    ]);
    expect(list(sched({ interval: 2, unit: 'year', startDate: '2026-03-05' }), 3)).toEqual([
      '2026-03-05',
      '2028-03-05',
      '2030-03-05',
    ]);
    // Feb 29 falls back to Feb 28 in non-leap years and returns in leap years.
    expect(list(sched({ unit: 'year', startDate: '2028-02-29' }), 6)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
      '2033-02-28',
    ]);
    expect(list(sched({ interval: 4, unit: 'year', startDate: '2024-02-29' }), 3)).toEqual([
      '2024-02-29',
      '2028-02-29',
      '2032-02-29',
    ]);
  });

  it('monthly from Feb 29 in a leap year', () => {
    expect(list(sched({ startDate: '2028-02-29' }), 3)).toEqual([
      '2028-02-29',
      '2028-03-29',
      '2028-04-29',
    ]);
  });

  it('has no occurrence after the end date, and the end date itself counts', () => {
    const schedule = sched({ interval: 10, unit: 'day', startDate: '2026-10-04', endDate: '2026-10-24' });
    expect(list(schedule, 5)).toEqual(['2026-10-04', '2026-10-14', '2026-10-24', null, null]);
    expect(occurrenceAt({ ...schedule, endDate: '2026-10-23' }, 2)).toBeNull();
  });

  it('day and week steps ignore daylight saving changes', () => {
    // Across spring forward (Mar 8) and fall back (Nov 1) in New York.
    expect(list(sched({ unit: 'day', startDate: '2026-03-06' }), 5)).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(list(sched({ unit: 'day', startDate: '2026-10-30' }), 5)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(list(sched({ unit: 'week', startDate: '2026-03-04' }), 3)).toEqual([
      '2026-03-04',
      '2026-03-11',
      '2026-03-18',
    ]);
    expect(list(sched({ interval: 2, unit: 'week', startDate: '2026-10-21' }), 3)).toEqual([
      '2026-10-21',
      '2026-11-04',
      '2026-11-18',
    ]);
  });
});

describe('current versus next', () => {
  const tenDays = (extra: Partial<Sched> = {}) =>
    sched({ interval: 10, unit: 'day', startDate: '2026-10-04', ...extra });

  it('a missed occurrence stays current until the next one arrives, then is replaced', () => {
    // Occurrences: Oct 4, 14, 24.
    expect(scheduleState(tenDays(), '2026-10-10')).toEqual({ kind: 'current', date: '2026-10-04' });
    expect(scheduleState(tenDays(), '2026-10-13')).toEqual({ kind: 'current', date: '2026-10-04' });
    expect(scheduleState(tenDays(), '2026-10-14')).toEqual({ kind: 'current', date: '2026-10-14' });
  });

  it('only one occurrence is ever current: earlier missed ones are dropped', () => {
    expect(scheduleState(tenDays(), '2026-12-01')).toEqual({ kind: 'current', date: '2026-11-23' });
  });

  it('an occurrence due today is current', () => {
    expect(scheduleState(tenDays(), '2026-10-04')).toEqual({ kind: 'current', date: '2026-10-04' });
  });

  it('before the start date the first occurrence is upcoming', () => {
    expect(scheduleState(tenDays(), '2026-10-01')).toEqual({ kind: 'upcoming', date: '2026-10-04' });
  });

  it('once the current occurrence is confirmed the next one is upcoming', () => {
    expect(scheduleState(tenDays({ lastConfirmedAt: '2026-10-04' }), '2026-10-10')).toEqual({
      kind: 'upcoming',
      date: '2026-10-14',
    });
    // Confirmed today's occurrence.
    expect(scheduleState(tenDays({ lastConfirmedAt: '2026-10-14' }), '2026-10-14')).toEqual({
      kind: 'upcoming',
      date: '2026-10-24',
    });
  });

  it('a payment confirmed ahead of time skips to the occurrence after it', () => {
    expect(scheduleState(tenDays({ lastConfirmedAt: '2026-10-24' }), '2026-10-10')).toEqual({
      kind: 'upcoming',
      date: '2026-11-03',
    });
  });

  it('a past occurrence confirmed long ago does not hold the current one back', () => {
    expect(scheduleState(tenDays({ lastConfirmedAt: '2026-10-04' }), '2026-10-30')).toEqual({
      kind: 'current',
      date: '2026-10-24',
    });
  });

  it('the last occurrence before the end date stays current until paid, then it is finished', () => {
    const ended = tenDays({ endDate: '2026-10-20' });
    expect(scheduleState(ended, '2026-10-16')).toEqual({ kind: 'current', date: '2026-10-14' });
    expect(scheduleState(ended, '2027-05-01')).toEqual({ kind: 'current', date: '2026-10-14' });
    expect(scheduleState({ ...ended, lastConfirmedAt: '2026-10-14' }, '2027-05-01')).toEqual({
      kind: 'finished',
    });
    // Paid before the date passed: finished only after no occurrence is left.
    expect(scheduleState({ ...ended, lastConfirmedAt: '2026-10-14' }, '2026-10-16')).toEqual({
      kind: 'finished',
    });
  });

  it('a once-only payment: upcoming, then current, then finished once paid', () => {
    const once = tenDays({ endDate: '2026-10-04' });
    expect(scheduleState(once, '2026-09-30')).toEqual({ kind: 'upcoming', date: '2026-10-04' });
    expect(scheduleState(once, '2026-12-30')).toEqual({ kind: 'current', date: '2026-10-04' });
    expect(scheduleState({ ...once, lastConfirmedAt: '2026-10-04' }, '2026-09-30')).toEqual({
      kind: 'finished',
    });
  });

  it('monthly clamped occurrences are picked correctly around month ends', () => {
    const monthly = sched({ startDate: '2026-01-31' });
    expect(scheduleState(monthly, '2026-02-27')).toEqual({ kind: 'current', date: '2026-01-31' });
    expect(scheduleState(monthly, '2026-02-28')).toEqual({ kind: 'current', date: '2026-02-28' });
    expect(scheduleState(monthly, '2026-03-30')).toEqual({ kind: 'current', date: '2026-02-28' });
    expect(scheduleState(monthly, '2026-03-31')).toEqual({ kind: 'current', date: '2026-03-31' });
    const yearly = sched({ unit: 'year', startDate: '2028-02-29' });
    expect(scheduleState(yearly, '2029-02-27')).toEqual({ kind: 'current', date: '2028-02-29' });
    expect(scheduleState(yearly, '2029-02-28')).toEqual({ kind: 'current', date: '2029-02-28' });
  });

  it('handles a far-away today without iterating occurrence by occurrence', () => {
    expect(scheduleState(sched({ unit: 'day', startDate: '2000-01-01' }), '2026-10-14')).toEqual({
      kind: 'current',
      date: '2026-10-14',
    });
  });
});

describe('scheduleState with "today" taken from the clock across daylight saving', () => {
  // Today is always the local calendar day of the instant, as the app computes it.
  const stateAt = (schedule: Sched, instant: Date) => scheduleState(schedule, toDay(instant));

  it('spring forward (Mar 8): current/upcoming picks are right before, during and after the jump', () => {
    // Daily from Mar 6; clocks jump 02:00 -> 03:00 on Mar 8.
    const daily = sched({ unit: 'day', startDate: '2026-03-06' });
    expect(stateAt(daily, new Date(2026, 2, 7, 23, 59))).toEqual({ kind: 'current', date: '2026-03-07' });
    expect(stateAt(daily, new Date(2026, 2, 8, 0, 0))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(daily, new Date('2026-03-08T06:59:00Z'))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(daily, new Date('2026-03-08T07:00:00Z'))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(daily, new Date(2026, 2, 8, 23, 59))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(daily, new Date(2026, 2, 9, 0, 0))).toEqual({ kind: 'current', date: '2026-03-09' });

    // Confirmed on the 8th: the next one is the 9th, even late on the short day.
    const paid = { ...daily, lastConfirmedAt: '2026-03-08' };
    expect(stateAt(paid, new Date(2026, 2, 8, 23, 59))).toEqual({ kind: 'upcoming', date: '2026-03-09' });

    // Weekly on Sundays, the jump day itself is an occurrence.
    const weekly = sched({ unit: 'week', startDate: '2026-03-01' });
    expect(stateAt(weekly, new Date(2026, 2, 7, 12))).toEqual({ kind: 'current', date: '2026-03-01' });
    expect(stateAt(weekly, new Date(2026, 2, 8, 3, 30))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(weekly, new Date(2026, 2, 14, 23, 59))).toEqual({ kind: 'current', date: '2026-03-08' });
    expect(stateAt(weekly, new Date(2026, 2, 15, 0, 0))).toEqual({ kind: 'current', date: '2026-03-15' });

    // Before an upcoming start on the jump day.
    const later = sched({ unit: 'day', startDate: '2026-03-08' });
    expect(stateAt(later, new Date(2026, 2, 7, 23, 59))).toEqual({ kind: 'upcoming', date: '2026-03-08' });
    expect(stateAt(later, new Date(2026, 2, 8, 0, 0))).toEqual({ kind: 'current', date: '2026-03-08' });
  });

  it('fall back (Nov 1): the repeated hour stays one calendar day', () => {
    const daily = sched({ unit: 'day', startDate: '2026-10-30' });
    expect(stateAt(daily, new Date('2026-11-01T03:59:00Z'))).toEqual({ kind: 'current', date: '2026-10-31' });
    expect(stateAt(daily, new Date('2026-11-01T04:00:00Z'))).toEqual({ kind: 'current', date: '2026-11-01' });
    // Both 01:30s of the repeated hour.
    expect(stateAt(daily, new Date('2026-11-01T05:30:00Z'))).toEqual({ kind: 'current', date: '2026-11-01' });
    expect(stateAt(daily, new Date('2026-11-01T06:30:00Z'))).toEqual({ kind: 'current', date: '2026-11-01' });
    expect(stateAt(daily, new Date(2026, 10, 1, 23, 59))).toEqual({ kind: 'current', date: '2026-11-01' });
    expect(stateAt(daily, new Date(2026, 10, 2, 0, 0))).toEqual({ kind: 'current', date: '2026-11-02' });
    const paid = { ...daily, lastConfirmedAt: '2026-11-01' };
    expect(stateAt(paid, new Date('2026-11-01T06:30:00Z'))).toEqual({ kind: 'upcoming', date: '2026-11-02' });
  });

  it('a monthly payment on the jump or fall-back day keeps its date', () => {
    expect(stateAt(sched({ startDate: '2026-02-08' }), new Date(2026, 2, 8, 12))).toEqual({
      kind: 'current',
      date: '2026-03-08',
    });
    expect(stateAt(sched({ startDate: '2026-10-01' }), new Date('2026-11-01T06:30:00Z'))).toEqual({
      kind: 'current',
      date: '2026-11-01',
    });
  });
});

describe('nextDueDay (local today, daylight saving)', () => {
  const payment = (extra: Partial<RecurringPayment> = {}) => ({
    interval: 1,
    unit: 'week' as Unit,
    startDate: '2026-03-01',
    endDate: null as string | null,
    active: true,
    lastConfirmedAt: null as string | null,
    ...extra,
  });

  it('uses the local calendar day, also late at night around spring forward', () => {
    // Sunday Mar 8 23:30 local, the day clocks jump forward.
    expect(nextDueDay(payment(), new Date(2026, 2, 8, 23, 30))).toBe('2026-03-08');
    expect(nextDueDay(payment(), new Date(2026, 2, 9, 0, 30))).toBe('2026-03-08');
    expect(nextDueDay(payment({ lastConfirmedAt: '2026-03-08' }), new Date(2026, 2, 9, 0, 30))).toBe(
      '2026-03-15',
    );
  });

  it('uses the local calendar day around fall back, including the repeated hour', () => {
    const daily = payment({ unit: 'day', startDate: '2026-10-30' });
    expect(nextDueDay(daily, new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01');
    expect(nextDueDay(daily, new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(nextDueDay(daily, new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    expect(nextDueDay(daily, new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(nextDueDay(daily, new Date(2026, 10, 2, 0, 0))).toBe('2026-11-02');
  });

  it('is null when inactive or finished', () => {
    expect(nextDueDay(payment({ active: false }), new Date(2026, 2, 8))).toBeNull();
    expect(
      nextDueDay(
        payment({ endDate: '2026-03-01', lastConfirmedAt: '2026-03-01' }),
        new Date(2026, 2, 8),
      ),
    ).toBeNull();
  });

  it('toDay and dayToDate round-trip local days', () => {
    expect(toDay(new Date(2026, 2, 8, 23, 59))).toBe('2026-03-08');
    expect(toDay(dayToDate('2026-11-01'))).toBe('2026-11-01');
    expect(dayToDate('2026-03-08').getHours()).toBe(0);
  });
});

describe('isOnceOnly', () => {
  const base = { interval: 10, unit: 'day' as Unit, startDate: '2026-10-04' };
  it('is true when the end date is before the second occurrence', () => {
    expect(isOnceOnly({ ...base, endDate: '2026-10-04' })).toBe(true);
    expect(isOnceOnly({ ...base, endDate: '2026-10-13' })).toBe(true);
  });
  it('is false on the second occurrence or later, and without an end date', () => {
    expect(isOnceOnly({ ...base, endDate: '2026-10-14' })).toBe(false);
    expect(isOnceOnly({ ...base, endDate: '2027-01-01' })).toBe(false);
    expect(isOnceOnly({ ...base, endDate: null })).toBe(false);
  });
  it('uses the clamped month when the end date is between months', () => {
    const monthly = { interval: 1, unit: 'month' as Unit, startDate: '2026-01-31' };
    expect(isOnceOnly({ ...monthly, endDate: '2026-02-27' })).toBe(true);
    expect(isOnceOnly({ ...monthly, endDate: '2026-02-28' })).toBe(false);
  });
});

describe('sortRecurring', () => {
  const make = (id: number, name: string, extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
    id,
    accountId: 1,
    name,
    amountCents: 100,
    note: null,
    interval: 1,
    unit: 'month',
    startDate: '2026-10-01',
    endDate: null,
    notifyDaysBefore: '',
    active: true,
    lastConfirmedAt: null,
    dismissedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });

  it('puts the soonest next date first, then inactive and finished ones by name', () => {
    const now = new Date(2026, 9, 12);
    const sorted = sortRecurring(
      [
        make(1, 'Zed off', { active: false }),
        make(2, 'Late', { startDate: '2026-10-28' }),
        make(3, 'Soon', { startDate: '2026-10-13' }),
        make(4, 'Paid', { startDate: '2026-10-02', lastConfirmedAt: '2026-10-02' }),
        make(5, 'Alpha off', { active: false }),
        make(6, 'Also soon', { startDate: '2026-09-13', unit: 'week', interval: 4 }),
        make(7, 'Done', { endDate: '2026-10-01', lastConfirmedAt: '2026-10-01' }),
      ],
      now,
    );
    expect(sorted.map((item) => item.name)).toEqual([
      'Also soon',
      'Soon',
      'Late',
      'Paid',
      'Alpha off',
      'Done',
      'Zed off',
    ]);
  });

  it('returns a new array', () => {
    const items = [make(2, 'b'), make(1, 'a')];
    const sorted = sortRecurring(items, new Date(2026, 9, 12));
    expect(sorted).not.toBe(items);
    expect(items.map((item) => item.id)).toEqual([2, 1]);
  });
});

describe('interval bounds', () => {
  it.each([
    ['1', 1],
    ['365', 365],
    [' 12 ', 12],
    ['007', 7],
  ])('%j is accepted as %i', (text, expected) => {
    expect(parseInterval(text)).toEqual({ ok: true, interval: expected });
  });

  it.each([
    ['', 'intervalRequired'],
    ['   ', 'intervalRequired'],
    ['0', 'intervalOutOfRange'],
    ['366', 'intervalOutOfRange'],
    ['1000', 'intervalOutOfRange'],
    ['1.5', 'intervalInvalid'],
    ['1,5', 'intervalInvalid'],
    ['-1', 'intervalInvalid'],
    ['abc', 'intervalInvalid'],
    ['2 weeks', 'intervalInvalid'],
  ])('%j is rejected with %s', (text, code) => {
    expect(parseInterval(text)).toEqual({ ok: false, code });
  });
});

describe('validateRecurringInput', () => {
  const today = '2026-10-14';
  const ok: RecurringInput = {
    accountId: 1,
    name: 'Rent',
    amount: '12.50',
    interval: '1',
    unit: 'month',
    startDate: today,
    endDate: null,
    note: '',
    active: true,
  };
  const check = (extra: Partial<RecurringInput>, currency: string | null = 'USD', original?: string) =>
    validateRecurringInput({ ...ok, ...extra }, currency, today, original);

  it('accepts a valid input', () => {
    expect(check({})).toBeNull();
    expect(check({ startDate: '2030-01-01', endDate: '2030-01-01' })).toBeNull();
    expect(check({ note: 'x'.repeat(140) })).toBeNull();
  });

  it('requires a trimmed name of at most 40 characters', () => {
    expect(check({ name: '   ' })).toBe('nameRequired');
    expect(check({ name: `  ${'a'.repeat(40)}  ` })).toBeNull();
    expect(check({ name: 'a'.repeat(41) })).toBe('nameTooLong');
  });

  it('a chosen account that does not exist is an error; no account is fine', () => {
    expect(check({}, null)).toBe('accountNotFound');
    // Without an account the caller passes the default currency.
    expect(check({ accountId: null }, 'MXN')).toBeNull();
    expect(check({ accountId: null, amount: '10.5' }, 'JPY')).toBe('amountDecimalsNotAllowed');
  });

  it.each([
    ['', 'USD', 'amountRequired'],
    ['abc', 'USD', 'amountInvalid'],
    ['0', 'USD', 'amountNotPositive'],
    ['1000000000', 'USD', 'amountTooLarge'],
    ['1.234', 'USD', 'amountTooManyDecimals'],
    ['10.5', 'JPY', 'amountDecimalsNotAllowed'],
  ])('amount %j in %s gives %s', (amount, currency, code) => {
    expect(check({ amount }, currency)).toBe(code);
  });

  it('checks the interval and the unit', () => {
    expect(check({ interval: '0' })).toBe('intervalOutOfRange');
    expect(check({ interval: '366' })).toBe('intervalOutOfRange');
    expect(check({ interval: '' })).toBe('intervalRequired');
    expect(check({ interval: '2.5' })).toBe('intervalInvalid');
    expect(check({ interval: '365' })).toBeNull();
    expect(check({ unit: 'fortnight' })).toBe('invalidUnit');
    for (const unit of ['day', 'week', 'month', 'year']) expect(check({ unit })).toBeNull();
  });

  describe('start date', () => {
    it('on create: today or later', () => {
      expect(check({ startDate: today })).toBeNull();
      expect(check({ startDate: '2026-10-15' })).toBeNull();
      expect(check({ startDate: '2026-10-13' })).toBe('startDateInPast');
      expect(check({ startDate: '2025-01-01' })).toBe('startDateInPast');
    });

    it('rejects things that are not a calendar day', () => {
      expect(check({ startDate: '' })).toBe('invalidStartDate');
      expect(check({ startDate: '2026-02-30' })).toBe('invalidStartDate');
      expect(check({ startDate: '2026-13-01' })).toBe('invalidStartDate');
      expect(check({ startDate: '10/14/2026' })).toBe('invalidStartDate');
    });

    it('on edit: an unchanged past start date is kept, a changed past one is not', () => {
      expect(check({ startDate: '2026-08-01' }, 'USD', '2026-08-01')).toBeNull();
      expect(check({ startDate: '2026-08-02' }, 'USD', '2026-08-01')).toBe('startDateInPast');
      expect(check({ startDate: '2026-10-14' }, 'USD', '2026-08-01')).toBeNull();
      expect(check({ startDate: '2026-12-01' }, 'USD', '2026-08-01')).toBeNull();
    });
  });

  describe('end date', () => {
    it('is optional, and must be on or after the start date', () => {
      expect(check({ endDate: null })).toBeNull();
      expect(check({ startDate: '2026-11-01', endDate: '2026-11-01' })).toBeNull();
      expect(check({ startDate: '2026-11-01', endDate: '2026-12-01' })).toBeNull();
      expect(check({ startDate: '2026-11-02', endDate: '2026-11-01' })).toBe('endBeforeStart');
    });

    it('must be a calendar day', () => {
      expect(check({ endDate: '2026-02-31' })).toBe('invalidEndDate');
      expect(check({ endDate: 'soon' })).toBe('invalidEndDate');
    });

    it('is checked against an unchanged past start date too', () => {
      expect(check({ startDate: '2026-08-01', endDate: '2026-09-01' }, 'USD', '2026-08-01')).toBeNull();
      expect(check({ startDate: '2026-08-01', endDate: '2026-07-01' }, 'USD', '2026-08-01')).toBe(
        'endBeforeStart',
      );
    });
  });

  it('limits the note to 140 characters after trimming', () => {
    expect(check({ note: `${'n'.repeat(140)}  ` })).toBeNull();
    expect(check({ note: 'n'.repeat(141) })).toBe('noteTooLong');
  });
});

describe('validateRecurringInput after a payment was paid or skipped', () => {
  const today = '2026-11-09';
  const handled = '2026-10-15';
  const ok: RecurringInput = {
    accountId: 1,
    name: 'Rent',
    amount: '12.50',
    interval: '1',
    unit: 'month',
    startDate: handled,
    endDate: null,
    note: '',
    active: true,
  };
  const check = (extra: Partial<RecurringInput>) =>
    validateRecurringInput({ ...ok, ...extra }, 'USD', today, '2026-01-15', handled);

  it('the shown start date (the handled occurrence) stays valid although it is in the past', () => {
    expect(check({})).toBeNull();
  });

  it('a different start date must be after the handled one and today or later', () => {
    expect(check({ startDate: '2026-10-14' })).toBe('startDateNotAfterHandled');
    expect(check({ startDate: '2026-10-01' })).toBe('startDateNotAfterHandled');
    expect(check({ startDate: '2026-10-16' })).toBe('startDateInPast');
    expect(check({ startDate: '2026-11-08' })).toBe('startDateInPast');
    expect(check({ startDate: today })).toBeNull();
    expect(check({ startDate: '2026-12-01' })).toBeNull();
  });

  it('when the handled occurrence is in the future, the day after it is the minimum', () => {
    const future = (startDate: string) =>
      validateRecurringInput({ ...ok, startDate }, 'USD', today, '2026-01-15', '2026-11-15');
    expect(future('2026-11-15')).toBeNull();
    expect(future('2026-11-14')).toBe('startDateNotAfterHandled');
    expect(future('2026-11-16')).toBeNull();
  });

  it('the end date must be on or after the shown start date', () => {
    expect(check({ endDate: '2026-10-14' })).toBe('endBeforeStart');
    expect(check({ endDate: handled })).toBeNull();
  });

  it('ignores the stored start date once something was handled', () => {
    // 2026-01-15 is the stored (past) start date; entering it is no longer a
    // "kept unchanged" case, it is before the handled occurrence.
    expect(check({ startDate: '2026-01-15' })).toBe('startDateNotAfterHandled');
  });
});

describe('startDateFloor', () => {
  it('is today for a payment that was never handled', () => {
    expect(startDateFloor(null, '2026-11-09')).toBe('2026-11-09');
  });

  it('is the later of today and the day after the handled occurrence', () => {
    expect(startDateFloor('2026-10-15', '2026-11-09')).toBe('2026-11-09');
    expect(startDateFloor('2026-11-15', '2026-11-09')).toBe('2026-11-16');
    expect(startDateFloor('2026-11-09', '2026-11-09')).toBe('2026-11-10');
    expect(startDateFloor('2026-02-28', '2026-01-01')).toBe('2026-03-01');
  });
});

describe('effectiveStartDate', () => {
  const existing = {
    interval: 1,
    unit: 'month' as Unit,
    startDate: '2026-01-31',
    lastConfirmedAt: '2026-02-28' as string | null,
  };

  it('uses the entered date when nothing was handled', () => {
    expect(
      effectiveStartDate({ ...existing, lastConfirmedAt: null }, { interval: 2, unit: 'month', startDate: '2026-05-01' }),
    ).toBe('2026-05-01');
  });

  it('keeps the stored anchor when the schedule is unchanged and the shown date is left alone', () => {
    expect(effectiveStartDate(existing, { interval: 1, unit: 'month', startDate: '2026-02-28' })).toBe(
      '2026-01-31',
    );
  });

  it('re-anchors to the handled occurrence when the interval or the unit changed', () => {
    expect(effectiveStartDate(existing, { interval: 2, unit: 'month', startDate: '2026-02-28' })).toBe(
      '2026-02-28',
    );
    expect(effectiveStartDate(existing, { interval: 1, unit: 'week', startDate: '2026-02-28' })).toBe(
      '2026-02-28',
    );
  });

  it('uses a different entered date as the new anchor', () => {
    expect(effectiveStartDate(existing, { interval: 3, unit: 'week', startDate: '2026-04-01' })).toBe(
      '2026-04-01',
    );
  });
});

describe('actionOccurrence (what Pay now and Skip act on)', () => {
  const payment = (extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
    id: 1,
    accountId: 1,
    name: 'Rent',
    amountCents: 100,
    note: null,
    interval: 1,
    unit: 'month',
    startDate: '2026-10-15',
    endDate: null,
    notifyDaysBefore: '',
    active: true,
    lastConfirmedAt: null,
    dismissedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });

  it('is the current (overdue) occurrence when there is one', () => {
    expect(actionOccurrence(payment(), '2026-11-09')).toBe('2026-10-15');
    expect(actionOccurrence(payment({ startDate: '2026-11-09' }), '2026-11-09')).toBe('2026-11-09');
  });

  it('is the next occurrence once the current one was handled, or none is due yet', () => {
    expect(actionOccurrence(payment({ lastConfirmedAt: '2026-10-15' }), '2026-11-09')).toBe('2026-11-15');
    expect(actionOccurrence(payment({ startDate: '2026-12-01' }), '2026-11-09')).toBe('2026-12-01');
  });

  it('ignores a dismissal', () => {
    expect(actionOccurrence(payment({ dismissedAt: '2026-10-15' }), '2026-11-09')).toBe('2026-10-15');
  });

  it('is null for an inactive or finished payment', () => {
    expect(actionOccurrence(payment({ active: false }), '2026-11-09')).toBeNull();
    expect(
      actionOccurrence(payment({ endDate: '2026-10-20', lastConfirmedAt: '2026-10-15' }), '2026-11-09'),
    ).toBeNull();
  });
});

describe('isDay', () => {
  it('accepts real calendar days only', () => {
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-04-31')).toBe(false);
    expect(isDay('2026-4-1')).toBe(false);
  });
});
