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

export type EsitoCarica = { ok: true; ids: string[] } | { ok: false; error: 'limite' };

/**
 * Записът: редовете (в опашката) и одитът — в една транзакция; после каченото отива на мястото си.
 * Файл, който не може да се премести, не оставя ред след себе си.
 */
export async function aggiungiAllegati(
  scheda: { id: string; aziendaId: string },
  sezione: SectionKey,
  didascalia: string | null,
  files: readonly Caricato[],
  actorId: string,
): Promise<EsitoCarica> {
  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.allegato.count({ where: { schedaId: scheda.id } });
    if (count + files.length > MAX_PER_SCHEDA) return null;
    const rows = [];
    for (const file of files) {
      rows.push(
        await tx.allegato.create({
          data: {
            schedaId: scheda.id,
            sezione,
            tipo: file.tipo,
            didascalia,
            nomeOriginale: file.nome,
            byteOriginali: file.byte,
            caricatoDaId: actorId,
          },
          select: { id: true, schedaId: true, tipo: true },
        }),
      );
    }
    await writeAudit(
      {
        actorId,
        action: 'ALLEGATO_UPLOAD',
        aziendaId: scheda.aziendaId,
        targetType: 'scheda',
        targetId: scheda.id,
        meta: {
          sezione,
          foto: files.filter((f) => f.tipo === 'FOTO').length,
          video: files.filter((f) => f.tipo === 'VIDEO').length,
        },
      },
      tx,
    );
    return rows;
  });
  if (!created) return { ok: false, error: 'limite' };
  await mkdir(cartellaScheda(scheda.id), { recursive: true });
  const ids: string[] = [];
  for (const [i, row] of created.entries()) {
    try {
      await rename(files[i]!.temp, percorsi(row).originale);
      ids.push(row.id);
    } catch {
      await prisma.allegato.deleteMany({ where: { id: row.id } });
      await rm(files[i]!.temp, { force: true });
    }
  }
  return { ok: true, ids };
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
