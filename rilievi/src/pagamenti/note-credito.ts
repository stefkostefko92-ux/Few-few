import type { Prisma } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { entroIlDa, scomponiRimborso } from './note-credito-importi.js';
import { daPeriodo } from './situazione.js';

/**
 * Кредитните известия за издаване (собственикът, 12 ноември 2026 — „Кредитно известие при връщане и спор“;
 * условията 2026-11-14, чл. 12.9; чл. 115 ЗДДС — подготвен казус на Данъчника, не е данъчен съвет). Порталът не
 * издава документи: записва, че известие се дължи — за всяко завършено връщане (през Revolut или отбелязано на
 * ръка) и за всеки спор, решен срещу нас — към кое плащане, за колко и до кога. MASTER го издава в софтуера си за
 * фактури и записва тук номера и деня. Пробите в Sandbox на живия сървър нямат фактура — нямат и известие.
 */
export interface NuovaNota {
  pagamentoId: string;
  origine: 'RIMBORSO' | 'CONTESTAZIONE';
  rimborsoId?: string | null;
  contestazioneId?: string | null;
  /** Върнатото с ДДС, в центове. */
  totaleCent: number;
  /** Кога парите са върнати или спорът е решен. */
  eventoAt: Date;
}

/** Записва дължимото известие; `false` — няма какво (проба, нула, вече записано за същото връщане или спор). */
export async function registraNotaCredito(
  tx: Prisma.TransactionClient,
  v: NuovaNota,
): Promise<boolean> {
  // Редът на плащането е заключен: две известия едновременно не надхвърлят заедно фактурата.
  await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ${v.pagamentoId} FOR UPDATE`;
  const p = await tx.pagamento.findUnique({
    where: { id: v.pagamentoId },
    select: { regimeIva: true, ambiente: true, totaleCent: true },
  });
  if (!p || !daPeriodo(p.ambiente)) return false;
  // Известията към една фактура не я надхвърлят (спор за друга сума; спор след вече върнато).
  const gia = await tx.notaCredito.aggregate({
    where: { pagamentoId: v.pagamentoId },
    _sum: { totaleCent: true },
  });
  const totale = Math.min(Math.trunc(v.totaleCent), p.totaleCent - (gia._sum.totaleCent ?? 0));
  if (!(totale > 0)) return false;
  if (v.rimborsoId && (await tx.notaCredito.findUnique({ where: { rimborsoId: v.rimborsoId } })))
    return false;
  if (
    v.contestazioneId &&
    (await tx.notaCredito.findUnique({ where: { contestazioneId: v.contestazioneId } }))
  )
    return false;
  const { imponibile, iva } = scomponiRimborso(totale, p.regimeIva);
  await tx.notaCredito.create({
    data: {
      pagamentoId: v.pagamentoId,
      origine: v.origine,
      rimborsoId: v.rimborsoId ?? null,
      contestazioneId: v.contestazioneId ?? null,
      imponibileCent: imponibile,
      ivaCent: iva,
      totaleCent: totale,
      eventoAt: v.eventoAt,
      entroIl: entroIlDa(v.eventoAt),
    },
  });
  return true;
}

const conPagamento = {
  pagamento: {
    select: {
      id: true,
      aziendaNome: true,
      ragioneSociale: true,
      partitaIva: true,
      regimeIva: true,
      fatturaNumero: true,
      fatturataAt: true,
      completatoAt: true,
    },
  },
} as const;

/** За конзолата: неиздадените (най-спешните първи) и последните издадени. */
export async function elencoNoteCredito() {
  const [daEmettere, emesse] = await Promise.all([
    prisma.notaCredito.findMany({
      where: { emessaAt: null },
      orderBy: { entroIl: 'asc' },
      take: 200,
      include: conPagamento,
    }),
    prisma.notaCredito.findMany({
      where: { emessaAt: { not: null } },
      orderBy: { emessaAt: 'desc' },
      take: 20,
      include: conPagamento,
    }),
  ]);
  return { daEmettere, emesse };
}

/** Всички известия за счетоводството (CSV), най-новите отгоре. */
export const tutteLeNoteCredito = () =>
  prisma.notaCredito.findMany({ orderBy: { eventoAt: 'desc' }, take: 5000, include: conPagamento });

/** Номерът на документа: каквото е на известието — букви, цифри и малко знаци, до 40. */
export function numeroDocumento(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return v.length >= 1 && v.length <= 40 && /^[\p{L}\p{N} ./_#-]+$/u.test(v) ? v : null;
}

/** MASTER записва, че известието е издадено: номерът и денят му. Веднъж; после не се пипа. */
export async function segnaNotaEmessa(
  actorId: string,
  id: string,
  numero: string,
  emessaAt: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.notaCredito.updateMany({
      where: { id, emessaAt: null },
      data: { numero, emessaAt },
    });
    if (count !== 1) return false;
    const n = await tx.notaCredito.findUniqueOrThrow({
      where: { id },
      select: { pagamentoId: true, totaleCent: true, pagamento: { select: { aziendaId: true } } },
    });
    await writeAudit(
      {
        actorId,
        action: 'NOTA_CREDITO_EMESSA',
        aziendaId: n.pagamento.aziendaId,
        targetType: 'pagamento',
        targetId: n.pagamentoId,
        meta: { totaleCent: n.totaleCent },
      },
      tx,
    );
    return true;
  });
}

/** Алармата: колко известия чакат издаване. Не се чака и не хвърля (allarmi/servizio.ts). */
export async function avvisaNoteCredito(): Promise<void> {
  try {
    const n = await prisma.notaCredito.count({ where: { emessaAt: null } });
    if (n > 0) void allarme('notaCredito', n);
  } catch (error) {
    logger.warn(
      { evento: 'nota_credito.avviso', err: errorMessage(error) },
      'nota di credito: avviso',
    );
  }
}

/** Поддръжката: има ли неиздадено известие със срок до ден (или минал) — напомня. Връща броя им. */
export async function ricordaNoteInScadenza(now: Date = new Date()): Promise<number> {
  const n = await prisma.notaCredito.count({
    where: { emessaAt: null, entroIl: { lt: new Date(now.getTime() + 24 * 60 * 60_000) } },
  });
  if (n > 0) await avvisaNoteCredito();
  return n;
}
