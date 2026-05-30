import { create } from "zustand";
import type { PublicUser } from "@aso/shared";

interface AuthState {
  user: PublicUser | null;
  /** False until the initial /me check resolves, so we don't flash the login screen. */
  initializing: boolean;
  setUser: (user: PublicUser | null) => void;
  setInitializing: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initializing: true,
  setUser: (user) => set({ user }),
  setInitializing: (initializing) => set({ initializing }),
}));
