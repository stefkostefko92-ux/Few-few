/**
 * Tiny sound-effect helper. Loads CC0 OGG files from /assets/sfx/ on
 * first play, caches them as HTMLAudioElement clones for overlapping
 * playback, and respects a global volume + on/off toggle persisted in
 * localStorage.
 *
 * Usage:
 *   sfx.play('hit');          // plays the swing-hit clip
 *   sfx.setVolume(0.6);       // 0..1 master volume
 *   sfx.setEnabled(false);    // mute everything
 *
 * Sound credits in /public/assets/sfx/CREDITS.md.
 */

export type SfxName = 'click' | 'hover' | 'swing' | 'hit' | 'magic' | 'coin' | 'equip' | 'potion';

const STORAGE_KEY = 'nd_audio_settings';

interface Settings {
  enabled: boolean;
  volume: number;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== false,
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.5,
      };
    }
  } catch {/* ignore */}
  return { enabled: true, volume: 0.5 };
}

function saveSettings(s: Settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/* ignore */}
}

const state: Settings = typeof window !== 'undefined' ? loadSettings() : { enabled: true, volume: 0.5 };
const cache = new Map<SfxName, HTMLAudioElement>();

/** Pre-load a clip. Safe to call multiple times. */
function preload(name: SfxName): HTMLAudioElement {
  let el = cache.get(name);
  if (!el) {
    el = new Audio(`/assets/sfx/${name}.ogg`);
    el.preload = 'auto';
    cache.set(name, el);
  }
  return el;
}

export const sfx = {
  play(name: SfxName, opts: { volume?: number } = {}): void {
    if (!state.enabled) return;
    if (typeof window === 'undefined') return;
    try {
      const base = preload(name);
      // Clone so multiple plays don't cut each other off.
      const clip = base.cloneNode(true) as HTMLAudioElement;
      clip.volume = Math.max(0, Math.min(1, (opts.volume ?? 1) * state.volume));
      clip.play().catch(() => { /* swallow autoplay-policy errors */ });
    } catch { /* fail silent */ }
  },

  setEnabled(on: boolean) { state.enabled = on; saveSettings(state); },
  setVolume(v: number) { state.volume = Math.max(0, Math.min(1, v)); saveSettings(state); },
  getSettings(): Settings { return { ...state }; },
};

/** Pre-warm the cache. Call once early after first user interaction. */
export function preloadAllSfx(): void {
  if (typeof window === 'undefined') return;
  (['click','hover','swing','hit','magic','coin','equip','potion'] as SfxName[]).forEach(preload);
}
