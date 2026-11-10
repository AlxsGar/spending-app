/**
 * New York: fall back on 2026-11-01 (a 25-hour day) and spring forward on
 * 2026-03-08 (a 23-hour day). Custom ranges and this month step by calendar
 * parts, so no day is skipped or repeated.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { rangeDays, validateCustomRange } from '@/services/chart-range';
import { localDayKey } from '@/services/day-groups';

describe('custom ranges over a DST change', () => {
  it('over the fall-back day has every day once', () => {
    const days = rangeDays(
      { kind: 'custom', from: new Date(2026, 9, 30), to: new Date(2026, 10, 3) },
      new Date(2026, 10, 9),
    );
    expect(days.map(localDayKey)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(days.every((day) => day.getHours() === 0)).toBe(true);
  });

  it('over the spring-forward day has every day once', () => {
    const days = rangeDays(
      { kind: 'custom', from: new Date(2026, 2, 6), to: new Date(2026, 2, 10) },
      new Date(2026, 10, 9),
    );
    expect(days.map(localDayKey)).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('this month across the fall-back day', () => {
    const days = rangeDays({ kind: 'month' }, new Date(2026, 10, 3));
    expect(days.map(localDayKey)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('the one-year limit holds across DST changes', () => {
    const today = new Date(2026, 10, 9);
    expect(validateCustomRange(new Date(2025, 10, 9), new Date(2026, 10, 9), today)).toBeNull();
    expect(validateCustomRange(new Date(2025, 10, 8), new Date(2026, 10, 9), today)).toBe('tooLong');
  });
});
