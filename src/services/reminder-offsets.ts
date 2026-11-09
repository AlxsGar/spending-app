// The reminder choices: how many days before an occurrence a reminder fires.
// 0 is the morning of the occurrence. A selection is stored as a comma-separated
// subset ("3,1,0"), always in this order; empty means no reminders.
export const REMINDER_OFFSETS = [3, 2, 1, 0] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

// What a new payment starts with until the user changes the setting: one day
// before and the morning of.
export const DEFAULT_REMINDERS = '1,0';

// The offsets in a stored value, in the canonical order. Anything that is not a
// choice, and repeats, are dropped.
export function parseReminders(value: string | null | undefined): ReminderOffset[] {
  if (!value) return [];
  const chosen = new Set(value.split(',').map((part) => Number(part.trim())));
  return REMINDER_OFFSETS.filter((offset) => chosen.has(offset));
}

// The stored form of a selection.
export function formatReminders(offsets: readonly number[]): string {
  return REMINDER_OFFSETS.filter((offset) => offsets.includes(offset)).join(',');
}
