// No time zone is pinned here on purpose: every expectation is derived from
// local getters, so this file passes under any TZ (run it with TZ=UTC and
// TZ=America/New_York to check). DST cases live in compose-edited-date-dst.

import { composeEditedDate } from '@/services/transactions';

const localTime = (iso: string) => {
  const date = new Date(iso);
  return [date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()];
};
const localDay = (iso: string) => {
  const date = new Date(iso);
  return [date.getFullYear(), date.getMonth(), date.getDate()];
};

// Later than every date used below, so the "not after now" cap stays out of
// the way except in the cap tests.
const LATER = new Date(2030, 0, 1);

describe('composeEditedDate', () => {
  const original = new Date(2026, 2, 5, 14, 45, 10, 250).toISOString();

  it('keeps the exact original timestamp when the local day is unchanged', () => {
    expect(composeEditedDate(original, new Date(2026, 2, 5), LATER)).toBe(original);
    expect(composeEditedDate(original, new Date(2026, 2, 5, 23, 59), LATER)).toBe(original);
  });

  it.each([
    ['just after local midnight', 0, 30],
    ['late in the evening', 23, 30],
  ])('compares LOCAL days: %s', (_label, hour, minute) => {
    // Away from UTC, one of these two instants falls on a different UTC day
    // than its local day, which is what this guards. In UTC both are equal.
    const iso = new Date(2026, 2, 5, hour, minute).toISOString();
    expect(composeEditedDate(iso, new Date(2026, 2, 5), LATER)).toBe(iso);
    const moved = composeEditedDate(iso, new Date(2026, 2, 6), LATER);
    expect(localDay(moved)).toEqual([2026, 2, 6]);
    expect(localTime(moved)).toEqual([hour, minute, 0, 0]);
  });

  it('uses the new local day with the original local time of day when the day changed', () => {
    const iso = composeEditedDate(original, new Date(2026, 2, 1), LATER);
    expect(localDay(iso)).toEqual([2026, 2, 1]);
    expect(localTime(iso)).toEqual([14, 45, 10, 250]);
    expect(iso).toBe(new Date(2026, 2, 1, 14, 45, 10, 250).toISOString());
  });

  it('works across months and years', () => {
    const iso = composeEditedDate(original, new Date(2025, 11, 31), LATER);
    expect(localDay(iso)).toEqual([2025, 11, 31]);
    expect(localTime(iso)).toEqual([14, 45, 10, 250]);
  });

  describe('never later than now', () => {
    // Now is 10:00 on 2026-03-10 local.
    const now = new Date(2026, 2, 10, 10, 0, 0, 0);
    const today = new Date(2026, 2, 10);

    it('stores now when the original time of day is later than now', () => {
      const evening = new Date(2026, 2, 5, 20, 15, 30, 500).toISOString();
      expect(composeEditedDate(evening, today, now)).toBe(now.toISOString());
    });

    it('keeps the original time of day when it is earlier than now', () => {
      const morning = new Date(2026, 2, 5, 8, 15, 30, 500).toISOString();
      const result = composeEditedDate(morning, today, now);
      expect(localDay(result)).toEqual([2026, 2, 10]);
      expect(localTime(result)).toEqual([8, 15, 30, 500]);
    });

    it('keeps a time of day equal to now', () => {
      const same = new Date(2026, 2, 5, 10, 0, 0, 0).toISOString();
      expect(composeEditedDate(same, today, now)).toBe(now.toISOString());
    });

    it('does not cap a past day, whatever the time of day', () => {
      const evening = new Date(2026, 2, 5, 23, 59).toISOString();
      const result = composeEditedDate(evening, new Date(2026, 2, 9), now);
      expect(localDay(result)).toEqual([2026, 2, 9]);
      expect(localTime(result)).toEqual([23, 59, 0, 0]);
    });

    it('keeps the unchanged-day rule over the cap: an original in the future is returned as it was', () => {
      const future = new Date(2026, 2, 10, 18, 0).toISOString();
      expect(composeEditedDate(future, today, now)).toBe(future);
    });
  });
});
