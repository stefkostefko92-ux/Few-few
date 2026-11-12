import type { CambioEsito } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { cambioMail, type TipoCambioMail } from '../mail/templates.js';
import { giornoRoma } from '../master/tempo.js';
import type { SessionUser } from '../types.js';
import { fineProroga, fineTransizione, type Proroga } from './cambio-tempi.js';
import { eliminazioneIl } from './eliminazione.js';

/**
 * Смяната на доставчика (Data Act, чл. 23–30; собственикът, 12 ноември 2026 — точки A1 и A4). ADMIN на
 * фирмата (или MASTER) я иска от настройките с избора какво става с данните (`CambioEsito`); услугата
 * продължава ИЗЦЯЛО през прехода (чл. 25(2)(a)(ii)), износът е винаги на един бутон. Преходът се удължава
 * веднъж и се оттегля до края си. В края поддръжката (`concludiCambi`) деактивира фирмата: договорът
 * свършва, а ADMIN-ът ѝ влиза още 90 дни само за износа (auth/memberships.ts), после изтриването
 * (eliminazione.ts). Всяка стъпка — ред в регистъра и писмо до администраторите (и до MASTER при искане
 * и оттегляне: доставчикът помага при смяната, чл. 25(2)(a)(i)).
 */

export type EsitoRichiesta = 'ok' | 'gia' | 'assente';

/** Адресите на активните ADMIN на фирмата (и на деактивирана — писмото за края отива и тогава). */
async function indirizziAdmin(aziendaId: string): Promise<string[]> {
  const righe = await prisma.membership.findMany({
    where: { aziendaId, role: 'ADMIN', user: { deactivatedAt: null } },
    select: { user: { select: { email: true } } },
  });
  return [...new Set(righe.map((r) => r.user.email))];
}

async function indirizziMaster(): Promise<string[]> {
  const righe = await prisma.user.findMany({
    where: { master: true, deactivatedAt: null },
    select: { email: true },
  });
  return righe.map((r) => r.email);
}

/** Писмата — след отговора на заявката, всяко поотделно; провалът се записва, не спира нищо. */
function invia(
  tipo: TipoCambioMail,
  destinatari: Promise<string[]>,
  dati: { azienda: string; aziendaId: string; esito: CambioEsito | null; fine: Date | null },
): void {
  const link = new URL(
    `/impostazioni/esportazione?azienda=${encodeURIComponent(dati.aziendaId)}`,
    config().PUBLIC_BASE_URL,
  ).href;
  const fine = dati.fine ? giornoRoma(new Date(dati.fine.getTime() - 1)) : '';
  const eliminazione = dati.fine ? giornoRoma(eliminazioneIl(dati.fine)) : '';
  destinatari
    .then(async (indirizzi) => {
      for (const to of indirizzi) {
        await sendMail(
          cambioMail({
            to,
            tipo,
            azienda: dati.azienda,
            esito: dati.esito,
            fine,
            eliminazione,
            link,
          }),
        );
      }
    })
    .catch((error: unknown) => {
      logger.error({ err: errorMessage(error), tipo }, 'cambio: писмата не тръгнаха');
    });
}

/** Искането: само за активна фирма без друго искане; краят — `fineTransizione`. */
export async function richiediCambio(
  actor: SessionUser,
  aziendaId: string,
  esito: CambioEsito,
  now = new Date(),
): Promise<EsitoRichiesta> {
  const fine = fineTransizione(now);
  const esitoTx = await prisma.$transaction(async (tx) => {
    const azienda = await tx.azienda.findUnique({
      where: { id: aziendaId },
      select: { name: true, deactivatedAt: true },
    });
    if (!azienda || azienda.deactivatedAt) return null;
    const { count } = await tx.azienda.updateMany({
      where: { id: aziendaId, deactivatedAt: null, cambioRichiestoAt: null },
      data: { cambioRichiestoAt: now, cambioFineAt: fine, cambioEsito: esito },
    });
    if (count === 0) return { name: azienda.name, gia: true };
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_CAMBIO_RICHIESTO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { esito, fine: fine.toISOString() },
      },
      tx,
    );
    return { name: azienda.name, gia: false };
  });
  if (!esitoTx) return 'assente';
  if (esitoTx.gia) return 'gia';
  const dati = { azienda: esitoTx.name, aziendaId, esito, fine };
  invia('richiesto', indirizziAdmin(aziendaId), dati);
  invia('masterRichiesto', indirizziMaster(), dati);
  return 'ok';
}

/** Удължаването — веднъж, докато преходът още тече. */
export async function prorogaCambio(
  actor: SessionUser,
  aziendaId: string,
  giorni: Proroga,
  now = new Date(),
): Promise<boolean> {
  const fatto = await prisma.$transaction(async (tx) => {
    // Редът се заключва: удължаване и края на прехода от поддръжката не се разминават.
    const rows = await tx.$queryRaw<
      Array<{ name: string; cambioFineAt: Date | null; cambioEsito: CambioEsito | null }>
    >`SELECT name, "cambioFineAt", "cambioEsito" FROM "Azienda"
      WHERE id = ${aziendaId} AND "deactivatedAt" IS NULL AND NOT "cambioProrogato"
        AND "cambioFineAt" > ${now} FOR UPDATE`;
    const row = rows[0];
    if (!row?.cambioFineAt) return null;
    const fine = fineProroga(row.cambioFineAt, giorni);
    await tx.azienda.update({
      where: { id: aziendaId },
      data: { cambioFineAt: fine, cambioProrogato: true },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_CAMBIO_PROROGATO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { giorni, fine: fine.toISOString() },
      },
      tx,
    );
    return { azienda: row.name, aziendaId, esito: row.cambioEsito, fine };
  });
  if (!fatto) return false;
  invia('prorogato', indirizziAdmin(aziendaId), fatto);
  return true;
}

/** Оттеглянето — докато преходът тече; фирмата продължава, сякаш искане не е имало. */
export async function annullaCambio(
  actor: SessionUser,
  aziendaId: string,
  now = new Date(),
): Promise<boolean> {
  const fatto = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM "Azienda"
      WHERE id = ${aziendaId} AND "deactivatedAt" IS NULL AND "cambioFineAt" > ${now} FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    await tx.azienda.update({
      where: { id: aziendaId },
      data: {
        cambioRichiestoAt: null,
        cambioFineAt: null,
        cambioEsito: null,
        cambioProrogato: false,
      },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_CAMBIO_ANNULLATO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
      },
      tx,
    );
    return row.name;
  });
  if (!fatto) return false;
  const dati = { azienda: fatto, aziendaId, esito: null, fine: null };
  invia('annullato', indirizziAdmin(aziendaId), dati);
  invia('masterAnnullato', indirizziMaster(), dati);
  return true;
}

/** Новият избор какво става с данните — докато преходът тече (Allegato B, B.3). */
export async function cambiaEsito(
  actor: SessionUser,
  aziendaId: string,
  esito: CambioEsito,
  now = new Date(),
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.azienda.updateMany({
      where: { id: aziendaId, deactivatedAt: null, cambioFineAt: { gt: now } },
      data: { cambioEsito: esito },
    });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_CAMBIO_ESITO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { esito },
      },
      tx,
    );
    return true;
  });
}

/**
 * Поддръжката: преходите, които са свършили — фирмата се деактивира (договорът свършва, чл. 25(2)(e)),
 * хората ѝ излизат, ADMIN-ът получава писмо до кога може да свали данните. Колко.
 */
export async function concludiCambi(now = new Date()): Promise<number> {
  const scaduti = await prisma.azienda.findMany({
    where: { deactivatedAt: null, cambioFineAt: { lte: now } },
    select: { id: true },
  });
  let n = 0;
  for (const { id } of scaduti) {
    const fatto = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ name: string; cambioFineAt: Date; cambioEsito: CambioEsito }>
      >`SELECT name, "cambioFineAt", "cambioEsito" FROM "Azienda"
        WHERE id = ${id} AND "deactivatedAt" IS NULL AND "cambioFineAt" <= ${now} FOR UPDATE`;
      const row = rows[0];
      if (!row) return null;
      await tx.azienda.update({ where: { id }, data: { deactivatedAt: now } });
      // Сесиите на хората без друга активна фирма падат (ADMIN-ът влиза наново — само за износа).
      await tx.session.deleteMany({
        where: {
          user: {
            master: false,
            memberships: { some: { aziendaId: id }, none: { azienda: { deactivatedAt: null } } },
          },
        },
      });
      await writeAudit(
        {
          actorId: null,
          action: 'AZIENDA_CAMBIO_CONCLUSO',
          aziendaId: id,
          targetType: 'azienda',
          targetId: id,
          meta: { esito: row.cambioEsito },
        },
        tx,
      );
      return { azienda: row.name, aziendaId: id, esito: row.cambioEsito, fine: now };
    });
    if (!fatto) continue;
    invia('concluso', indirizziAdmin(id), fatto);
    n += 1;
  }
  return n;
}

/** Последният износ на фирмата (за страницата): кога и кой; null — няма. */
export async function ultimaEsportazione(
  aziendaId: string,
): Promise<{ at: Date; nome: string | null } | null> {
  const riga = await prisma.auditLog.findFirst({
    where: { aziendaId, action: 'AZIENDA_EXPORT' },
    orderBy: { at: 'desc' },
    select: { at: true, actor: { select: { name: true, master: true } } },
  });
  if (!riga) return null;
  return { at: riga.at, nome: riga.actor && !riga.actor.master ? riga.actor.name : null };
}

/** Фирмите на човека в преход — лентата над страниците (master/banner.ts): ясно до кога върви услугата. */
export async function cambiInCorso(
  user: SessionUser,
  now = new Date(),
): Promise<Array<{ id: string; name: string; ultimoGiorno: Date; admin: boolean }>> {
  const vive = user.memberships.filter((m) => !m.soloEsportazione);
  if (user.master || vive.length === 0) return [];
  const righe = await prisma.azienda.findMany({
    where: {
      id: { in: vive.map((m) => m.aziendaId) },
      deactivatedAt: null,
      cambioFineAt: { gt: now },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, cambioFineAt: true },
  });
  return righe.map((r) => ({
    id: r.id,
    name: r.name,
    ultimoGiorno: new Date((r.cambioFineAt ?? now).getTime() - 1),
    admin: vive.some((m) => m.aziendaId === r.id && m.role === 'ADMIN'),
  }));
}
