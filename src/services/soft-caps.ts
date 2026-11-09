import type * as SQLite from 'expo-sqlite';

import type { Account, Currency } from './accounts';
import { initDb } from './db';
import { parseAmountToCents } from './money';
import type { AmountParseError } from './money';
import type { Transaction } from './transactions';
import { serialized } from './write-queue';

export const CAP_PERIODS = ['day', 'week', 'month'] as const;
export type CapPeriod = (typeof CAP_PERIODS)[number];
export const DEFAULT_CAP_PERIOD: CapPeriod = 'month';

export type SoftCap = {
  id: number;
  // Null is the global cap.
  accountId: number | null;
  period: CapPeriod;
  amountCents: number;
};

// What a form sends: the typed amount (empty means no cap) and the period.
export type CapInput = {
  amount: string;
  period: CapPeriod;
};

export type CapValidationCode =
  | 'capInvalid'
  | 'capNotPositive'
  | 'capTooLarge'
  | 'capDecimalsNotAllowed'
  | 'capTooManyDecimals'
  | 'capInvalidPeriod';

export class CapValidationError extends Error {
  code: CapValidationCode;

  constructor(code: CapValidationCode) {
    super(code);
    this.name = 'CapValidationError';
    this.code = code;
  }
}

const AMOUNT_CODES: Record<AmountParseError, CapValidationCode> = {
  // An empty amount is "no cap", handled before parsing; mapped for completeness.
  empty: 'capInvalid',
  invalid: 'capInvalid',
  notPositive: 'capNotPositive',
  tooLarge: 'capTooLarge',
  decimalsNotAllowed: 'capDecimalsNotAllowed',
  tooManyDecimals: 'capTooManyDecimals',
};

export function isCapPeriod(value: string): value is CapPeriod {
  return (CAP_PERIODS as readonly string[]).includes(value);
}

// The cap to store: positive cents and a period, or null for "no cap" (an empty
// amount). Throws CapValidationError for anything else. The currency decides
// whether decimals are allowed.
export function parseCapInput(
  input: CapInput,
  currency: string,
): { cents: number; period: CapPeriod } | null {
  if (!isCapPeriod(input.period)) throw new CapValidationError('capInvalidPeriod');
  if (input.amount.trim().length === 0) return null;
  const parsed = parseAmountToCents(input.amount, currency);
  if (!parsed.ok) throw new CapValidationError(AMOUNT_CODES[parsed.code]);
  return { cents: parsed.cents, period: input.period };
}

// The first problem with a typed cap, or null.
export function validateCapInput(input: CapInput, currency: string): CapValidationCode | null {
  try {
    parseCapInput(input, currency);
    return null;
  } catch (error) {
    if (error instanceof CapValidationError) return error.code;
    throw error;
  }
}

type CapRow = {
  id: number;
  account_id: number | null;
  period: string;
  amount_cents: number;
};

export async function listCaps(): Promise<SoftCap[]> {
  const db = await initDb();
  const rows = await db.getAllAsync<CapRow>(
    'SELECT id, account_id, period, amount_cents FROM soft_caps ORDER BY id',
  );
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    period: row.period as CapPeriod,
    amountCents: row.amount_cents,
  }));
}

// Sets (a cap) or removes (null) the cap of one scope: an account id, or null
// for the global cap. Runs on the caller's connection so it can share a
// transaction with an account write. The unique index on the scope guarantees
// one row per scope; update first, insert when there was nothing to update.
export async function writeCap(
  db: SQLite.SQLiteDatabase,
  accountId: number | null,
  cap: { cents: number; period: CapPeriod } | null,
): Promise<void> {
  const scope = accountId ?? 0;
  if (cap === null) {
    await db.runAsync('DELETE FROM soft_caps WHERE COALESCE(account_id, 0) = ?', scope);
    return;
  }
  const result = await db.runAsync(
    'UPDATE soft_caps SET period = ?, amount_cents = ? WHERE COALESCE(account_id, 0) = ?',
    cap.period,
    cap.cents,
    scope,
  );
  if (result.changes === 0) {
    await db.runAsync(
      'INSERT INTO soft_caps (account_id, period, amount_cents) VALUES (?, ?, ?)',
      accountId,
      cap.period,
      cap.cents,
    );
  }
}

// Sets, changes or clears the global cap (Settings). The amount is in the
// default currency. Queued with the other writes (see write-queue.ts) so it
// cannot interleave with an account save.
export function saveGlobalCap(input: CapInput, currency: string): Promise<void> {
  const cap = parseCapInput(input, currency);
  return serialized(async () => {
    const db = await initDb();
    await writeCap(db, null, cap);
  });
}

// ---- Periods ---------------------------------------------------------------

// The local period that contains `reference`: [start, end), both local
// midnights. Built from local calendar parts, so a daylight saving change inside
// the period just makes it 23 or 25 hours long. Weeks run Monday to Sunday.
export function periodBounds(period: CapPeriod, reference: Date): { start: Date; end: Date } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const day = reference.getDate();
  if (period === 'day') {
    return { start: new Date(year, month, day), end: new Date(year, month, day + 1) };
  }
  if (period === 'week') {
    const sinceMonday = (reference.getDay() + 6) % 7;
    return {
      start: new Date(year, month, day - sinceMonday),
      end: new Date(year, month, day - sinceMonday + 7),
    };
  }
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

// Total of the expenses (income never offsets) dated inside the period of
// `reference`, for the accounts in `accountIds`.
export function spentInPeriod(
  transactions: readonly Transaction[],
  accountIds: ReadonlySet<number>,
  period: CapPeriod,
  reference: Date,
): number {
  const { start, end } = periodBounds(period, reference);
  const from = start.getTime();
  const to = end.getTime();
  let total = 0;
  for (const item of transactions) {
    if (item.kind !== 'expense' || !accountIds.has(item.accountId)) continue;
    const time = new Date(item.date).getTime();
    if (time >= from && time < to) total += item.amountCents;
  }
  return total;
}

export type ExceededCap = {
  // Null for the global cap.
  accountId: number | null;
  period: CapPeriod;
  capCents: number;
  spentCents: number;
  currency: Currency;
};

// The cap Home's compact banner leads with: the global cap when it is exceeded,
// else the one furthest over its amount by percentage (spent / cap). Equal
// percentages: the earlier in the list wins, which is the lower position in the
// account order, so the choice is the same on every render. Null for none.
export function headlineCap(list: readonly ExceededCap[]): ExceededCap | null {
  const global = list.find((item) => item.accountId === null);
  if (global) return global;
  let best: ExceededCap | null = null;
  for (const item of list) {
    if (best === null || item.spentCents / item.capCents > best.spentCents / best.capCents) {
      best = item;
    }
  }
  return best;
}

// One account's cap and how far along it is this period (the account detail
// line), or null when it has no cap. `exceeded` is strictly above the cap.
export function accountCapProgress(options: {
  caps: readonly SoftCap[];
  accountId: number;
  transactions: readonly Transaction[];
  now: Date;
}): { period: CapPeriod; capCents: number; spentCents: number; exceeded: boolean } | null {
  const cap = options.caps.find((item) => item.accountId === options.accountId);
  if (!cap) return null;
  const spentCents = spentInPeriod(
    options.transactions,
    new Set([options.accountId]),
    cap.period,
    options.now,
  );
  return {
    period: cap.period,
    capCents: cap.amountCents,
    spentCents,
    exceeded: spentCents > cap.amountCents,
  };
}

// The caps whose current-period total is strictly above their amount: the
// global cap first, then the account caps in account order. The global cap
// counts the accounts that opted in and use the default currency; an account
// cap counts that account only. A cap of an account that is gone is ignored.
export function exceededCaps(options: {
  caps: readonly SoftCap[];
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  defaultCurrency: Currency;
  // Any moment of the current local day.
  now: Date;
}): ExceededCap[] {
  const { caps, accounts, transactions, defaultCurrency, now } = options;
  const result: ExceededCap[] = [];

  const global = caps.find((cap) => cap.accountId === null);
  if (global) {
    const ids = new Set(
      accounts
        .filter((account) => account.inGlobalCap && account.currency === defaultCurrency)
        .map((account) => account.id),
    );
    const spent = spentInPeriod(transactions, ids, global.period, now);
    if (spent > global.amountCents) {
      result.push({
        accountId: null,
        period: global.period,
        capCents: global.amountCents,
        spentCents: spent,
        currency: defaultCurrency,
      });
    }
  }

  for (const account of accounts) {
    const cap = caps.find((item) => item.accountId === account.id);
    if (!cap) continue;
    const spent = spentInPeriod(transactions, new Set([account.id]), cap.period, now);
    if (spent > cap.amountCents) {
      result.push({
        accountId: account.id,
        period: cap.period,
        capCents: cap.amountCents,
        spentCents: spent,
        currency: account.currency,
      });
    }
  }
  return result;
}
