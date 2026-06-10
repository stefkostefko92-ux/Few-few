import { create } from "zustand";

/**
 * Client accessibility + comfort settings (§6 sound, §3.5 motion). Persisted to
 * localStorage. `reducedMotion` also honours the OS `prefers-reduced-motion`
 * so it defaults correctly without user action.
 */
interface SettingsState {
  muted: boolean;
  reducedMotion: boolean;
  setMuted: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
}

const KEY = "aso_settings";
const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function load(): { muted: boolean; reducedMotion: boolean } {
  if (typeof localStorage === "undefined") return { muted: false, reducedMotion: !!prefersReduced };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      return {
        muted: Boolean(parsed.muted),
        reducedMotion: parsed.reducedMotion ?? !!prefersReduced,
      };
    }
  } catch {
    /* ignore malformed storage */
  }
  return { muted: false, reducedMotion: !!prefersReduced };
}

function persist(s: { muted: boolean; reducedMotion: boolean }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}

const initial = load();

// Apply the stored/OS preference to the DOM immediately so the CSS gate
// (`:root[data-reduced-motion="true"]`) is correct on first paint, not just
// after a manual toggle.
if (typeof document !== "undefined") {
  document.documentElement.dataset.reducedMotion = initial.reducedMotion ? "true" : "false";
}

export const useSettings = create<SettingsState>((set, get) => ({
  muted: initial.muted,
  reducedMotion: initial.reducedMotion,
  setMuted: (muted) => {
    set({ muted });
    persist({ muted, reducedMotion: get().reducedMotion });
  },
  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    persist({ muted: get().muted, reducedMotion });
    if (typeof document !== "undefined") {
      document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false";
    }
  },
}));
