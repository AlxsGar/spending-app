import { getAccount } from './accounts';
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

// Balance per account = income - expense. Accounts without transactions are
// absent from the result (their balance is 0).
export function computeBalances(
  transactions: Pick<Transaction, 'accountId' | 'kind' | 'amountCents'>[],
): Record<number, number> {
  const balances: Record<number, number> = {};
  for (const item of transactions) {
    const signed = item.kind === 'income' ? item.amountCents : -item.amountCents;
    balances[item.accountId] = (balances[item.accountId] ?? 0) + signed;
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
