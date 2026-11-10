import { Router } from 'express';
import { principalOf, requireCsrf, requireUser, safeNext } from '../auth/guards.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { accettaRegole, ultimaAccettazione } from '../legale/accettazioni.js';
import { pdfCopia } from '../legale/copia.js';
import { dichiaratiSchema, type Dichiarati } from '../legale/firma.js';
import { renderCopiaAccettazione } from '../legale/pdf.js';
import { ACCETTA_PATH, COPIA_PATH } from '../legale/percorsi.js';
import { CAMPI_ACCETTAZIONE, sigilloValido } from '../legale/sigillo.js';
import { daAccettare, inAttesa } from '../legale/stato.js';
import { hashTesto, leggiTesto } from '../legale/testi.js';
import { TESTI_AGGIORNATI, VERSIONE } from '../legale/versioni.js';
import { logger } from '../logger.js';
import { CONDIZIONI_PATH, CONDIZIONI_PDF_PATH } from '../seo/paths.js';
import { paginaStructuredData } from '../seo/structured-data.js';
import { contestoDi, iniziaFirma } from './condizioni-firma.js';
import { renderAccetta, testo } from './condizioni-vista.js';
import { publicCache, siteLocals } from './site.js';

/**
 * Условията за услугата и правилата за ползване (собственикът, 10 ноември 2026 — „Fai tutto in modo tale
 * da essere legalmente coperti e minimamente esposti“): публичната страница и PDF-ът им, страницата за
 * приемане в портала (пропускът е в requireUser) и копието на администратора. Подписът с код —
 * condizioni-firma.ts.
 */
export const condizioniRouter: Router = Router();

condizioniRouter.get(CONDIZIONI_PATH, (req, res) => {
  publicCache(req, res);
  const locals = siteLocals(req, CONDIZIONI_PATH);
  const condizioni = leggiTesto('CONDIZIONI');
  const regole = leggiTesto('REGOLE');
  const t = res.locals.t;
  res.render('site/condizioni', {
    ...locals,
    jsonLd: paginaStructuredData(t, locals.canonical ?? '', {
      title: t('legale.pagina.title'),
      description: t('legale.pagina.metaDescription'),
      updated: TESTI_AGGIORNATI,
    }),
    condizioni,
    regole,
    hash: { condizioni: hashTesto(condizioni), regole: hashTesto(regole) },
    pdfPath: CONDIZIONI_PDF_PATH,
  });
});

/** Текстовете като PDF — да се запазят, преди да се приемат (El Majdoub, C-322/14). */
condizioniRouter.get(CONDIZIONI_PDF_PATH, pdfLimiter, async (_req, res) => {
  const pdf = await renderCopiaAccettazione({
    titolo: res.locals.t('legale.pagina.title'),
    testi: [leggiTesto('CONDIZIONI'), leggiTesto('REGOLE')],
    riepilogo: [],
    t: res.locals.t,
    fontDir: config().PDF_FONT_DIR,
  });
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="condizioni-rilievi-impianti-${VERSIONE.CONDIZIONI}.pdf"`,
      'Content-Length': String(pdf.length),
    })
    .end(pdf);
});

condizioniRouter.get(ACCETTA_PATH, requireUser, async (req, res) => {
  if (!inAttesa(daAccettare(principalOf(req).user))) {
    res.redirect(safeNext(req.query.next));
    return;
  }
  await renderAccetta(req, res, 200, { errori: {}, valori: {}, errore: null });
});

/**
 * Първата стъпка: правилата (всеки) и — за ADMIN — приемането за фирмата с декларираните ѝ данни; после
 * кодът към имейла му и страницата за подписа (condizioni-firma.ts). Нищо не се пише при грешка.
 */
condizioniRouter.post(ACCETTA_PATH, requireUser, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const stato = daAccettare(user);
  const next = safeNext(body.next);
  if (!inAttesa(stato)) {
    res.redirect(303, next);
    return;
  }
  const valori = {
    ragioneSociale: testo(body.ragioneSociale),
    sede: testo(body.sede),
    partitaIva: testo(body.partitaIva),
    condizioni: testo(body.condizioni),
    regole: testo(body.regole),
  };
  if (body.versioneCondizioni !== VERSIONE.CONDIZIONI || body.versioneRegole !== VERSIONE.REGOLE) {
    await renderAccetta(req, res, 409, {
      errori: {},
      valori,
      errore: 'legale.accetta.errore.versione',
    });
    return;
  }
  const errori: Record<string, string> = {};
  if (stato.regole && valori.regole !== 'si') errori.regole = 'legale.accetta.errore.regole';
  let dichiarati: Dichiarati | null = null;
  if (stato.condizioni === 'accetta') {
    if (valori.condizioni !== 'si') errori.condizioni = 'legale.accetta.errore.condizioni';
    const parsed = dichiaratiSchema.safeParse(valori);
    if (parsed.success) dichiarati = parsed.data;
    else
      for (const issue of parsed.error.issues) {
        const campo = String(issue.path[0] ?? '');
        errori[campo] ??= `legale.accetta.errore.${campo}`;
      }
  }
  if (Object.keys(errori).length > 0) {
    await renderAccetta(req, res, 422, { errori, valori, errore: null });
    return;
  }
  if (stato.regole) await accettaRegole(user, contestoDi(req));
  if (stato.condizioni === 'accetta' && dichiarati && stato.azienda) {
    await iniziaFirma(req, res, { aziendaId: stato.azienda.id, dichiarati, next, valori });
    return;
  }
  setFlash(res, 'ok', 'legale.flash.regole');
  res.redirect(
    303,
    stato.condizioni === 'attendi' ? `${ACCETTA_PATH}?next=${encodeURIComponent(next)}` : next,
  );
});

/** Копието на последното приемане за фирмата — само за нейния ADMIN; печатът се проверява първо. */
condizioniRouter.get(COPIA_PATH, requireUser, pdfLimiter, async (req, res) => {
  // Фирмата от `?azienda=` (човек в няколко фирми), иначе първата — само където е ADMIN.
  const admin = principalOf(req).user.memberships.filter((m) => m.role === 'ADMIN');
  const membership =
    typeof req.query.azienda === 'string'
      ? admin.find((m) => m.aziendaId === req.query.azienda)
      : admin[0];
  const riga = membership ? await ultimaAccettazione(membership.aziendaId) : null;
  if (!riga?.otpEmail || !riga.otpInviatoAt || !riga.otpVerificatoAt) {
    res.status(404).render('errors/error', {
      titleKey: 'error.notFoundTitle',
      messageKey: 'legale.copia.nessuna',
      status: 404,
    });
    return;
  }
  if (!sigilloValido(riga, CAMPI_ACCETTAZIONE)) {
    logger.error({ id: riga.id }, 'регистърът на приеманията: печатът не съвпада');
    throw new Error('печатът на приемането не съвпада');
  }
  const pdf = await pdfCopia(
    {
      at: riga.at,
      versione: riga.versione,
      hash: riga.hash,
      clausole: riga.clausole,
      ragioneSociale: riga.ragioneSociale ?? '',
      sede: riga.sede ?? '',
      partitaIva: riga.partitaIva ?? '',
      nome: riga.userNome,
      email: riga.userEmail,
      otpEmail: riga.otpEmail,
      otpInviatoAt: riga.otpInviatoAt,
      otpVerificatoAt: riga.otpVerificatoAt,
    },
    res.locals.t,
    res.locals.fmt.dateTime,
    config().PDF_FONT_DIR,
  );
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="condizioni-rilievi-impianti-${riga.versione}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    })
    .end(pdf);
});
