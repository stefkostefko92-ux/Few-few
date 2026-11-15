import type { Pagamento, Prisma, Rimborso } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { avvisaRimborso, avvisaRimborsoFallito } from './avvisi-rimborsi.js';
import { clientePer } from './config.js';
import { avvisaNoteCredito, registraNotaCredito } from './note-credito.js';
import { ErroreRevolut, rimborsaOrdine, type OrdineRevolut } from './revolut.js';
import { ripartisci, type OrdinePagato } from './rimborsi-riparto.js';

/**
 * Връщането през Revolut (условията 2026-11-13, чл. 12.9 — „sullo stesso mezzo di pagamento“): MASTER нарежда
 * сумата; тя отива върху поръчката на плащането, а каквото надхвърля платеното по нея (надграждане с кредит по
 * чл. 12.4) — върху поръчките, от които идва кредитът (rimborsi-riparto.ts). Всяка част е ред `Rimborso`, чийто id
 * е Idempotency-Key: повторено нареждане не връща два пъти. Revolut обработва връщането до 2 дни — плащането става
 * „RIMBORSATO“ едва когато поръчката за връщане се прочете като `completed` (веднага, от подписания webhook или от
 * поддръжката — rimborsi-riconcilia.ts). Отказано връщане не променя нищо и се казва (одит, писмо, аларма).
 */
const RIMBORSABILI: readonly Pagamento['stato'][] = ['COMPLETATO', 'DA_VERIFICARE'];
const DESCRIZIONE = 'Rilievi Impianti — rimborso (art. 12.9 delle Condizioni)';
type Tx = Prisma.TransactionClient;

type OrdineDi = OrdinePagato & { revolutOrderId: string };

/** Поръчките, върху които може да отиде връщането за `p`: то самото, после тези, от които идва кредитът му. */
async function ordiniDi(tx: Tx, p: Pagamento): Promise<OrdineDi[]> {
  const catena: Pagamento[] = [p];
  // Само платено плащане носи кредит от други; чакащото MASTER се връща от собствената си поръчка.
  let daVedere = p.stato === 'COMPLETATO' ? p.creditoDa : [];
  for (let giro = 0; giro < 5 && daVedere.length > 0; giro += 1) {
    const altri = await tx.pagamento.findMany({
      where: {
        id: { in: daVedere, notIn: catena.map((c) => c.id) },
        stato: { in: ['COMPLETATO', 'RIMBORSATO'] },
        ambiente: p.ambiente,
        revolutOrderId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    catena.push(...altri);
    daVedere = altri.flatMap((a) => a.creditoDa);
  }
  const ids = catena.map((c) => c.id);
  // Редовете на веригата са заключени в постоянен ред: две връщания не разпределят едно и също място.
  await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  const [freschi, inCorso] = await Promise.all([
    tx.pagamento.findMany({ where: { id: { in: ids } }, select: { id: true, rimborsoCent: true } }),
    tx.rimborso.groupBy({
      by: ['pagamentoId'],
      where: { pagamentoId: { in: ids }, stato: 'IN_CORSO' },
      _sum: { importoCent: true },
    }),
  ]);
  return catena.map((c) => ({
    id: c.id,
    revolutOrderId: c.revolutOrderId!,
    pagatoCent: c.totaleCent,
    giaRimborsatoCent:
      (freschi.find((f) => f.id === c.id)?.rimborsoCent ?? 0) +
      (inCorso.find((r) => r.pagamentoId === c.id)?._sum.importoCent ?? 0),
  }));
}

/** Колко най-много може да се върне през Revolut за плащането и как би се разпределила `importoCent`. */
export async function anteprimaRimborso(pagamentoId: string, importoCent: number) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!p || !p.revolutOrderId) return { maxCent: 0, parti: [] };
    const ordini = await ordiniDi(tx, p);
    const maxCent = ordini.reduce((s, o) => s + Math.max(0, o.pagatoCent - o.giaRimborsatoCent), 0);
    return { maxCent, parti: ripartisci(Math.min(importoCent, maxCent), ordini).parti };
  });
}

export type EsitoRimborso =
  | { ok: true; stato: 'completato' | 'inCorso' | 'senzaRisposta' }
  | { ok: true; stato: 'rifiutato'; codice: string }
  | { ok: false; errore: 'stato' | 'inCorso' | 'chiave' }
  | { ok: false; errore: 'importo'; maxCent: number };

type Passo = 'completato' | 'inCorso' | 'senzaRisposta' | { rifiutato: string };

export async function rimborsaSuRevolut(
  actorId: string,
  pagamentoId: string,
  importoCent: number,
): Promise<EsitoRimborso> {
  const adesso = new Date();
  type Preparato =
    | { errore: 'stato' | 'inCorso' }
    | { errore: 'importo'; maxCent: number }
    | { errore: null; p: Pagamento; righe: Array<{ riga: Rimborso; ordine: string }> };
  const preparato = await prisma.$transaction(async (tx): Promise<Preparato> => {
    await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ${pagamentoId} FOR UPDATE`;
    const p = await tx.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!p || !RIMBORSABILI.includes(p.stato) || !p.revolutOrderId) return { errore: 'stato' };
    if ((await tx.rimborso.count({ where: { perPagamentoId: p.id, stato: 'IN_CORSO' } })) > 0)
      return { errore: 'inCorso' };
    const ordini = await ordiniDi(tx, p);
    const maxCent = ordini.reduce((s, o) => s + Math.max(0, o.pagatoCent - o.giaRimborsatoCent), 0);
    const { parti, restoCent } = ripartisci(importoCent, ordini);
    if (parti.length === 0 || restoCent > 0) return { errore: 'importo', maxCent };
    const righe: Array<{ riga: Rimborso; ordine: string }> = [];
    for (const parte of parti)
      righe.push({
        // Един и същ час за частите на едно нареждане: така се познава „последното“ (chiudi).
        riga: await tx.rimborso.create({
          data: {
            pagamentoId: parte.id,
            perPagamentoId: p.id,
            importoCent: parte.cent,
            createdById: actorId,
            createdAt: adesso,
          },
        }),
        ordine: ordini.find((o) => o.id === parte.id)!.revolutOrderId,
      });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTO_RIMBORSO_AVVIATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: p.id,
        meta: { importoCent, ordini: parti.length },
      },
      tx,
    );
    return { errore: null, p, righe };
  });
  if (preparato.errore === 'importo')
    return { ok: false, errore: 'importo', maxCent: preparato.maxCent };
  if (preparato.errore !== null) return { ok: false, errore: preparato.errore };
  const c = await clientePer(preparato.p.ambiente);
  if (!c) {
    for (const { riga } of preparato.righe) await fallisci(riga.id, 'chiave');
    return { ok: false, errore: 'chiave' };
  }
  let esito: EsitoRimborso = { ok: true, stato: 'completato' };
  for (const { riga, ordine } of preparato.righe) {
    const passo = await ordina(c, riga, ordine);
    if (typeof passo === 'object')
      esito = { ok: true, stato: 'rifiutato', codice: passo.rifiutato };
    else if (esito.ok && esito.stato === 'completato' && passo !== 'completato')
      esito = { ok: true, stato: passo };
    else if (esito.ok && esito.stato === 'inCorso' && passo === 'senzaRisposta')
      esito = { ok: true, stato: passo };
  }
  return esito;
}

type Cliente = NonNullable<Awaited<ReturnType<typeof clientePer>>>;

/** Нарежда частта в Revolut (или пак, със същия ключ) и записва какво е отговорил. */
export async function ordina(c: Cliente, riga: Rimborso, ordine: string): Promise<Passo> {
  try {
    const r = await rimborsaOrdine(c, ordine, {
      amount: riga.importoCent,
      reference: riga.id,
      description: DESCRIZIONE,
      chiave: riga.id,
    });
    return await registra(riga.id, r);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    const s = error.stato;
    // Отказ (4xx) е окончателен; мрежа, таймаут, 5xx и „заето“ — отговорът не е дошъл: редът остава отворен.
    if (typeof s === 'number' && s >= 400 && s < 500 && ![408, 409, 425, 429].includes(s)) {
      await fallisci(riga.id, String(s));
      return { rifiutato: String(s) };
    }
    logger.warn(
      { evento: 'rimborso.senza_risposta', rimborso: riga.id, stato: s },
      'revolut: il rimborso non ha avuto risposta',
    );
    return 'senzaRisposta';
  }
}

/** Поръчката за връщане, както я казва Revolut: записва id-то ѝ и действа по състоянието. */
export async function registra(rimborsoId: string, r: OrdineRevolut): Promise<Passo> {
  await prisma.rimborso.updateMany({
    where: { id: rimborsoId, revolutRefundId: null },
    data: { revolutRefundId: r.id },
  });
  if (r.state === 'completed') {
    await completa(rimborsoId);
    return 'completato';
  }
  if (r.state === 'failed' || r.state === 'cancelled') {
    await fallisci(rimborsoId, r.state);
    return { rifiutato: r.state };
  }
  return 'inCorso';
}

/** Частта е върната: сумата отива при плащането на поръчката; ако нареждането е цяло — плащането се затваря. */
async function completa(rimborsoId: string): Promise<void> {
  const adesso = new Date();
  let dovuta = false;
  const chiuso = await prisma.$transaction(async (tx) => {
    const { count } = await tx.rimborso.updateMany({
      where: { id: rimborsoId, stato: 'IN_CORSO' },
      data: { stato: 'COMPLETATO', completatoAt: adesso },
    });
    if (count !== 1) return null;
    const r = await tx.rimborso.findUniqueOrThrow({ where: { id: rimborsoId } });
    await tx.$executeRaw`UPDATE "Pagamento" SET "rimborsoCent" = COALESCE("rimborsoCent", 0) + ${r.importoCent}, "rimborsatoAt" = ${adesso} WHERE id = ${r.pagamentoId}`;
    // Кредитното известие следва фактурата: към плащането, върху чиято поръчка са върнати парите (чл. 12.9).
    const nota = await registraNotaCredito(tx, {
      pagamentoId: r.pagamentoId,
      origine: 'RIMBORSO',
      rimborsoId: r.id,
      totaleCent: r.importoCent,
      eventoAt: adesso,
    });
    if (nota) dovuta = true;
    // Последното нареждане за плащането: затваря се само ако всичките му части са върнати.
    const ultimo = await tx.rimborso.findMany({
      where: { perPagamentoId: r.perPagamentoId, createdAt: r.createdAt },
    });
    if (ultimo.some((u) => u.stato !== 'COMPLETATO')) return null;
    const { count: chiusi } = await tx.pagamento.updateMany({
      where: { id: r.perPagamentoId, stato: { in: [...RIMBORSABILI] } },
      data: { stato: 'RIMBORSATO', rimborsatoAt: adesso },
    });
    if (chiusi !== 1) return null;
    const p = await tx.pagamento.findUniqueOrThrow({ where: { id: r.perPagamentoId } });
    const totale = ultimo.reduce((s, u) => s + u.importoCent, 0);
    await writeAudit(
      {
        actorId: r.createdById,
        action: 'PAGAMENTO_RIMBORSATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: p.id,
        meta: { rimborsoCent: totale, origine: 'revolut' },
      },
      tx,
    );
    return { p, totale };
  });
  if (dovuta) void avvisaNoteCredito();
  // Писмата — след записа; не се чакат.
  if (chiuso) void avvisaRimborso(chiuso.p, chiuso.totale);
}

export async function fallisci(rimborsoId: string, codice: string): Promise<void> {
  const fallito = await prisma.$transaction(async (tx) => {
    const { count } = await tx.rimborso.updateMany({
      where: { id: rimborsoId, stato: 'IN_CORSO' },
      data: { stato: 'FALLITO', errore: codice.slice(0, 30) },
    });
    if (count !== 1) return null;
    const r = await tx.rimborso.findUniqueOrThrow({
      where: { id: rimborsoId },
      include: { perPagamento: true },
    });
    await writeAudit(
      {
        actorId: r.createdById,
        action: 'PAGAMENTO_RIMBORSO_FALLITO',
        aziendaId: r.perPagamento.aziendaId,
        targetType: 'pagamento',
        targetId: r.perPagamentoId,
        meta: { codice: codice.slice(0, 30), importoCent: r.importoCent },
      },
      tx,
    );
    return r;
  });
  if (!fallito) return;
  void allarme('rimborsoFallito');
  void avvisaRimborsoFallito(fallito.perPagamento, fallito.importoCent, codice);
}
