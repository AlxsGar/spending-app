import type { Transaction } from './transactions';

export type DayGroup = {
  // Local day as YYYY-MM-DD.
  key: string;
  // Local midnight of that day.
  day: Date;
  items: Transaction[];
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// The device's local calendar day of an instant, as YYYY-MM-DD.
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Groups transactions by the device's local day. Keeps the input order, so a
// newest-first list gives newest-first groups.
export function groupByLocalDay(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of transactions) {
    const instant = new Date(item.date);
    const key = localDayKey(instant);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({
        key,
        day: new Date(instant.getFullYear(), instant.getMonth(), instant.getDate()),
        items: [item],
      });
    }
  }
  return groups;
}

export function relativeDay(day: Date, now: Date): 'today' | 'yesterday' | null {
  const key = localDayKey(day);
  if (key === localDayKey(now)) return 'today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDayKey(yesterday)) return 'yesterday';
  return null;
}
