import 'server-only';
// The previews of the survey sketches (round 50, GET /api/allegati/[id]/anteprima) kept from weighing on the renderers'
// slots that every company's documents share (src/lib/report/render.ts): a preview once drawn is kept in memory by what
// makes it — the file's SHA-256, the page, the orientation, the size — and answered again without any renderer or the
// file's bytes (they never change; at most 48 previews and 48 MB, the least recently used forgotten first); else one
// preview is drawn at a time in the whole server — one renderer slot at most: the others wait a short turn without one,
// a few at most, then «busy» —, one under way per company (a colleague's: «busy»), two per user. A PDF page is cut short
// at 8 s (src/lib/report/image-tool.ts).
import type { SessionUser } from '@/lib/auth';
import type { AllegatoType } from '@/lib/allegati/limits';
import { PREVIEW_EDGE, previewOf } from '@/lib/report/image-tool';
import { RendererBusy } from '@/lib/report/render';
import { inFlight } from '@/server/download';
import { bytesOf } from './queries';

export const ANTEPRIMA_LIMITS = {
  /** previews per user and 10 minutes (a PDF sketch's four pages, the panel opened again: a few each time) */
  perUser10Min: 30,
  /** under way at once: per user, per company (a bound of its own should the company's be raised) */
  perUser: 2,
  perCompany: 1,
  /** drawn at once in the server, and how many wait their turn — without a slot — and for how long at most */
  drawing: 1,
  waiting: 4,
  waitMs: 10_000,
  /** previews kept in memory, and their bytes in all */
  keptEntries: 48,
  keptBytes: 48 * 1024 * 1024,
} as const;

/** A preview as answered: bytes never changed once made (the route copies them into each answer). */
export interface Anteprima { readonly bytes: Buffer; readonly mime: 'image/png' | 'image/jpeg' }

/** A memory of at most `maxEntries` values and `maxBytes` bytes in all, the least recently used forgotten first; a value
 *  larger than the whole memory is not kept. */
export function byteLru<T extends { readonly bytes: Uint8Array }>(maxEntries: number, maxBytes: number) {
  const map = new Map<string, T>();
  let held = 0;
  return {
    get(key: string): T | undefined {
      const hit = map.get(key);
      if (hit) {
        map.delete(key);
        map.set(key, hit);
      }
      return hit;
    },
    set(key: string, value: T): void {
      if (value.bytes.length > maxBytes) return;
      const old = map.get(key);
      if (old) {
        held -= old.bytes.length;
        map.delete(key);
      }
      map.set(key, value);
      held += value.bytes.length;
      for (const [k, v] of map) {
        if (map.size <= maxEntries && held <= maxBytes) break;
        map.delete(k);
        held -= v.bytes.length;
      }
    },
    get size(): number { return map.size; },
    get bytes(): number { return held; },
    clear(): void {
      map.clear();
      held = 0;
    },
  };
}

const memory = byteLru<Anteprima>(ANTEPRIMA_LIMITS.keptEntries, ANTEPRIMA_LIMITS.keptBytes);
/** The previews kept in memory forgotten (the tests). */
export const forgetAnteprime = (): void => memory.clear();

let drawing = 0;
const queue: (() => void)[] = [];

/** `fn` as the preview drawn in the server; the others wait their turn without a renderer's slot, at most `waiting` of
 *  them and `waitMs` each — past that, RendererBusy. The one that ends hands its turn to the next. */
async function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  if (drawing < ANTEPRIMA_LIMITS.drawing) drawing += 1;
  else {
    if (queue.length >= ANTEPRIMA_LIMITS.waiting) throw new RendererBusy();
    await new Promise<void>((resolve, reject) => {
      const go = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = queue.indexOf(go);
        if (i >= 0) queue.splice(i, 1);
        reject(new RendererBusy());
      }, ANTEPRIMA_LIMITS.waitMs);
      queue.push(go);
    });
  }
  try {
    return await fn();
  } finally {
    const next = queue.shift();
    if (next) next(); else drawing -= 1;
  }
}

/** The file a preview is made of: a sketch of the user's company (queries.ts fileDaMostrare). */
export interface FileDaMostrare { id: string; sha256: string; size: number; orientation: number | null }

/**
 * The preview of page `page` (1 for a picture) of a sketch for `user`: from memory, else drawn in its turn. Null when the
 * user has two under way already (the route answers 429); throws RendererBusy when the company's one is under way, the
 * server's turn cannot be had or the renderers are busy (503), the tool's error when the file cannot be drawn.
 */
export async function anteprimaDi(user: SessionUser, f: FileDaMostrare, type: AllegatoType, page: number): Promise<Anteprima | null> {
  const key = [f.sha256, page, f.orientation ?? 0, PREVIEW_EDGE].join(':');
  const kept = memory.get(key);
  if (kept) return kept;
  const mine = inFlight(`anteprima:${user.id}`, ANTEPRIMA_LIMITS.perUser);
  if (!mine) return null;
  const ours = inFlight(`anteprima-azienda:${user.companyId}`, ANTEPRIMA_LIMITS.perCompany);
  try {
    if (!ours) throw new RendererBusy();
    const pic = await oneAtATime(() => previewOf({ load: () => bytesOf(f.id, f.size), type, orientation: f.orientation }, page));
    memory.set(key, pic);
    return pic;
  } finally {
    ours?.();
    mine();
  }
}
