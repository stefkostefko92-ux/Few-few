import { writeAudit } from '../audit.js';
import { isLivello, type Livello } from '../abbonamenti/regole.js';
import { prisma } from '../db.js';

/**
 * Плановете Premium (#31): ниво по брой хора, срок 1–36 месеца, цена в евро БЕЗ ДДС (цели центове). Задава ги MASTER;
 * изключеният не се предлага, но плащанията го помнят — не се трие никога. Одит: нивото, срокът и цената.
 */
export interface DatiPiano {
  livello: Livello;
  mesi: number;
  prezzoCent: number;
}

/** „1.290,50“, „1290.5“, „290“ → центове; иначе null (от 1 до 100 000 €). */
export function prezzoDa(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim().replace(/\s|€/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  const cent = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return cent >= 100 && cent <= 10_000_000 ? cent : null;
}

export function leggiPiano(body: Record<string, unknown>): DatiPiano | null {
  const livello = Number(body.livello);
  const mesi = Number(body.mesi);
  const prezzoCent = prezzoDa(body.prezzo);
  if (!isLivello(livello) || !Number.isInteger(mesi) || mesi < 1 || mesi > 36 || !prezzoCent)
    return null;
  return { livello, mesi, prezzoCent };
}

export const pianiAttivi = () =>
  prisma.pianoAbbonamento.findMany({
    where: { attivo: true },
    orderBy: [{ livello: 'asc' }, { mesi: 'asc' }, { prezzoCent: 'asc' }],
  });

export const tuttiIPiani = () =>
  prisma.pianoAbbonamento.findMany({
    orderBy: [{ attivo: 'desc' }, { livello: 'asc' }, { mesi: 'asc' }],
  });

export async function creaPiano(actorId: string, d: DatiPiano): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.pianoAbbonamento.create({ data: d });
    await writeAudit(
      {
        actorId,
        action: 'PIANO_CREATO',
        aziendaId: null,
        targetType: 'piano',
        targetId: p.id,
        meta: { livello: d.livello, mesi: d.mesi, prezzoCent: d.prezzoCent },
      },
      tx,
    );
  });
}

export async function attivaPiano(actorId: string, id: string, attivo: boolean): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.pianoAbbonamento.updateMany({ where: { id }, data: { attivo } });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'PIANO_MODIFICATO',
        aziendaId: null,
        targetType: 'piano',
        targetId: id,
        meta: { attivo },
      },
      tx,
    );
    return true;
  });
}
