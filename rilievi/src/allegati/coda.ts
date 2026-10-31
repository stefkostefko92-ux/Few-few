import { rm } from 'node:fs/promises';
import { setTimeout as attendi } from 'node:timers/promises';
import type { TipoAllegato } from '@prisma/client';
import { mediaConfig } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { percorsi, rimuoviFile, type Percorsi } from './archivio.js';
import { leggiFirma, riconosci } from './formati.js';
import { comprimiFoto, type EsitoFoto } from './foto.js';
import {
  comprimiVideo,
  ErroreVideo,
  esegui,
  Interrotto,
  type EsitoVideo,
  type Strumenti,
} from './video.js';

/**
 * Опашката на обработката — в самата база (без Redis): фоновият процес (src/worker.ts) взима най-стария
 * файл „в опашката“ (`FOR UPDATE SKIP LOCKED` — два процеса никога не взимат един и същ), компресира го
 * и го отбелязва „готов“ или „грешка“. Прекъснатият при спиране се връща в опашката; при срив — при
 * следващия старт. Файл, който е свалил процеса три пъти, става „грешка“, вместо да го сваля вечно.
 * При грешка оригиналът се трие — човекът качва наново; при успех — също (остава компресираното).
 */

export const MAX_TENTATIVI = 3;
const ATTESA_MS = 3_000;

export interface Lavoro {
  id: string;
  schedaId: string;
  tipo: TipoAllegato;
  tentativi: number;
}

export type Esito = 'PRONTO' | 'ERRORE' | 'IN_CODA';

/** Останалото „в обработка“ от процес, който е паднал — пак в опашката. */
export async function ripristinaInterrotti(): Promise<number> {
  const { count } = await prisma.allegato.updateMany({
    where: { stato: 'IN_LAVORAZIONE' },
    data: { stato: 'IN_CODA' },
  });
  return count;
}

export async function prendiProssimo(): Promise<Lavoro | null> {
  const rows = await prisma.$queryRaw<Lavoro[]>`
    UPDATE "Allegato"
    SET stato = 'IN_LAVORAZIONE', tentativi = tentativi + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Allegato"
      WHERE stato = 'IN_CODA'
      ORDER BY "createdAt", id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "schedaId", tipo, tentativi`;
  return rows[0] ?? null;
}

async function fallisci(lavoro: Lavoro, p: Percorsi, codice: string): Promise<'ERRORE'> {
  await prisma.allegato.updateMany({
    where: { id: lavoro.id, stato: 'IN_LAVORAZIONE' },
    data: { stato: 'ERRORE', errore: codice },
  });
  await rimuoviFile(p);
  return 'ERRORE';
}

/** Ключът на грешката за човека (`allegati.errore.<…>`). */
function codiceDi(error: unknown): string {
  if (error instanceof ErroreVideo) return error.codice;
  if (error instanceof Error && /pixel limit/i.test(error.message)) return 'troppoGrande';
  return 'illeggibile';
}

export async function elabora(
  lavoro: Lavoro,
  strumenti: Strumenti,
  signal: AbortSignal,
): Promise<Esito> {
  const p = percorsi(lavoro);
  if (lavoro.tentativi > MAX_TENTATIVI) return fallisci(lavoro, p, 'ripetuto');
  try {
    const formato = riconosci(await leggiFirma(p.originale));
    let esito: EsitoFoto | EsitoVideo;
    if (lavoro.tipo === 'FOTO' && formato?.tipo === 'FOTO') {
      esito = await comprimiFoto(p.originale, formato.formato, p);
    } else if (lavoro.tipo === 'VIDEO' && formato?.tipo === 'VIDEO') {
      esito = await comprimiVideo(strumenti, p.originale, formato.formato, p, {
        maxMinuti: mediaConfig().MEDIA_MAX_VIDEO_MIN,
        signal,
      });
    } else {
      return await fallisci(lavoro, p, 'illeggibile');
    }
    const done = await prisma.allegato.updateMany({
      where: { id: lavoro.id, stato: 'IN_LAVORAZIONE' },
      data: {
        stato: 'PRONTO',
        errore: null,
        byte: esito.byte,
        larghezza: esito.larghezza,
        altezza: esito.altezza,
        durataMs: 'durataMs' in esito ? esito.durataMs : null,
      },
    });
    // Изтрит, докато се е обработвал: компресираното не остава без ред.
    if (done.count === 0) {
      await rimuoviFile(p);
      return 'ERRORE';
    }
    await rm(p.originale, { force: true });
    return 'PRONTO';
  } catch (error) {
    if (error instanceof Interrotto) {
      await prisma.allegato.updateMany({
        where: { id: lavoro.id, stato: 'IN_LAVORAZIONE' },
        data: { stato: 'IN_CODA', tentativi: { decrement: 1 } },
      });
      await Promise.all([p.file, p.mini, p.riquadro].map((file) => rm(file, { force: true })));
      return 'IN_CODA';
    }
    logger.warn({ id: lavoro.id, err: errorMessage(error) }, 'allegato: обработката не успя');
    return fallisci(lavoro, p, codiceDi(error));
  }
}

/** ffmpeg и ffprobe на място (иначе процесът не тръгва) и дали ffmpeg има `zscale` за HDR. */
export async function verificaStrumenti(signal: AbortSignal): Promise<Strumenti> {
  const cfg = mediaConfig();
  await esegui(cfg.FFPROBE_PATH, ['-version'], { timeoutMs: 30_000, signal });
  const filters = await esegui(cfg.FFMPEG_PATH, ['-hide_banner', '-filters'], {
    timeoutMs: 30_000,
    signal,
  });
  return {
    ffmpeg: cfg.FFMPEG_PATH,
    ffprobe: cfg.FFPROBE_PATH,
    zscale: /\szscale\s/.test(filters.toString('utf8')),
  };
}

/** Цикълът на фоновия процес — докато не дойде сигнал за спиране. `battito` — „жив съм“. */
export async function lavora(
  strumenti: Strumenti,
  signal: AbortSignal,
  battito: () => void,
): Promise<void> {
  const restored = await ripristinaInterrotti();
  if (restored > 0) logger.info({ restored }, 'allegati: прекъснатите са пак в опашката');
  while (!signal.aborted) {
    battito();
    let lavoro: Lavoro | null = null;
    try {
      lavoro = await prendiProssimo();
    } catch (error) {
      logger.error({ err: errorMessage(error) }, 'allegati: опашката не се чете');
      await attendi(10 * ATTESA_MS, undefined, { signal }).catch(() => undefined);
      continue;
    }
    if (!lavoro) {
      await attendi(ATTESA_MS, undefined, { signal }).catch(() => undefined);
      continue;
    }
    const started = Date.now();
    const esito = await elabora(lavoro, strumenti, signal);
    logger.info(
      { id: lavoro.id, tipo: lavoro.tipo, esito, ms: Date.now() - started },
      'allegato elaborato',
    );
  }
}
