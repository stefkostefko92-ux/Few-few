import type { Prisma, StatoApprovazione } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { schedaScope, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';

/**
 * Одобрението на две стъпки (собственикът, 12 ноември 2026 — точка C7): във фирма, която го е включила
 * (`Azienda.approvazioneSchede`, администраторът ѝ, по подразбиране — не), техникът праща картата, а
 * който има `schede:approve` (по подразбиране RESPONSABILE нагоре) я одобрява или връща с бележка — и
 * никога своята пратена (четири очи; MASTER — да). Поръчка към доставчика от портала тръгва само от одобрена
 * карта (ordini/invio.ts). Промяна на одобрена карта я връща в чернова (`riapriApprovazione`). Липсващото
 * състояние е чернова. Одит `SCHEDA_INVIATA/APPROVATA/RESPINTA`.
 */
export const MAX_NOTA = 1000;

export type EsitoApprovazione = 'ok' | 'stato' | 'stessa' | 'missing' | 'spenta';

type Scheda = { id: string; aziendaId: string; statoApprovazione: StatoApprovazione | null };

/** Може ли да тръгне поръчка от картата: без одобрение във фирмата — винаги; иначе само одобрена. */
export const ordineConsentito = (
  scheda: { statoApprovazione: StatoApprovazione | null },
  azienda: { approvazioneSchede: boolean },
): boolean => !azienda.approvazioneSchede || scheda.statoApprovazione === 'APPROVATA';

export async function riapriApprovazione(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.scheda.updateMany({
    where: { id, statoApprovazione: 'APPROVATA' },
    data: { statoApprovazione: 'BOZZA', approvazioneAt: null, approvazioneDaId: null },
  });
}

async function caricata(scope: Scope, id: string) {
  return prisma.scheda.findFirst({
    where: { id, deletedAt: null, ...schedaScope(scope) },
    select: {
      id: true,
      aziendaId: true,
      statoApprovazione: true,
      azienda: { select: { approvazioneSchede: true } },
    },
  });
}

/** Състоянието се сменя само ако е още онова, от което тръгва (две заявки наведнъж — една минава). */
async function passa(
  scheda: Scheda,
  da: ReadonlyArray<StatoApprovazione | null>,
  data: Prisma.SchedaUncheckedUpdateManyInput,
  audit: { actorId: string; action: 'SCHEDA_INVIATA' | 'SCHEDA_APPROVATA' | 'SCHEDA_RESPINTA' },
): Promise<EsitoApprovazione> {
  const stati = da.filter((s): s is StatoApprovazione => s !== null);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.scheda.updateMany({
      where: {
        id: scheda.id,
        deletedAt: null,
        OR: [
          { statoApprovazione: { in: stati } },
          ...(da.includes(null) ? [{ statoApprovazione: null }] : []),
        ],
      },
      data,
    });
    if (count === 0) return 'stato';
    await writeAudit(
      {
        actorId: audit.actorId,
        action: audit.action,
        aziendaId: scheda.aziendaId,
        targetType: 'scheda',
        targetId: scheda.id,
      },
      tx,
    );
    return 'ok';
  });
}

/** Техникът праща за одобрение: от чернова или върната. */
export async function inviaApprovazione(
  scope: Scope,
  id: string,
  actorId: string,
): Promise<EsitoApprovazione> {
  const s = await caricata(scope, id);
  if (!s) return 'missing';
  if (!s.azienda.approvazioneSchede) return 'spenta';
  return passa(
    s,
    [null, 'BOZZA', 'RESPINTA'],
    { statoApprovazione: 'INVIATA', notaApprovazione: null },
    { actorId, action: 'SCHEDA_INVIATA' },
  );
}

/** Кой е пратил картата последен — той не я одобрява сам. */
async function mittente(id: string): Promise<string | null> {
  const riga = await prisma.auditLog.findFirst({
    where: { targetType: 'scheda', targetId: id, action: 'SCHEDA_INVIATA' },
    orderBy: { at: 'desc' },
    select: { actorId: true },
  });
  return riga?.actorId ?? null;
}

export async function decidiApprovazione(
  scope: Scope,
  id: string,
  actor: { id: string; master: boolean },
  decisione: 'approva' | 'respingi',
  nota: string | null,
): Promise<EsitoApprovazione> {
  const s = await caricata(scope, id);
  if (!s) return 'missing';
  if (!s.azienda.approvazioneSchede) return 'spenta';
  if (!actor.master && (await mittente(id)) === actor.id) return 'stessa';
  return decisione === 'approva'
    ? passa(
        s,
        ['INVIATA'],
        {
          statoApprovazione: 'APPROVATA',
          approvazioneAt: new Date(),
          approvazioneDaId: actor.id,
          notaApprovazione: nota,
        },
        { actorId: actor.id, action: 'SCHEDA_APPROVATA' },
      )
    : passa(
        s,
        ['INVIATA'],
        { statoApprovazione: 'RESPINTA', approvazioneDaId: actor.id, notaApprovazione: nota },
        { actorId: actor.id, action: 'SCHEDA_RESPINTA' },
      );
}

/** Картите за одобрение в обхвата на човека (пратените), най-старите първи. */
export function daApprovare(scope: Scope) {
  return prisma.scheda.findMany({
    where: {
      deletedAt: null,
      statoApprovazione: 'INVIATA',
      azienda: { approvazioneSchede: true },
      ...schedaScope(scope),
    },
    orderBy: { updatedAt: 'asc' },
    take: 200,
    select: {
      id: true,
      indirizzo: true,
      matricola: true,
      numeroImpianto: true,
      updatedAt: true,
      azienda: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
  });
}

/** Колко карти чакат одобрение в обхвата — лентата над списъка на картите. */
export function contaDaApprovare(scope: Scope): Promise<number> {
  return prisma.scheda.count({
    where: {
      deletedAt: null,
      statoApprovazione: 'INVIATA',
      azienda: { approvazioneSchede: true },
      ...schedaScope(scope),
    },
  });
}
