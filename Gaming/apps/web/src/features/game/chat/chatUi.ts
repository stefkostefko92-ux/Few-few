import { create } from "zustand";

/**
 * Open/unread state of the in-match chat, shared by the dock (ChatDock) and
 * the compact toggle in the scene header on phones — there the floating
 * button sat over the bottom row of the table's controls.
 */
interface ChatUi {
  open: boolean;
  unread: number;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setUnread: (n: number) => void;
}

export const useChatUi = create<ChatUi>((set) => ({
  open: false,
  unread: 0,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  setUnread: (unread) => set({ unread }),
}));
