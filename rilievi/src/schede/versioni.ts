import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * Версиите на картата (собственикът, 12 ноември 2026 — точка C4): след всеки запис — снимка на полетата и
 * мерките по спирки (JSON), в транзакцията на записа (редът на картата е заключен — номерата не се
 * разминават). Еднаква с последната (само изборът на снимките) — не се пази. Последните `MAX_VERSIONI`.
 * Разликите — `differenze`, страницата — routes/schede-versioni.ts.
 */
export const MAX_VERSIONI = 100;

/** Колоните, които не са съдържание на картата: връзки, служебни, търсачката, одобрението. */
const ESCLUSI = new Set([
  'id',
  'aziendaId',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'deletedAt',
  'deletedById',
  'searchText',
  'fotoStampate',
  'statoApprovazione',
  'approvazioneAt',
  'approvazioneDaId',
  'notaApprovazione',
]);

export type Istantanea = Record<string, Prisma.JsonValue>;

/** Редът като JSON: Decimal — низ, дата — ISO; без служебните колони. */
export function istantanea(row: Record<string, unknown>): Istantanea {
  const out: Istantanea = {};
  for (const [k, v] of Object.entries(row)) {
    if (ESCLUSI.has(k) || v === undefined) continue;
    out[k] = JSON.parse(JSON.stringify(v ?? null)) as Prisma.JsonValue;
  }
  return out;
}

export async function salvaVersione(
  tx: Prisma.TransactionClient,
  schedaId: string,
  autoreId: string,
): Promise<void> {
  const row = await tx.scheda.findUnique({
    where: { id: schedaId },
    include: {
      misureBottoniere: {
        orderBy: { fermata: 'asc' },
        omit: { id: true, schedaId: true },
      },
    },
  });
  if (!row) return;
  const dati = istantanea(row as unknown as Record<string, unknown>);
  const ultima = await tx.schedaVersione.findFirst({
    where: { schedaId },
    orderBy: { numero: 'desc' },
    select: { numero: true, dati: true },
  });
  if (ultima && JSON.stringify(ultima.dati) === JSON.stringify(dati)) return;
  const numero = (ultima?.numero ?? 0) + 1;
  await tx.schedaVersione.create({ data: { schedaId, numero, autoreId, dati } });
  if (numero > MAX_VERSIONI) {
    await tx.schedaVersione.deleteMany({
      where: { schedaId, numero: { lte: numero - MAX_VERSIONI } },
    });
  }
}

export interface Differenza {
  key: string;
  prima: Prisma.JsonValue;
  dopo: Prisma.JsonValue;
}

/** Ключовете с различна стойност — в реда на `dopo`, после изчезналите. */
export function differenze(prima: Istantanea | null, dopo: Istantanea): Differenza[] {
  const out: Differenza[] = [];
  const uguale = (a: Prisma.JsonValue | undefined, b: Prisma.JsonValue | undefined) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const [key, v] of Object.entries(dopo)) {
    if (!uguale(prima?.[key], v)) out.push({ key, prima: prima?.[key] ?? null, dopo: v });
  }
  for (const [key, v] of Object.entries(prima ?? {})) {
    if (!(key in dopo) && v !== null) out.push({ key, prima: v, dopo: null });
  }
  return out;
}

export function elencoVersioni(schedaId: string) {
  return prisma.schedaVersione.findMany({
    where: { schedaId },
    orderBy: { numero: 'desc' },
    select: { numero: true, at: true, autore: { select: { name: true } } },
  });
}

/** Версията и предишната ѝ (null — първата). */
export async function versioneConPrecedente(schedaId: string, numero: number) {
  const [v, prev] = await Promise.all([
    prisma.schedaVersione.findUnique({
      where: { schedaId_numero: { schedaId, numero } },
      select: { numero: true, at: true, dati: true, autore: { select: { name: true } } },
    }),
    prisma.schedaVersione.findFirst({
      where: { schedaId, numero: { lt: numero } },
      orderBy: { numero: 'desc' },
      select: { dati: true },
    }),
  ]);
  if (!v) return null;
  return { ...v, precedente: (prev?.dati as Istantanea | undefined) ?? null };
}
