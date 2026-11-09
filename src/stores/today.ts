import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toDay } from '@/services/recurring';
import type { Day } from '@/services/recurring';

// The device's local calendar day, kept current: it changes at the next local
// midnight (one timer, set for exactly that moment, not a poll) and when the app
// returns to the foreground (the timer may not have run while it was
// suspended). A screen that uses it re-renders only when the day changes.
export function useToday(): Day {
  const [today, setToday] = useState(() => toDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      setToday(toDay(new Date()));
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      // A timer can fire a moment early; waiting at least a second keeps that
      // from rescheduling in a tight loop.
      timer = setTimeout(refresh, Math.max(midnight.getTime() - now.getTime(), 1000));
    };

    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
