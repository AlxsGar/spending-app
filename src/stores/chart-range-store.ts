import { create } from 'zustand';

import type { Day } from '@/services/recurring';

// A custom range chosen on the Custom range screen, waiting for the chart that
// opened it (`chartId`: 'home', or 'account-<id>') to pick it up.
export type PendingRange = { chartId: string; from: Day; to: Day };

type ChartRangeState = {
  pending: PendingRange | null;
  apply: (range: PendingRange) => void;
  // Clears the pending range, only if it is still that one.
  clear: (range: PendingRange) => void;
};

// A hand-off between the Custom range screen and the chart below it. Each chart
// keeps its own range in its own state (so nothing is remembered between visits);
// the screen only leaves the result here and goes back, and the chart that owns
// the id takes it and empties the slot. A result nobody consumes (no chart with
// that id is mounted) is left in place and never replayed: a chart that mounts
// later starts on its default range, and the next apply simply overwrites it.
export const useChartRangeStore = create<ChartRangeState>((set, get) => ({
  pending: null,
  apply: (range) => set({ pending: { ...range } }),
  clear: (range) => {
    if (get().pending === range) set({ pending: null });
  },
}));
