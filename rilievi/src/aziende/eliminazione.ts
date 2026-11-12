import { rimuoviScheda } from '../allegati/archivio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { sendMail } from '../mail/mailer.js';
import { cambioMail } from '../mail/templates.js';
import { conservaFinoDa } from '../legale/emissioni.js';
import { errorMessage, logger } from '../logger.js';
import { DAY } from '../time.js';
import { GIORNI_PRIMA_DELL_ELIMINAZIONE } from './cambio-tempi.js';

/**
 * Краят на услугата за фирма (чл. 28, ал. 3, б. „g“ GDPR; одит, 4 ноември 2026). Деактивираната фирма
 * (setAziendaActive) пази всичко GIORNI_PRIMA_DELL_ELIMINAZIONE дни — активирана наново, нищо не се
 * губи; после поддръжката (maintenance.ts) я изтрива окончателно. MASTER може да я изтрие и веднага
 * (маршрутът иска името ѝ), но само деактивирана. Преди това MASTER сваля всичко (esportazione.ts).
 *
 * Изтрива се: картите (със снимките, клиповете, скиците и мерките — и папките им в тома), листовете за
 * интервенция, табелите, изчисленията за аргано, поканите, регистърът на фирмата, членствата и хората,
 * които са били САМО в нея (сесиите и връзките им падат с тях). Който е и в друга фирма, губи само
 * това членство. В регистъра остава един ред без фирма и без лични данни: кой, кога и колко.
 */
export { GIORNI_PRIMA_DELL_ELIMINAZIONE };

/** Денят, в който деактивираната фирма ще бъде изтрита. */
export const eliminazioneIl = (deactivatedAt: Date): Date =>
  new Date(deactivatedAt.getTime() + GIORNI_PRIMA_DELL_ELIMINAZIONE * DAY);

/** Изтрива деактивирана фирма; false — няма такава или е активна. */
export async function eliminaAzienda(aziendaId: string, actorId: string | null): Promise<boolean> {
  const esito = await prisma.$transaction(
    async (tx) => {
      // Редът на фирмата се заключва: активиране наново и изтриване не се разминават.
      const rows = await tx.$queryRaw<Array<{ deactivatedAt: Date | null; name: string }>>`
        SELECT "deactivatedAt", name FROM "Azienda" WHERE id = ${aziendaId} FOR UPDATE`;
      const riga = rows[0];
      if (!riga?.deactivatedAt) return null;
      // Адресите на администраторите — преди да изчезнат с хората: потвърждението на изтриването
      // (Allegato B, B.13; чл. 25(2)(h) Data Act) тръгва след записа.
      const admin = await tx.membership.findMany({
        where: { aziendaId, role: 'ADMIN', user: { deactivatedAt: null } },
        select: { user: { select: { email: true } } },
      });
      const schede = await tx.scheda.findMany({ where: { aziendaId }, select: { id: true } });
      const membri = await tx.membership.findMany({
        where: { aziendaId },
        select: { userId: true },
      });
      await tx.cartello.deleteMany({ where: { aziendaId } });
      await tx.intervento.deleteMany({ where: { aziendaId } });
      await tx.verbale.deleteMany({ where: { aziendaId } });
      // „Buono di lavoro“ — подписите му падат с него (Cascade).
      await tx.buonoLavoro.deleteMany({ where: { aziendaId } });
      // Офертите (Restrict към фирмата) и ценоразписът (Cascade — изрично, за реда на изтриването).
      await tx.preventivo.deleteMany({ where: { aziendaId } });
      await tx.voceListino.deleteMany({ where: { aziendaId } });
      await tx.calcoloArgano.deleteMany({ where: { aziendaId } });
      await tx.calcoloLimitatore.deleteMany({ where: { aziendaId } });
      // Снимките, скиците, мерките и изчислението на картата падат с нея (Cascade).
      await tx.scheda.deleteMany({ where: { aziendaId } });
      await tx.invite.deleteMany({ where: { aziendaId } });
      await tx.auditLog.deleteMany({ where: { aziendaId } });
      // Приеманията на условията остават (src/legale/): срокът им тече от края на договора — сега.
      await tx.accettazione.updateMany({
        where: { aziendaId },
        data: { conservaFino: conservaFinoDa(new Date()) },
      });
      // Също приетите оферти; плащанията остават с името на фирмата (aziendaId → NULL) — до срока на офертата.
      await tx.accettazioneOfferta.updateMany({
        where: { aziendaId },
        data: { conservaFino: conservaFinoDa(new Date()) },
      });
      await tx.membership.deleteMany({ where: { aziendaId } });
      const soli = await tx.user.deleteMany({
        where: {
          id: { in: membri.map((m) => m.userId) },
          master: false,
          memberships: { none: {} },
        },
      });
      await tx.azienda.delete({ where: { id: aziendaId } });
      await writeAudit(
        {
          actorId,
          action: 'AZIENDA_DELETE',
          aziendaId: null,
          targetType: 'azienda',
          targetId: aziendaId,
          meta: { schede: schede.length, persone: soli.count, automatica: actorId === null },
        },
        tx,
      );
      return {
        schede: schede.map((s) => s.id),
        nome: riga.name,
        indirizzi: [...new Set(admin.map((a) => a.user.email))],
      };
    },
    { timeout: 120_000 },
  );
  if (!esito) return false;
  for (const to of esito.indirizzi) {
    await sendMail(
      cambioMail({
        to,
        tipo: 'cancellato',
        azienda: esito.nome,
        esito: null,
        fine: '',
        eliminazione: '',
        link: '',
      }),
    ).catch((error: unknown) =>
      logger.warn({ err: errorMessage(error) }, 'azienda: потвърждението на изтриването не тръгна'),
    );
  }
  // Папките след записа: провал тук оставя файлове без карта, никога карта без файлове.
  for (const schedaId of esito.schede) {
    await rimuoviScheda(schedaId).catch((error: unknown) =>
      logger.warn({ schedaId, err: errorMessage(error) }, 'azienda: папката на картата остана'),
    );
  }
  return true;
}

/** Деактивираните преди повече от GIORNI_PRIMA_DELL_ELIMINAZIONE дни — изтрити; колко. */
export async function eliminaAziendeScadute(now = Date.now()): Promise<number> {
  const scadute = await prisma.azienda.findMany({
    where: { deactivatedAt: { lt: new Date(now - GIORNI_PRIMA_DELL_ELIMINAZIONE * DAY) } },
    select: { id: true },
  });
  let n = 0;
  for (const { id } of scadute) if (await eliminaAzienda(id, null)) n += 1;
  return n;
}
