import { useSettings } from "./settings";

/**
 * Minimal sound layer (§6). Plays short WebAudio blips for game feedback,
 * honouring the global mute. No external audio assets — keeps the build
 * asset-free. Safe to call on the server / without AudioContext.
 */
type Cue = "deal" | "flip" | "win" | "loss" | "click" | "error" | "alert";

/** Single-tone cues. */
const FREQ: Record<string, number> = { deal: 330, flip: 440, win: 660, loss: 180, click: 520 };
/** Multi-tone cues: [freq, startOffset(s), duration(s), waveform]. */
const SEQ: Partial<Record<Cue, Array<[number, number, number, OscillatorType]>>> = {
  // Harsh descending buzz — a clear "wrong / impossible" signal.
  error: [
    [200, 0, 0.09, "square"],
    [150, 0.08, 0.12, "square"],
  ],
  // Bright rising chime — a positive announcement flourish.
  alert: [
    [620, 0, 0.08, "triangle"],
    [880, 0.07, 0.12, "triangle"],
  ],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

function blip(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, peak = 0.08): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = freq;
  osc.type = type;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playCue(cue: Cue): void {
  if (useSettings.getState().muted) return;
  const ac = audio();
  if (!ac) return;
  try {
    const seq = SEQ[cue];
    if (seq) {
      for (const [freq, off, dur, type] of seq) blip(ac, freq, ac.currentTime + off, dur, type, cue === "error" ? 0.1 : 0.08);
      return;
    }
    blip(ac, FREQ[cue] ?? 440, ac.currentTime, 0.18, "sine");
  } catch {
    /* audio is best-effort */
  }
}
