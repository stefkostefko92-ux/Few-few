import { writeAudit } from '../audit.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { rimborsoDovutoMail } from '../mail/templates-pagamenti.js';
import { DAY } from '../time.js';
import { ALIQUOTA_BG_BP } from './importi.js';
import { formatoEuro } from './offerta.js';

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

/** Дължимото към момента `al`, с ДДС (ако е начислен), в центове; 0 — планът е изтекъл или няма период. */
export function rimborsoDovuto(p: PerRimborso, al: Date): number {
  if (!p.inizio || !p.fine || p.fine.getTime() <= al.getTime()) return 0;
  const totali = Math.max(1, Math.round((p.fine.getTime() - p.inizio.getTime()) / DAY));
  const da = Math.max(al.getTime(), p.inizio.getTime());
  const nonGoduti = Math.min(totali, Math.floor((p.fine.getTime() - da) / DAY));
  const netto = Math.floor(((p.imponibileCent + p.creditoCent) * nonGoduti) / totali);
  return p.regimeIva === 'iva-bg' ? netto + Math.round((netto * ALIQUOTA_BG_BP) / 10_000) : netto;
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
  return righe
    .filter((p) => !gia.has(p.id))
    .map((p) => {
      const cessazione = p.azienda?.deactivatedAt ?? now;
      return { ...p, cessazione, dovutoCent: rimborsoDovuto(p, cessazione) };
    })
    .filter((p) => p.dovutoCent > 0);
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
    const dovuto = pagati
      .filter((p) => !gia.has(p.id))
      .reduce((somma, p) => somma + rimborsoDovuto(p, al), 0);
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
 * MASTER отбелязва върнатото (сумата с ДДС): плащането става „RIMBORSATO“ и не се брои повече за платен период
 * (нито за кредит). Абонаментът на още активна фирма не се пипа оттук — MASTER го задава на ръка на страницата ѝ.
 */
export async function segnaRimborsato(
  actorId: string,
  id: string,
  rimborsoCent: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.pagamento.updateMany({
      where: { id, stato: { in: ['COMPLETATO', 'DA_VERIFICARE'] } },
      data: { stato: 'RIMBORSATO', rimborsoCent, rimborsatoAt: new Date() },
    });
    if (count !== 1) return false;
    const p = await tx.pagamento.findUniqueOrThrow({ where: { id }, select: { aziendaId: true } });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTO_RIMBORSATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: id,
        meta: { rimborsoCent },
      },
      tx,
    );
    return true;
  });
}

/** MASTER отбелязва, че фактурата е издадена (извън портала). */
export async function segnaFatturato(actorId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.pagamento.updateMany({
      where: { id, stato: { in: ['COMPLETATO', 'RIMBORSATO'] }, fatturataAt: null },
      data: { fatturataAt: new Date() },
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
      },
      tx,
    );
    return true;
  });
}
