import { getAccount } from './accounts';
import type { Account } from './accounts';
import { initDb } from './db';
import { parseAmountToCents } from './money';
import type { AmountParseError } from './money';

export const TRANSACTION_KINDS = ['expense', 'income'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const NOTE_MAX_LENGTH = 140;

export type Transaction = {
  id: number;
  accountId: number;
  kind: TransactionKind;
  amountCents: number;
  // ISO string in UTC.
  date: string;
  note: string | null;
  recurringId: number | null;
  createdAt: string;
};

export type TransactionInput = {
  accountId: number | null;
  kind: string;
  // What the user typed; converted to cents by parseAmountToCents.
  amount: string;
  // The chosen local day. Only its local year, month and day are used.
  date: Date;
  note: string;
};

export type TransactionValidationCode =
  | 'accountRequired'
  | 'accountNotFound'
  | 'invalidKind'
  | 'amountRequired'
  | 'amountInvalid'
  | 'amountNotPositive'
  | 'amountTooLarge'
  | 'amountDecimalsNotAllowed'
  | 'amountTooManyDecimals'
  | 'invalidDate'
  | 'dateInFuture'
  | 'noteTooLong';

export class TransactionValidationError extends Error {
  code: TransactionValidationCode;

  constructor(code: TransactionValidationCode) {
    super(code);
    this.name = 'TransactionValidationError';
    this.code = code;
  }
}

type TransactionRow = {
  id: number;
  account_id: number;
  kind: string;
  amount_cents: number;
  date: string;
  note: string | null;
  recurring_id: number | null;
  created_at: string;
};

const COLUMNS = 'id, account_id, kind, amount_cents, date, note, recurring_id, created_at';

const AMOUNT_CODES: Record<AmountParseError, TransactionValidationCode> = {
  empty: 'amountRequired',
  invalid: 'amountInvalid',
  notPositive: 'amountNotPositive',
  tooLarge: 'amountTooLarge',
  decimalsNotAllowed: 'amountDecimalsNotAllowed',
  tooManyDecimals: 'amountTooManyDecimals',
};

export function isTransactionKind(value: string): value is TransactionKind {
  return (TRANSACTION_KINDS as readonly string[]).includes(value);
}

// Whole local days, so two instants on the same local calendar day compare equal.
function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// The chosen LOCAL day plus the current LOCAL time of day, as an ISO UTC string.
export function composeTransactionDate(day: Date, now: Date): string {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  ).toISOString();
}

// The stored date after an edit. Same local day as the original: the original
// timestamp, untouched. Another day: that local day at the ORIGINAL local time
// of day, but never later than `now`: moving an evening transaction to today
// in the morning stores `now` instead of a time in the future.
//
// The unchanged-day rule wins over the cap: an original that is somehow already
// in the future is returned as it was, because an edit that does not change
// the day does not touch the timestamp.
//
// Daylight saving time: a time that does not exist on the new day (02:30 on a
// spring-forward day) is resolved forward by JavaScript, so it is stored as
// 03:30 that day. A time that happens twice (01:30 on a fall-back day) resolves
// to the first occurrence. The cap is applied after that resolution. All are
// pinned in compose-edited-date-dst.test.ts.
export function composeEditedDate(
  originalIso: string,
  day: Date,
  now: Date = new Date(),
): string {
  const original = new Date(originalIso);
  if (localDayNumber(original) === localDayNumber(day)) return originalIso;
  const composed = composeTransactionDate(day, original);
  return composed > now.toISOString() ? now.toISOString() : composed;
}

// Returns the first problem found, or null when the input is valid. The
// currency is the chosen account's (null when there is no such account). The
// form and the service both call this, so they cannot disagree.
export function validateTransactionInput(
  input: TransactionInput,
  currency: string | null,
  now: Date = new Date(),
): TransactionValidationCode | null {
  if (input.accountId === null) return 'accountRequired';
  if (currency === null) return 'accountNotFound';
  if (!isTransactionKind(input.kind)) return 'invalidKind';
  const amount = parseAmountToCents(input.amount, currency);
  if (!amount.ok) return AMOUNT_CODES[amount.code];
  if (Number.isNaN(input.date.getTime())) return 'invalidDate';
  if (localDayNumber(input.date) > localDayNumber(now)) return 'dateInFuture';
  if (input.note.trim().length > NOTE_MAX_LENGTH) return 'noteTooLong';
  return null;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind as TransactionKind,
    amountCents: row.amount_cents,
    date: row.date,
    note: row.note,
    recurringId: row.recurring_id,
    createdAt: row.created_at,
  };
}

// Newest first: date descending, then id descending. Returns a new array.
export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.id - a.id;
  });
}

// The most recently RECORDED transactions (created_at desc, then id desc),
// regardless of their date, so a backdated entry still shows up. `include`
// filters first (for example to skip rows of deleted accounts).
export function latestRecorded(
  transactions: Transaction[],
  limit: number,
  include: (item: Transaction) => boolean = () => true,
): Transaction[] {
  return transactions
    .filter(include)
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return b.id - a.id;
    })
    .slice(0, limit);
}

// Balance per account = the account's anchor + income - expense of its
// transactions dated STRICTLY after the anchor. Without an anchor every
// transaction counts. Dates are compared as instants (parsed), not as text.
// Every account is in the result; transactions of unknown accounts (orphans)
// are ignored.
//
// Known edge: a transaction's date is the chosen day plus the local time of
// recording (composeTransactionDate). On a fall-back day the local hour repeats
// and JavaScript resolves it to the FIRST occurrence, so one recorded in the
// second 01:xx can be dated an hour earlier than an anchor set in that same
// second 01:xx, and then does not count. Pinned in balance-dst.test.ts.
export function computeBalances(
  accounts: Pick<Account, 'id' | 'balanceAnchorCents' | 'balanceAnchorAt'>[],
  transactions: Pick<Transaction, 'accountId' | 'kind' | 'amountCents' | 'date'>[],
): Record<number, number> {
  const balances: Record<number, number> = {};
  const anchors: Record<number, number | null> = {};
  for (const account of accounts) {
    balances[account.id] = account.balanceAnchorCents;
    anchors[account.id] =
      account.balanceAnchorAt === null ? null : new Date(account.balanceAnchorAt).getTime();
  }
  for (const item of transactions) {
    if (!(item.accountId in balances)) continue;
    const anchor = anchors[item.accountId];
    if (anchor !== null && !(new Date(item.date).getTime() > anchor)) continue;
    balances[item.accountId] += item.kind === 'income' ? item.amountCents : -item.amountCents;
  }
  return balances;
}

export async function listTransactions(): Promise<Transaction[]> {
  const db = await initDb();
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date DESC, id DESC`,
  );
  return rows.map(toTransaction);
}

export async function getTransaction(id: number): Promise<Transaction | null> {
  const db = await initDb();
  const row = await db.getFirstAsync<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE id = ?`,
    id,
  );
  return row ? toTransaction(row) : null;
}

// Changes account, kind, amount, date and note. created_at and recurring_id
// never change. Throws when the transaction does not exist.
export async function updateTransaction(
  id: number,
  input: TransactionInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const existing = await getTransaction(id);
  if (!existing) throw new Error(`Transaction ${id} not found`);
  const account = input.accountId === null ? null : await getAccount(input.accountId);
  const code = validateTransactionInput(input, account ? account.currency : null, now);
  if (code || !account) throw new TransactionValidationError(code ?? 'accountNotFound');

  const amount = parseAmountToCents(input.amount, account.currency);
  if (!amount.ok) throw new TransactionValidationError(AMOUNT_CODES[amount.code]);

  const kind = input.kind as TransactionKind;
  const date = composeEditedDate(existing.date, input.date, now);
  const trimmed = input.note.trim();
  const note = trimmed.length > 0 ? trimmed : null;

  const db = await initDb();
  const result = await db.runAsync(
    'UPDATE transactions SET account_id = ?, kind = ?, amount_cents = ?, date = ?, note = ? WHERE id = ?',
    account.id,
    kind,
    amount.cents,
    date,
    note,
    id,
  );
  if (result.changes === 0) throw new Error(`Transaction ${id} not found`);
  return { ...existing, accountId: account.id, kind, amountCents: amount.cents, date, note };
}

export async function removeTransaction(id: number): Promise<void> {
  const db = await initDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function createTransaction(
  input: TransactionInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const account = input.accountId === null ? null : await getAccount(input.accountId);
  const code = validateTransactionInput(input, account ? account.currency : null, now);
  if (code || !account) throw new TransactionValidationError(code ?? 'accountNotFound');

  const amount = parseAmountToCents(input.amount, account.currency);
  if (!amount.ok) throw new TransactionValidationError(AMOUNT_CODES[amount.code]);

  const kind = input.kind as TransactionKind;
  const date = composeTransactionDate(input.date, now);
  const trimmed = input.note.trim();
  const note = trimmed.length > 0 ? trimmed : null;
  const createdAt = now.toISOString();

  const db = await initDb();
  const result = await db.runAsync(
    'INSERT INTO transactions (account_id, kind, amount_cents, date, note, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    account.id,
    kind,
    amount.cents,
    date,
    note,
    createdAt,
  );
  return {
    id: result.lastInsertRowId,
    accountId: account.id,
    kind,
    amountCents: amount.cents,
    date,
    note,
    recurringId: null,
    createdAt,
  };
}
