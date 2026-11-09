// A development tool, kept on purpose. It is reachable only under __DEV__: the
// Settings row that calls it is not rendered in a production build. It is
// documented in docs/spec.md ("Development tools").
//
// It schedules one real-looking reminder 15 seconds from now for the first
// payment that has an occurrence to remind about, so the content, the tap and the
// Pay/Skip dialog can be tried without waiting for 09:00. Its identifier starts
// with "dev-test:", not "reminder:", so a reminder sync never cancels it.
import i18n from '@/i18n';
import { requestNotificationPermission, scheduleOne } from '@/services/notifications';
import { reminderOccurrence } from '@/services/reminder-plan';
import { listRecurring, toDay } from '@/services/recurring';
import { reminderBody } from '@/services/reminders';

export async function scheduleTestReminder(): Promise<void> {
  const permission = await requestNotificationPermission();
  const payments = await listRecurring();
  const today = toDay(new Date());
  const payment = payments.find((item) => reminderOccurrence(item, today) !== null);
  console.log('[dev] test reminder:', permission, payment ? payment.name : 'no payment');
  if (!payment || permission !== 'granted') return;
  const occurrence = reminderOccurrence(payment, today)!;
  await scheduleOne({
    id: `dev-test:${payment.id}:${Date.now()}`,
    title: payment.name,
    body: reminderBody(1, i18n.t('settings.dev.testAmount')),
    data: { recurringId: payment.id, occurrence },
    fireAt: new Date(Date.now() + 15_000),
  });
}
