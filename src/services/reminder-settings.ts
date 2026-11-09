import { getSetting, setSetting } from './db';
import { DEFAULT_REMINDERS, formatReminders, parseReminders } from './reminder-offsets';

const DEFAULT_REMINDERS_KEY = 'default_reminders';

// The reminder choices a new recurring payment starts with: the stored setting
// (an empty string is a valid choice: none), else DEFAULT_REMINDERS.
export async function getDefaultReminders(): Promise<string> {
  const stored = await getSetting(DEFAULT_REMINDERS_KEY);
  return stored === null ? DEFAULT_REMINDERS : formatReminders(parseReminders(stored));
}

export async function saveDefaultReminders(value: string): Promise<void> {
  await setSetting(DEFAULT_REMINDERS_KEY, formatReminders(parseReminders(value)));
}
