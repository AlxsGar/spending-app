import { getAccount, getDefaultCurrency, NAME_MAX_LENGTH } from './accounts';
import { initDb } from './db';
import { localDayKey } from './day-groups';
import { parseAmountToCents } from './money';
import type { AmountParseError } from './money';
import { formatReminders, parseReminders } from './reminder-offsets';
import { NOTE_MAX_LENGTH } from './transactions';
import { serialized } from './write-queue';

export { NAME_MAX_LENGTH, NOTE_MAX_LENGTH };

export const UNITS = ['day', 'week', 'month', 'year'] as const;
export type Unit = (typeof UNITS)[number];
export const INTERVAL_MAX = 365;

// Schedule dates are calendar days ("YYYY-MM-DD"), not timestamps. They compare
// correctly as text.
export type Day = string;

export type RecurringPayment = {
  id: number;
  // null: not assigned to an account (it uses the default currency).
  accountId: number | null;
  name: string;
  amountCents: number;
  note: string | null;
  // "Every [interval] [unit]".
  interval: number;
  unit: Unit;
  // The first occurrence, and the anchor of every later one.
  startDate: Day;
  // No occurrence is after it; null means indefinite.
  endDate: Day | null;
  // Comma-separated subset of 3,2,1,0; empty means no reminders.
  notifyDaysBefore: string;
  active: boolean;
  // The last occurrence paid or skipped; null when never.
  lastConfirmedAt: Day | null;
  // The occurrence whose card was dismissed; null when none. It only hides that
  // occurrence's card; the next occurrence shows again.
  dismissedAt: Day | null;
  // ISO UTC.
  createdAt: string;
};

export type RecurringInput = {
  accountId: number | null;
  name: string;
  // What the user typed; converted to cents by parseAmountToCents.
  amount: string;
  // What the user typed: a whole number from 1 to 365.
  interval: string;
  unit: string;
  startDate: Day;
  endDate: Day | null;
  note: string;
  active: boolean;
  // The reminder choices ("3,1,0", see reminder-offsets.ts). Create: left out
  // means none. Update: left out keeps what is stored.
  notifyDaysBefore?: string;
};

export type RecurringValidationCode =
  | 'accountNotFound'
  | 'nameRequired'
  | 'nameTooLong'
  | 'amountRequired'
  | 'amountInvalid'
  | 'amountNotPositive'
  | 'amountTooLarge'
  | 'amountDecimalsNotAllowed'
  | 'amountTooManyDecimals'
  | 'intervalRequired'
  | 'intervalInvalid'
  | 'intervalOutOfRange'
  | 'invalidUnit'
  | 'invalidStartDate'
  | 'startDateInPast'
  | 'startDateNotAfterHandled'
  | 'invalidEndDate'
  | 'endBeforeStart'
  | 'noteTooLong';

export class RecurringValidationError extends Error {
  code: RecurringValidationCode;

  constructor(code: RecurringValidationCode) {
    super(code);
    this.name = 'RecurringValidationError';
    this.code = code;
  }
}

type RecurringRow = {
  id: number;
  account_id: number | null;
  name: string;
  amount_cents: number;
  note: string | null;
  interval: number;
  unit: string;
  start_date: string;
  end_date: string | null;
  notify_days_before: string;
  active: number;
  last_confirmed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

const COLUMNS =
  'id, account_id, name, amount_cents, note, interval, unit, start_date, end_date, notify_days_before, active, last_confirmed_at, dismissed_at, created_at';

const AMOUNT_CODES: Record<AmountParseError, RecurringValidationCode> = {
  empty: 'amountRequired',
  invalid: 'amountInvalid',
  notPositive: 'amountNotPositive',
  tooLarge: 'amountTooLarge',
  decimalsNotAllowed: 'amountDecimalsNotAllowed',
  tooManyDecimals: 'amountTooManyDecimals',
};

// ---- Calendar days -------------------------------------------------------
// All arithmetic is on year/month/day numbers and whole day counts from
// Date.UTC (which has no daylight saving), never on local timestamps, so a
// DST change cannot move an occurrence.

const MS_PER_DAY = 86_400_000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function formatDay(year: number, month: number, day: number): Day {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parseDay(value: Day): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayNumber(value: Day): number {
  const { year, month, day } = parseDay(value);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromDayNumber(count: number): Day {
  const date = new Date(count * MS_PER_DAY);
  return formatDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// True for a real calendar day written as YYYY-MM-DD.
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDay(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

// The device's local calendar day of a Date.
export function toDay(date: Date): Day {
  return localDayKey(date);
}

// Local midnight of a calendar day.
export function dayToDate(value: Day): Date {
  const { year, month, day } = parseDay(value);
  return new Date(year, month - 1, day);
}

// ---- Occurrences ---------------------------------------------------------

type Schedule = Pick<RecurringPayment, 'interval' | 'unit' | 'startDate' | 'endDate'>;

// The k-th occurrence (k = 0 is the start date), or null when it falls after
// the end date. Always computed from the start date, so a clamped month does
// not drift (Jan 31, Feb 28, Mar 31).
export function occurrenceAt(schedule: Schedule, k: number): Day | null {
  const { interval, unit, startDate, endDate } = schedule;
  let result: Day;
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? interval : interval * 7;
    result = fromDayNumber(dayNumber(startDate) + k * step);
  } else {
    const { year, month, day } = parseDay(startDate);
    if (unit === 'month') {
      const months = year * 12 + (month - 1) + k * interval;
      const targetYear = Math.floor(months / 12);
      const targetMonth = (months % 12) + 1;
      result = formatDay(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
    } else {
      const targetYear = year + k * interval;
      result = formatDay(targetYear, month, Math.min(day, daysInMonth(targetYear, month)));
    }
  }
  return endDate !== null && result > endDate ? null : result;
}

// Same as occurrenceAt but ignoring the end date.
function rawOccurrence(schedule: Schedule, k: number): Day {
  return occurrenceAt({ ...schedule, endDate: null }, k)!;
}

// The index of the latest occurrence on or before `bound` (ignoring the end
// date), or -1 when the start date is after it.
function latestIndexOnOrBefore(schedule: Schedule, bound: Day): number {
  if (schedule.startDate > bound) return -1;
  const { interval, unit, startDate } = schedule;
  let k: number;
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? interval : interval * 7;
    k = Math.floor((dayNumber(bound) - dayNumber(startDate)) / step);
  } else {
    const start = parseDay(startDate);
    const end = parseDay(bound);
    const span =
      unit === 'month'
        ? (end.year - start.year) * 12 + (end.month - start.month)
        : end.year - start.year;
    k = Math.floor(span / interval);
  }
  // Month-end clamping can make the estimate off by one either way.
  while (k > 0 && rawOccurrence(schedule, k) > bound) k--;
  while (rawOccurrence(schedule, k + 1) <= bound) k++;
  return k;
}

export type ScheduleState =
  | { kind: 'current'; date: Day }
  | { kind: 'upcoming'; date: Day }
  | { kind: 'finished' };

// What the payment is waiting on, given today's local calendar day:
// - current: the latest occurrence on or before today (and not after the end
//   date) that is after the last confirmed one. Only one is ever due or overdue;
//   earlier missed ones are dropped. The last occurrence before the end date
//   stays current until paid or skipped.
// - upcoming: otherwise, the first occurrence after today (and after the last
//   confirmed one).
// - finished: no occurrence is left.
export function scheduleState(
  payment: Schedule & { lastConfirmedAt: Day | null },
  today: Day,
): ScheduleState {
  const { lastConfirmedAt, endDate } = payment;
  const bound = endDate !== null && endDate < today ? endDate : today;
  const k0 = latestIndexOnOrBefore(payment, bound);
  if (k0 >= 0) {
    const date = rawOccurrence(payment, k0);
    if (lastConfirmedAt === null || date > lastConfirmedAt) return { kind: 'current', date };
  }
  let k = k0 + 1;
  for (;;) {
    const date = occurrenceAt(payment, k);
    if (date === null) return { kind: 'finished' };
    if (lastConfirmedAt === null || date > lastConfirmedAt) return { kind: 'upcoming', date };
    k++;
  }
}

// The day a row shows as "next": the current or upcoming occurrence. Null for
// an inactive or finished payment.
export function nextDueDay(
  payment: Schedule & { active: boolean; lastConfirmedAt: Day | null },
  now: Date = new Date(),
): Day | null {
  if (!payment.active) return null;
  const state = scheduleState(payment, toDay(now));
  return state.kind === 'finished' ? null : state.date;
}

// True when an end date is set and falls before the second occurrence: the
// payment can only happen once.
export function isOnceOnly(
  schedule: Pick<Schedule, 'interval' | 'unit' | 'startDate'> & { endDate: Day | null },
): boolean {
  if (schedule.endDate === null) return false;
  return occurrenceAt(schedule, 1) === null;
}

// Active, unfinished payments first by next due day then id; the rest (inactive
// or finished) last by name.
export function sortRecurring(
  payments: RecurringPayment[],
  now: Date = new Date(),
): RecurringPayment[] {
  const due = new Map(payments.map((item) => [item.id, nextDueDay(item, now)]));
  return [...payments].sort((a, b) => {
    const left = due.get(a.id) ?? null;
    const right = due.get(b.id) ?? null;
    if ((left === null) !== (right === null)) return left === null ? 1 : -1;
    if (left !== null && right !== null) {
      if (left !== right) return left < right ? -1 : 1;
      return a.id - b.id;
    }
    const byName = a.name.localeCompare(b.name);
    return byName !== 0 ? byName : a.id - b.id;
  });
}

// ---- Card stack ----------------------------------------------------------

// A card shows occurrences from today through today + this many days, both
// ends included (8 calendar days). Overdue ones are before today and always
// shown.
export const STACK_WINDOW_DAYS = 7;

// The calendar day `count` days after `value` (negative: before). Whole days,
// so a month or year boundary or a DST change cannot shift it.
export function addDays(value: Day, count: number): Day {
  return fromDayNumber(dayNumber(value) + count);
}

export type StackCard = {
  payment: RecurringPayment;
  // The occurrence the card is for (the one Dismiss and Paid act on).
  occurrence: Day;
  // Before today and unpaid.
  overdue: boolean;
};

// The card a payment would show today, or null: inactive and finished payments
// have none, nor do ones whose occurrence is after today + 7 days or was
// dismissed. Only the current occurrence can be overdue (earlier missed ones are
// dropped, see scheduleState).
export function cardFor(payment: RecurringPayment, today: Day): StackCard | null {
  if (!payment.active) return null;
  const state = scheduleState(payment, today);
  if (state.kind === 'finished') return null;
  let occurrence: Day | null = state.date;
  // A dismissed occurrence hides only itself: the next one is judged like any
  // other (it shows once it is within the window, and is never overdue).
  if (payment.dismissedAt === occurrence) {
    occurrence = occurrenceAt(payment, latestIndexOnOrBefore(payment, occurrence) + 1);
  }
  if (occurrence === null || occurrence > addDays(today, STACK_WINDOW_DAYS)) return null;
  return { payment, occurrence, overdue: occurrence < today };
}

// The cards in stack order: overdue first, then the rest, each by occurrence
// day and then id.
export function stackCards(payments: RecurringPayment[], today: Day): StackCard[] {
  const cards: StackCard[] = [];
  for (const payment of payments) {
    const card = cardFor(payment, today);
    if (card) cards.push(card);
  }
  return cards.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.occurrence !== b.occurrence) return a.occurrence < b.occurrence ? -1 : 1;
    return a.payment.id - b.payment.id;
  });
}

// The latest occurrence strictly before `occurrence`, or null when it is the
// first one (or earlier). Used to undo a payment.
export function previousOccurrence(schedule: Schedule, occurrence: Day): Day | null {
  const k = latestIndexOnOrBefore(schedule, addDays(occurrence, -1));
  return k < 0 ? null : rawOccurrence(schedule, k);
}

// The occurrence Pay now and Skip act on: the current one (due or overdue,
// unpaid), else the next one, so paying or skipping early is allowed. A
// dismissal is ignored (it only hides a card). Null for an inactive or finished
// payment.
export function actionOccurrence(payment: RecurringPayment, today: Day): Day | null {
  if (!payment.active) return null;
  const state = scheduleState(payment, today);
  return state.kind === 'finished' ? null : state.date;
}

// True when paying or skipping `occurrence` is a valid call today: the payment
// is active and unfinished, and the occurrence is its actionOccurrence, or (the
// only other case) the occurrence right after it while the action occurrence's
// card was dismissed and that next one is within the deck's 7-day window,
// because the deck then shows it (the same rule as cardFor).
// Anything else (already handled, beyond the next one, not an occurrence of the
// schedule, inactive, finished) is not.
export function canHandleOccurrence(payment: RecurringPayment, occurrence: Day, today: Day): boolean {
  const target = actionOccurrence(payment, today);
  if (target === null) return false;
  if (occurrence === target) return true;
  if (payment.dismissedAt !== target) return false;
  // The successor card only shows within the deck window (see cardFor).
  return (
    occurrence === occurrenceAt(payment, latestIndexOnOrBefore(payment, target) + 1) &&
    occurrence <= addDays(today, STACK_WINDOW_DAYS)
  );
}

// The first occurrence strictly after `occurrence` (an occurrence of the
// schedule), or null when the end date leaves none. Reminders use it for an
// overdue payment: the overdue one stays quiet, the next one is scheduled.
export function occurrenceAfter(schedule: Schedule, occurrence: Day): Day | null {
  return occurrenceAt(schedule, latestIndexOnOrBefore(schedule, occurrence) + 1);
}

// The earliest start date the edit form offers: today, or for a payment that
// was paid or skipped, the day after that occurrence if that is later.
export function startDateFloor(lastConfirmedAt: Day | null, today: Day): Day {
  if (lastConfirmedAt === null) return today;
  const next = addDays(lastConfirmedAt, 1);
  return next > today ? next : today;
}

// The start date to store when saving an edit.
// - Never paid or skipped: what was entered.
// - Paid or skipped, start date left as shown (the last handled occurrence): the
//   schedule is kept as it is; but when the interval or unit changed, the new
//   schedule is counted from that occurrence, so it becomes the anchor (start
//   date) and stays handled, and the next occurrence is one new step after it.
// - Paid or skipped, a different start date: that date (it is after the handled
//   one, see validateRecurringInput). last_confirmed_at is not touched: it is
//   before the new start, so the new start is the first unhandled occurrence.
export function effectiveStartDate(
  existing: Pick<RecurringPayment, 'interval' | 'unit' | 'startDate' | 'lastConfirmedAt'>,
  input: { interval: number; unit: Unit; startDate: Day },
): Day {
  const { lastConfirmedAt } = existing;
  if (lastConfirmedAt === null || input.startDate !== lastConfirmedAt) return input.startDate;
  const changed = input.interval !== existing.interval || input.unit !== existing.unit;
  return changed ? lastConfirmedAt : existing.startDate;
}

// ---- Validation ----------------------------------------------------------

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value);
}

// The typed interval as a number, or the reason it is not one.
export function parseInterval(
  value: string,
): { ok: true; interval: number } | { ok: false; code: RecurringValidationCode } {
  const text = value.trim();
  if (text.length === 0) return { ok: false, code: 'intervalRequired' };
  if (!/^\d+$/.test(text)) return { ok: false, code: 'intervalInvalid' };
  const interval = Number(text);
  if (interval < 1 || interval > INTERVAL_MAX) return { ok: false, code: 'intervalOutOfRange' };
  return { ok: true, interval };
}

// Returns the first problem found, or null when the input is valid.
// - currency: the chosen account's currency, or the default currency when no
//   account is chosen. It is null only when a chosen account does not exist.
// - today: the local calendar day; a start date before it is rejected.
// - originalStartDate: when editing, the stored start date. Left unchanged it
//   stays valid even if it is in the past; a changed one must be today or later.
// - lastConfirmedAt: when editing a payment that was paid or skipped, the last
//   handled occurrence. The form shows it as the start date; left as it is, it
//   stays valid (it is the anchor, see effectiveStartDate). A different one must
//   be after it and today or later, whichever is later (startDateFloor).
// The form and the service both call this, so they cannot disagree.
export function validateRecurringInput(
  input: RecurringInput,
  currency: string | null,
  today: Day = toDay(new Date()),
  originalStartDate?: Day,
  lastConfirmedAt: Day | null = null,
): RecurringValidationCode | null {
  const name = input.name.trim();
  if (name.length === 0) return 'nameRequired';
  if (name.length > NAME_MAX_LENGTH) return 'nameTooLong';
  if (currency === null) return 'accountNotFound';
  const amount = parseAmountToCents(input.amount, currency);
  if (!amount.ok) return AMOUNT_CODES[amount.code];
  const interval = parseInterval(input.interval);
  if (!interval.ok) return interval.code;
  if (!isUnit(input.unit)) return 'invalidUnit';
  if (!isDay(input.startDate)) return 'invalidStartDate';
  if (lastConfirmedAt !== null) {
    if (input.startDate !== lastConfirmedAt) {
      if (input.startDate <= lastConfirmedAt) return 'startDateNotAfterHandled';
      if (input.startDate < today) return 'startDateInPast';
    }
  } else if (input.startDate < today && input.startDate !== originalStartDate) {
    return 'startDateInPast';
  }
  if (input.endDate !== null) {
    if (!isDay(input.endDate)) return 'invalidEndDate';
    if (input.endDate < input.startDate) return 'endBeforeStart';
  }
  if (input.note.trim().length > NOTE_MAX_LENGTH) return 'noteTooLong';
  return null;
}

// ---- Storage -------------------------------------------------------------

function toRecurring(row: RecurringRow): RecurringPayment {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    amountCents: row.amount_cents,
    note: row.note,
    interval: row.interval,
    unit: row.unit as Unit,
    startDate: row.start_date,
    endDate: row.end_date,
    notifyDaysBefore: row.notify_days_before,
    active: row.active === 1,
    lastConfirmedAt: row.last_confirmed_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
  };
}

// Validates and parses the input against the chosen account, or against the
// default currency when no account is chosen.
async function parse(
  input: RecurringInput,
  today: Day,
  originalStartDate?: Day,
  lastConfirmedAt: Day | null = null,
) {
  const account = input.accountId === null ? null : await getAccount(input.accountId);
  if (input.accountId !== null && !account) throw new RecurringValidationError('accountNotFound');
  const currency = account ? account.currency : await getDefaultCurrency();
  const code = validateRecurringInput(input, currency, today, originalStartDate, lastConfirmedAt);
  if (code) throw new RecurringValidationError(code);
  const amount = parseAmountToCents(input.amount, currency);
  if (!amount.ok) throw new RecurringValidationError(AMOUNT_CODES[amount.code]);
  const interval = parseInterval(input.interval);
  if (!interval.ok) throw new RecurringValidationError(interval.code);
  const trimmed = input.note.trim();
  return {
    accountId: account ? account.id : null,
    name: input.name.trim(),
    amountCents: amount.cents,
    note: trimmed.length > 0 ? trimmed : null,
    interval: interval.interval,
    unit: input.unit as Unit,
    startDate: input.startDate,
    endDate: input.endDate,
    active: input.active,
  };
}

export async function listRecurring(): Promise<RecurringPayment[]> {
  const db = await initDb();
  const rows = await db.getAllAsync<RecurringRow>(
    `SELECT ${COLUMNS} FROM recurring_payments ORDER BY id`,
  );
  return rows.map(toRecurring);
}

export async function getRecurring(id: number): Promise<RecurringPayment | null> {
  const db = await initDb();
  const row = await db.getFirstAsync<RecurringRow>(
    `SELECT ${COLUMNS} FROM recurring_payments WHERE id = ?`,
    id,
  );
  return row ? toRecurring(row) : null;
}

export async function createRecurring(
  input: RecurringInput,
  now: Date = new Date(),
): Promise<RecurringPayment> {
  const parsed = await parse(input, toDay(now));
  const createdAt = now.toISOString();
  const notifyDaysBefore = formatReminders(parseReminders(input.notifyDaysBefore));
  const db = await initDb();
  const result = await db.runAsync(
    'INSERT INTO recurring_payments (account_id, name, amount_cents, note, interval, unit, start_date, end_date, notify_days_before, active, last_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
    parsed.accountId,
    parsed.name,
    parsed.amountCents,
    parsed.note,
    parsed.interval,
    parsed.unit,
    parsed.startDate,
    parsed.endDate,
    notifyDaysBefore,
    parsed.active ? 1 : 0,
    createdAt,
  );
  return {
    id: result.lastInsertRowId,
    ...parsed,
    notifyDaysBefore,
    lastConfirmedAt: null,
    dismissedAt: null,
    createdAt,
  };
}

// Changes account, name, amount, schedule, note, active and (when given) the
// reminder choices. last_confirmed_at and created_at never change here, so paid and skipped
// occurrences stay handled and their transactions are untouched. The next due
// date is computed from the schedule, so changing interval, unit or start date
// moves it and renames or amount edits do not. Never paid: an unchanged start
// date may be in the past, a changed one must be today or later. Paid or
// skipped: see effectiveStartDate and validateRecurringInput. Runs in the write
// queue, so a pay or skip cannot change last_confirmed_at between the read and
// the write. Throws when the payment does not exist.
export function updateRecurring(
  id: number,
  input: RecurringInput,
  now: Date = new Date(),
): Promise<RecurringPayment> {
  return serialized(() => update(id, input, now));
}

async function update(id: number, input: RecurringInput, now: Date): Promise<RecurringPayment> {
  const existing = await getRecurring(id);
  if (!existing) throw new Error(`Recurring payment ${id} not found`);
  const parsed = await parse(input, toDay(now), existing.startDate, existing.lastConfirmedAt);
  const startDate = effectiveStartDate(existing, parsed);
  const notifyDaysBefore =
    input.notifyDaysBefore === undefined
      ? existing.notifyDaysBefore
      : formatReminders(parseReminders(input.notifyDaysBefore));
  const db = await initDb();
  const result = await db.runAsync(
    'UPDATE recurring_payments SET account_id = ?, name = ?, amount_cents = ?, note = ?, interval = ?, unit = ?, start_date = ?, end_date = ?, active = ?, notify_days_before = ? WHERE id = ?',
    parsed.accountId,
    parsed.name,
    parsed.amountCents,
    parsed.note,
    parsed.interval,
    parsed.unit,
    startDate,
    parsed.endDate,
    parsed.active ? 1 : 0,
    notifyDaysBefore,
    id,
  );
  if (result.changes === 0) throw new Error(`Recurring payment ${id} not found`);
  return { ...existing, ...parsed, startDate, notifyDaysBefore };
}

// Hides the card of one occurrence. Does not touch last_confirmed_at. Throws
// when the payment does not exist.
export async function dismissRecurring(id: number, occurrence: Day): Promise<void> {
  const db = await initDb();
  const result = await db.runAsync(
    'UPDATE recurring_payments SET dismissed_at = ? WHERE id = ?',
    occurrence,
    id,
  );
  if (result.changes === 0) throw new Error(`Recurring payment ${id} not found`);
}

// Linked transactions stay: their recurring_id becomes NULL (foreign key).
export async function removeRecurring(id: number): Promise<void> {
  const db = await initDb();
  await db.runAsync('DELETE FROM recurring_payments WHERE id = ?', id);
}
