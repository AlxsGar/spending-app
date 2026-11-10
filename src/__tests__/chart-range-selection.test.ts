import {
  fromBounds,
  labelIndices,
  rangeDays,
  toBounds,
  validateCustomRange,
  withinBounds,
} from '@/services/chart-range';
import { localDayKey } from '@/services/day-groups';

const keys = (days: Date[]) => days.map(localDayKey);

describe('rangeDays', () => {
  const today = new Date(2026, 10, 11); // Nov 11 2026

  it('7 days ends on today', () => {
    expect(keys(rangeDays({ kind: 'days7' }, today))).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ]);
  });

  it('30 days reaches back across the month boundary', () => {
    const days = rangeDays({ kind: 'days30' }, today);
    expect(days).toHaveLength(30);
    expect(localDayKey(days[0])).toBe('2026-10-13');
    expect(localDayKey(days[29])).toBe('2026-11-11');
  });

  it('this month runs from the 1st to today', () => {
    const days = rangeDays({ kind: 'month' }, today);
    expect(days).toHaveLength(11);
    expect(localDayKey(days[0])).toBe('2026-11-01');
    expect(localDayKey(days[10])).toBe('2026-11-11');
  });

  it('this month on the 1st is that one day', () => {
    const days = rangeDays({ kind: 'month' }, new Date(2026, 10, 1));
    expect(keys(days)).toEqual(['2026-11-01']);
  });

  it('a custom range across a month boundary', () => {
    const days = rangeDays({ kind: 'custom', from: new Date(2026, 9, 29), to: new Date(2026, 10, 2) }, today);
    expect(keys(days)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('a custom range across a year boundary', () => {
    const days = rangeDays({ kind: 'custom', from: new Date(2025, 11, 30), to: new Date(2026, 0, 2) }, today);
    expect(keys(days)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
});

describe('validateCustomRange', () => {
  const today = new Date(2026, 10, 9); // Nov 9 2026

  it('accepts one day, today, and a normal range', () => {
    expect(validateCustomRange(today, today, today)).toBeNull();
    expect(validateCustomRange(new Date(2026, 9, 3), new Date(2026, 10, 9), today)).toBeNull();
  });

  it('rejects To before From', () => {
    expect(validateCustomRange(new Date(2026, 10, 5), new Date(2026, 10, 4), today)).toBe('order');
  });

  it('rejects To after today', () => {
    expect(validateCustomRange(new Date(2026, 10, 5), new Date(2026, 10, 10), today)).toBe('future');
  });

  it('allows up to the same date one year after From, and rejects one day more', () => {
    // Nov 9 2025 through Nov 9 2026: exactly one year.
    expect(validateCustomRange(new Date(2025, 10, 9), new Date(2026, 10, 9), today)).toBeNull();
    // Nov 8 2025 through Nov 9 2026: a year and a day.
    expect(validateCustomRange(new Date(2025, 10, 8), new Date(2026, 10, 9), today)).toBe('tooLong');
  });

  it('allows 366 days after From across a Feb 29, rejects past it', () => {
    const later = new Date(2025, 5, 1);
    // Mar 1 2024 to Mar 1 2025 spans Feb 29 2024 (366 days after From): allowed.
    expect(validateCustomRange(new Date(2024, 2, 1), new Date(2025, 2, 1), later)).toBeNull();
    expect(validateCustomRange(new Date(2024, 2, 1), new Date(2025, 2, 2), later)).toBe('tooLong');
    // From Feb 29 counts as Mar 1 the next year.
    expect(validateCustomRange(new Date(2024, 1, 29), new Date(2025, 2, 1), later)).toBeNull();
    expect(validateCustomRange(new Date(2024, 1, 29), new Date(2025, 2, 2), later)).toBe('tooLong');
  });

  it('checks the order before the other rules', () => {
    expect(validateCustomRange(new Date(2026, 10, 12), new Date(2026, 10, 11), today)).toBe('order');
  });
});

describe('picker bounds', () => {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

  it('From: no later than To, no earlier than a year before it', () => {
    expect(fromBounds(day(2026, 11, 9))).toEqual({ min: day(2025, 11, 9), max: day(2026, 11, 9) });
  });

  it('From across a Feb 29: the leap day still reaches Mar 1 a year later', () => {
    expect(fromBounds(day(2025, 3, 1)).min).toEqual(day(2024, 2, 29));
    expect(fromBounds(day(2025, 2, 28)).min).toEqual(day(2024, 2, 28));
    // To on a Feb 29: a year back is Mar 1 of the year before.
    expect(fromBounds(day(2024, 2, 29)).min).toEqual(day(2023, 3, 1));
  });

  it('To: no earlier than From, and no later than today', () => {
    expect(toBounds(day(2026, 11, 5), day(2026, 11, 9))).toEqual({
      min: day(2026, 11, 5),
      max: day(2026, 11, 9),
    });
  });

  it('To: capped at one year after From when that is before today', () => {
    expect(toBounds(day(2025, 6, 1), day(2026, 11, 9)).max).toEqual(day(2026, 6, 1));
    expect(toBounds(day(2024, 2, 29), day(2026, 11, 9)).max).toEqual(day(2025, 3, 1));
  });

  it('withinBounds includes both edges', () => {
    const bounds = { min: day(2026, 1, 1), max: day(2026, 1, 31) };
    expect(withinBounds(new Date(2026, 0, 1, 15), bounds)).toBe(true);
    expect(withinBounds(new Date(2026, 0, 31, 23), bounds)).toBe(true);
    expect(withinBounds(day(2025, 12, 31), bounds)).toBe(false);
    expect(withinBounds(day(2026, 2, 1), bounds)).toBe(false);
  });

  it('every pair the bounds allow is valid, and the edges just outside are not', () => {
    const today = day(2026, 11, 9);
    for (const to of [day(2026, 11, 9), day(2025, 3, 1), day(2025, 2, 28), day(2024, 2, 29)]) {
      const { min, max } = fromBounds(to);
      expect(validateCustomRange(min, max, to < today ? to : today)).toBeNull();
      const before = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 1);
      expect(validateCustomRange(before, to, to)).toBe('tooLong');
    }
    for (const from of [day(2025, 6, 1), day(2024, 2, 29), day(2026, 11, 1)]) {
      const { min, max } = toBounds(from, today);
      expect(validateCustomRange(from, min, today)).toBeNull();
      expect(validateCustomRange(from, max, today)).toBeNull();
    }
  });
});

describe('label thinning by range length', () => {
  it('shows every label at 7 days, about 7 at 30 and 365 days', () => {
    expect(labelIndices(7)).toHaveLength(7);
    expect(labelIndices(30)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(labelIndices(365)).toHaveLength(7);
  });
});
