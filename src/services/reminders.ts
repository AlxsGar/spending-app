import i18n from '@/i18n';

import { getDefaultCurrency, listAccounts } from './accounts';
import { formatMoney } from './money';
import { replaceScheduledReminders } from './notifications';
import type { ScheduledReminder } from './notifications';
import { planReminders } from './reminder-plan';
import type { PlannedReminder } from './reminder-plan';
import { listRecurring } from './recurring';

// "Due in 3 days · MX$5,000.00", "Due tomorrow · …", "Due today · …".
export function reminderBody(offset: number, amount: string): string {
  if (offset === 0) return i18n.t('reminders.dueToday', { amount });
  if (offset === 1) return i18n.t('reminders.dueTomorrow', { amount });
  return i18n.t('reminders.dueIn', { count: offset, amount });
}

// One sync: reads the payments, plans, and replaces our scheduled notifications
// with the plan. Pass `now` for tests.
export async function runReminderSync(now: Date = new Date()): Promise<number> {
  const [payments, accounts, defaultCurrency] = await Promise.all([
    listRecurring(),
    listAccounts(),
    getDefaultCurrency(),
  ]);
  const currencies = new Map(accounts.map((account) => [account.id, account.currency]));
  const byId = new Map(payments.map((payment) => [payment.id, payment]));
  const items: ScheduledReminder[] = [];
  for (const reminder of planReminders(payments, now)) {
    const payment = byId.get(reminder.recurringId);
    if (!payment) continue;
    const currency =
      payment.accountId === null ? defaultCurrency : currencies.get(payment.accountId);
    if (!currency) continue;
    items.push(toScheduled(reminder, payment.name, formatMoney(payment.amountCents, currency)));
  }
  return replaceScheduledReminders(items);
}

function toScheduled(reminder: PlannedReminder, name: string, amount: string): ScheduledReminder {
  return {
    id: reminder.id,
    title: name,
    body: reminderBody(reminder.offset, amount),
    data: { recurringId: reminder.recurringId, occurrence: reminder.occurrence },
    fireAt: reminder.fireAt,
  };
}

// Syncs run one at a time, and a burst of requests while one is running costs
// one more run, not one per request (the extra run sees every write made so
// far). A failed run is logged and never throws: a reminder problem must not
// break the action that asked. The promise resolves when the sync that covers
// this request is done.
let current: Promise<void> | null = null;
let again = false;

export function requestReminderSync(): Promise<void> {
  if (current) {
    again = true;
    return current;
  }
  current = (async () => {
    try {
      do {
        again = false;
        try {
          await runReminderSync();
        } catch (error) {
          console.error('[reminders] sync failed:', error);
        }
      } while (again);
    } finally {
      current = null;
    }
  })();
  return current;
}
