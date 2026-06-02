import { create } from "zustand";
import type { MatchPlayerInfo, PublicUser } from "@aso/shared";
import type { MatchPhase } from "../features/game/useMatch";

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

/**
 * The single active match, published by `useMatch` so chrome rendered outside a
 * game view (the chat dock in `GameView`) can address the right room without
 * threading props through 18 bespoke views. Only one match runs at a time.
 */
interface MatchState {
  matchId: string | null;
  seat: number;
  players: MatchPlayerInfo[];
  phase: MatchPhase;
  setMatch: (m: { matchId: string; seat: number; players: MatchPlayerInfo[] }) => void;
  setPhase: (phase: MatchPhase) => void;
  clearMatch: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matchId: null,
  seat: 0,
  players: [],
  phase: "searching",
  setMatch: ({ matchId, seat, players }) => set({ matchId, seat, players, phase: "playing" }),
  setPhase: (phase) => set({ phase }),
  clearMatch: () => set({ matchId: null, seat: 0, players: [], phase: "searching" }),
}));

/**
 * App-wide quick-store modal. Opened from the wallet bar (incl. mid-game, since
 * the header renders during matches) so players can top up without leaving the
 * table. `reason` lets callers tailor the heading (e.g. low on chips).
 */
type StoreReason = "default" | "chips" | "gems" | "vip";
interface StoreModalState {
  open: boolean;
  reason: StoreReason;
  openStore: (reason?: StoreReason) => void;
  closeStore: () => void;
}

export const useStoreModal = create<StoreModalState>((set) => ({
  open: false,
  reason: "default",
  openStore: (reason = "default") => set({ open: true, reason }),
  closeStore: () => set({ open: false }),
}));
