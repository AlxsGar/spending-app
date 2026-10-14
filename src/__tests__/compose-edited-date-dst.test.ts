/**
 * New York has daylight saving time: 2026-03-08 02:00 -> 03:00 and
 * 2026-11-01 02:00 -> 01:00.
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { composeEditedDate } from '@/services/transactions';

// After every date used here, so the "not later than now" cap stays out of the way.
const LATER = new Date(2030, 0, 1);

describe('time zone for these tests', () => {
  it('is New York', () => {
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(300); // EST
    expect(new Date(2026, 6, 15, 12).getTimezoneOffset()).toBe(240); // EDT
  });
});

describe('composeEditedDate around daylight saving time', () => {
  it('moves a 02:30 transaction onto the spring-forward day: the missing time lands at 03:30', () => {
    const original = new Date(2026, 2, 5, 2, 30).toISOString();
    expect(new Date(original).getHours()).toBe(2);

    const iso = composeEditedDate(original, new Date(2026, 2, 8), LATER);
    const result = new Date(iso);
    // 02:30 does not exist on 2026-03-08. JavaScript resolves it forward, so the
    // stored time is 03:30 EDT (07:30Z), still on the chosen day. The original
    // time of day is not kept exactly.
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 2, 8]);
    expect([result.getHours(), result.getMinutes()]).toEqual([3, 30]);
    expect(iso).toBe('2026-03-08T07:30:00.000Z');
  });

  it('keeps the exact timestamp when editing on the spring-forward day itself', () => {
    const original = new Date(2026, 2, 8, 3, 30).toISOString();
    expect(composeEditedDate(original, new Date(2026, 2, 8), LATER)).toBe(original);
  });

  it('keeps 03:30 when moving it off the spring-forward day', () => {
    const original = new Date(2026, 2, 8, 3, 30).toISOString();
    const result = new Date(composeEditedDate(original, new Date(2026, 2, 9), LATER));
    expect([result.getDate(), result.getHours(), result.getMinutes()]).toEqual([9, 3, 30]);
  });

  it('moves a 01:30 transaction onto the fall-back day: the repeated hour resolves to the first 01:30 (EDT)', () => {
    const original = new Date(2026, 9, 20, 1, 30).toISOString();
    const iso = composeEditedDate(original, new Date(2026, 10, 1), LATER);
    const result = new Date(iso);
    expect([result.getMonth(), result.getDate()]).toEqual([10, 1]);
    expect([result.getHours(), result.getMinutes()]).toEqual([1, 30]);
    expect(iso).toBe('2026-11-01T05:30:00.000Z');
  });
});
