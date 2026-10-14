/**
 * Grouping uses the device's local time zone. Pin it to America/Mexico_City
 * (UTC-6, no DST), so local day boundaries differ from UTC ones.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/Mexico_City"}
 */

import { groupByLocalDay, localDayKey, relativeDay } from '@/services/day-groups';
import type { Transaction } from '@/services/transactions';

const make = (id: number, date: string): Transaction => ({
  id,
  accountId: 1,
  kind: 'expense',
  amountCents: 100,
  date,
  note: null,
  recurringId: null,
  createdAt: date,
});

describe('groupByLocalDay (TZ America/Mexico_City, UTC-6)', () => {
  it('runs in the pinned zone', () => {
    expect(new Date('2026-01-10T12:00:00Z').getTimezoneOffset()).toBe(360);
  });

  it('splits 23:30 local and 00:30 next day local even though they share a UTC date', () => {
    // 23:30 on Jan 10 local = 05:30Z Jan 11; 00:30 on Jan 11 local = 06:30Z Jan 11.
    const late = make(1, '2026-01-11T05:30:00.000Z');
    const early = make(2, '2026-01-11T06:30:00.000Z');
    expect(late.date.slice(0, 10)).toBe(early.date.slice(0, 10));
    const groups = groupByLocalDay([early, late]);
    expect(groups.map((group) => group.key)).toEqual(['2026-01-11', '2026-01-10']);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([[2], [1]]);
  });

  it('joins transactions on one local day even when their UTC dates differ', () => {
    // 19:00 and 17:00 local on Jan 10 = 01:00Z Jan 11 and 23:00Z Jan 10.
    const evening = make(1, '2026-01-11T01:00:00.000Z');
    const afternoon = make(2, '2026-01-10T23:00:00.000Z');
    expect(evening.date.slice(0, 10)).not.toBe(afternoon.date.slice(0, 10));
    const groups = groupByLocalDay([evening, afternoon]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('2026-01-10');
    expect(groups[0].items.map((item) => item.id)).toEqual([1, 2]);
  });

  it('keeps newest-first order across groups and returns local midnight as the day', () => {
    const groups = groupByLocalDay([
      make(3, '2026-01-12T18:00:00.000Z'),
      make(2, '2026-01-11T18:00:00.000Z'),
      make(1, '2026-01-10T18:00:00.000Z'),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['2026-01-12', '2026-01-11', '2026-01-10']);
    expect(groups[0].day.getHours()).toBe(0);
    expect(groups[0].day.getDate()).toBe(12);
  });

  it('returns no groups for no transactions', () => {
    expect(groupByLocalDay([])).toEqual([]);
  });
});

describe('relativeDay', () => {
  // Now: Jan 11 00:30 local (06:30Z).
  const now = new Date('2026-01-11T06:30:00.000Z');

  it('labels today and yesterday by local day', () => {
    expect(localDayKey(now)).toBe('2026-01-11');
    expect(relativeDay(new Date(2026, 0, 11), now)).toBe('today');
    expect(relativeDay(new Date(2026, 0, 10), now)).toBe('yesterday');
    expect(relativeDay(new Date(2026, 0, 9), now)).toBeNull();
  });

  it('handles month boundaries', () => {
    const first = new Date(2026, 2, 1, 10);
    expect(relativeDay(new Date(2026, 1, 28), first)).toBe('yesterday');
  });
});
