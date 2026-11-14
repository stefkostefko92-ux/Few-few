import type { Prisma, StatoPreventivo } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { colonneDi } from './dati.js';
import type { PreventivoData } from './form.js';

/**
 * Офертата в базата (C1). Номерът е на фирмата, от 1 — броячът `Azienda.preventiviNumero` се увеличава в
 * транзакцията на новата оферта (UPDATE … RETURNING заключва реда на фирмата), САМО ако MASTER е
 * включил офертите и фирмата е активна. Сборовете се смятат тук от редовете (`colonneDi`), никога от
 * пратеното. Промяна — само върху отворената версия (`base` = updatedAt) и само в „Bozza“ или „Inviato“:
 * приетата или отказаната оферта е документ — за промяна първо се връща в „Inviato“. Изтрива се само
 * чернова. Одитът — в същата транзакция, без клиента и без сумите.
 */

export const STATI = [
  'BOZZA',
  'INVIATO',
  'ACCETTATO',
  'RIFIUTATO',
] as const satisfies readonly StatoPreventivo[];
export const MODIFICABILI: readonly StatoPreventivo[] = ['BOZZA', 'INVIATO'];

/** Позволените преходи: към „Inviato“ от черновата и обратно от изхода (грешно отбелязан), изходът — от „Inviato“. */
const PASSAGGI: Readonly<Record<StatoPreventivo, readonly StatoPreventivo[]>> = {
  BOZZA: ['INVIATO'],
  INVIATO: ['ACCETTATO', 'RIFIUTATO'],
  ACCETTATO: ['INVIATO'],
  RIFIUTATO: ['INVIATO'],
};
export const passaggiDa = (stato: StatoPreventivo): readonly StatoPreventivo[] => PASSAGGI[stato];
export const isStato = (value: unknown): value is StatoPreventivo =>
  typeof value === 'string' && (STATI as readonly string[]).includes(value);

export type EsitoPreventivo =
  | { esito: 'ok'; id: string; numero: number }
  | { esito: 'spento' | 'scheda' | 'conflict' | 'bloccato' | 'missing' };

/** Нова оферта; `schedaId` — картата, от която е попълнена (маршрутът я е проверил), тук — пак. */
export function createPreventivo(options: {
  data: PreventivoData;
  actorId: string;
  aziendaId: string;
  schedaId: string | null;
}): Promise<EsitoPreventivo> {
  const { data, actorId, aziendaId, schedaId } = options;
  return prisma
    .$transaction(async (tx) => {
      // Редът на фирмата се заключва до края: две оферти едновременно вземат два номера.
      const [counter] = await tx.$queryRaw<Array<{ numero: number }>>`
      UPDATE "Azienda" SET "preventiviNumero" = "preventiviNumero" + 1
      WHERE "id" = ${aziendaId} AND "preventiviAttivi" AND "deactivatedAt" IS NULL
      RETURNING "preventiviNumero" AS numero`;
      if (!counter) return { esito: 'spento' } as const;
      if (schedaId) {
        const scheda = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Scheda"
        WHERE "id" = ${schedaId} AND "aziendaId" = ${aziendaId} AND "deletedAt" IS NULL
        FOR SHARE`;
        // Без картата — нищо: и номерът се връща с транзакцията.
        if (scheda.length === 0) throw new SchedaSparita();
      }
      const row = await tx.preventivo.create({
        data: {
          ...colonneDi(data, counter.numero),
          aziendaId,
          schedaId,
          numero: counter.numero,
          createdById: actorId,
          updatedById: actorId,
        },
        select: { id: true },
      });
      await audit(tx, actorId, 'PREVENTIVO_CREATE', aziendaId, row.id, { numero: counter.numero });
      return { esito: 'ok', id: row.id, numero: counter.numero } as const;
    })
    .catch((error: unknown) => {
      if (error instanceof SchedaSparita) return { esito: 'scheda' } as const;
      throw error;
    });
}

class SchedaSparita extends Error {
  constructor() {
    super('scheda');
  }
}

/** Промяна върху отворената версия; `bloccato` — офертата вече е приета или отказана. */
export function updatePreventivo(options: {
  id: string;
  aziendaId: string;
  base: string;
  data: PreventivoData;
  actorId: string;
}): Promise<EsitoPreventivo> {
  const { id, aziendaId, data, actorId } = options;
  const base = new Date(options.base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.preventivo.findFirst({
      where: { id, aziendaId },
      select: { numero: true, stato: true, updatedAt: true },
    });
    if (!current) return { esito: 'missing' } as const;
    if (Number.isNaN(base.getTime()) || current.updatedAt.getTime() !== base.getTime())
      return { esito: 'conflict' } as const;
    if (!MODIFICABILI.includes(current.stato)) return { esito: 'bloccato' } as const;
    const updated = await tx.preventivo.updateMany({
      where: { id, aziendaId, updatedAt: base, stato: { in: [...MODIFICABILI] } },
      data: { ...colonneDi(data, current.numero), updatedById: actorId },
    });
    if (updated.count === 0) return { esito: 'conflict' } as const;
    await audit(tx, actorId, 'PREVENTIVO_UPDATE', aziendaId, id, { numero: current.numero });
    return { esito: 'ok', id, numero: current.numero } as const;
  });
}

/** Нов статус — само по позволен преход от сегашния (условието е в самия UPDATE). */
export async function cambiaStato(options: {
  id: string;
  aziendaId: string;
  da: StatoPreventivo;
  a: StatoPreventivo;
  actorId: string;
}): Promise<boolean> {
  const { id, aziendaId, da, a, actorId } = options;
  if (!PASSAGGI[da].includes(a)) return false;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.preventivo.updateMany({
      where: { id, aziendaId, stato: da },
      data: { stato: a, statoAt: new Date(), updatedById: actorId },
    });
    if (updated.count === 0) return false;
    await audit(tx, actorId, 'PREVENTIVO_STATO', aziendaId, id, { da, a });
    return true;
  });
}

/** Тръгналото писмо: одитът (без адреса) и черновата става „Inviato“. */
export async function registraInvio(actorId: string, aziendaId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.preventivo.updateMany({
      where: { id, aziendaId, stato: 'BOZZA' },
      data: { stato: 'INVIATO', statoAt: new Date() },
    });
    await audit(tx, actorId, 'PREVENTIVO_EMAIL', aziendaId, id, {
      ...(updated.count > 0 ? { inviato: true } : {}),
    });
  });
}

/** Изтрива черновата (одитът пази номера); приета/пратена оферта не се трие. */
export async function eliminaPreventivo(
  actorId: string,
  aziendaId: string,
  id: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.preventivo.findFirst({
      where: { id, aziendaId, stato: 'BOZZA' },
      select: { numero: true },
    });
    if (!row) return false;
    const deleted = await tx.preventivo.deleteMany({ where: { id, aziendaId, stato: 'BOZZA' } });
    if (deleted.count === 0) return false;
    await audit(tx, actorId, 'PREVENTIVO_DELETE', aziendaId, id, { numero: row.numero });
    return true;
  });
}

function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action:
    | 'PREVENTIVO_CREATE'
    | 'PREVENTIVO_UPDATE'
    | 'PREVENTIVO_STATO'
    | 'PREVENTIVO_DELETE'
    | 'PREVENTIVO_EMAIL',
  aziendaId: string,
  id: string,
  meta: Prisma.InputJsonObject,
) {
  return writeAudit(
    { actorId, action, aziendaId, targetType: 'preventivo', targetId: id, meta },
    tx,
  );
}
