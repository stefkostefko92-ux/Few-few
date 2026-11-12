import { config } from '../config.js';
import { prisma } from '../db.js';
import { sendMail } from '../mail/mailer.js';
import { abbonamentoAvvisoMail } from '../mail/templates-abbonamento.js';
import { DAY } from '../time.js';

/**
 * Известията за края на пробния месец и на плана (чл. 12.6 на условията 2026-11-12): до администраторите — 14 и
 * 3 дни преди края и в деня на края. Всяка граница тръгва веднъж за даден край (`avvisoScadenzaPer` /
 * `avvisoScadenzaSoglia`, заети с един UPDATE — два процеса не пращат две писма); нов край (подновяване, ръчна
 * промяна) — започва отначало. Не по време на смяна на доставчика (чл. 12.7). Пуска се от поддръжката всеки час.
 */
export const SOGLIE = [14, 3, 0] as const;
export type Soglia = (typeof SOGLIE)[number];

/** Коя граница се дължи сега: 14 / 3 дни преди края, 0 — денят след края (до 24 ч.); иначе null. */
export function sogliaDovuta(fino: Date, now: Date): Soglia | null {
  const resta = fino.getTime() - now.getTime();
  if (resta <= 0) return -resta < DAY ? 0 : null;
  if (resta <= 3 * DAY) return 3;
  if (resta <= 14 * DAY) return 14;
  return null;
}

export async function avvisaScadenze(now: Date = new Date()): Promise<number> {
  const aziende = await prisma.azienda.findMany({
    where: {
      deactivatedAt: null,
      abbonamentoFino: {
        gt: new Date(now.getTime() - DAY),
        lte: new Date(now.getTime() + 14 * DAY),
      },
      OR: [{ cambioFineAt: null }, { cambioFineAt: { lte: now } }],
    },
    select: {
      id: true,
      name: true,
      abbonamentoFino: true,
      abbonamentoProva: true,
      avvisoScadenzaPer: true,
      avvisoScadenzaSoglia: true,
    },
  });
  let inviati = 0;
  for (const a of aziende) {
    const fino = a.abbonamentoFino;
    if (!fino) continue;
    const soglia = sogliaDovuta(fino, now);
    if (soglia === null) continue;
    const stessoFine = a.avvisoScadenzaPer?.getTime() === fino.getTime();
    if (stessoFine && a.avvisoScadenzaSoglia !== null && a.avvisoScadenzaSoglia <= soglia) continue;
    // Заемане: само ако никой друг не е пратил тази (или по-малка) граница за същия край.
    const { count } = await prisma.azienda.updateMany({
      where: {
        id: a.id,
        abbonamentoFino: fino,
        OR: [
          { avvisoScadenzaPer: null },
          { avvisoScadenzaPer: { not: fino } },
          { avvisoScadenzaSoglia: null },
          { avvisoScadenzaSoglia: { gt: soglia } },
        ],
      },
      data: { avvisoScadenzaPer: fino, avvisoScadenzaSoglia: soglia },
    });
    if (count !== 1) continue;
    const admin = await prisma.membership.findMany({
      where: { aziendaId: a.id, role: 'ADMIN', user: { deactivatedAt: null } },
      select: { user: { select: { email: true } } },
    });
    const link = `${config().PUBLIC_BASE_URL}/impostazioni/abbonamento?azienda=${encodeURIComponent(a.id)}`;
    for (const m of admin) {
      await sendMail(
        abbonamentoAvvisoMail({
          to: m.user.email,
          azienda: a.name,
          prova: a.abbonamentoProva,
          soglia,
          ultimoGiorno: new Date(fino.getTime() - 1),
          link,
        }),
      );
      inviati += 1;
    }
  }
  return inviati;
}
