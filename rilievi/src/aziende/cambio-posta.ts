import type { CambioEsito } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { cambioMail, type TipoCambioMail } from '../mail/templates.js';
import { giornoRoma } from '../master/tempo.js';
import { eliminazioneIl } from './eliminazione.js';

/** Писмата на смяната на доставчика (src/aziende/cambio.ts): до администраторите на фирмата и до MASTER. */

/** Адресите на активните ADMIN на фирмата (и на деактивирана — писмото за края отива и тогава). */
export async function indirizziAdmin(aziendaId: string): Promise<string[]> {
  const righe = await prisma.membership.findMany({
    where: { aziendaId, role: 'ADMIN', user: { deactivatedAt: null } },
    select: { user: { select: { email: true } } },
  });
  return [...new Set(righe.map((r) => r.user.email))];
}

export async function indirizziMaster(): Promise<string[]> {
  const righe = await prisma.user.findMany({
    where: { master: true, deactivatedAt: null },
    select: { email: true },
  });
  return righe.map((r) => r.email);
}

/** Писмата — след отговора на заявката, всяко поотделно; провалът се записва, не спира нищо. */
export function invia(
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
