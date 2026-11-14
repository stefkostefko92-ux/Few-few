import { Router, type Request, type Response } from 'express';
import { principalOf, requireCsrf, requireUser, safeNext } from '../auth/guards.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { firmaCondizioni, type Contesto } from '../legale/accettazioni.js';
import { mailCopia, pdfCopia } from '../legale/copia.js';
import {
  avviaFirma,
  CODICE_MINUTI,
  codiceSchema,
  MAX_TENTATIVI,
  sfidaAperta,
  type Dichiarati,
} from '../legale/firma.js';
import { ACCETTA_PATH, FIRMA_PATH, percorsoDaFirmare } from '../legale/percorsi.js';
import { daAccettare } from '../legale/stato.js';
import { clausoleSpecifiche, leggiTesto } from '../legale/testi.js';
import { versioneDaFirmare } from '../legale/versioni.js';
import { logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { renderAccetta } from './condizioni-vista.js';

/**
 * Втората стъпка на ADMIN (чл. 3.1 от условията; Cass. 20945/2026): на своя страница — специалното
 * одобрение на клаузите от чл. 24, всяка с номер, описание и пълния си текст, подписано с кода от
 * имейла му. После копието (PDF) по имейл; свалянето — condizioni.ts.
 */
export const condizioniFirmaRouter: Router = Router();

/** Адресът и браузърът — за регистъра на приеманията (чл. 19.1). */
export const contestoDi = (req: Request): Contesto => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

const conNext = (path: string, next: string): string => `${path}?next=${encodeURIComponent(next)}`;

/**
 * Праща кода (нов опит) и води към подписа. Без поща кодът не стига до никого: в продукция това е
 * грешка и опитът пада; в среда за проба без SMTP кодът се показва на страницата.
 */
export async function iniziaFirma(
  req: Request,
  res: Response,
  o: {
    aziendaId: string;
    dichiarati: Dichiarati;
    next: string;
    valori: Record<string, string>;
  },
): Promise<void> {
  const user = principalOf(req).user;
  const avvio = await avviaFirma(user, o.aziendaId, o.dichiarati);
  if (!avvio.ok) {
    if (avvio.motivo === 'attendi' && (await sfidaAperta(user.id))) {
      res.redirect(303, conNext(FIRMA_PATH, o.next));
      return;
    }
    const status = avvio.motivo === 'ruolo' ? 409 : 429;
    await renderAccetta(req, res, status, {
      errori: {},
      valori: o.valori,
      errore: `legale.accetta.errore.${avvio.motivo}`,
    });
    return;
  }
  const t = res.locals.t;
  const esito = await sendMail({
    to: avvio.email,
    subject: t('legale.mail.codice.subject'),
    text: t('legale.mail.codice.text', {
      codice: avvio.codice,
      versione: versioneDaFirmare('CONDIZIONI'),
      azienda: o.dichiarati.ragioneSociale,
      minuti: CODICE_MINUTI,
    }),
  });
  if (esito === 'disabled' && !isProduction()) {
    setFlash(res, 'info', 'legale.firma.prova', { codice: avvio.codice });
  } else if (esito !== 'sent') {
    // Само ТОЗИ опит: писмото може да е чакало сървъра минути, а междувременно да е тръгнал друг код.
    await prisma.firmaCondizioni.deleteMany({ where: { id: avvio.id, usataAt: null } });
    await renderAccetta(req, res, 502, {
      errori: {},
      valori: o.valori,
      errore: 'legale.accetta.errore.invio',
    });
    return;
  }
  res.redirect(303, conNext(FIRMA_PATH, o.next));
}

async function renderFirma(
  req: Request,
  res: Response,
  status: number,
  extra: { errori?: Record<string, string>; errore?: string | null; rimasti?: number } = {},
): Promise<void> {
  const user = principalOf(req).user;
  const next = safeNext(
    req.method === 'GET' ? req.query.next : (req.body as { next?: unknown }).next,
  );
  const sfida = await sfidaAperta(user.id);
  if (!sfida) {
    if (extra.errore) setFlash(res, 'error', extra.errore);
    res.redirect(303, conNext(ACCETTA_PATH, next));
    return;
  }
  const dichiarati = sfida.dichiarati as unknown as Dichiarati;
  // Текстът на опита (пратения код) — него вижда и подписва човекът.
  res.status(status).render('legale/firma', {
    clausole: clausoleSpecifiche(leggiTesto('CONDIZIONI', sfida.versione)),
    azienda: dichiarati.ragioneSociale,
    email: sfida.email,
    versione: sfida.versione,
    minuti: CODICE_MINUTI,
    errori: extra.errori ?? {},
    errore: extra.errore ?? null,
    rimasti: extra.rimasti ?? MAX_TENTATIVI - sfida.tentativi,
    next,
    condizioniPath: percorsoDaFirmare(),
  });
}

condizioniFirmaRouter.get(FIRMA_PATH, requireUser, async (req, res) => {
  if (daAccettare(principalOf(req).user).condizioni !== 'accetta') {
    res.redirect(303, conNext(ACCETTA_PATH, safeNext(req.query.next)));
    return;
  }
  await renderFirma(req, res, 200);
});

condizioniFirmaRouter.post(FIRMA_PATH, requireUser, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const next = safeNext(body.next);
  const stato = daAccettare(user);
  if (stato.condizioni === null) {
    res.redirect(303, next);
    return;
  }
  if (stato.condizioni !== 'accetta') {
    await renderAccetta(req, res, 409, {
      errori: {},
      valori: {},
      errore: 'legale.firma.errore.ruolo',
    });
    return;
  }
  if (body.clausole !== 'si') {
    await renderFirma(req, res, 422, { errori: { clausole: 'legale.firma.errore.clausole' } });
    return;
  }
  const codice = codiceSchema.safeParse(typeof body.codice === 'string' ? body.codice : '');
  if (!codice.success) {
    await renderFirma(req, res, 422, { errori: { codice: 'legale.firma.errore.formato' } });
    return;
  }
  const t = res.locals.t;
  const dateTime = res.locals.fmt.dateTime;
  const esito = await firmaCondizioni(user, codice.data, contestoDi(req), (d) =>
    pdfCopia(d, t, dateTime, config().PDF_FONT_DIR),
  );
  if (!esito.ok) {
    if (esito.motivo === 'codice') {
      const sfida = await sfidaAperta(user.id);
      await renderFirma(req, res, 422, {
        errori: { codice: 'legale.firma.errore.codice' },
        rimasti: sfida ? MAX_TENTATIVI - sfida.tentativi : 0,
      });
      return;
    }
    if (esito.motivo === 'ruolo') {
      await renderFirma(req, res, 409, { errore: 'legale.firma.errore.ruolo' });
      return;
    }
    setFlash(res, 'error', `legale.firma.errore.${esito.motivo}`);
    res.redirect(303, conNext(ACCETTA_PATH, next));
    return;
  }
  const mail = mailCopia(esito.firmato, t, dateTime);
  const inviata = await sendMail({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    attachments: [
      { filename: mail.filename, content: esito.copia, contentType: 'application/pdf' },
    ],
  });
  // Приемането е записано: без писмо копието остава за сваляне от профила.
  if (inviata !== 'sent') logger.warn({ inviata }, 'копието на условията не тръгна по имейл');
  setFlash(res, 'ok', 'legale.flash.accettate');
  res.redirect(303, next);
});

/** Нов код за същите декларирани данни — след минута, до MAX_CODICI_ORA на час (firma.ts). */
condizioniFirmaRouter.post(
  `${FIRMA_PATH}/nuovo-codice`,
  requireUser,
  requireCsrf,
  async (req, res) => {
    const user = principalOf(req).user;
    const next = safeNext((req.body as { next?: unknown }).next);
    const ultima = await prisma.firmaCondizioni.findFirst({
      where: { userId: user.id },
      orderBy: { inviatoAt: 'desc' },
    });
    if (daAccettare(user).condizioni !== 'accetta' || !ultima) {
      res.redirect(303, conNext(ACCETTA_PATH, next));
      return;
    }
    const avvio = await avviaFirma(
      user,
      ultima.aziendaId,
      ultima.dichiarati as unknown as Dichiarati,
    );
    if (!avvio.ok) {
      setFlash(res, 'error', `legale.accetta.errore.${avvio.motivo}`);
      res.redirect(303, conNext(FIRMA_PATH, next));
      return;
    }
    const t = res.locals.t;
    const esito = await sendMail({
      to: avvio.email,
      subject: t('legale.mail.codice.subject'),
      text: t('legale.mail.codice.text', {
        codice: avvio.codice,
        versione: versioneDaFirmare('CONDIZIONI'),
        azienda: (ultima.dichiarati as unknown as Dichiarati).ragioneSociale,
        minuti: CODICE_MINUTI,
      }),
    });
    if (esito === 'disabled' && !isProduction())
      setFlash(res, 'info', 'legale.firma.prova', { codice: avvio.codice });
    else if (esito === 'sent') setFlash(res, 'ok', 'legale.flash.codiceInviato');
    else {
      // Кодът не е стигнал до никого: опитът пада (не брои в тавана на час) и човекът започва наново —
      // предишният код вече е изгорен от `avviaFirma`, на страницата на подписа няма какво да се въведе.
      await prisma.firmaCondizioni.deleteMany({ where: { id: avvio.id, usataAt: null } });
      setFlash(res, 'error', 'legale.accetta.errore.invio');
      res.redirect(303, conNext(ACCETTA_PATH, next));
      return;
    }
    res.redirect(303, conNext(FIRMA_PATH, next));
  },
);
