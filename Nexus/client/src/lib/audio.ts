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
/* Audit RISK #6: previous version called cloneNode() on every play,
 * creating a new <audio> element forever and eventually exhausting
 * Chromium's media-decoder pool. Now each clip has a fixed ring buffer
 * of 4 pre-allocated <audio> instances; play() rewinds and reuses them
 * round-robin instead of allocating. */
const RING_SIZE = 4;
const ring = new Map<SfxName, { pool: HTMLAudioElement[]; idx: number }>();

function getRing(name: SfxName): { pool: HTMLAudioElement[]; idx: number } {
  let r = ring.get(name);
  if (!r) {
    r = { pool: [], idx: 0 };
    for (let i = 0; i < RING_SIZE; i++) {
      const a = new Audio(`/assets/sfx/${name}.ogg`);
      a.preload = 'auto';
      r.pool.push(a);
    }
    ring.set(name, r);
  }
  return r;
}

export const sfx = {
  play(name: SfxName, opts: { volume?: number } = {}): void {
    if (!state.enabled) return;
    if (typeof window === 'undefined') return;
    try {
      const r = getRing(name);
      const clip = r.pool[r.idx];
      r.idx = (r.idx + 1) % RING_SIZE;
      try { clip.pause(); clip.currentTime = 0; } catch { /* ignore */ }
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
  (['click','hover','swing','hit','magic','coin','equip','potion'] as SfxName[]).forEach(getRing);
}
