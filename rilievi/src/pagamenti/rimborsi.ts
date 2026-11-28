import type { AmbienteRevolut, Prisma, StatoPagamento } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { rimborsoDovutoMail } from '../mail/templates-pagamenti.js';
import { businessDay, DAY } from '../time.js';
import { ALIQUOTA_BG_BP, conIva } from './importi.js';
import { registraNotaCreditoCent } from './note-credito.js';
import { formatoEuro } from './offerta.js';
import { ripartisci } from './rimborsi-riparto.js';

/**
 * Връщането по чл. 12.9 на условията 2026-11-12: при прекратяване преди края на платен план — частта от платеното
 * за ЦЕЛИТЕ неизползвани дни, пропорционално на срока на плана (неначенат план — цялата сума), до 30 дни. Порталът
 * смята дължимото и го показва на MASTER; самото връщане (през Revolut или с превод) и кредитното известие са
 * извън портала — MASTER отбелязва сумата. Стойността на плана е платеното плюс превърнатия кредит от предишни
 * плащания (чл. 12.4): така надграждането не намалява дължимото.
 */

export interface PerRimborso {
  inizio: Date | null;
  fine: Date | null;
  imponibileCent: number;
  creditoCent: number;
  regimeIva: string;
}

const ORA = 60 * 60_000;

/**
 * Плащане, от което идва превърнатият кредит (чл. 12.4): фактурата му е в НЕГОВИЯ режим на ДДС, а основата му
 * (`imponibileCent`) е най-много, колкото от кредита може да се върне към нея.
 */
export interface FonteCredito {
  id: string;
  regimeIva: string;
  imponibileCent: number;
}

/** Една част от дължимото: към коя фактура, без ДДС и с ДДС по режима на ТАЗИ фактура. */
export interface ParteRimborso {
  pagamentoId: string;
  nettoCent: number;
  totaleCent: number;
}

const lordo = (netto: number, regime: string): number =>
  conIva(regime) ? netto + Math.round((netto * ALIQUOTA_BG_BP) / 10_000) : netto;

/**
 * Дължимото към момента `al`, разделено по произход (прегледът на Данъчника, 28 ноември 2026 — M2): частта от
 * собствената стойност на плана — към неговата фактура и с неговия ДДС; частта от превърнатия кредит — към
 * фактурите, от които идва (`fonti`, в реда на `creditoDa`, всяка до основата си — като `ripartisci` при Revolut),
 * всяка с ДДС по СВОЯ режим. Каквото не се побира в никоя (непознат източник), остава върху самото плащане.
 * Празно — нищо не се дължи (изтекъл план, без период).
 */
export function ripartoDovuto(
  p: PerRimborso & { id?: string },
  fonti: readonly FonteCredito[],
  al: Date,
): ParteRimborso[] {
  if (!p.inizio || !p.fine || p.fine.getTime() <= al.getTime()) return [];
  const totali = Math.max(1, Math.round((p.fine.getTime() - p.inizio.getTime()) / DAY));
  // План, който още не е започнал — всичко (чл. 12.9). Иначе — целите дни след прекратяването, с един час
  // допуск: денят с 23 часа при смяната към лятно време не струва ден на клиента.
  const nonGoduti =
    al.getTime() <= p.inizio.getTime()
      ? totali
      : Math.min(totali, Math.floor((p.fine.getTime() - al.getTime() + ORA) / DAY));
  const netto = Math.floor(((p.imponibileCent + p.creditoCent) * nonGoduti) / totali);
  const proprio = Math.min(netto, Math.floor((p.imponibileCent * nonGoduti) / totali));
  const { parti, restoCent } = ripartisci(
    netto - proprio,
    fonti.map((f) => ({ id: f.id, pagatoCent: f.imponibileCent, giaRimborsatoCent: 0 })),
  );
  const nettoProprio = proprio + restoCent;
  return [
    {
      pagamentoId: p.id ?? '',
      nettoCent: nettoProprio,
      totaleCent: lordo(nettoProprio, p.regimeIva),
    },
    ...parti.map((x) => {
      const regime = fonti.find((f) => f.id === x.id)!.regimeIva;
      return { pagamentoId: x.id, nettoCent: x.cent, totaleCent: lordo(x.cent, regime) };
    }),
  ].filter((x) => x.totaleCent > 0);
}

/** Дължимото към момента `al`, с ДДС (ако е начислен), в центове; 0 — планът е изтекъл или няма период. */
export function rimborsoDovuto(
  p: PerRimborso & { id?: string },
  al: Date,
  fonti: readonly FonteCredito[] = [],
): number {
  return ripartoDovuto(p, fonti, al).reduce((s, x) => s + x.totaleCent, 0);
}

/**
 * Върнатото на ръка (с ДДС) по фактури: първо частите на дължимото в реда им (собствената — първа), каквото е
 * повече — върху самото плащане (`propriaId`); известието там се реже до фактурата (registraNotaCredito).
 */
export function notePerRimborso(
  rimborsoCent: number,
  parti: readonly ParteRimborso[],
  propriaId: string,
): Array<{ pagamentoId: string; cent: number }> {
  if (!Number.isSafeInteger(rimborsoCent) || rimborsoCent <= 0) return [];
  const { parti: quote, restoCent } = ripartisci(
    rimborsoCent,
    parti.map((x) => ({ id: x.pagamentoId, pagatoCent: x.totaleCent, giaRimborsatoCent: 0 })),
  );
  const note = quote.map((q) => ({ pagamentoId: q.id, cent: q.cent }));
  if (restoCent > 0) {
    const propria = note.find((n) => n.pagamentoId === propriaId);
    if (propria) propria.cent += restoCent;
    else note.unshift({ pagamentoId: propriaId, cent: restoCent });
  }
  return note;
}

/**
 * Фактурите, от които идва кредитът на `p` (веригата на `creditoDa`, като `ordiniDi` при Revolut: до 5 нива, най-
 * новите първи): само платено плащане носи кредит; плащане за проверка — не (периодът му не е даден).
 */
export async function fontiCredito(
  db: Prisma.TransactionClient,
  p: { id: string; stato: StatoPagamento; ambiente: AmbienteRevolut; creditoDa: string[] },
): Promise<FonteCredito[]> {
  const viste = new Set<string>([p.id]);
  const fonti: FonteCredito[] = [];
  let daVedere = p.stato === 'COMPLETATO' ? p.creditoDa : [];
  for (let giro = 0; giro < 5 && daVedere.length > 0; giro += 1) {
    const altri = await db.pagamento.findMany({
      where: {
        id: { in: daVedere, notIn: [...viste] },
        stato: { in: ['COMPLETATO', 'RIMBORSATO'] },
        ambiente: p.ambiente,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, regimeIva: true, imponibileCent: true, creditoDa: true },
    });
    for (const a of altri) {
      viste.add(a.id);
      fonti.push({ id: a.id, regimeIva: a.regimeIva, imponibileCent: a.imponibileCent });
    }
    daVedere = altri.flatMap((a) => a.creditoDa);
  }
  return fonti;
}

const SELECT = {
  id: true,
  aziendaId: true,
  aziendaNome: true,
  inizio: true,
  fine: true,
  imponibileCent: true,
  creditoCent: true,
  totaleCent: true,
  regimeIva: true,
  stato: true,
  ambiente: true,
  creditoDa: true,
  azienda: { select: { deactivatedAt: true } },
} as const;

/**
 * Плащанията, чието неизползвано време вече е превърнато в дни на по-късен план (чл. 12.4): стойността им е в
 * `creditoCent` на новото плащане (и когато то е върнато) — тук не се броят втори път.
 */
export async function convertiti(): Promise<Set<string>> {
  const righe = await prisma.pagamento.findMany({
    where: { stato: { in: ['COMPLETATO', 'RIMBORSATO'] }, creditoDa: { isEmpty: false } },
    select: { creditoDa: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return new Set(righe.flatMap((r) => r.creditoDa));
}

/** Плащанията с платено и неизползвано време на спрени или изтрити фирми — „Rimborsi dovuti“ в конзолата. */
export async function rimborsiDovuti(now: Date = new Date()) {
  const gia = await convertiti();
  const righe = await prisma.pagamento.findMany({
    where: {
      stato: 'COMPLETATO',
      fine: { gt: now },
      ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
      OR: [{ aziendaId: null }, { azienda: { deactivatedAt: { not: null } } }],
    },
    orderBy: { createdAt: 'asc' },
    select: SELECT,
    take: 100,
  });
  // Вече върнатото през Revolut за същото плащане (част от нареждане, чиято друга част не е минала).
  const resi = await prisma.rimborso.groupBy({
    by: ['perPagamentoId'],
    where: { perPagamentoId: { in: righe.map((r) => r.id) }, stato: 'COMPLETATO' },
    _sum: { importoCent: true },
  });
  const reso = (id: string) => resi.find((r) => r.perPagamentoId === id)?._sum.importoCent ?? 0;
  const out = [];
  for (const p of righe.filter((r) => !gia.has(r.id))) {
    const cessazione = p.azienda?.deactivatedAt ?? now;
    const fonti = await fontiCredito(prisma, p);
    const dovutoCent = Math.max(0, rimborsoDovuto(p, cessazione, fonti) - reso(p.id));
    if (dovutoCent > 0) out.push({ ...p, cessazione, dovutoCent });
  }
  return out;
}

/** Фирмата е спряна: ако има платено и неизползвано време — писмо до всеки MASTER (30-дневният срок тече). */
export async function avvisaRimborsiDovuti(aziendaId: string, al: Date): Promise<void> {
  try {
    const pagati = await prisma.pagamento.findMany({
      where: {
        aziendaId,
        stato: 'COMPLETATO',
        fine: { gt: al },
        ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
      },
      select: SELECT,
    });
    const gia = await convertiti();
    let dovuto = 0;
    for (const p of pagati.filter((x) => !gia.has(x.id)))
      dovuto += rimborsoDovuto(p, al, await fontiCredito(prisma, p));
    if (dovuto <= 0 || !pagati[0]) return;
    const master = await prisma.user.findMany({
      where: { master: true, deactivatedAt: null },
      select: { email: true },
    });
    for (const m of master)
      await sendMail(
        rimborsoDovutoMail({
          to: m.email,
          azienda: pagati[0].aziendaNome,
          importo: formatoEuro(dovuto),
          link: `${config().PUBLIC_BASE_URL}/master/pagamenti#h-rimborsi`,
        }),
      );
  } catch (error) {
    logger.error(
      { evento: 'pagamento.rimborso_avviso', err: errorMessage(error) },
      'rimborso dovuto: avviso non inviato',
    );
  }
}

/** „20,50“, „1.290,5“ → центове; null — не е сума. */
export function importoDa(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim().replace(/\s|€/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/**
 * MASTER отбелязва върнатото извън портала (сумата с ДДС): плащането става „RIMBORSATO“ и не се брои повече за
 * платен период (нито за кредит). Абонаментът на още активна фирма не се пипа оттук — MASTER го задава на ръка на
 * страницата ѝ. Докато тече връщане през Revolut за същото плащане — не (rimborso-revolut.ts го затваря само).
 * Кредитното известие се дължи по произход (M2): частта на превърнатия кредит — към фактурата, от която идва, с
 * нейния ДДС (`ripartoDovuto`, `notePerRimborso`).
 */
export async function segnaRimborsato(
  actorId: string,
  id: string,
  rimborsoCent: number,
): Promise<boolean> {
  // Върнатото, което не влезе в известие (фактурата-източник вече има известия до сумата си): казва се, не се губи.
  let senzaNota = 0;
  const fatto = await prisma.$transaction(async (tx) => {
    if ((await tx.rimborso.count({ where: { perPagamentoId: id, stato: 'IN_CORSO' } })) > 0)
      return false;
    const prima = await tx.pagamento.findUnique({ where: { id }, select: SELECT });
    const adesso = new Date();
    const { count } = await tx.pagamento.updateMany({
      where: { id, stato: { in: ['COMPLETATO', 'DA_VERIFICARE'] } },
      data: { stato: 'RIMBORSATO', rimborsoCent, rimborsatoAt: adesso },
    });
    if (count !== 1 || !prima) return false;
    // Върнато извън портала: кредитното известие се дължи и тогава (чл. 12.9) — по фактурите на произхода.
    if (rimborsoCent > 0) {
      const fonti = await fontiCredito(tx, prima);
      const parti = ripartoDovuto(prima, fonti, prima.azienda?.deactivatedAt ?? adesso);
      let registrato = 0;
      for (const nota of notePerRimborso(rimborsoCent, parti, id))
        registrato += await registraNotaCreditoCent(tx, {
          pagamentoId: nota.pagamentoId,
          origine: 'RIMBORSO',
          totaleCent: nota.cent,
          eventoAt: adesso,
        });
      senzaNota = Math.max(0, rimborsoCent - registrato);
    }
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTO_RIMBORSATO',
        aziendaId: prima.aziendaId,
        targetType: 'pagamento',
        targetId: id,
        meta: { rimborsoCent, ...(senzaNota > 0 ? { senzaNotaCent: senzaNota } : {}) },
      },
      tx,
    );
    return true;
  });
  if (fatto && senzaNota > 0) {
    // Известието за тази част се прави на ръка: в регистъра пише колко, алармата казва, че има такова.
    logger.warn({ pagamentoId: id, senzaNotaCent: senzaNota }, 'rimborso.notaParziale');
    void allarme('notaCredito');
  }
  return fatto;
}

/**
 * MASTER отбелязва, че фактурата е издадена (извън портала): номерът и датата ѝ — задължителни (H2; чл. 115, ал. 4
 * ЗДДС — кредитното известие ги съдържа). `fatturataAt` е моментът на отметката, `fatturaData` — денят на документа.
 * Веднъж; после не се пипа.
 */
export async function segnaFatturato(
  actorId: string,
  id: string,
  numero: string,
  data: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Фактура за аванс не е с дата преди плащането (денят по Рим; ревюто на Кодаджията). Без ден на плащане
    // (върнато от „da verificare“) — нищо за сверка.
    const pagato = await tx.pagamento.findUnique({ where: { id }, select: { completatoAt: true } });
    if (pagato?.completatoAt && data.toISOString().slice(0, 10) < businessDay(pagato.completatoAt))
      return false;
    const { count } = await tx.pagamento.updateMany({
      where: { id, stato: { in: ['COMPLETATO', 'RIMBORSATO'] }, fatturataAt: null },
      data: { fatturataAt: new Date(), fatturaNumero: numero, fatturaData: data },
    });
    if (count !== 1) return false;
    const p = await tx.pagamento.findUniqueOrThrow({ where: { id }, select: { aziendaId: true } });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTO_FATTURATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: id,
        meta: { fatturaNumero: numero, fatturaData: data.toISOString().slice(0, 10) },
      },
      tx,
    );
    return true;
  });
}
