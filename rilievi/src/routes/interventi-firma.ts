import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import {
  confermaIntervento,
  parseConferma,
  valoriFirmaDalBody,
  type CampoFirma,
  type ErroriConferma,
} from '../interventi/conferma.js';
import { numeroModulo, type InterventoFull } from '../interventi/service.js';
import { improntaContenuto, improntaLeggibile } from '../interventi/sigillo.js';
import { codiceVoce, GRUPPI_VOCI, valoriVoci } from '../interventi/voci.js';
import { loadIntervento, scope } from './interventi.js';
import { notFound } from './schede-shared.js';

/**
 * „Firma e conferma“ (собственикът, 30 октомври 2026 — подписът е обвързан със съдържанието): страницата
 * показва окончателния лист само за четене и отпечатъка му; техникът и клиентът подписват под него.
 * Формата връща версията и отпечатъка, които е показала — различни ли са от записаните, нищо не се пише
 * и листът се показва наново, без подписите (те бяха за другото съдържание).
 */
export const interventiFirmaRouter: Router = Router();

const write = requireCapability('interventi:write');

interface FirmaView {
  values: Record<CampoFirma, string>;
  errors: ErroriConferma;
  conflict?: boolean;
}

function renderFirma(res: Response, status: number, row: InterventoFull, view: FirmaView): void {
  const numero = numeroModulo(row.numero);
  const impronta = improntaContenuto(row);
  res.status(status).render('interventi/firma', {
    titleKey: 'interventi.conferma.titolo',
    title: res.locals.t('interventi.conferma.titoloNumero', { n: numero }),
    scripts: ['firma'],
    intervento: row,
    numero,
    gruppi: GRUPPI_VOCI,
    codice: codiceVoce,
    voci: valoriVoci(row.voci),
    firme: { tecnico: null, cliente: null },
    senzaFirme: true,
    base: row.updatedAt.toISOString(),
    improntaHex: impronta,
    improntaTesto: improntaLeggibile(impronta),
    ...view,
  });
}

/** Празните полета на подписа; името на техника — на влезлия човек (може да се смени). */
const valoriVuoti = (req: Request): Record<CampoFirma, string> => ({
  firmaTecnico: '',
  firmaTecnicoNome: principalOf(req).user.name,
  firmaCliente: '',
  firmaClienteNome: '',
});

/** Листът за подпис: само чернова, само с право на запис във фирмата му. */
async function bozzaDaFirmare(req: Request, res: Response): Promise<InterventoFull | null> {
  const row = await loadIntervento(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId)) {
    notFound(req, res);
    return null;
  }
  if (row.confermatoAt) {
    setFlash(res, 'info', 'interventi.chiuso');
    res.redirect(303, `/interventi/${row.id}`);
    return null;
  }
  return row;
}

interventiFirmaRouter.get('/interventi/:id/firma', write, async (req, res) => {
  const row = await bozzaDaFirmare(req, res);
  if (!row) return;
  renderFirma(res, 200, row, { values: valoriVuoti(req), errors: {} });
});

interventiFirmaRouter.post('/interventi/:id/conferma', write, requireCsrf, async (req, res) => {
  const row = await bozzaDaFirmare(req, res);
  if (!row) return;
  const body = req.body as Record<string, unknown>;
  const vista = {
    base: typeof body.base === 'string' ? body.base : '',
    impronta: typeof body.impronta === 'string' ? body.impronta : '',
  };
  // Подписаното не е това, което е в базата: листът наново, подписите — празни, имената остават.
  const cambiato = (current: InterventoFull) =>
    renderFirma(res, 409, current, {
      values: { ...valoriFirmaDalBody(body), firmaTecnico: '', firmaCliente: '' },
      errors: {},
      conflict: true,
    });
  if (vista.base !== row.updatedAt.toISOString() || vista.impronta !== improntaContenuto(row))
    return cambiato(row);
  const parsed = parseConferma(body);
  if (!parsed.ok)
    return renderFirma(res, 422, row, { values: valoriFirmaDalBody(body), errors: parsed.errors });
  const esito = await confermaIntervento(
    scope(req, 'interventi:write'),
    row.id,
    vista,
    parsed.data,
    principalOf(req).user.id,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'conflict') {
    const current = await bozzaDaFirmare(req, res);
    if (current) cambiato(current);
    return;
  }
  setFlash(
    res,
    esito === 'ok' ? 'ok' : 'info',
    esito === 'ok' ? 'interventi.flash.confermato' : 'interventi.chiuso',
  );
  res.redirect(303, `/interventi/${row.id}`);
});
