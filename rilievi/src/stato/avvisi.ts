import type { TipoAvvisoStato } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { momentoRoma } from '../master/tempo.js';

/**
 * Съобщенията на `/stato`, написани от MASTER (`/master/stato`): прекъсване (краят — когато мине; празен —
 * още трае) или планирана поддръжка (с начало и край). Часовете — по Рим, от `datetime-local`. Не се трият:
 * историята е на страницата. Одит `STATO_AVVISO` без текста.
 */

export const TIPI = ['INTERRUZIONE', 'MANUTENZIONE'] as const satisfies readonly TipoAvvisoStato[];
export const MAX_TITOLO = 160;
export const MAX_TESTO = 2000;

export interface AvvisoData {
  tipo: TipoAvvisoStato;
  titolo: string;
  testo: string;
  inizio: Date;
  fine: Date | null;
}
export type ErroriAvviso = Partial<
  Record<keyof AvvisoData, 'required' | 'tooLong' | 'data' | 'ordine' | 'option'>
>;

const pulito = (v: unknown): string =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .replace(/\r\n?/g, '\n')
        .trim()
    : '';

export function parseAvviso(
  body: unknown,
): { ok: true; data: AvvisoData } | { ok: false; errors: ErroriAvviso } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: ErroriAvviso = {};
  const tipo = z.enum(TIPI).safeParse(raw.tipo);
  if (!tipo.success) errors.tipo = 'option';
  const titolo = pulito(raw.titolo).replace(/\s+/g, ' ');
  if (!titolo) errors.titolo = 'required';
  else if (titolo.length > MAX_TITOLO) errors.titolo = 'tooLong';
  const testo = pulito(raw.testo);
  if (!testo) errors.testo = 'required';
  else if (testo.length > MAX_TESTO) errors.testo = 'tooLong';
  const inizioRaw = pulito(raw.inizio);
  const inizio = inizioRaw ? momentoRoma(inizioRaw) : null;
  if (!inizioRaw) errors.inizio = 'required';
  else if (!inizio) errors.inizio = 'data';
  const fineRaw = pulito(raw.fine);
  const fine = fineRaw ? momentoRoma(fineRaw) : null;
  if (fineRaw && !fine) errors.fine = 'data';
  else if (!fineRaw && tipo.success && tipo.data === 'MANUTENZIONE') errors.fine = 'required';
  else if (fine && inizio && fine.getTime() <= inizio.getTime()) errors.fine = 'ordine';
  if (Object.keys(errors).length > 0 || !tipo.success || !inizio) return { ok: false, errors };
  return { ok: true, data: { tipo: tipo.data, titolo, testo, inizio, fine } };
}

export function elencoAvvisi() {
  return prisma.avvisoStato.findMany({
    orderBy: { inizio: 'desc' },
    take: 100,
    include: { createdBy: { select: { name: true } } },
  });
}

/** Ново (`id` null) или промяна; false — няма такова. */
export async function salvaAvviso(
  actorId: string,
  id: string | null,
  data: AvvisoData,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    let targetId = id;
    if (id === null) {
      targetId = (
        await tx.avvisoStato.create({
          data: { ...data, createdById: actorId },
          select: { id: true },
        })
      ).id;
    } else {
      const updated = await tx.avvisoStato.updateMany({ where: { id }, data });
      if (updated.count === 0) return false;
    }
    await writeAudit(
      {
        actorId,
        action: 'STATO_AVVISO',
        aziendaId: null,
        targetType: 'avviso',
        targetId: targetId!,
        meta: { tipo: data.tipo, nuovo: id === null, chiuso: data.fine !== null },
      },
      tx,
    );
    return true;
  });
}
