/**
 * New York falls back on 2026-11-01: 02:00 EDT -> 01:00 EST, so the local hour
 * 01:xx happens twice (first 01:xx EDT = 05:xxZ, then 01:xx EST = 06:xxZ).
 *
 * @jest-environment ./src/test/timezone-environment.js
 * @jest-environment-options {"timezone": "America/New_York"}
 */
import { composeTransactionDate, computeBalances } from '@/services/transactions';

describe('balance anchor during the repeated hour of a fall-back day', () => {
  it('a transaction recorded in the SECOND 01:xx is dated in the first one, before an anchor set in the second', () => {
    // The anchor is set at 01:30 EST, the second 01:30 (06:30Z).
    const anchorAt = new Date('2026-11-01T06:30:00.000Z');
    expect(anchorAt.getHours()).toBe(1);
    // A transaction recorded at 01:45 EST (06:45Z), later than the anchor.
    const recordedAt = new Date('2026-11-01T06:45:00.000Z');
    expect([recordedAt.getHours(), recordedAt.getMinutes()]).toEqual([1, 45]);

    // The chosen day plus the local time 01:45 resolves to the FIRST 01:45
    // (EDT, 05:45Z), an hour before it was really recorded.
    const date = composeTransactionDate(new Date(2026, 10, 1), recordedAt);
    expect(date).toBe('2026-11-01T05:45:00.000Z');

    // So it is dated before the anchor and does not count. Known and accepted;
    // it only affects transactions recorded in that one repeated hour.
    const balances = computeBalances(
      [{ id: 1, balanceAnchorCents: 10000, balanceAnchorAt: anchorAt.toISOString() }],
      [{ accountId: 1, kind: 'expense', amountCents: 500, date }],
    );
    expect(balances).toEqual({ 1: 10000 });
  });

  it('a transaction recorded in the first 01:xx is unaffected when the anchor comes before it', () => {
    const anchorAt = '2026-11-01T05:10:00.000Z';
    const recordedAt = new Date('2026-11-01T05:45:00.000Z');
    const date = composeTransactionDate(new Date(2026, 10, 1), recordedAt);
    expect(date).toBe('2026-11-01T05:45:00.000Z');
    expect(
      computeBalances(
        [{ id: 1, balanceAnchorCents: 10000, balanceAnchorAt: anchorAt }],
        [{ accountId: 1, kind: 'expense', amountCents: 500, date }],
      ),
    ).toEqual({ 1: 9500 });
  });
});
