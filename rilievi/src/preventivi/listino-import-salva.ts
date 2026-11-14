import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { MAX_VOCI, type VoceData } from './listino.js';
import type { RigaImport } from './listino-import.js';

/**
 * Записът на внесения ценоразпис (четенето — listino-import.ts): какво би станало (`pianoImport`, без
 * запис) и самият запис (`importaListino`) — всички редове или нито един, под заключения ред на фирмата
 * (таванът не се минава и два записа не се разминават). Ред с код, който го има в ценоразписа, обновява онзи
 * ред; ред без код, еднакъв с ред без код, който вече го има (или с по-ранен в поставеното), не се добавя
 * втори път — същият лист, внесен пак, не удвоява нищо; всичко друго се добавя. Обновяването е ЕДНА заявка
 * (до 1000 реда един по един биха минали таймаута на транзакцията). Одитът — само броят, без цените.
 */

export interface PianoImport {
  nuove: number;
  aggiornate: number;
  /** Редове без код, които вече са в ценоразписа точно такива — не се добавят пак. */
  uguali: number;
  /** Колко реда има сега и колко ще станат. */
  presenti: number;
  dopo: number;
}

type Db = Pick<typeof prisma, 'voceListino'>;

const chiave = (v: { descrizione: string; unita: string; prezzo: number; iva: number }): string =>
  JSON.stringify([v.descrizione, v.unita, v.prezzo, v.iva]);

/** Кой ред какво става: обновява (по кода), пропуска се (без код, вече го има), добавя се. */
async function ripartisci(db: Db, aziendaId: string, righe: readonly RigaImport[]) {
  const codici = righe.map((r) => r.data.codice).filter((c): c is string => c !== null);
  const [conCodice, senzaCodice] = await Promise.all([
    codici.length === 0
      ? []
      : db.voceListino.findMany({
          where: { aziendaId, codice: { in: codici } },
          select: { id: true, codice: true },
        }),
    righe.some((r) => r.data.codice === null)
      ? db.voceListino.findMany({
          where: { aziendaId, codice: null },
          select: { descrizione: true, unita: true, prezzo: true, iva: true },
        })
      : [],
  ]);
  const idPerCodice = new Map(conCodice.map((v) => [v.codice!, v.id]));
  const presenti = new Set(senzaCodice.map(chiave));
  const daAggiornare: Array<{ id: string; data: VoceData }> = [];
  const daCreare: VoceData[] = [];
  let uguali = 0;
  for (const { data } of righe) {
    const id = data.codice === null ? undefined : idPerCodice.get(data.codice);
    if (id !== undefined) daAggiornare.push({ id, data });
    else if (data.codice === null && presenti.has(chiave(data))) uguali += 1;
    else {
      if (data.codice === null) presenti.add(chiave(data));
      daCreare.push(data);
    }
  }
  return { daAggiornare, daCreare, uguali };
}

/** Какво би станало при записа: колко нови реда, колко обновени и колко вече налични. Нищо не се пише. */
export async function pianoImport(
  aziendaId: string,
  righe: readonly RigaImport[],
): Promise<PianoImport> {
  const [parti, presenti] = await Promise.all([
    ripartisci(prisma, aziendaId, righe),
    prisma.voceListino.count({ where: { aziendaId } }),
  ]);
  return {
    nuove: parti.daCreare.length,
    aggiornate: parti.daAggiornare.length,
    uguali: parti.uguali,
    presenti,
    dopo: presenti + parti.daCreare.length,
  };
}

export type EsitoImport =
  { esito: 'ok'; nuove: number; aggiornate: number } | { esito: 'missing' } | { esito: 'pieno' };

export async function importaListino(
  actorId: string,
  aziendaId: string,
  righe: readonly RigaImport[],
): Promise<EsitoImport> {
  return prisma.$transaction(
    async (tx): Promise<EsitoImport> => {
      // Само при включени оферти и активна фирма — под заключения ред (както `salvaVoce`).
      const azienda = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Azienda"
        WHERE "id" = ${aziendaId} AND "preventiviAttivi" AND "deactivatedAt" IS NULL
        FOR UPDATE`;
      if (azienda.length === 0) return { esito: 'missing' };
      const { daAggiornare, daCreare } = await ripartisci(tx, aziendaId, righe);
      const presenti = await tx.voceListino.count({ where: { aziendaId } });
      if (presenti + daCreare.length > MAX_VOCI) return { esito: 'pieno' };
      if (daAggiornare.length > 0) {
        const valori = daAggiornare.map(
          ({ id, data }) =>
            Prisma.sql`(${id}, ${data.descrizione}, ${data.unita}, ${data.prezzo}::int, ${data.iva}::int)`,
        );
        await tx.$executeRaw`
          UPDATE "VoceListino" AS v
          SET "descrizione" = n."descrizione", "unita" = n."unita", "prezzo" = n."prezzo",
              "iva" = n."iva", "updatedAt" = now()
          FROM (VALUES ${Prisma.join(valori)}) AS n("id", "descrizione", "unita", "prezzo", "iva")
          WHERE v."id" = n."id" AND v."aziendaId" = ${aziendaId}`;
      }
      if (daCreare.length > 0)
        await tx.voceListino.createMany({ data: daCreare.map((data) => ({ ...data, aziendaId })) });
      await writeAudit(
        {
          actorId,
          action: 'LISTINO_UPDATE',
          aziendaId,
          targetType: 'azienda',
          targetId: aziendaId,
          meta: { azione: 'importazione', nuove: daCreare.length, aggiornate: daAggiornare.length },
        },
        tx,
      );
      return { esito: 'ok', nuove: daCreare.length, aggiornate: daAggiornare.length };
    },
    // Заключеният ред на фирмата може да се чака (друг запис в ценоразписа); записът на 1000 реда не е миг.
    { timeout: 30_000, maxWait: 10_000 },
  );
}
