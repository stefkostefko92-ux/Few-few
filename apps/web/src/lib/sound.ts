import { useSettings } from "./settings";

/**
 * Minimal sound layer (§6). Plays short WebAudio blips for game feedback,
 * honouring the global mute. No external audio assets yet (a Howler sprite
 * atlas is later polish) — this keeps the build asset-free while wiring the
 * mute control through. Safe to call on the server / without AudioContext.
 */
type Cue = "deal" | "flip" | "win" | "loss" | "click";

const FREQ: Record<Cue, number> = { deal: 330, flip: 440, win: 660, loss: 180, click: 520 };

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function playCue(cue: Cue): void {
  if (useSettings.getState().muted) return;
  const ac = audio();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = FREQ[cue];
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.2);
  } catch {
    /* audio is best-effort */
  }
}
