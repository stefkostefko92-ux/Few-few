import type { AttachmentKind } from '@prisma/client';
import { redactPii } from '../domain/pii.js';

/**
 * Типът на прикачения файл се познава по СЪДЪРЖАНИЕТО (магически байтове), не по името или
 * Content-Type на клиента (§15 „controlli specifici“): преименуван .exe не става снимка.
 * Всеки вид приема само своите формати; таваните са по вид (FR-06).
 */

export const MAX_BYTES: Record<AttachmentKind, number> = {
  PHOTO: 10 * 1024 * 1024,
  LOG: 2 * 1024 * 1024,
  DOCUMENT: 50 * 1024 * 1024,
};

export type DetectedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'application/pdf'
  | 'application/json'
  | 'text/csv'
  | 'text/plain';

const KIND_MIMES: Record<AttachmentKind, readonly DetectedMime[]> = {
  PHOTO: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  LOG: ['text/plain', 'text/csv', 'application/json'],
  DOCUMENT: ['application/pdf'],
};

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) =>
  Buffer.from(b.subarray(from, to)).toString('latin1');

/** HEIF/HEIC: кутия „ftyp“ на отместване 4 и основна марка от семейството. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

function detectBinary(b: Uint8Array): DetectedMime | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    if (HEIF_BRANDS.has(brand)) return 'image/heif';
  }
  if (ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** CSV: поне два реда и еднакъв (ненулев) брой разделители в първите редове. */
function looksCsv(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 5);
  if (lines.length < 2) return false;
  return [',', ';', '\t'].some((d) => {
    const counts = lines.map((l) => l.split(d).length - 1);
    return counts[0] !== undefined && counts[0] > 0 && counts.every((c) => c === counts[0]);
  });
}

/** Лог: валиден UTF-8 без NUL; JSON, ако се разчита като JSON, иначе CSV или текст. */
function detectText(b: Uint8Array): DetectedMime | null {
  if (b.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'application/json';
    } catch {
      // не е JSON — продължава като текст
    }
  }
  return looksCsv(text) ? 'text/csv' : 'text/plain';
}

/** Видът по съдържанието или null, ако форматът не е разрешен за този вид. */
export function detectMime(kind: AttachmentKind, bytes: Uint8Array): DetectedMime | null {
  const mime = detectBinary(bytes) ?? (kind === 'LOG' ? detectText(bytes) : null);
  return mime !== null && KIND_MIMES[kind].includes(mime) ? mime : null;
}

const NAME_MAX = 120;
/** Контролни и форматиращи знаци (вкл. U+202E — обръщане на посоката, „exe.jpg“ измама). */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Името е само за показване: без път (и Windows, и POSIX), без контролни/двупосочни знаци, без
 * лични данни (имейл, телефон…), до 120 знака с разширението запазено. Празно → „file“.
 */
export function sanitizeFileName(raw: string | undefined | null): string {
  const base = (raw ?? '').normalize('NFC').split(/[/\\]/).pop() ?? '';
  const flat = base.replace(/[\t\n\v\f\r]/g, ' ').replace(UNSAFE, '');
  let name = redactPii(flat.replace(/\s+/g, ' '))
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .replace(/["<>:|?*]/g, '_');
  const chars = [...name];
  if (chars.length > NAME_MAX) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? [...name.slice(dot)] : [];
    const keepExt = ext.length > 1 && ext.length <= 10 ? ext : [];
    name = chars.slice(0, NAME_MAX - keepExt.length).join('') + keepExt.join('');
  }
  return name === '' ? 'file' : name;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** JPEG: първият SOF маркер (без DHT C4, JPG C8, DAC CC) носи височина и ширина. */
function jpegSize(b: Buffer): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // пълнеж
      continue;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // маркери без дължина
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // край/данни преди SOF
    const length = b.readUInt16BE(i + 2);
    if (length < 2) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (sof) {
      if (i + 9 > b.length) return null;
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

/** WebP: VP8 (със загуби), VP8L (без загуби) или VP8X (разширен) — размерът на платното. */
function webpSize(b: Buffer): ImageSize | null {
  if (b.length < 30) return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  return null;
}

/**
 * Размерът в пиксели от заглавката, без декодиране (нула зависимости, без чужд декодер върху
 * недоверения файл). null → не се разчита (повреден/необичаен файл) — не се праща на AI.
 */
export function imageSize(mime: DetectedMime, bytes: Uint8Array): ImageSize | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size: ImageSize | null = null;
  if (mime === 'image/png') {
    if (b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR') {
      size = { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
  } else if (mime === 'image/jpeg') size = jpegSize(b);
  else if (mime === 'image/webp') size = webpSize(b);
  return size && size.width > 0 && size.height > 0 ? size : null;
}
