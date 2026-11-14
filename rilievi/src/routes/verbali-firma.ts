import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { copiaLimiter, pdfLimiter } from '../http/limits.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import {
  confermaVerbale,
  parseFirmeVerbale,
  sigilloVerbaleIntatto,
  valoriFirmeVerbale,
  type CampoFirmaVerbale,
  type ErroriFirmaVerbale,
} from '../verbali/conferma.js';
import { COPIE, type Copia } from '../verbali/pdf.js';
import { pdfVerbale } from './firma-copia.js';
import type { VerbaleFull } from '../verbali/service.js';
import { improntaVerbale } from '../verbali/sigillo.js';
import { scope } from './interventi.js';
import { copiaEmailSchema } from '../legale/informativa.js';
import { copiaVerbale, informativaDi } from './firma-copia.js';
import { notFound } from './schede-shared.js';
import { loadVerbale, vistaFoglio } from './verbali.js';

/**
 * „Firma e conferma“ на протокола — като листа за интервенция: страницата показва окончателния протокол
 * само за четене и отпечатъка му; техникът изпълнител и супервайзърът подписват под него. Без „Verbale
 * positivo“ протоколът не се подписва — обратно към формата. После — двата PDF-а от едно и също подписано
 * съдържание: „Copia azienda“ и „Copia installatore“, само при непокътнат печат.
 */
export const verbaliFirmaRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

interface FirmaView {
  /** Имейлът за копието (по избор) и грешката му — връщат се с формата. */
  copiaEmail?: string;
  erroreCopia?: boolean;
  values: Record<CampoFirmaVerbale, string>;
  errors: ErroriFirmaVerbale;
  conflict?: boolean;
}

async function renderFirma(
  res: Response,
  status: number,
  row: VerbaleFull,
  view: FirmaView,
): Promise<void> {
  const impronta = improntaVerbale(row);
  const informativa = await informativaDi(row.aziendaId);
  res.status(status).render('verbali/firma', {
    titleKey: 'verbali.conferma.titolo',
    scripts: ['firma'],
    ...vistaFoglio(row),
    firme: { tecnico: null, supervisore: null },
    senzaFirme: true,
    base: row.updatedAt.toISOString(),
    improntaHex: impronta,
    improntaTesto: improntaLeggibile(impronta),
    informativa,
    copiaEmail: '',
    erroreCopia: false,
    ...view,
  });
}

const valoriVuoti = (req: Request): Record<CampoFirmaVerbale, string> => ({
  firmaTecnico: '',
  firmaTecnicoNome: principalOf(req).user.name,
  firmaSupervisore: '',
  firmaSupervisoreNome: '',
});

/** Протоколът за подпис: само чернова, само с право на запис във фирмата, само с „Verbale positivo“. */
async function bozzaDaFirmare(req: Request, res: Response): Promise<VerbaleFull | null> {
  const row = await loadVerbale(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId)) {
    notFound(req, res);
    return null;
  }
  if (row.confermatoAt) {
    setFlash(res, 'info', 'verbali.chiuso');
    res.redirect(303, `/verbali/${row.id}`);
    return null;
  }
  if (row.positivo === null) {
    setFlash(res, 'error', 'verbali.positivoMancante');
    res.redirect(303, `/verbali/${row.id}/modifica`);
    return null;
  }
  return row;
}

verbaliFirmaRouter.get('/verbali/:id/firma', write, async (req, res) => {
  const row = await bozzaDaFirmare(req, res);
  if (!row) return;
  await renderFirma(res, 200, row, { values: valoriVuoti(req), errors: {} });
});

verbaliFirmaRouter.post(
  '/verbali/:id/conferma',
  write,
  requireCsrf,
  copiaLimiter,
  async (req, res) => {
    const row = await bozzaDaFirmare(req, res);
    if (!row) return;
    const body = req.body as Record<string, unknown>;
    // По избор: имейлът за копието (legale/informativa.ts) — само адрес или нищо; не се пази.
    const copiaEmail = typeof body.copiaEmail === 'string' ? body.copiaEmail.slice(0, 254) : '';
    const copia = copiaEmailSchema.safeParse(copiaEmail);
    const vista = {
      base: typeof body.base === 'string' ? body.base : '',
      impronta: typeof body.impronta === 'string' ? body.impronta : '',
    };
    // Подписаното не е това, което е в базата: протоколът наново, подписите — празни, имената остават.
    const cambiato = (current: VerbaleFull) =>
      renderFirma(res, 409, current, {
        values: { ...valoriFirmeVerbale(body), firmaTecnico: '', firmaSupervisore: '' },
        errors: {},
        conflict: true,
        copiaEmail,
      });
    if (vista.base !== row.updatedAt.toISOString() || vista.impronta !== improntaVerbale(row))
      return cambiato(row);
    if (!copia.success)
      return renderFirma(res, 422, row, {
        values: valoriFirmeVerbale(body),
        errors: {},
        copiaEmail,
        erroreCopia: true,
      });
    const parsed = parseFirmeVerbale(body);
    if (!parsed.ok)
      return renderFirma(res, 422, row, {
        values: valoriFirmeVerbale(body),
        errors: parsed.errors,
        copiaEmail,
      });
    const esito = await confermaVerbale(
      scope(req, 'interventi:write'),
      row.id,
      vista,
      parsed.data,
      principalOf(req).user.id,
    );
    if (esito === 'missing') return notFound(req, res);
    if (esito === 'conflict' || esito === 'incompleto') {
      const current = await bozzaDaFirmare(req, res);
      if (current) await cambiato(current);
      return;
    }
    if (typeof esito === 'object') {
      // Щрихи, които вече стоят на друг документ: подписът се рисува наново, на ръка; другият остава.
      const values = valoriFirmeVerbale(body);
      const errors: ErroriFirmaVerbale = {};
      for (const campo of esito.ripetute) {
        values[campo] = '';
        errors[campo] = 'ripetuta';
      }
      return renderFirma(res, 422, row, { values, errors, copiaEmail });
    }
    if (esito === 'ok' && copia.data) {
      // Копието за подписалия — от потвърдения документ, с проверката на печата.
      const confermato = await loadVerbale(req);
      const inviata = confermato
        ? await copiaVerbale(res, confermato, copia.data, principalOf(req).user.id)
        : 'failed';
      setFlash(
        res,
        inviata === 'sent' ? 'ok' : 'error',
        inviata === 'sent' ? 'verbali.flash.confermatoCopia' : 'verbali.flash.confermatoCopiaNo',
      );
      res.redirect(303, `/verbali/${row.id}`);
      return;
    }
    setFlash(
      res,
      esito === 'ok' ? 'ok' : 'info',
      esito === 'ok' ? 'verbali.flash.confermato' : 'verbali.chiuso',
    );
    res.redirect(303, `/verbali/${row.id}`);
  },
);

const copiaDi = (value: unknown): Copia | null =>
  COPIE.includes(value as Copia) ? (value as Copia) : null;

/** Двата PDF-а — само от потвърден протокол с непокътнат печат; черновата няма PDF. */
verbaliFirmaRouter.get('/verbali/:id/pdf/:copia', read, pdfLimiter, async (req, res) => {
  const copia = copiaDi(req.params.copia);
  const row = copia ? await loadVerbale(req) : null;
  if (!copia || !row || !row.confermatoAt) return notFound(req, res);
  if (!sigilloVerbaleIntatto(row)) {
    setFlash(res, 'error', 'verbali.sigillo.bloccato');
    res.redirect(303, `/verbali/${row.id}`);
    return;
  }
  const { pdf, filename } = await pdfVerbale(res, row, copia);
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    })
    .end(pdf);
});
