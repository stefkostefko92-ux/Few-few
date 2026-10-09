// backend/src/lib/transcriptAtRest.js
// Транскриптите на тикетите (archiveHtml) при покой — ЕДНО определение.
//
// Discord Developer Terms §5(c)(i): „encryption of the data at rest". Досега
// транскриптите (най-голямата маса съдържание от Discord, с имена и текст на
// хора) лежаха в базата в открит текст и разчитахме само на шифрирания диск на
// VPS-а, който никой не е потвърдил. Сега всеки НОВ запис минава през
// AES-256-GCM (lib/crypto.js); четенето е `decryptSafe` — заварените редове в
// открит текст се четат непроменени и се шифрират при следващия запис (същата
// стратегия като при OAuth токените: без миграция, без прекъсване).
//
// Маркерите на ретенцията („<!-- anonymized … -->“) НЕ се шифрират — те са
// сигнал за задачите (startsWith), не съдържание.
import { encrypt, decryptSafe } from "./crypto.js";

export const RETENTION_MARKER_PREFIX = "<!-- anonymized";

export function sealTranscript(html) {
  if (html === null || html === undefined) return html;
  const s = String(html);
  if (s.startsWith(RETENTION_MARKER_PREFIX)) return s;
  return encrypt(s);
}

export function openTranscript(value) {
  if (value === null || value === undefined) return value;
  return decryptSafe(String(value));
}
