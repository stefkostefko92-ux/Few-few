import type { DecisioneContestazione, StatoContestazione } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { contestazioneMail } from '../mail/templates-rimborsi.js';
import { indirizziMaster } from './avvisi-rimborsi.js';
import { baseDi, leggiConfig } from './config.js';
import { avvisaNoteCredito, registraNotaCredito } from './note-credito.js';
import { ErroreRevolut, leggiDisputa, type DisputaRevolut } from './revolut.js';

/**
 * Споровете за плащане (chargeback; условията 2026-11-13, чл. 12.9): Revolut известява с `DISPUTE_*` (само id-то
 * на спора), порталът го чете обратно (`GET /api/disputes/{id}` — кое е вярно решава Revolut, не известието),
 * връзва го с плащането по поръчката и го показва на MASTER със срока за отговор. Отговаря се в Revolut Business.
 * Порталът НЕ решава нищо сам: изгубен спор не пипа нито плащането, нито абонамента — решава MASTER.
 * И кредитното известие (прегледът на Данъчника, 28 ноември 2026 — M1; не е данъчен съвет): при извършена услуга
 * върнатото от банката е неплащане, не разваляне — известие се издава само при разваляне (чл. 115, ал. 1 и 3 ЗДДС;
 * корекцията при несъбираемо вземане е по чл. 126б). Изгубеният спор е „da valutare“: MASTER избира веднъж
 * (`decidiContestazione`) — „nota di credito (risoluzione)“ или „nessuna nota (mancato pagamento)“; аларма при
 * изгубването и напомняне от поддръжката, докато чака.
 */
const STATI: Record<DisputaRevolut['state'], StatoContestazione> = {
  needs_response: 'DA_RISPONDERE',
  under_review: 'IN_ESAME',
  won: 'VINTA',
  lost: 'PERSA',
};

const data = (v: string | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function aggiornaContestazione(disputeId: string): Promise<void> {
  const cfg = await leggiConfig();
  if (!cfg.chiave) return;
  let d: DisputaRevolut;
  try {
    d = await leggiDisputa({ base: baseDi(cfg.ambiente), chiave: cfg.chiave }, disputeId);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn(
      { evento: 'contestazione.lettura_fallita', stato: error.stato },
      'revolut: la contestazione non si legge',
    );
    return;
  }
  if (d.id !== disputeId) return;
  const stato = STATI[d.state];
  const motivo =
    [d.reason_code, d.reason_description]
      .filter(Boolean)
      .join(' — ')
      .replace(/\p{Cc}+/gu, ' ')
      .slice(0, 300) || null;
  const cambiata = await prisma.$transaction(async (tx) => {
    // Две известия за един спор едновременно: едно след друго (един запис в одита за една промяна).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contestazione:${d.id}`}))`;
    const pagamento = d.payment?.order_id
      ? await tx.pagamento.findUnique({
          where: { revolutOrderId: d.payment.order_id },
          select: { id: true, aziendaId: true, aziendaNome: true },
        })
      : null;
    const prima = await tx.contestazione.findUnique({
      where: { id: d.id },
      select: { stato: true },
    });
    const dati = {
      pagamentoId: pagamento?.id ?? null,
      stato,
      sottostato: d.substate?.slice(0, 30) ?? null,
      motivo,
      importoCent: d.amount,
      valuta: d.currency,
      rispostaEntro: data(d.response_due_date),
      apertaAt: data(d.created_at),
    };
    const riga = await tx.contestazione.upsert({
      where: { id: d.id },
      create: { id: d.id, ...dati },
      update: dati,
    });
    if (prima?.stato === stato) return null;
    // Спор, решен срещу нас: известие НЕ се записва само — чака избора на MASTER (неплащане или разваляне).
    const daValutare = stato === 'PERSA' && pagamento !== null && riga.decisione === null;
    await writeAudit(
      {
        actorId: null,
        action: 'PAGAMENTO_CONTESTATO',
        aziendaId: pagamento?.aziendaId ?? null,
        targetType: 'pagamento',
        targetId: pagamento?.id ?? d.id,
        meta: { stato },
      },
      tx,
    );
    return { riga, azienda: pagamento?.aziendaNome ?? null, daValutare };
  });
  if (!cambiata) return;
  void allarme('contestazione');
  if (cambiata.daValutare) void avvisaContestazioniDaValutare();
  try {
    const link = `${config().PUBLIC_BASE_URL}/master/pagamenti#h-contestazioni`;
    for (const to of await indirizziMaster())
      await sendMail(
        contestazioneMail({ to, contestazione: cambiata.riga, azienda: cambiata.azienda, link }),
      );
  } catch (error) {
    logger.error(
      { evento: 'contestazione.mail_fallita', err: errorMessage(error) },
      'contestazione: email non inviate',
    );
  }
}

/**
 * Изгубените спорове с плащане, за които MASTER още не е избрал. Спор с известие, записано само от кода отпреди
 * 28 ноември 2026, не е „da valutare“ — известието му остава, както е.
 */
const DA_VALUTARE = {
  stato: 'PERSA',
  pagamentoId: { not: null },
  decisione: null,
  notaCredito: { is: null },
} as const;

/** Алармата: колко изгубени спора чакат избора. Не се чака и не хвърля (allarmi/servizio.ts). */
async function avvisaContestazioniDaValutare(): Promise<void> {
  try {
    const n = await prisma.contestazione.count({ where: DA_VALUTARE });
    if (n > 0) void allarme('contestazioneDaValutare', n);
  } catch (error) {
    logger.warn(
      { evento: 'contestazione.avviso', err: errorMessage(error) },
      'contestazione: avviso',
    );
  }
}

/** Поддръжката: изгубените спорове, които още чакат избора — напомняне (само броят). Връща броя им. */
export async function ricordaContestazioniDaValutare(): Promise<number> {
  const n = await prisma.contestazione.count({ where: DA_VALUTARE });
  if (n > 0) void allarme('contestazioneDaValutare', n);
  return n;
}

export const DECISIONI: readonly DecisioneContestazione[] = ['NOTA_CREDITO', 'NESSUNA_NOTA'];

/**
 * MASTER избира за изгубен спор: `NOTA_CREDITO` — разваляне, дължи се кредитно известие за оспорената сума
 * (към фактурата на плащането, до нея — registraNotaCredito); `NESSUNA_NOTA` — неплащане, известие няма. Веднъж,
 * само за изгубен спор с плащане; одит `CONTESTAZIONE_DECISA`. `false` — нищо не е записано.
 */
export async function decidiContestazione(
  actorId: string,
  id: string,
  decisione: DecisioneContestazione,
): Promise<boolean> {
  const adesso = new Date();
  const esito = await prisma.$transaction(async (tx) => {
    // Същото заключване като при известието от Revolut: изборът и ново известие не се разминават.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contestazione:${id}`}))`;
    const { count } = await tx.contestazione.updateMany({
      where: { id, ...DA_VALUTARE },
      data: { decisione, decisaAt: adesso },
    });
    if (count !== 1) return null;
    const c = await tx.contestazione.findUniqueOrThrow({
      where: { id },
      select: { importoCent: true, pagamento: { select: { id: true, aziendaId: true } } },
    });
    const nota =
      decisione === 'NOTA_CREDITO' && c.pagamento
        ? await registraNotaCredito(tx, {
            pagamentoId: c.pagamento.id,
            origine: 'CONTESTAZIONE',
            contestazioneId: id,
            totaleCent: c.importoCent,
            eventoAt: adesso,
          })
        : false;
    await writeAudit(
      {
        actorId,
        action: 'CONTESTAZIONE_DECISA',
        aziendaId: c.pagamento?.aziendaId ?? null,
        targetType: 'pagamento',
        targetId: c.pagamento?.id ?? id,
        meta: { contestazione: id, decisione },
      },
      tx,
    );
    return { nota };
  });
  if (!esito) return false;
  if (esito.nota) void avvisaNoteCredito();
  return true;
}

/** Поддръжката: отворените спорове — прочетени наново (изгубено известие). */
export async function aggiornaContestazioniAperte(): Promise<number> {
  const aperte = await prisma.contestazione.findMany({
    where: { stato: { in: ['DA_RISPONDERE', 'IN_ESAME'] } },
    orderBy: { updatedAt: 'asc' },
    select: { id: true },
    take: 50,
  });
  for (const c of aperte) await aggiornaContestazione(c.id);
  return aperte.length;
}

/** За конзолата: отворените първи, после последните затворени. */
export async function elencoContestazioni() {
  return prisma.contestazione.findMany({
    orderBy: [{ stato: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: {
      pagamento: { select: { id: true, aziendaNome: true } },
      notaCredito: { select: { id: true } },
    },
  });
}
