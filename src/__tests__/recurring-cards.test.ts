import {
  STACK_WINDOW_DAYS,
  addDays,
  cardFor,
  previousOccurrence,
  stackCards,
} from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';

const make = (id: number, extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id,
  accountId: 1,
  name: `Payment ${id}`,
  amountCents: 100,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-01-15',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('addDays', () => {
  it('adds and subtracts whole calendar days across month, year and leap boundaries', () => {
    expect(addDays('2026-11-05', 7)).toBe('2026-11-12');
    expect(addDays('2026-02-24', 7)).toBe('2026-03-03');
    expect(addDays('2028-02-24', 7)).toBe('2028-03-02');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-05-10', 0)).toBe('2026-05-10');
  });

  it('is not moved by a daylight saving change', () => {
    // US spring forward (Mar 8 2026) and fall back (Nov 1 2026).
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
});

describe('cardFor: the 7-day window (both ends included)', () => {
  // A payment whose first occurrence is `start`, nothing confirmed.
  const upcoming = (start: string) => make(1, { startDate: start });

  it('the window is today through today + 7', () => {
    expect(STACK_WINDOW_DAYS).toBe(7);
  });

  it('shows an occurrence today (due today, not overdue)', () => {
    expect(cardFor(upcoming('2026-11-05'), '2026-11-05')).toEqual({
      payment: upcoming('2026-11-05'),
      occurrence: '2026-11-05',
      overdue: false,
    });
  });

  it('shows today + 7 and hides today + 8', () => {
    expect(cardFor(upcoming('2026-11-12'), '2026-11-05')?.occurrence).toBe('2026-11-12');
    expect(cardFor(upcoming('2026-11-13'), '2026-11-05')).toBeNull();
  });

  it('holds across a month boundary', () => {
    expect(cardFor(upcoming('2026-03-03'), '2026-02-24')?.occurrence).toBe('2026-03-03');
    expect(cardFor(upcoming('2026-03-04'), '2026-02-24')).toBeNull();
    // Leap year: February has 29 days.
    expect(cardFor(upcoming('2028-03-02'), '2028-02-24')?.occurrence).toBe('2028-03-02');
    expect(cardFor(upcoming('2028-03-03'), '2028-02-24')).toBeNull();
  });

  it('holds across a year boundary', () => {
    expect(cardFor(upcoming('2027-01-04'), '2026-12-28')?.occurrence).toBe('2027-01-04');
    expect(cardFor(upcoming('2027-01-05'), '2026-12-28')).toBeNull();
    expect(cardFor(upcoming('2027-01-01'), '2026-12-31')?.occurrence).toBe('2027-01-01');
  });

  it('the day after a confirmed occurrence is not in the window until it is within 7 days', () => {
    const monthly = make(1, { startDate: '2026-01-15', lastConfirmedAt: '2026-10-15' });
    expect(cardFor(monthly, '2026-11-07')).toBeNull();
    expect(cardFor(monthly, '2026-11-08')?.occurrence).toBe('2026-11-15');
  });
});

describe('cardFor: overdue, dismissed, inactive, finished', () => {
  it('an occurrence before today that is unpaid is overdue, however old', () => {
    const yearly = make(1, { unit: 'year', startDate: '2025-01-01' });
    expect(cardFor(yearly, '2026-11-05')).toMatchObject({ occurrence: '2026-01-01', overdue: true });
    const monthly = make(2, { startDate: '2026-10-01' });
    expect(cardFor(monthly, '2026-11-05')).toMatchObject({ occurrence: '2026-11-01', overdue: true });
  });

  it('only the current occurrence is a card: earlier missed ones are dropped', () => {
    const daily = make(1, { unit: 'day', startDate: '2026-11-01' });
    expect(cardFor(daily, '2026-11-05')).toMatchObject({ occurrence: '2026-11-05', overdue: false });
  });

  it('a paid occurrence is not overdue; the next one shows when it is near', () => {
    const paid = make(1, { startDate: '2026-10-01', lastConfirmedAt: '2026-11-01' });
    expect(cardFor(paid, '2026-11-05')).toBeNull();
    expect(cardFor(paid, '2026-11-25')?.occurrence).toBe('2026-12-01');
  });

  describe('a dismissed occurrence hides only itself', () => {
    // Monthly on the 1st; Nov 1 is overdue and dismissed.
    const dismissed = make(1, { startDate: '2026-10-01', dismissedAt: '2026-11-01' });

    it('overdue dismissed, next outside the window: no card', () => {
      expect(cardFor(dismissed, '2026-11-05')).toBeNull();
      expect(cardFor(dismissed, '2026-11-23')).toBeNull();
    });

    it('overdue dismissed, next inside the window: a card for the next, not overdue', () => {
      expect(cardFor(dismissed, '2026-11-24')).toEqual({
        payment: dismissed,
        occurrence: '2026-12-01',
        overdue: false,
      });
      expect(cardFor(dismissed, '2026-11-30')).toMatchObject({ occurrence: '2026-12-01', overdue: false });
    });

    it('on the next occurrence day it is the current occurrence, due today', () => {
      expect(cardFor(dismissed, '2026-12-01')).toMatchObject({ occurrence: '2026-12-01', overdue: false });
    });

    it('dismissed upcoming: no card until the following occurrence enters the window', () => {
      const upcoming = make(1, { startDate: '2026-11-08', dismissedAt: '2026-11-08' });
      expect(cardFor(upcoming, '2026-11-05')).toBeNull();
      expect(cardFor(upcoming, '2026-11-20')).toBeNull();
      expect(cardFor(upcoming, '2026-12-01')).toMatchObject({ occurrence: '2026-12-08', overdue: false });
    });

    it('does not run past the end date', () => {
      const ending = make(1, { startDate: '2026-10-01', endDate: '2026-11-15', dismissedAt: '2026-11-01' });
      expect(cardFor(ending, '2026-11-24')).toBeNull();
    });

    it('stackCards counts it once, with the next occurrence, among other cards', () => {
      const other = make(2, { startDate: '2026-11-26' });
      const cards = stackCards([dismissed, other], '2026-11-24');
      expect(cards.map((card) => [card.payment.id, card.occurrence, card.overdue])).toEqual([
        [2, '2026-11-26', false],
        [1, '2026-12-01', false],
      ]);
      expect(cards).toHaveLength(2);
    });
  });

  it('inactive and finished payments never have a card', () => {
    expect(cardFor(make(1, { active: false, startDate: '2026-11-05' }), '2026-11-05')).toBeNull();
    // Single payment ended Nov 3 and already paid: finished.
    const finished = make(2, {
      startDate: '2026-11-03',
      endDate: '2026-11-03',
      lastConfirmedAt: '2026-11-03',
    });
    expect(cardFor(finished, '2026-11-05')).toBeNull();
    // Unpaid last occurrence stays current (overdue) until paid.
    const unpaid = make(3, { startDate: '2026-11-03', endDate: '2026-11-03' });
    expect(cardFor(unpaid, '2026-11-05')).toMatchObject({ occurrence: '2026-11-03', overdue: true });
  });

  it('a payment that starts after the window has no card', () => {
    expect(cardFor(make(1, { startDate: '2027-02-01' }), '2026-11-05')).toBeNull();
  });
});

describe('stackCards', () => {
  const today = '2026-11-05';

  it('puts overdue first, then the rest soonest first, ties by id', () => {
    const cards = stackCards(
      [
        make(1, { startDate: '2026-11-10' }),
        make(2, { startDate: '2026-10-28' }), // monthly, unpaid: Oct 28 is overdue
        make(3, { startDate: '2026-11-05' }),
        make(4, { startDate: '2026-11-08' }),
        make(5, { startDate: '2026-11-08' }),
        make(6, { unit: 'year', startDate: '2025-11-01' }), // overdue Nov 1
        make(7, { unit: 'week', startDate: '2026-10-29' }), // current Nov 5 (today)
      ],
      today,
    );
    // Payment 2 is monthly from Oct 28: its Oct 28 occurrence is current and
    // overdue (Oct 28 < Nov 5).
    expect(cards.map((card) => [card.payment.id, card.occurrence, card.overdue])).toEqual([
      [2, '2026-10-28', true],
      [6, '2026-11-01', true],
      [3, '2026-11-05', false],
      [7, '2026-11-05', false],
      [4, '2026-11-08', false],
      [5, '2026-11-08', false],
      [1, '2026-11-10', false],
    ]);
  });

  it('is empty when nothing qualifies', () => {
    expect(stackCards([], today)).toEqual([]);
    expect(stackCards([make(1, { active: false })], today)).toEqual([]);
  });
});

describe('previousOccurrence', () => {
  const monthly31 = { interval: 1, unit: 'month' as const, startDate: '2026-01-31', endDate: null };

  it('is the occurrence before, with month-end clamping', () => {
    expect(previousOccurrence(monthly31, '2026-03-31')).toBe('2026-02-28');
    expect(previousOccurrence(monthly31, '2026-02-28')).toBe('2026-01-31');
  });

  it('is null for the first occurrence', () => {
    expect(previousOccurrence(monthly31, '2026-01-31')).toBeNull();
    expect(previousOccurrence({ ...monthly31, startDate: '2026-11-05' }, '2026-11-05')).toBeNull();
  });

  it('works for days, weeks and years, and across a year boundary', () => {
    const base = { endDate: null };
    expect(previousOccurrence({ ...base, interval: 3, unit: 'day', startDate: '2026-12-30' }, '2027-01-04')).toBe(
      '2027-01-02',
    );
    expect(previousOccurrence({ ...base, interval: 2, unit: 'week', startDate: '2026-12-01' }, '2026-12-29')).toBe(
      '2026-12-15',
    );
    expect(previousOccurrence({ ...base, interval: 1, unit: 'year', startDate: '2024-02-29' }, '2026-02-28')).toBe(
      '2025-02-28',
    );
  });

  it('for a day that is not an occurrence, is the latest one before it', () => {
    expect(previousOccurrence(monthly31, '2026-03-15')).toBe('2026-02-28');
  });
});
