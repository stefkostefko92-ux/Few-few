import type { Prisma } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { GIORNI_FATTURA } from './offerta.js';

/**
 * Фактурата на платен план (издава се извън портала; прегледът на Данъчника, 28 ноември 2026 — H2): плащането е
 * аванс (чл. 25, ал. 7 ЗДДС), фактурата — до 5 дни от него (чл. 113, ал. 4). Всеки ред „Da fatturare“ носи срока,
 * а поддръжката напомня в Discord за тези със срок до ден (само броят). Не е данъчен съвет.
 */

const GIORNO = 24 * 60 * 60_000;

/**
 * Надписът, който българската фактура носи при обратно начисляване вместо ставката и данъка (чл. 114 ЗДДС) —
 * дословно на български, затова е тук, а не в италианския речник (`tests/i18n.test.ts` не пуска кирилица там).
 */
export const DICITURA_INVERSIONE = 'обратно начисляване';

/** Срокът за издаване: моментът на плащането + `GIORNI_FATTURA` дни. */
export const fatturaEntroIl = (completatoAt: Date): Date =>
  new Date(completatoAt.getTime() + GIORNI_FATTURA * GIORNO);

/** Плащанията за фактуриране: завършени, без отметка; пробите в Sandbox на живия сървър — не. */
export const whereDaFatturare = (): Prisma.PagamentoWhereInput => ({
  stato: 'COMPLETATO',
  fatturataAt: null,
  ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
});

/** Поддръжката: колко плащания за фактуриране са със срок до ден (или минал) — аларма с броя. Грешката — на стъпката. */
export async function ricordaFattureInScadenza(now: Date = new Date()): Promise<number> {
  const n = await prisma.pagamento.count({
    where: {
      ...whereDaFatturare(),
      completatoAt: { lt: new Date(now.getTime() + GIORNO - GIORNI_FATTURA * GIORNO) },
    },
  });
  if (n > 0) void allarme('fattura', n);
  return n;
}
