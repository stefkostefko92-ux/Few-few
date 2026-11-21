// Обработка на качени изображения — чисто (без диск и без server-only), тества се.
// abuse-money-spec В (Разбивача т. 4): PNG 16000×16000 тежи 0,74 MB, но
// декодиран е ~768 MB; 14 паралелни стигаха ~930 MB RSS при mem_limit 1g.
// - Размерите се четат от заглавката и над MAX_INPUT_PIXELS — отказ без декодиране.
// - `limitInputPixels` е втори предпазител в самия sharp.
// - Най-много 2 едновременни обработки в процеса; sharp с 1 нишка на обработка.
// - Опашката е с таван (Разбивача Н1: 30 чакащи качвания по ~9 MB → 1,3 GB RSS) —
//   пълна опашка = отказ веднага; и най-много 1 качване в ход на потребител.

import sharp, { type Metadata } from 'sharp';

export const MAX_INPUT_PIXELS = 40_000_000; // ~6300×6300 — повече от всяка камера на телефон
const MAX_PARALLEL = 2;
const MAX_WAITING = 4;

sharp.concurrency(1);

let active = 0;
const waiting: Array<() => void> = [];

/**
 * Изпълнява fn, когато има свободно място (≤ MAX_PARALLEL наведнъж). При освобождаване
 * слотът се ПРЕДАВА на чакащия (active не пада) — иначе нов викащ в същия microtask
 * би влязъл преди събудения и би станал трети.
 */
export async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) {
    if (waiting.length >= MAX_WAITING) throw new ImageBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active += 1;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

export class ImageBusyError extends Error {
  constructor() {
    super('image queue full');
  }
}

/** Опашката е пълна — отказ ПРЕДИ тялото да се чете в паметта. */
export function imageQueueFull(): boolean {
  return active >= MAX_PARALLEL && waiting.length >= MAX_WAITING;
}

const inFlight = new Set<string>();

/** Най-много 1 качване в ход на ключ (потребител); зает → null веднага. */
export async function withUploadLock<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
}

export type ProcessResult = { ok: true; buffer: Buffer } | { ok: false; reason: 'too-large' | 'invalid' | 'busy' };

export async function processImage(input: Buffer, kind: 'bg' | 'avatar'): Promise<ProcessResult> {
  return withImageSlot(() => decode(input, kind)).catch((error: unknown) => {
    if (error instanceof ImageBusyError) return { ok: false, reason: 'busy' } as const;
    throw error;
  });
}

async function decode(input: Buffer, kind: 'bg' | 'avatar'): Promise<ProcessResult> {
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
}

const OWN_MEDIA = /^\/media\/((?:avatar|bg)-[a-f0-9]{24}\.webp)$/;

/** Името на НАШ качен файл от `/media/...` адрес (иначе null) — само такива се трият. */
export function mediaFileName(url: string | null | undefined): string | null {
  const match = url ? OWN_MEDIA.exec(url) : null;
  return match ? match[1]! : null;
}
