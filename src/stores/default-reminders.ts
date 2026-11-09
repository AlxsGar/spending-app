import { useEffect } from 'react';
import { create } from 'zustand';

import { getDefaultReminders, saveDefaultReminders } from '@/services/reminder-settings';
import { DEFAULT_REMINDERS } from '@/services/reminder-offsets';

type State = {
  // Null until read from the settings table.
  value: string | null;
  saveError: boolean;
  load: () => Promise<void>;
  set: (value: string) => Promise<void>;
};

export const useDefaultRemindersStore = create<State>((set, get) => ({
  value: null,
  saveError: false,
  load: async () => {
    try {
      set({ value: await getDefaultReminders() });
    } catch (error) {
      console.error('[reminders] default load failed:', error);
      // Never block the form: fall back to the built-in default.
      set({ value: DEFAULT_REMINDERS });
    }
  },
  set: async (value) => {
    const previous = get().value;
    set({ value, saveError: false });
    try {
      await saveDefaultReminders(value);
    } catch (error) {
      console.error('[reminders] default save failed:', error);
      set({ value: previous, saveError: true });
    }
  },
}));

// The default reminder choices (a stored string such as "1,0"), or null until
// they have been read.
export function useDefaultReminders(): string | null {
  const value = useDefaultRemindersStore((state) => state.value);
  const load = useDefaultRemindersStore((state) => state.load);
  useEffect(() => {
    if (value === null) void load();
  }, [value, load]);
  return value;
}
