import { create } from 'zustand';

export type SuccessTone = 'positive' | 'negative';

export type SuccessFeedback = {
  // Paper icon name.
  icon: string;
  tone: SuccessTone;
  // Already translated.
  message: string;
  // Already formatted, optional.
  amountText?: string;
};

type Shown = SuccessFeedback & { id: number };

type SuccessState = {
  current: Shown | null;
  show: (feedback: SuccessFeedback) => void;
  // Clears the card; with an id, only if that card is still the one showing.
  hide: (id?: number) => void;
};

let nextId = 1;

export const useSuccessStore = create<SuccessState>((set, get) => ({
  current: null,
  show: (feedback) => set({ current: { ...feedback, id: nextId++ } }),
  hide: (id) => {
    const current = get().current;
    if (current && (id === undefined || current.id === id)) set({ current: null });
  },
}));

// Shows the shared success card (see SuccessHost). Call it after a successful
// save, right before navigating back. Never call it on failure.
export function showSuccess(feedback: SuccessFeedback): void {
  useSuccessStore.getState().show(feedback);
}
