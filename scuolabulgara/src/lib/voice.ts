// Choosing the device's own Bulgarian voice for the alphabet words. Devices
// differ a lot: Edge ships a neural "Kalina … (Natural)", iOS has "Daria",
// Android the Google voice, Windows/Chrome only the older "Ivan", Linux often
// just eSpeak. Pure ranking, so the choice is testable without a browser.

export type VoiceLike = { name: string; lang: string; localService?: boolean };

/** Higher is better; null means "don't use it" (not Bulgarian, or robotic). */
export function voiceScore(v: VoiceLike): number | null {
  if (!/^bg([-_]|$)/i.test(v.lang)) return null;
  const n = v.name;
  if (/espeak|mbrola|festival|pico/i.test(n)) return null; // the robotic ones
  let s = 0;
  if (/natural|neural|online|premium|enhanced/i.test(n)) s += 100;
  if (/kalina|daria|google/i.test(n)) s += 60; // known good (and female) voices
  if (/female|жен/i.test(n)) s += 20;
  if (/ivan/i.test(n)) s -= 10; // usable, but the older male desktop voice
  return s;
}

export function bestVoice<T extends VoiceLike>(voices: T[]): T | null {
  let best: T | null = null, bestScore = -Infinity;
  for (const v of voices) {
    const s = voiceScore(v);
    if (s !== null && s > bestScore) { best = v; bestScore = s; }
  }
  return best;
}
