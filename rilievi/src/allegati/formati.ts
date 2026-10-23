import { open } from 'node:fs/promises';

/**
 * Какво е каченото — по САМИТЕ БАЙТОВЕ, не по името или по типа от браузъра (те не доказват нищо).
 * Снимки: JPEG, PNG, WebP, AVIF — sharp ги чете. HEIC — отделно: sharp (без HEVC) не го чете, затова
 * отказ с подсказка как телефонът да прати JPEG (Safari на iPhone обикновено го превръща сам). Клипове:
 * контейнерите ISO BMFF (MP4, MOV, 3GP), Matroska/WebM и AVI; дали вътре наистина има видео, казва
 * ffprobe при обработката.
 */

export type FormatoFoto = 'jpeg' | 'png' | 'webp' | 'avif';
export type FormatoVideo = 'mp4' | 'mov' | '3gp' | 'webm' | 'avi';
export type Formato =
  | { tipo: 'FOTO'; formato: FormatoFoto }
  | { tipo: 'VIDEO'; formato: FormatoVideo }
  | { tipo: 'HEIC' };

/** Колко байта от началото стигат за разпознаването. */
export const BYTE_FIRMA = 32;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const HEIC = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);
const AVIF = new Set(['avif', 'avis']);
/** Само звук (M4A, M4B, M4P) — не е клип. */
const AUDIO = new Set(['M4A ', 'M4B ', 'M4P ']);

const ascii = (buf: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...buf.subarray(from, to));
const starts = (buf: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, i) => buf[i] === byte);

export function riconosci(buf: Uint8Array): Formato | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { tipo: 'FOTO', formato: 'jpeg' };
  if (starts(buf, PNG)) return { tipo: 'FOTO', formato: 'png' };
  if (ascii(buf, 0, 4) === 'RIFF') {
    const kind = ascii(buf, 8, 12);
    if (kind === 'WEBP') return { tipo: 'FOTO', formato: 'webp' };
    if (kind === 'AVI ') return { tipo: 'VIDEO', formato: 'avi' };
    return null;
  }
  if (starts(buf, EBML)) return { tipo: 'VIDEO', formato: 'webm' };
  // ISO BMFF: кутията `ftyp` с основната марка на файла.
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (AVIF.has(brand)) return { tipo: 'FOTO', formato: 'avif' };
    if (HEIC.has(brand)) return { tipo: 'HEIC' };
    if (AUDIO.has(brand)) return null;
    if (brand === 'qt  ') return { tipo: 'VIDEO', formato: 'mov' };
    if (brand.startsWith('3g')) return { tipo: 'VIDEO', formato: '3gp' };
    return { tipo: 'VIDEO', formato: 'mp4' };
  }
  return null;
}

/** Първите байтове на файла на диска — за `riconosci`. */
export async function leggiFirma(file: string): Promise<Uint8Array> {
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(BYTE_FIRMA);
    const { bytesRead } = await handle.read(buf, 0, BYTE_FIRMA, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
