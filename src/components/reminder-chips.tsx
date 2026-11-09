import { useTranslation } from 'react-i18next';

import { FilterChips } from '@/components/ui';
import { REMINDER_OFFSETS, formatReminders, parseReminders } from '@/services/reminder-offsets';

type Props = {
  // The stored choices, such as "1,0".
  value: string;
  onChange: (value: string) => void;
};

const LABEL_KEYS = {
  3: 'reminders.option3',
  2: 'reminders.option2',
  1: 'reminders.option1',
  0: 'reminders.option0',
} as const;

// The four reminder choices (3, 2, 1 days before, morning of) as toggle chips.
// Used by the recurring payment form and by the default in Settings.
export function ReminderChips({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <FilterChips
      options={REMINDER_OFFSETS.map((offset) => ({
        value: String(offset),
        label: t(LABEL_KEYS[offset]),
      }))}
      selected={parseReminders(value).map(String)}
      onChange={(next) => onChange(formatReminders(next.map(Number)))}
    />
  );
}
