/**
 * New York: spring forward on 2026-03-08 (a 23-hour day) and fall back on
 * 2026-11-01 (a 25-hour day). Days are stepped by calendar parts, so a window
 * never skips or repeats a day, and each moment lands on its local date.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { dailyTotals, lastDays, sumTotals } from '@/services/chart-range';
import { localDayKey } from '@/services/day-groups';
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

describe('window over the fall-back day (2026-11-01)', () => {
  const days = lastDays(new Date(2026, 10, 3)); // Oct 28 .. Nov 3

  it('has seven distinct consecutive days', () => {
    expect(days.map(localDayKey)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(days.every((day) => day.getHours() === 0)).toBe(true);
  });

  it('puts both ends of the 25-hour day on Nov 1', () => {
    const totals = dailyTotals(
      [
        tx(1, '2026-11-01T04:00:00.000Z'), // 00:00 EDT
        tx(2, '2026-11-02T04:59:59.000Z'), // 23:59:59 EST
        tx(3, '2026-11-02T05:00:00.000Z'), // Nov 2, 00:00 EST
        tx(4, '2026-11-01T03:59:59.000Z'), // Oct 31, 23:59:59 EDT
      ],
      days,
      ids,
    );
    // Amounts are 10 ** (id - 1).
    expect(totals[4].expenseCents).toBe(1 + 10);
    expect(totals[5].expenseCents).toBe(100);
    expect(totals[3].expenseCents).toBe(1000);
  });
});

describe('window over the spring-forward day (2026-03-08)', () => {
  const days = lastDays(new Date(2026, 2, 10)); // Mar 4 .. Mar 10

  it('has seven distinct consecutive days', () => {
    expect(days.map(localDayKey)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('keeps the 23-hour day whole', () => {
    const totals = dailyTotals(
      [
        tx(1, '2026-03-08T05:00:00.000Z'), // 00:00 EST
        tx(2, '2026-03-09T03:59:59.000Z'), // 23:59:59 EDT
        tx(3, '2026-03-09T04:00:00.000Z'), // Mar 9, 00:00 EDT
      ],
      days,
      ids,
    );
    expect(totals[4].expenseCents).toBe(1 + 10);
    expect(totals[5].expenseCents).toBe(100);
    expect(sumTotals(totals).expenseCents).toBe(111);
  });
});
