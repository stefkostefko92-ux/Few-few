import { constants } from 'node:fs';
import { access, mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { TipoAllegato } from '@prisma/client';
import { mediaConfig } from '../config.js';

/**
 * Файловете на снимките и клиповете (`MEDIA_DIR`): `arrivi/` — каченото, докато заявката не свърши;
 * `schede/<карта>/` — на всеки файл оригиналът до обработката (`<id>.orig`), после компресираният
 * (`<id>.jpg` или `<id>.mp4`) и миниатюрата (`<id>.mini.jpg`). Пътят е само от id-тата (cuid) — името
 * на качения файл никога не стига до диска.
 */

const ID = /^[a-z0-9]{20,40}$/;

function checkId(id: string): string {
  if (!ID.test(id)) throw new Error(`allegati: недопустим id ${JSON.stringify(id)}`);
  return id;
}

export function cartellaArrivi(): string {
  return join(mediaConfig().MEDIA_DIR, 'arrivi');
}

export function cartellaScheda(schedaId: string): string {
  return join(mediaConfig().MEDIA_DIR, 'schede', checkId(schedaId));
}

export interface Percorsi {
  /** Каченото, до края на обработката. */
  originale: string;
  /** Компресираното: JPEG за снимка, MP4 (H.264) за клип. */
  file: string;
  /** Миниатюрата (JPEG): галерията, кадърът на клипа, печатът и PDF-ът. */
  mini: string;
}

export function percorsi(allegato: { id: string; schedaId: string; tipo: TipoAllegato }): Percorsi {
  const base = join(cartellaScheda(allegato.schedaId), checkId(allegato.id));
  return {
    originale: `${base}.orig`,
    file: `${base}.${allegato.tipo === 'VIDEO' ? 'mp4' : 'jpg'}`,
    mini: `${base}.mini.jpg`,
  };
}

/** Папките на място и с право на запис — иначе процесът не тръгва (същото правило като конфига). */
export async function preparaArchivio(): Promise<void> {
  for (const dir of [cartellaArrivi(), join(mediaConfig().MEDIA_DIR, 'schede')]) {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
  }
}

/** Свободните байтове на диска на `MEDIA_DIR` (за непривилегирования процес). */
export async function spazioLibero(): Promise<number> {
  const info = await statfs(mediaConfig().MEDIA_DIR);
  return info.bavail * info.bsize;
}

/** Байтовете на качванията, които още текат в процеса — свободното място на диска още не ги вижда. */
let riservati = 0;

/**
 * Място за още `byte`, без дискът да падне под минимума (`MEDIA_MIN_FREE_MB`), заедно с качванията,
 * които още текат: запазва се ПРЕДИ проверката (няколко едновременни качвания не минават поотделно) и
 * се освобождава с върнатата функция (когато отговорът свърши). null — няма място.
 */
export async function riservaSpazio(byte: number): Promise<(() => void) | null> {
  riservati += byte;
  let libero = false;
  const rilascia = (): void => {
    if (libero) return;
    libero = true;
    riservati -= byte;
  };
  try {
    if ((await spazioLibero()) - riservati >= mediaConfig().MEDIA_MIN_FREE_MB * 1024 * 1024)
      return rilascia;
  } catch {
    // Томът не се чете — както без място.
  }
  rilascia();
  return null;
}

export async function rimuoviFile(p: Percorsi): Promise<void> {
  await Promise.all([p.originale, p.file, p.mini].map((file) => rm(file, { force: true })));
}

/** Папката на картата — при окончателното ѝ изтриване. */
export async function rimuoviScheda(schedaId: string): Promise<void> {
  await rm(cartellaScheda(schedaId), { recursive: true, force: true });
}

/** Каченото в `arrivi/`, останало от прекъсната заявка (по-старо от `oltreMs`) — изтрива се. */
export async function pulisciArrivi(oltreMs: number, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const name of await readdir(cartellaArrivi()).catch(() => [])) {
    const file = join(cartellaArrivi(), name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > oltreMs) {
      await rm(file, { force: true, recursive: true });
      removed += 1;
    }
  }
  return removed;
}
