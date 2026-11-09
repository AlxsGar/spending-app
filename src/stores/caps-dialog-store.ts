import { create } from 'zustand';

type CapsDialogState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

// Whether the "Caps exceeded" dialog is open. Lifted out of Home's banner so
// the snackbar's View action can open it from any screen; the one
// CapsDialogHost mounted at the root renders it.
export const useCapsDialogStore = create<CapsDialogState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
