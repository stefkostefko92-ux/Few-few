import { rimuoviScheda } from '../allegati/archivio.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { DAY } from '../time.js';

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
export const GIORNI_PRIMA_DELL_ELIMINAZIONE = 90;

/** Денят, в който деактивираната фирма ще бъде изтрита. */
export const eliminazioneIl = (deactivatedAt: Date): Date =>
  new Date(deactivatedAt.getTime() + GIORNI_PRIMA_DELL_ELIMINAZIONE * DAY);

/** Изтрива деактивирана фирма; false — няма такава или е активна. */
export async function eliminaAzienda(aziendaId: string, actorId: string | null): Promise<boolean> {
  const esito = await prisma.$transaction(
    async (tx) => {
      // Редът на фирмата се заключва: активиране наново и изтриване не се разминават.
      const rows = await tx.$queryRaw<Array<{ deactivatedAt: Date | null }>>`
        SELECT "deactivatedAt" FROM "Azienda" WHERE id = ${aziendaId} FOR UPDATE`;
      if (!rows[0]?.deactivatedAt) return null;
      const schede = await tx.scheda.findMany({ where: { aziendaId }, select: { id: true } });
      const membri = await tx.membership.findMany({
        where: { aziendaId },
        select: { userId: true },
      });
      await tx.cartello.deleteMany({ where: { aziendaId } });
      await tx.intervento.deleteMany({ where: { aziendaId } });
      await tx.verbale.deleteMany({ where: { aziendaId } });
      await tx.calcoloArgano.deleteMany({ where: { aziendaId } });
      await tx.calcoloLimitatore.deleteMany({ where: { aziendaId } });
      // Снимките, скиците, мерките и изчислението на картата падат с нея (Cascade).
      await tx.scheda.deleteMany({ where: { aziendaId } });
      await tx.invite.deleteMany({ where: { aziendaId } });
      await tx.auditLog.deleteMany({ where: { aziendaId } });
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
      return schede.map((s) => s.id);
    },
    { timeout: 120_000 },
  );
  if (!esito) return false;
  // Папките след записа: провал тук оставя файлове без карта, никога карта без файлове.
  for (const schedaId of esito) {
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
