import { z } from 'zod';

/** SteamID64 на индивидуален акаунт: 17 цифри, започва с 7656119 (договорът и схемата). */
export const steamId64 = z.string().regex(/^7656119\d{10}$/);

export function parseSteamId(value: unknown): string | null {
  const parsed = steamId64.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Имената идват от играта (Steam ник) — произволен Unicode. EJS ги екранира за HTML, но
 * контролни и посочни (bidi) знаци биха обърнали или скрили съседния текст в таблицата, затова
 * се махат преди показ. Празно след почистване → тирето на SteamID-а.
 */
export function displayName(raw: string, steamId: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .trim();
  return cleaned || steamId;
}

/** Име, отрязано до `max` знака (по кодови точки — не цепи емоджи на половина). */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, Math.max(1, max - 1))
    .join('')
    .trimEnd()}…`;
}
