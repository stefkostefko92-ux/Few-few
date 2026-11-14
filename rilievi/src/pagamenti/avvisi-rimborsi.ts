import type { Pagamento } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import {
  rimborsoEseguitoMail,
  rimborsoFallitoMail,
  rimborsoMasterMail,
} from '../mail/templates-rimborsi.js';

/**
 * Писмата за връщанията през Revolut: до платилия — когато Revolut потвърди (чл. 12.9), до всеки MASTER — и при
 * потвърдено, и при неуспешно. Тръгват след записа; писмо, което не тръгне, се записва с номера на плащането.
 */
const link = (p: Pagamento): string =>
  `${config().PUBLIC_BASE_URL}/master/pagamenti/${p.id}/rimborso`;

export const indirizziMaster = async (): Promise<string[]> =>
  (
    await prisma.user.findMany({
      where: { master: true, deactivatedAt: null },
      select: { email: true },
    })
  ).map((m) => m.email);

/** Адресът на платилия: акаунтът му, а ако вече го няма (изтрита фирма) — адресът от приетата оферта. */
async function emailPagante(p: Pagamento): Promise<string | null> {
  if (p.createdById) {
    const u = await prisma.user.findUnique({
      where: { id: p.createdById },
      select: { email: true },
    });
    if (u) return u.email;
  }
  const prova = await prisma.accettazioneOfferta.findUnique({
    where: { pagamentoId: p.id },
    select: { userEmail: true },
  });
  return prova?.userEmail ?? null;
}

export async function avvisaRimborso(p: Pagamento, importoCent: number): Promise<void> {
  try {
    const [master, chi] = await Promise.all([indirizziMaster(), emailPagante(p)]);
    if (chi) await sendMail(rimborsoEseguitoMail({ to: chi, pagamento: p, importoCent }));
    for (const to of master)
      await sendMail(rimborsoMasterMail({ to, pagamento: p, importoCent, link: link(p) }));
  } catch (error) {
    logger.error(
      { evento: 'rimborso.mail_fallita', err: errorMessage(error), pagamento: p.id },
      'rimborso: email non inviate',
    );
  }
}

export async function avvisaRimborsoFallito(
  p: Pagamento,
  importoCent: number,
  codice: string,
): Promise<void> {
  try {
    for (const to of await indirizziMaster())
      await sendMail(rimborsoFallitoMail({ to, pagamento: p, importoCent, codice, link: link(p) }));
  } catch (error) {
    logger.error(
      { evento: 'rimborso.mail_fallita', err: errorMessage(error), pagamento: p.id },
      'rimborso: email non inviate',
    );
  }
}
