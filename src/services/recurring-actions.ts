import { getAccount } from './accounts';
import { initDb } from './db';
import { composeTransactionDate } from './transactions';
import type { Transaction } from './transactions';
import { canHandleOccurrence, getRecurring, previousOccurrence, toDay } from './recurring';
import type { Day, RecurringPayment } from './recurring';
import { serialized } from './write-queue';

// Writes that touch both a recurring payment and its transactions. Each one is a
// single database transaction, so a failure leaves neither half behind.
//
// Concurrency: these writes run one at a time through the shared write queue
// (see write-queue.ts for why), and take their decisions with conditional
// UPDATEs inside the transaction, so the check and the write cannot be split.

// The occurrence was already paid or skipped (a double tap, or a stale card).
// Harmless: nothing was written.
export class AlreadyHandledError extends Error {
  constructor(paymentId: number, occurrence: Day) {
    super(`Occurrence ${occurrence} of recurring payment ${paymentId} was already handled`);
    this.name = 'AlreadyHandledError';
  }
}

// Pay and skip only act on a payment that is active and unfinished, and on the
// occurrence it is waiting on (see canHandleOccurrence), judged on the payment as
// it is now, inside the queued write. Otherwise the screen or card that asked is
// stale (handled elsewhere, schedule edited, payment switched off) or the call
// is invalid; both throw AlreadyHandledError, so the store answers 'already':
// nothing is written, the UI closes without a success card and the payment is
// refreshed. The conditional UPDATE below stays as the last guard.
function assertHandleable(payment: RecurringPayment, occurrence: Day, now: Date): void {
  if (!canHandleOccurrence(payment, occurrence, toDay(now))) {
    throw new AlreadyHandledError(payment.id, occurrence);
  }
}

export type PayOptions = {
  paymentId: number;
  // The occurrence being paid (a calendar day).
  occurrence: Day;
  // The account the expense goes on: the payment's own, or the one chosen when
  // the payment has none.
  accountId: number;
  // Pay now: the amount entered, in integer cents. Default: the payment's
  // stored amount. The payment itself never changes.
  amountCents?: number;
  now?: Date;
};

export type PayResult = {
  transaction: Transaction;
  payment: RecurringPayment;
};

// Quick Paid and Pay now: creates one expense linked to the payment and sets
// last_confirmed_at to the occurrence. The expense has the entered amount in
// cents (Pay now) or the payment's stored amount (quick Paid), today's date (same timestamp rule as a new transaction: the
// local day plus the current time of day), the payment's note as it is (may be
// empty), recurring_id and recurring_occurrence. Paying from an account in
// another currency relabels: the cents are not converted. Paying an occurrence
// that is not due yet is allowed; one that was already confirmed throws
// AlreadyHandledError and writes nothing, even when two calls overlap: the
// confirmation is a conditional UPDATE made first inside the transaction, and
// the expense is only inserted when it changed a row.
export function payOccurrence(options: PayOptions): Promise<PayResult> {
  return serialized(() => pay(options));
}

async function pay({
  paymentId,
  occurrence,
  accountId,
  amountCents,
  now = new Date(),
}: PayOptions): Promise<PayResult> {
  const payment = await getRecurring(paymentId);
  if (!payment) throw new Error(`Recurring payment ${paymentId} not found`);
  const cents = amountCents ?? payment.amountCents;
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error(`Invalid amount ${cents} for recurring payment ${paymentId}`);
  }
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  assertHandleable(payment, occurrence, now);

  // Today's local day at the current time of day: exactly `now`.
  const date = composeTransactionDate(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    now,
  );
  const createdAt = now.toISOString();
  const db = await initDb();
  let id = 0;
  await db.withTransactionAsync(async () => {
    const update = await db.runAsync(
      'UPDATE recurring_payments SET last_confirmed_at = ? WHERE id = ? AND (last_confirmed_at IS NULL OR last_confirmed_at < ?)',
      occurrence,
      paymentId,
      occurrence,
    );
    if (update.changes === 0) throw new AlreadyHandledError(paymentId, occurrence);
    const result = await db.runAsync(
      "INSERT INTO transactions (account_id, kind, amount_cents, date, note, recurring_id, recurring_occurrence, created_at) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?)",
      account.id,
      cents,
      date,
      payment.note,
      payment.id,
      occurrence,
      createdAt,
    );
    id = result.lastInsertRowId;
  });

  return {
    transaction: {
      id,
      accountId: account.id,
      kind: 'expense',
      amountCents: cents,
      date,
      note: payment.note,
      recurringId: payment.id,
      recurringOccurrence: occurrence,
      createdAt,
    },
    payment: { ...payment, lastConfirmedAt: occurrence },
  };
}

// Skip: marks the occurrence handled (last_confirmed_at = occurrence) without
// creating a transaction. Like paying, it is a conditional UPDATE through the
// write queue: an occurrence that was already paid or skipped (a double tap, a
// stale row) throws AlreadyHandledError and writes nothing. Skipping one that is
// not due yet is allowed. Cannot be undone.
export function skipOccurrence(
  paymentId: number,
  occurrence: Day,
  now: Date = new Date(),
): Promise<RecurringPayment> {
  return serialized(() => skip(paymentId, occurrence, now));
}

async function skip(paymentId: number, occurrence: Day, now: Date): Promise<RecurringPayment> {
  const payment = await getRecurring(paymentId);
  if (!payment) throw new Error(`Recurring payment ${paymentId} not found`);
  assertHandleable(payment, occurrence, now);
  const db = await initDb();
  const update = await db.runAsync(
    'UPDATE recurring_payments SET last_confirmed_at = ? WHERE id = ? AND (last_confirmed_at IS NULL OR last_confirmed_at < ?)',
    occurrence,
    paymentId,
    occurrence,
  );
  if (update.changes === 0) throw new AlreadyHandledError(paymentId, occurrence);
  return { ...payment, lastConfirmedAt: occurrence };
}

export type RemoveResult = {
  // Set when the delete undid a payment: the payment and its new
  // last_confirmed_at (null: back to never confirmed).
  undone: { paymentId: number; lastConfirmedAt: Day | null } | null;
};

type LinkRow = { recurring_id: number | null; recurring_occurrence: string | null };

// Deletes a transaction. When it paid the occurrence the payment last
// confirmed, last_confirmed_at goes back to the occurrence before it (null for
// the first), in the same database transaction. The transaction is read inside
// that database transaction, and the step back is a conditional UPDATE, so the
// decision and the writes see the same state. A transaction that paid an older
// occurrence, or none, changes nothing else.
export function removeTransactionUndoing(id: number): Promise<RemoveResult> {
  return serialized(() => removeAndUndo(id));
}

async function removeAndUndo(id: number): Promise<RemoveResult> {
  const db = await initDb();
  const result: RemoveResult = { undone: null };
  await db.withTransactionAsync(async () => {
    const link = await db.getFirstAsync<LinkRow>(
      'SELECT recurring_id, recurring_occurrence FROM transactions WHERE id = ?',
      id,
    );
    await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
    if (!link || link.recurring_id === null || link.recurring_occurrence === null) return;
    const payment = await getRecurring(link.recurring_id);
    if (!payment || payment.lastConfirmedAt !== link.recurring_occurrence) return;
    const previous = previousOccurrence(payment, link.recurring_occurrence);
    const update = await db.runAsync(
      'UPDATE recurring_payments SET last_confirmed_at = ? WHERE id = ? AND last_confirmed_at = ?',
      previous,
      payment.id,
      link.recurring_occurrence,
    );
    if (update.changes > 0) result.undone = { paymentId: payment.id, lastConfirmedAt: previous };
  });
  return result;
}
