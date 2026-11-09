import { parseReminders } from './reminder-offsets';
import type { ReminderOffset } from './reminder-offsets';
import {
  actionOccurrence,
  addDays,
  occurrenceAfter,
  toDay,
} from './recurring';
import type { Day, RecurringPayment } from './recurring';

// Every reminder fires at this hour, local time.
export const REMINDER_HOUR = 9;
// At most this many reminders are scheduled (iOS keeps about 64 per app).
export const MAX_REMINDERS = 60;
// Identifiers of our scheduled notifications start with this, so a sync can tell
// them from anything else.
export const REMINDER_ID_PREFIX = 'reminder:';

export type PlannedReminder = {
  // reminder:<payment id>:<occurrence>:<offset>
  id: string;
  recurringId: number;
  // The occurrence the reminder is about (a calendar day).
  occurrence: Day;
  offset: ReminderOffset;
  // The local moment it fires (REMINDER_HOUR on occurrence - offset).
  fireAt: Date;
};

export function reminderId(recurringId: number, occurrence: Day, offset: number): string {
  return `${REMINDER_ID_PREFIX}${recurringId}:${occurrence}:${offset}`;
}

// The occurrence a payment's reminders are for, or null for none:
// - inactive and finished payments: none;
// - the current-or-next occurrence (the one Pay now and Skip act on) when it is
//   today or later;
// - overdue (the current occurrence is before today): the overdue one stays
//   quiet and the occurrence after it is used, so its 3/2/1/0 reminders are
//   scheduled ahead of time instead of only once it becomes current.
// Dismissing a card never changes this.
export function reminderOccurrence(payment: RecurringPayment, today: Day): Day | null {
  const target = actionOccurrence(payment, today);
  if (target === null) return null;
  return target < today ? occurrenceAfter(payment, target) : target;
}

// Whether a tap on a reminder for `occurrence` should open the payment's actions
// dialog: the payment is active and unfinished (it has an occurrence to act on),
// and that occurrence has not been paid or skipped yet. The dialog then acts on
// the payment's current target. Otherwise the tap only opens the list.
export function isReminderActionable(
  payment: RecurringPayment | undefined,
  occurrence: Day,
  today: Day,
): payment is RecurringPayment {
  if (!payment || actionOccurrence(payment, today) === null) return false;
  return payment.lastConfirmedAt === null || payment.lastConfirmedAt < occurrence;
}

// 09:00 (REMINDER_HOUR) local on a calendar day. Built from the day's year,
// month and day numbers, so it is the wall-clock hour whatever the DST offset.
function fireTime(day: Day, hour: number): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, hour, 0, 0, 0);
}

// The reminders to schedule, soonest first, at most MAX_REMINDERS. Only each
// payment's reminderOccurrence is used. A reminder whose time is not after `now`
// is left out. A pure function: the caller owns the clock.
export function planReminders(
  payments: readonly RecurringPayment[],
  now: Date,
  hour: number = REMINDER_HOUR,
): PlannedReminder[] {
  const today = toDay(now);
  const planned: PlannedReminder[] = [];
  for (const payment of payments) {
    const occurrence = reminderOccurrence(payment, today);
    if (occurrence === null) continue;
    for (const offset of parseReminders(payment.notifyDaysBefore)) {
      const fireAt = fireTime(addDays(occurrence, -offset), hour);
      if (fireAt.getTime() <= now.getTime()) continue;
      planned.push({
        id: reminderId(payment.id, occurrence, offset),
        recurringId: payment.id,
        occurrence,
        offset,
        fireAt,
      });
    }
  }
  planned.sort(
    (a, b) =>
      a.fireAt.getTime() - b.fireAt.getTime() ||
      a.recurringId - b.recurringId ||
      b.offset - a.offset,
  );
  return planned.slice(0, MAX_REMINDERS);
}
