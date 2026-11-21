// Обработка на качени изображения — чисто (без диск и без server-only), тества се.
// abuse-money-spec В (Разбивача т. 4): PNG 16000×16000 тежи 0,74 MB, но
// декодиран е ~768 MB; 14 паралелни стигаха ~930 MB RSS при mem_limit 1g.
// - Размерите се четат от заглавката и над MAX_INPUT_PIXELS — отказ без декодиране.
// - `limitInputPixels` е втори предпазител в самия sharp.
// - Най-много 2 едновременни обработки в процеса; sharp с 1 нишка на обработка.

import sharp, { type Metadata } from 'sharp';

export const MAX_INPUT_PIXELS = 40_000_000; // ~6300×6300 — повече от всяка камера на телефон
const MAX_PARALLEL = 2;

sharp.concurrency(1);

let active = 0;
const waiting: Array<() => void> = [];

/** Изпълнява fn, когато има свободно място (≤ MAX_PARALLEL наведнъж). */
export async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export type ProcessResult = { ok: true; buffer: Buffer } | { ok: false; reason: 'too-large' | 'invalid' };

export async function processImage(input: Buffer, kind: 'bg' | 'avatar'): Promise<ProcessResult> {
  return withImageSlot(async () => {
    let meta: Metadata;
    try {
      // Само заглавката (без декодиране) — затова без лимит тук; лимитът е при обработката.
      meta = await sharp(input, { limitInputPixels: false }).metadata();
    } catch {
      return { ok: false, reason: 'invalid' } as const;
    }
    if (!meta.width || !meta.height) return { ok: false, reason: 'invalid' } as const;
    if (meta.width * meta.height > MAX_INPUT_PIXELS) return { ok: false, reason: 'too-large' } as const;
    try {
      const pipeline = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
      const buffer =
        kind === 'bg'
          ? await pipeline.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
          : await pipeline.resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
      return { ok: true, buffer } as const;
    } catch {
      return { ok: false, reason: 'invalid' } as const;
    }
  });
}

const OWN_MEDIA = /^\/media\/((?:avatar|bg)-[a-f0-9]{24}\.webp)$/;

/** Името на НАШ качен файл от `/media/...` адрес (иначе null) — само такива се трият. */
export function mediaFileName(url: string | null | undefined): string | null {
  const match = url ? OWN_MEDIA.exec(url) : null;
  return match ? match[1]! : null;
}
