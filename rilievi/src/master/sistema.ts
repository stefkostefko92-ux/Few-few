import { buildCorrente } from '../build.js';
import { spazioLibero } from '../allegati/archivio.js';
import { mailEnabled, mediaConfig } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { HOUR, MINUTE } from '../time.js';

/** `ok` — зелено; `attenzione` — да се погледне; `errore` — нещо не работи. */
export type Esito = 'ok' | 'attenzione' | 'errore';

export interface Controllo {
  /** Ключът на реда (`master.sistema.voci.<chiave>`). */
  chiave: string;
  esito: Esito;
  /** Стойността за показване — вече форматирана (байтове, ms, дата) или ключ на превода. */
  valore: string;
  /** Параметрите на подсказката под реда (`master.sistema.nota.<chiave>.<esito>`). */
  nota?: Record<string, string | number>;
}

const MB = 1024 * 1024;

/** Байтовете за хора: 1 decimale da GB in su. */
export function byteLeggibili(byte: number): string {
  if (byte >= 1024 * MB) return `${(byte / (1024 * MB)).toFixed(1).replace('.', ',')} GB`;
  if (byte >= MB) return `${Math.round(byte / MB)} MB`;
  return `${Math.max(0, Math.round(byte / 1024))} KB`;
}

/** Колко време: „3 g 4 h“, „5 h 12 min“, „8 min“. */
export function durata(ms: number): string {
  const min = Math.floor(ms / MINUTE);
  const ore = Math.floor(min / 60);
  const giorni = Math.floor(ore / 24);
  if (giorni > 0) return `${giorni} g ${ore % 24} h`;
  if (ore > 0) return `${ore} h ${min % 60} min`;
  return `${min} min`;
}

/** Опашката на снимките: най-старият чакащ под 15 мин. — ok, под час — внимание, иначе грешка. */
export function esitoCoda(piuVecchioMs: number | null, errori: number): Esito {
  if (piuVecchioMs !== null && piuVecchioMs > HOUR) return 'errore';
  if ((piuVecchioMs !== null && piuVecchioMs > 15 * MINUTE) || errori > 0) return 'attenzione';
  return 'ok';
}

/** Свободното място на диска със снимките спрямо минимума за качване (`MEDIA_MIN_FREE_MB`). */
export function esitoSpazio(libero: number, minimoMb: number): Esito {
  if (libero < minimoMb * MB) return 'errore';
  if (libero < minimoMb * MB * 3) return 'attenzione';
  return 'ok';
}

async function spazio(): Promise<Controllo> {
  try {
    const libero = await spazioLibero();
    const minimo = mediaConfig().MEDIA_MIN_FREE_MB;
    return {
      chiave: 'spazio',
      esito: esitoSpazio(libero, minimo),
      valore: byteLeggibili(libero),
      nota: { minimo: byteLeggibili(minimo * MB) },
    };
  } catch (error) {
    logger.warn({ err: errorMessage(error) }, 'мястото на диска не се прочете');
    return { chiave: 'spazio', esito: 'errore', valore: '—' };
  }
}

/**
 * Здравето на системата за конзолата на MASTER — само числа, без пътища, адреси и тайни: кодът (build),
 * процесът, базата (отговор, размер, последната миграция), снимките (място, опашката — работникът е в
 * свой контейнер и се познава по нея), пощата.
 */
export async function statoSistema(now: Date = new Date()): Promise<Controllo[]> {
  // Само отговорът на базата се мери — без диска; паднала база дава червени светлини, не 500.
  const latenzaDb = (async () => {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - t0);
  })();
  const [latenza, dimensione, migrazione, coda, errori, spazioDisco] = await Promise.allSettled([
    latenzaDb,
    prisma.$queryRaw<Array<{ byte: bigint }>>`SELECT pg_database_size(current_database()) AS byte`,
    prisma.$queryRaw<Array<{ nome: string; fine: Date | null }>>`
      SELECT migration_name AS nome, finished_at AS fine FROM "_prisma_migrations"
      ORDER BY started_at DESC LIMIT 1`,
    prisma.allegato.findFirst({
      where: { stato: { in: ['IN_CODA', 'IN_LAVORAZIONE'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.allegato.count({ where: { stato: 'ERRORE' } }),
    spazio(),
  ]);
  const ok = <T>(r: PromiseSettledResult<T>): T | undefined =>
    r.status === 'fulfilled' ? r.value : undefined;
  const ms = ok(latenza);
  const ultima = ok(migrazione)?.[0];
  const statoCoda = coda.status === 'fulfilled' && errori.status === 'fulfilled';
  const piuVecchio = ok(coda) ? now.getTime() - ok(coda)!.createdAt.getTime() : null;
  const memoria = process.memoryUsage().rss;
  if (latenza.status === 'rejected')
    logger.warn({ err: errorMessage(latenza.reason) }, 'конзолата: базата не отговаря');
  return [
    { chiave: 'build', esito: 'ok', valore: buildCorrente() },
    {
      chiave: 'processo',
      esito: 'ok',
      valore: durata(process.uptime() * 1000),
      nota: { node: process.version, memoria: byteLeggibili(memoria) },
    },
    {
      chiave: 'database',
      esito: ms === undefined ? 'errore' : ms > 500 ? 'attenzione' : 'ok',
      valore: ms === undefined ? '—' : `${ms} ms`,
      nota: { dimensione: byteLeggibili(Number(ok(dimensione)?.[0]?.byte ?? 0)) },
    },
    {
      chiave: 'migrazione',
      esito: ultima?.fine ? 'ok' : 'errore',
      valore: ultima?.nome ?? '—',
    },
    ok(spazioDisco) ?? { chiave: 'spazio', esito: 'errore', valore: '—' },
    {
      chiave: 'coda',
      esito: statoCoda ? esitoCoda(piuVecchio, ok(errori) ?? 0) : 'errore',
      valore: !statoCoda ? '—' : piuVecchio === null ? '0' : durata(piuVecchio),
      nota: { errori: ok(errori) ?? '—' },
    },
    {
      chiave: 'posta',
      esito: mailEnabled() ? 'ok' : 'attenzione',
      valore: mailEnabled() ? 'master.sistema.posta.attiva' : 'master.sistema.posta.spenta',
    },
  ];
}
