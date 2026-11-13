import type { Response } from 'express';
import { writeAudit } from '../audit.js';
import { aziendaLogo } from '../aziende/service.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { sigilloIntatto } from '../interventi/conferma.js';
import { numeroModulo, registraInvio, type InterventoFull } from '../interventi/service.js';
import { informativaPerFirma } from '../legale/informativa.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { interventoMail, verbaleMail } from '../mail/templates.js';
import { sigilloVerbaleIntatto } from '../verbali/conferma.js';
import { COPIE, renderVerbalePdf, type Copia } from '../verbali/pdf.js';
import type { VerbaleFull } from '../verbali/service.js';
import { dayFromDate } from '../time.js';
import { pdfDi } from './interventi-invio.js';

/**
 * Страницата на подписа и копието за подписалия (собственикът, 12 ноември 2026 — точка D4; условията 5.5 и
 * 15.4 от версия 2026-11-12): информацията по чл. 13 на фирмата над подписите и по избор имейл, на който
 * потвърденият документ (PDF/A) тръгва веднага. Адресът не се пази — само одитът, без него.
 */

/** Текстът на информацията за фирмата на документа. */
export async function informativaDi(aziendaId: string): Promise<string> {
  const azienda = await prisma.azienda.findUniqueOrThrow({
    where: { id: aziendaId },
    select: { name: true, datiSocietari: true, informativaFirme: true },
  });
  return informativaPerFirma(azienda);
}

/** Една от двете копия на протокола като PDF — за свалянето (verbali-firma.ts) и за писмото. */
export async function pdfVerbale(
  res: Response,
  row: VerbaleFull,
  copia: Copia,
): Promise<{ pdf: Buffer; filename: string }> {
  const logo = row.azienda.logoType ? await aziendaLogo(row.aziendaId) : null;
  const pdf = await renderVerbalePdf(row, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
    copia,
  });
  return { pdf, filename: `verbale-chiusura-cantiere-${dayFromDate(row.data)}-copia-${copia}.pdf` };
}

/** Потвърденият лист за интервенция до подписалия; 'failed' и при нарушен печат (не тръгва нищо). */
export async function copiaIntervento(
  res: Response,
  row: InterventoFull,
  to: string,
  actorId: string,
): Promise<MailResult> {
  if (!row.confermatoAt || !sigilloIntatto(row)) return 'failed';
  const { pdf, filename } = await pdfDi(res, row);
  const esito = await sendMail(
    interventoMail({
      to,
      numero: numeroModulo(row.numero),
      data: res.locals.fmt.day(row.data),
      azienda: row.azienda.name,
      pdf,
      filename,
    }),
  );
  if (esito === 'sent') await registraInvio(actorId, row);
  return esito;
}

/** Двете копия на потвърдения протокол до подписалия, в едно писмо. */
export async function copiaVerbale(
  res: Response,
  row: VerbaleFull,
  to: string,
  actorId: string,
): Promise<MailResult> {
  if (!row.confermatoAt || !sigilloVerbaleIntatto(row)) return 'failed';
  const allegati = await Promise.all(COPIE.map((copia) => pdfVerbale(res, row, copia)));
  const esito = await sendMail(
    verbaleMail({
      to,
      data: res.locals.fmt.day(row.data),
      azienda: row.azienda.name,
      allegati,
    }),
  );
  if (esito === 'sent') {
    await writeAudit({
      actorId,
      action: 'VERBALE_EMAIL',
      aziendaId: row.aziendaId,
      targetType: 'verbale',
      targetId: row.id,
      meta: { copie: allegati.length },
    });
  }
  return esito;
}
