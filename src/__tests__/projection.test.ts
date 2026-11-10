import { dueOccurrencesThisMonth, monthEndDay, projectBalances } from '@/services/projection';
import type { RecurringPayment } from '@/services/recurring';

const pay = (extra: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 1,
  accountId: 1,
  name: 'Rent',
  amountCents: 1000,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-11-20',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const account = (id: number, currency: 'USD' | 'MXN' | 'EUR') => ({ id, currency });
const TODAY = '2026-11-10';

const project = (
  payments: RecurringPayment[],
  extra: Partial<Parameters<typeof projectBalances>[0]> = {},
) =>
  projectBalances({
    accounts: [account(1, 'USD')],
    balances: { 1: 50000 },
    payments,
    today: TODAY,
    defaultCurrency: 'MXN',
    ...extra,
  });

describe('monthEndDay', () => {
  it('knows month lengths, leap years included', () => {
    expect(monthEndDay('2026-11-10')).toBe('2026-11-30');
    expect(monthEndDay('2026-12-01')).toBe('2026-12-31');
    expect(monthEndDay('2028-02-03')).toBe('2028-02-29');
    expect(monthEndDay('2026-02-03')).toBe('2026-02-28');
  });
});

describe('dueOccurrencesThisMonth', () => {
  it('counts a monthly payment due later this month once', () => {
    expect(dueOccurrencesThisMonth(pay(), TODAY)).toBe(1);
  });

  it('counts every remaining occurrence of a weekly payment through month end', () => {
    // Nov 12, 19, 26.
    expect(dueOccurrencesThisMonth(pay({ unit: 'week', startDate: '2026-11-12' }), TODAY)).toBe(3);
  });

  it('counts an overdue unpaid occurrence', () => {
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-11-03' }), TODAY)).toBe(1);
  });

  it('counts the overdue weekly occurrence too, but not earlier missed ones', () => {
    // Nov 2 (missed, dropped), 9 (overdue, counts), 16, 23, 30.
    expect(dueOccurrencesThisMonth(pay({ unit: 'week', startDate: '2026-10-26' }), TODAY)).toBe(4);
  });

  it('does not count an occurrence paid early or skipped', () => {
    expect(dueOccurrencesThisMonth(pay({ lastConfirmedAt: '2026-11-20' }), TODAY)).toBe(0);
    expect(
      dueOccurrencesThisMonth(
        pay({ unit: 'week', startDate: '2026-11-12', lastConfirmedAt: '2026-11-19' }),
        TODAY,
      ),
    ).toBe(1);
  });

  it('does not count inactive or finished payments', () => {
    expect(dueOccurrencesThisMonth(pay({ active: false }), TODAY)).toBe(0);
    expect(
      dueOccurrencesThisMonth(
        pay({ startDate: '2026-10-01', endDate: '2026-10-01', lastConfirmedAt: '2026-10-01' }),
        TODAY,
      ),
    ).toBe(0);
  });

  it('stops at an end date inside the month', () => {
    expect(
      dueOccurrencesThisMonth(
        pay({ unit: 'week', startDate: '2026-11-12', endDate: '2026-11-20' }),
        TODAY,
      ),
    ).toBe(2);
  });

  it('still counts a dismissed occurrence', () => {
    expect(dueOccurrencesThisMonth(pay({ dismissedAt: '2026-11-20' }), TODAY)).toBe(1);
  });

  it('counts a payment due today', () => {
    expect(dueOccurrencesThisMonth(pay({ startDate: TODAY }), TODAY)).toBe(1);
  });

  it('does not count an occurrence on the 1st of next month', () => {
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-12-01' }), TODAY)).toBe(0);
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-11-30' }), TODAY)).toBe(1);
  });

  it('on the last day of the month counts only what is due that day or overdue', () => {
    const last = '2026-11-30';
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-11-30' }), last)).toBe(1);
    expect(dueOccurrencesThisMonth(pay({ startDate: '2026-12-01' }), last)).toBe(0);
    expect(dueOccurrencesThisMonth(pay({ unit: 'day', startDate: '2026-11-29' }), last)).toBe(1);
  });

  it('rolls over on a new month', () => {
    const p = pay({ startDate: '2026-11-20' });
    expect(dueOccurrencesThisMonth(p, '2026-11-30')).toBe(1);
    // December 1: the Nov 20 one is overdue and unpaid (current), plus Dec 20.
    expect(dueOccurrencesThisMonth(p, '2026-12-01')).toBe(2);
  });
});

describe('projectBalances', () => {
  it('equals the balance when nothing is due', () => {
    const result = project([]);
    expect(result.perAccount).toEqual({ 1: 50000 });
    expect(result.overall).toEqual([{ currency: 'USD', cents: 50000 }]);
  });

  it('subtracts due payments from the account and the overall line', () => {
    const result = project([pay({ unit: 'week', startDate: '2026-11-12' })]);
    expect(result.perAccount[1]).toBe(50000 - 3000);
    expect(result.overall).toEqual([{ currency: 'USD', cents: 47000 }]);
  });

  it('uses only the payments linked to the account', () => {
    const result = project(
      [pay({ id: 1, accountId: 1 }), pay({ id: 2, accountId: 2, amountCents: 7777 })],
      { accounts: [account(1, 'USD'), account(2, 'USD')], balances: { 1: 50000, 2: 20000 } },
    );
    expect(result.perAccount).toEqual({ 1: 49000, 2: 12223 });
    expect(result.overall).toEqual([{ currency: 'USD', cents: 61223 }]);
  });

  it('counts unassigned payments only overall, in the default currency', () => {
    const result = project([pay({ accountId: null, amountCents: 2500 })], {
      accounts: [account(1, 'USD'), account(2, 'MXN')],
      balances: { 1: 50000, 2: 10000 },
    });
    expect(result.perAccount).toEqual({ 1: 50000, 2: 10000 });
    expect(result.overall).toEqual([
      { currency: 'MXN', cents: 7500 },
      { currency: 'USD', cents: 50000 },
    ]);
  });

  it('shows a default-currency line for unassigned payments when no account uses it', () => {
    const result = project([pay({ accountId: null, amountCents: 2500 })]);
    expect(result.overall).toEqual([
      { currency: 'MXN', cents: -2500 },
      { currency: 'USD', cents: 50000 },
    ]);
  });

  it('puts the default currency first, then the rest alphabetically', () => {
    const result = project([], {
      accounts: [account(1, 'USD'), account(2, 'EUR'), account(3, 'MXN'), account(4, 'EUR')],
      balances: { 1: 100, 2: 200, 3: 300, 4: 400 },
    });
    expect(result.overall).toEqual([
      { currency: 'MXN', cents: 300 },
      { currency: 'EUR', cents: 600 },
      { currency: 'USD', cents: 100 },
    ]);
  });

  it('can go negative', () => {
    const result = project([pay({ amountCents: 80000 })]);
    expect(result.perAccount[1]).toBe(-30000);
  });
});
