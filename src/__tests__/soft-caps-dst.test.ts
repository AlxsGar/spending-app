/**
 * New York: spring forward on 2026-03-08 (02:00 EST -> 03:00 EDT, a 23-hour
 * day) and fall back on 2026-11-01 (a 25-hour day). Periods are built from local
 * calendar parts, so they start and end at local midnight whatever the offset.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { periodBounds, spentInPeriod } from '@/services/soft-caps';
import type { Transaction } from '@/services/transactions';

const tx = (id: number, iso: string): Transaction => ({
  id,
  accountId: 1,
  kind: 'expense',
  amountCents: 10 ** (id - 1),
  date: iso,
  note: null,
  recurringId: null,
  recurringOccurrence: null,
  createdAt: iso,
});
const ids = new Set([1]);

describe('spring forward (2026-03-08, Sunday)', () => {
  const reference = new Date(2026, 2, 8, 12);

  it('the day is 23 hours long, midnight to midnight local', () => {
    const { start, end } = periodBounds('day', reference);
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it('the week (Mon Mar 2 to Sun Mar 8) ends at Monday 00:00 EDT, not 24 hours after Sunday 00:00', () => {
    const { start, end } = periodBounds('week', reference);
    expect(start.toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    const items = [
      tx(1, '2026-03-09T03:59:59.999Z'), // Sunday 23:59:59.999 EDT: in
      tx(2, '2026-03-09T04:00:00.000Z'), // Monday 00:00 EDT: out
      tx(3, '2026-03-02T05:00:00.000Z'), // Monday 00:00 EST: in
      tx(4, '2026-03-02T04:59:59.999Z'), // Sunday before 23:59 EST: out
    ];
    expect(spentInPeriod(items, ids, 'week', reference)).toBe(1 + 100);
  });

  it('the month spans the change: EST at the start, EDT at the end', () => {
    const { start, end } = periodBounds('month', reference);
    expect(start.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-04-01T04:00:00.000Z');
  });
});

describe('fall back (2026-11-01, Sunday)', () => {
  const reference = new Date(2026, 10, 1, 12);

  it('the day is 25 hours long: 23:30 EST at the end still counts', () => {
    const { start, end } = periodBounds('day', reference);
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
    const items = [
      tx(1, '2026-11-01T04:00:00.000Z'), // 00:00 EDT: in
      tx(2, '2026-11-01T06:30:00.000Z'), // the repeated 01:30 EST: in
      tx(3, '2026-11-02T04:30:00.000Z'), // 23:30 EST: in
      tx(4, '2026-11-02T05:00:00.000Z'), // Monday 00:00 EST: out
      tx(5, '2026-11-01T03:59:59.999Z'), // Saturday 23:59 EDT: out
    ];
    expect(spentInPeriod(items, ids, 'day', reference)).toBe(1 + 10 + 100);
  });

  it('the week ends at Monday 00:00 EST (Nov 2)', () => {
    const { start, end } = periodBounds('week', reference);
    expect(start.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});
