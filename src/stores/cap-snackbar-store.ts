import { create } from 'zustand';

import type { ExceededCap } from '@/services/soft-caps';

// What the snackbar says: the crossed cap furthest over (the headline of the
// crossed set), its display name, and how many other caps the same save crossed.
export type CapNotice = {
  cap: ExceededCap;
  name: string;
  more: number;
};

// A notice waiting for the saved card to close, with the caps (null is the
// global cap) its save crossed, so they can be re-checked before it shows.
export type PendingNotice = {
  notice: CapNotice;
  crossed: (number | null)[];
};

type CapSnackbarState = {
  pending: PendingNotice | null;
  // On screen now.
  current: CapNotice | null;
  // A newer crossing save replaces whatever is pending or showing. A save that
  // crossed nothing never calls this: it leaves them alone.
  replace: (pending: PendingNotice) => void;
  // Takes the pending notice off the queue; with a notice, shows it.
  promote: (notice: CapNotice | null) => void;
  hide: () => void;
};

export const useCapSnackbarStore = create<CapSnackbarState>((set) => ({
  pending: null,
  current: null,
  replace: (pending) => set({ pending, current: null }),
  promote: (notice) => set({ pending: null, current: notice }),
  hide: () => set({ current: null }),
}));
