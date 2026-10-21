import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import type { Allegato, TipoAllegato } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { SECTIONS, type SectionKey } from '../schede/fields.js';
import { cartellaScheda, percorsi, rimuoviFile } from './archivio.js';

/**
 * Снимките и клиповете на картата — записът им, надписът и изтриването, винаги за вече проверена карта
 * (маршрутът я взима в обхвата на човека). Каченото влиза „в опашката“; компресира го фоновият процес
 * (coda.ts). Всяко действие пише в одита — без името на файла и без надписа.
 */

/** Колко файла може да носи една карта (всички раздели заедно). */
export const MAX_PER_SCHEDA = 300;
export const MAX_DIDASCALIA = 200;

export type AllegatoVista = Pick<
  Allegato,
  | 'id'
  | 'sezione'
  | 'tipo'
  | 'stato'
  | 'didascalia'
  | 'nomeOriginale'
  | 'larghezza'
  | 'altezza'
  | 'durataMs'
  | 'errore'
  | 'createdAt'
>;

const VISTA = {
  id: true,
  sezione: true,
  tipo: true,
  stato: true,
  didascalia: true,
  nomeOriginale: true,
  larghezza: true,
  altezza: true,
  durataMs: true,
  errore: true,
  createdAt: true,
} as const;

const SEZIONI: ReadonlySet<string> = new Set(SECTIONS.map((section) => section.key));

export function isSezione(value: unknown): value is SectionKey {
  return typeof value === 'string' && SEZIONI.has(value);
}

/** Надписът: без управляващи знаци и излишни интервали, до 200 знака; празният — няма надпис. */
export const didascaliaSchema = z
  .string()
  .max(2000)
  .transform((value) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DIDASCALIA),
  )
  .transform((value) => value || null);

const CAMPO_DIDASCALIA = /^didascalia-([a-z0-9]{20,40})$/;

/**
 * Сменените надписи от тялото: `didascalia-<id>`, различен от `prima-<id>` (надписът при отварянето на
 * страницата) — непипаното не се записва, затова не връща надпис, сменен междувременно от друг. Без
 * JavaScript Enter в кой да е надпис праща всички; с него — само своя. Счупено поле → null (400).
 */
export function modificheDi(body: Record<string, unknown>): Map<string, string | null> | null {
  const modifiche = new Map<string, string | null>();
  for (const [campo, raw] of Object.entries(body)) {
    const id = CAMPO_DIDASCALIA.exec(campo)?.[1];
    if (!id) continue;
    const nuova = didascaliaSchema.safeParse(raw);
    if (!nuova.success) return null;
    const prima = didascaliaSchema.safeParse(body[`prima-${id}`]);
    if (prima.success && prima.data === nuova.data) continue;
    modifiche.set(id, nuova.data);
  }
  return modifiche;
}

/** Името на качения файл за показ: без път и управляващи знаци, до 200 знака. */
export function nomeSicuro(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const clean = base
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (clean || 'file').slice(0, 200);
}

/** Файловете на картата по реда на качването (галериите на разделите, печатът, PDF-ът). */
export function allegatiDi(schedaId: string): Promise<AllegatoVista[]> {
  return prisma.allegato.findMany({
    where: { schedaId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: VISTA,
  });
}

export async function allegatoDi(schedaId: string, id: string): Promise<Allegato | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return prisma.allegato.findFirst({ where: { id, schedaId } });
}

export interface Caricato {
  /** Каченото в `arrivi/` (multer). */
  temp: string;
  nome: string;
  byte: number;
  tipo: TipoAllegato;
}

export type EsitoCarica =
  { ok: true; ids: string[] } | { ok: false; error: 'limite' | 'scheda' | 'spostamento' };

/**
 * Id на нов файл от приложението (малки букви и цифри, като тези на Prisma): времето отпред и редът в
 * качването след него — файловете от едно качване (един и същ `createdAt`) остават в реда си.
 */
function nuoviId(n: number): string[] {
  const tempo = Date.now().toString(36);
  return Array.from(
    { length: n },
    (_, i) => `c${tempo}${String(i).padStart(2, '0')}${randomBytes(8).toString('hex')}`,
  );
}

/**
 * Записът: каченото отива първо на мястото си, после редовете (в опашката) и одитът — в една
 * транзакция. Така фоновият процес никога не вижда ред без файла му. Картата се проверява пак вътре
 * (`FOR SHARE` — окончателното ѝ изтриване чака): качване, което е текло минути, не стига до карта,
 * преместена междувременно в кошчето или изтрита. Отказаното не оставя нито ред, нито файл.
 */
export async function aggiungiAllegati(
  scheda: { id: string; aziendaId: string },
  sezione: SectionKey,
  didascalia: string | null,
  files: readonly Caricato[],
  actorId: string,
): Promise<EsitoCarica> {
  await mkdir(cartellaScheda(scheda.id), { recursive: true });
  const ids = nuoviId(files.length);
  const spostati: Array<{ file: Caricato; id: string; originale: string }> = [];
  for (const [i, file] of files.entries()) {
    const id = ids[i]!;
    const originale = percorsi({ id, schedaId: scheda.id, tipo: file.tipo }).originale;
    try {
      await rename(file.temp, originale);
      spostati.push({ file, id, originale });
    } catch {
      await rm(file.temp, { force: true });
    }
  }
  if (spostati.length === 0) return { ok: false, error: 'spostamento' };
  const esito = await prisma.$transaction(async (tx) => {
    const viva = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Scheda" WHERE id = ${scheda.id} AND "deletedAt" IS NULL FOR SHARE`;
    if (viva.length === 0) return 'scheda' as const;
    const count = await tx.allegato.count({ where: { schedaId: scheda.id } });
    if (count + spostati.length > MAX_PER_SCHEDA) return 'limite' as const;
    await tx.allegato.createMany({
      data: spostati.map(({ file, id }) => ({
        id,
        schedaId: scheda.id,
        sezione,
        tipo: file.tipo,
        didascalia,
        nomeOriginale: file.nome,
        byteOriginali: file.byte,
        caricatoDaId: actorId,
      })),
    });
    await writeAudit(
      {
        actorId,
        action: 'ALLEGATO_UPLOAD',
        aziendaId: scheda.aziendaId,
        targetType: 'scheda',
        targetId: scheda.id,
        meta: {
          sezione,
          foto: spostati.filter((s) => s.file.tipo === 'FOTO').length,
          video: spostati.filter((s) => s.file.tipo === 'VIDEO').length,
        },
      },
      tx,
    );
    return 'ok' as const;
  });
  if (esito !== 'ok') {
    await Promise.all(spostati.map((s) => rm(s.originale, { force: true })));
    return { ok: false, error: esito };
  }
  return { ok: true, ids: spostati.map((s) => s.id) };
}

/**
 * Надписите, сменени от човека (маршрутът сравнява с надписа при отварянето на страницата): записва се
 * само различното от записаното — в една транзакция, с един ред в одита. Чужд id не пипа нищо.
 */
export async function salvaDidascalie(
  scheda: { id: string; aziendaId: string },
  modifiche: ReadonlyMap<string, string | null>,
  actorId: string,
): Promise<number> {
  if (modifiche.size === 0) return 0;
  return prisma.$transaction(async (tx) => {
    const attuali = await tx.allegato.findMany({
      where: { schedaId: scheda.id, id: { in: [...modifiche.keys()] } },
      select: { id: true, didascalia: true },
    });
    let n = 0;
    for (const row of attuali) {
      const didascalia = modifiche.get(row.id) ?? null;
      if (didascalia === row.didascalia) continue;
      await tx.allegato.update({ where: { id: row.id }, data: { didascalia } });
      n += 1;
    }
    if (n > 0)
      await writeAudit(
        {
          actorId,
          action: 'ALLEGATO_UPDATE',
          aziendaId: scheda.aziendaId,
          targetType: 'scheda',
          targetId: scheda.id,
          meta: { n },
        },
        tx,
      );
    return n;
  });
}

/** Редът и одитът — заедно; файловете — след това (липсващ файл не е грешка). */
export async function eliminaAllegato(
  scheda: { id: string; aziendaId: string },
  id: string,
  actorId: string,
): Promise<boolean> {
  const removed = await prisma.$transaction(async (tx) => {
    const row = await tx.allegato.findFirst({
      where: { id, schedaId: scheda.id },
      select: { id: true, schedaId: true, tipo: true, sezione: true },
    });
    if (!row) return null;
    await tx.allegato.delete({ where: { id: row.id } });
    await writeAudit(
      {
        actorId,
        action: 'ALLEGATO_DELETE',
        aziendaId: scheda.aziendaId,
        targetType: 'scheda',
        targetId: scheda.id,
        meta: { sezione: row.sezione, tipo: row.tipo },
      },
      tx,
    );
    return row;
  });
  if (!removed) return false;
  await rimuoviFile(percorsi(removed));
  return true;
}
