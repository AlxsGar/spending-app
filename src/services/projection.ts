import type { Account, Currency } from './accounts';
import { occurrenceAfter, scheduleState } from './recurring';
import type { Day, RecurringPayment } from './recurring';

// The last calendar day of the month `today` is in.
export function monthEndDay(today: Day): Day {
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

// How many unpaid occurrences of an active payment fall on or before the last
// day of this month: the current one if unpaid (overdue included, earlier missed
// ones are already dropped by the schedule), then every later one that stays
// within the end date. Paid and skipped both set lastConfirmedAt, and
// scheduleState only returns occurrences after it, so a paid-early occurrence is
// never counted. A dismissal only hides a card, so it is ignored here.
export function dueOccurrencesThisMonth(payment: RecurringPayment, today: Day): number {
  if (!payment.active) return 0;
  const end = monthEndDay(today);
  const state = scheduleState(payment, today);
  if (state.kind === 'finished') return 0;
  let count = 0;
  let date: Day | null = state.date;
  while (date !== null && date <= end) {
    count++;
    date = occurrenceAfter(payment, date);
  }
  return count;
}

// The cents a payment still takes out of the account by the end of this month.
export function dueCentsThisMonth(payment: RecurringPayment, today: Day): number {
  return dueOccurrencesThisMonth(payment, today) * payment.amountCents;
}

export type CurrencyProjection = { currency: Currency; cents: number };

export type Projection = {
  // Projected end-of-month balance per account id (its own currency).
  perAccount: Record<number, number>;
  // One line per currency that has an account, default currency first, then
  // alphabetical. A default-currency line is added when unassigned payments are
  // due but no account uses that currency.
  overall: CurrencyProjection[];
};

export function projectBalances(input: {
  accounts: Pick<Account, 'id' | 'currency'>[];
  // Current balance in cents per account id; a missing id means 0.
  balances: Record<number, number>;
  payments: RecurringPayment[];
  today: Day;
  defaultCurrency: Currency;
}): Projection {
  const { accounts, balances, payments, today, defaultCurrency } = input;

  const due: Record<number, number> = {};
  let unassigned = 0;
  for (const payment of payments) {
    const cents = dueCentsThisMonth(payment, today);
    if (cents === 0) continue;
    if (payment.accountId === null) unassigned += cents;
    else due[payment.accountId] = (due[payment.accountId] ?? 0) + cents;
  }

  const perAccount: Record<number, number> = {};
  const totals = new Map<Currency, number>();
  for (const account of accounts) {
    const cents = (balances[account.id] ?? 0) - (due[account.id] ?? 0);
    perAccount[account.id] = cents;
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + cents);
  }
  if (unassigned > 0 || totals.has(defaultCurrency)) {
    totals.set(defaultCurrency, (totals.get(defaultCurrency) ?? 0) - unassigned);
  }

  const overall = [...totals.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => {
      if (a.currency === defaultCurrency) return -1;
      if (b.currency === defaultCurrency) return 1;
      return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
    });
  return { perAccount, overall };
}
