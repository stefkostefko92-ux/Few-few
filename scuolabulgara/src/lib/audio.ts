// Recognise a sound file by its first bytes, not by the name or the type the
// browser claims — so a renamed script can never be stored as "audio". Pure.

export type AudioKind = { ext: "mp3" | "m4a" | "ogg" | "webm" | "wav"; mime: string };

const at = (b: Uint8Array, off: number, s: string) => [...s].every((c, i) => b[off + i] === c.charCodeAt(0));

export function sniffAudio(b: Uint8Array): AudioKind | null {
  if (b.length < 12) return null;
  if (at(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  if (at(b, 4, "ftyp")) return { ext: "m4a", mime: "audio/mp4" };
  if (at(b, 0, "OggS")) return { ext: "ogg", mime: "audio/ogg" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };
  if (at(b, 0, "RIFF") && at(b, 8, "WAVE")) return { ext: "wav", mime: "audio/wav" };
  return null;
}

export const AUDIO_MAX_BYTES = 3 * 1024 * 1024;

/** A PDF starts with "%PDF-" (a few producers put a little junk first). */
export const isPdf = (b: Uint8Array) => {
  for (let i = 0; i < Math.min(16, b.length - 5); i++) if (at(b, i, "%PDF-")) return true;
  return false;
};
export const PDF_MAX_BYTES = 14 * 1024 * 1024; // nginx accepts 15 MB per request
