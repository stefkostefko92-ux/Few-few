import { redactPii } from '../domain/pii.js';
import type { ModelInputs } from '../domain/response.js';
import { detectMime, imageSize } from '../services/filetype.js';

/**
 * Прикачените файлове към модела (FR-06, §9.2): САМО PHOTO/LOG, изрично привързани от техника към
 * ТОЗИ въпрос (CLEAN, същият случай — `bindToMessage`), само през Vertex в ЕС, само за отговора.
 * Чиста функция: байтовете идват от хранилището (services/model-inputs.ts), тук е решението.
 *
 * Таваните — по официалната документация на Anthropic (проверени на 09.10.2026):
 *  - формати: image/jpeg, image/png, image/gif, image/webp — HEIC/HEIF НЕ се поддържат;
 *  - Google Cloud (Vertex): само base64, до 5 MB на снимка (base64), до 30 MB на заявка;
 *  - до 8000×8000 px; над 20 снимки в заявка — по-строг таван (тук максимумът е 5);
 *  - под 200 px моделът може да греши/халюцинира.
 *  https://platform.claude.com/docs/en/build-with-claude/vision
 *  https://platform.claude.com/docs/en/api/overview#request-size-limits
 * Над тавана снимката НЕ се смалява (без sharp/libvips — нула чужд декодер върху недоверен файл),
 * а не се праща и отговорът иска друга снимка (`collect.photoSize` / `collect.photoFormat`).
 */

/** base64 на 3 750 000 байта = 5 000 000 знака — точно под 5 MB на Vertex. */
export const MAX_PHOTO_BYTES = 3_750_000;
export const MAX_PHOTO_PX = 8000;
export const MIN_PHOTO_PX = 200;
/** Всички снимки заедно в base64 — под 30 MB на заявка, с място за текста и историята. */
export const MAX_PHOTOS_BASE64 = 20_000_000;
/** Лог: опашката (най-новите редове), до 32 KB знака на лог и 64 KB общо. */
export const MAX_LOG_CHARS = 32 * 1024;
export const MAX_LOGS_CHARS = 64 * 1024;
/**
 * Ред от лога над тавана се отрязва: маскирането (`redactPii`) е по ред, защото шаблонът за
 * телефон е свръхлинеен върху дълги поредици „12-34-56-…“ (измерено: 32 KB на един ред ≈ 1,2 s).
 */
export const MAX_LOG_LINE = 2000;

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';
const SENDABLE = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);

export interface ModelPhoto {
  ref: string;
  attachmentId: string;
  mediaType: ImageMediaType;
  /** base64 — само в паметта за заявката, никога в лог/одит/база. */
  data: string;
}

export interface ModelLog {
  ref: string;
  attachmentId: string;
  text: string;
  /** Отрязано отпред (пази се опашката). */
  truncated: boolean;
}

export interface ModelAttachments {
  photos: ModelPhoto[];
  logs: ModelLog[];
  notSent: ModelInputs['notSent'];
}

export const NO_ATTACHMENTS: ModelAttachments = { photos: [], logs: [], notSent: [] };

export interface StoredAttachment {
  id: string;
  kind: 'PHOTO' | 'LOG';
  /** null → файлът липсва в хранилището (ретенция/изключено). */
  bytes: Buffer | null;
}

/** Опашката на лога: последните `max` знака, от началото на пълен ред. */
function tail(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let cut = text.slice(-max);
  const nl = cut.indexOf('\n');
  if (nl !== -1 && nl < 400) cut = cut.slice(nl + 1);
  return { text: cut, truncated: true };
}

/** Маскиране ред по ред (ограничено време — виж MAX_LOG_LINE). */
function redactLog(text: string): string {
  return text
    .split('\n')
    .map((line) => redactPii(line.length > MAX_LOG_LINE ? `${line.slice(0, MAX_LOG_LINE)}…` : line))
    .join('\n');
}

/** Решава кое отива към модела и кое не (с код за техника). Редът е редът на привързване. */
export function prepareAttachments(files: readonly StoredAttachment[]): ModelAttachments {
  const out: ModelAttachments = { photos: [], logs: [], notSent: [] };
  let photoBudget = MAX_PHOTOS_BASE64;
  let logBudget = MAX_LOGS_CHARS;
  for (const f of files) {
    const reject = (reason: string) => out.notSent.push({ id: f.id, kind: f.kind, reason });
    if (f.bytes === null) {
      reject('gate.attachment.unavailable');
      continue;
    }
    // Видът — наново по съдържанието (защита в дълбочина; не по реда в базата).
    const mime = detectMime(f.kind, f.bytes);
    if (f.kind === 'PHOTO') {
      if (mime === null || !SENDABLE.has(mime)) {
        reject('collect.photoFormat'); // HEIC/HEIF или непознат
        continue;
      }
      const size = imageSize(mime, f.bytes);
      if (size === null) {
        reject('collect.photoFormat');
        continue;
      }
      if (size.width < MIN_PHOTO_PX || size.height < MIN_PHOTO_PX) {
        reject('collect.betterPhoto');
        continue;
      }
      const encodedLength = Math.ceil(f.bytes.length / 3) * 4;
      if (
        f.bytes.length > MAX_PHOTO_BYTES ||
        size.width > MAX_PHOTO_PX ||
        size.height > MAX_PHOTO_PX ||
        encodedLength > photoBudget
      ) {
        reject('collect.photoSize');
        continue;
      }
      photoBudget -= encodedLength;
      out.photos.push({
        ref: `P${out.photos.length + 1}`,
        attachmentId: f.id,
        mediaType: mime as ImageMediaType,
        data: f.bytes.toString('base64'),
      });
      continue;
    }
    if (mime === null) {
      reject('collect.logExcerpt');
      continue;
    }
    const decoded = new TextDecoder('utf-8').decode(f.bytes);
    const cut = tail(decoded, MAX_LOG_CHARS);
    // Маскиране СЛЕД отрязването — цената е ограничена от тавана.
    const text = redactLog(cut.text);
    if (text.length > logBudget) {
      reject('collect.logExcerpt');
      continue;
    }
    logBudget -= text.length;
    out.logs.push({
      ref: `L${out.logs.length + 1}`,
      attachmentId: f.id,
      text,
      truncated: cut.truncated,
    });
  }
  return out;
}

/** Само id, вид и референция — за отговора, хронологията и одита (без съдържание). */
export function sentInputs(a: ModelAttachments): ModelInputs['attachments'] {
  return [
    ...a.photos.map((p) => ({ id: p.attachmentId, kind: 'PHOTO' as const, ref: p.ref })),
    ...a.logs.map((l) => ({ id: l.attachmentId, kind: 'LOG' as const, ref: l.ref })),
  ];
}
