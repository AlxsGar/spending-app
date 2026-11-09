import type { CapPeriod } from '@/services/soft-caps';

// The phrase that follows an amount: "of $1,000 this week".
export const WHEN_KEYS: Record<CapPeriod, string> = {
  day: 'caps.whenDay',
  week: 'caps.whenWeek',
  month: 'caps.whenMonth',
};
