import { Router } from 'express';
import { allegatiDi } from '../allegati/service.js';
import { ordiniDellaScheda } from '../ordini/invio.js';
import { moduliDellaScheda } from '../ordini/modulo-scheda.js';
import { contaDaApprovare, ordineConsentito } from '../schede/approvazione.js';
import { isPartial, principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canAnywhere, canIn, canInPerTogliere, spansAziende } from '../auth/scope.js';
import { cartelliDellaScheda } from '../cartelli/scheda.js';
import { verbaliDellaScheda } from '../verbali/service.js';
import { buoniDellaScheda } from '../buoni/elenco.js';
import { preventiviDellaScheda } from '../preventivi/elenco.js';
import { ordineSezioniDi } from '../aziende/sezioni.js';
import { setFlash } from '../http/flash.js';
import { businessDay } from '../time.js';
import { discrepanzeDi } from '../ordini/collegati.js';
import {
  displaySections,
  emptyFormValues,
  formValuesFromScheda,
  schedaTitle,
} from '../schede/format.js';
import { fogliDi } from '../schizzi/service.js';
import { listSchede } from '../schede/list.js';
import { highlight } from '../schede/search.js';
import { createScheda, getScheda, trashScheda, updateScheda } from '../schede/service.js';
import { formValuesFromBody, parseScheda, type FieldErrors } from '../schede/validation.js';
import {
  AZIENDA_ERROR_KEY,
  aziendeForNew,
  controlloDiscrepanze,
  renderForm,
} from './schede-form.js';
import {
  aziendaFilterOf,
  aziendeOf,
  loadScheda,
  notFound,
  queryOf,
  scope,
} from './schede-shared.js';

export const schedeRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');

schedeRouter.get('/schede', read, async (req, res) => {
  const query = queryOf(req);
  const readScope = scope(req, 'schede:read');
  const azienda = aziendaFilterOf(req, readScope);
  const [page, aziende] = await Promise.all([
    listSchede({ scope: readScope, azienda, query, page: req.query.p }),
    aziendeOf(req, readScope),
  ]);
  const view = { page, query, highlight, aziende, aziendaFilter: azienda ?? '' };
  if (isPartial(req)) {
    res.render('schede/_results', view);
    return;
  }
  // Картите, които чакат одобрение (точка C7) — лента за който одобрява.
  const daApprovareN = canAnywhere(principalOf(req).user, 'schede:approve')
    ? await contaDaApprovare(scope(req, 'schede:approve'))
    : 0;
  res.render('schede/list', { ...view, daApprovareN });
});

schedeRouter.get('/schede/nuova', write, async (req, res) => {
  const { choices, only } = await aziendeForNew(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const azienda =
    only?.id ??
    (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : '');
  // „Duplica“ (точка C4): новата карта взима полетата на друга (видима за човека, във фирма, в която пише),
  // без самоличността на уредбата (матрикула, номер, бон) и с днешната дата; снимки и скици — не.
  const da = typeof req.query.da === 'string' ? req.query.da : null;
  const origine = da ? await getScheda(scope(req, 'schede:read'), da) : null;
  const scrivibile = (aziendaId: string) =>
    only ? only.id === aziendaId : choices.some((a) => a.id === aziendaId);
  if (da && (!origine || !scrivibile(origine.aziendaId))) return notFound(req, res);
  const values = origine
    ? {
        ...formValuesFromScheda(origine, res.locals.fmt),
        data: businessDay(),
        matricola: '',
        numeroImpianto: '',
        buonoLavoro: '',
      }
    : emptyFormValues(businessDay());
  const scelta = origine?.aziendaId ?? azienda;
  await renderForm(req, res, 200, {
    scheda: null,
    values,
    errors: {},
    base: '',
    conflict: false,
    aziende: choices,
    azienda: scelta,
    ordineSezioni: await ordineSezioniDi(scelta || null),
    ...(origine ? { duplicataDa: schedaTitle(origine, res.locals.t) } : {}),
  });
});

schedeRouter.post('/schede', write, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const parsed = parseScheda(body);
  // Само фирма, в която човекът пише (MASTER — всяка активна); с една — винаги тя, каквото и да е пратил.
  const { choices, only } = await aziendeForNew(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  // Редът на разделите — на избраната фирма, само ако е измежду позволените.
  const ordineSezioni = await ordineSezioniDi(azienda?.id ?? null);
  if (!parsed.ok || !azienda) {
    const errors: FieldErrors = azienda ? {} : { [AZIENDA_ERROR_KEY]: 'azienda' };
    await renderForm(req, res, 422, {
      scheda: null,
      values: formValuesFromBody(body),
      errors: { ...errors, ...(parsed.ok ? {} : parsed.errors) },
      base: '',
      conflict: false,
      aziende: choices,
      // Само фирма, в която пише: чужд id не носи данните на чуждата фирма в страницата.
      azienda: azienda?.id ?? '',
      ordineSezioni,
    });
    return;
  }
  const discrepanze = controlloDiscrepanze(res, body, null);
  if (discrepanze.manca) {
    // Картата и модулите казват различни неща: записът чака потвърждение на точно тези разлики.
    await renderForm(req, res, 422, {
      scheda: null,
      values: formValuesFromBody(body),
      errors: {},
      base: '',
      conflict: false,
      aziende: choices,
      azienda: azienda.id,
      conferma: true,
      ordineSezioni,
    });
    return;
  }
  const scheda = await createScheda(
    {
      ...parsed.data,
      discrepanzeConfermate: discrepanze.impronta,
    },
    user.id,
    azienda.id,
  );
  setFlash(res, 'ok', 'flash.schedaCreated');
  res.redirect(303, `/schede/${scheda.id}`);
});

schedeRouter.get('/schede/:id', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  res.render('schede/show', {
    scheda,
    // Снимките и клиповете по раздели; качва, надписва и трие който пише във фирмата (не в кошчето).
    allegati: await allegatiDi(scheda.id),
    modifica: !scheda.deletedAt && canIn(principalOf(req).user, 'schede:write', scheda.aziendaId),
    // Изтекъл абонамент: снимка се трие и тогава (условията, чл. 12.5 в) — само връзката за изтриване.
    elimina:
      !scheda.deletedAt &&
      canInPerTogliere(principalOf(req).user, 'schede:write', scheda.aziendaId),
    showAzienda: spansAziende(scope(req, 'schede:read')),
    ident: schedaTitle(scheda, res.locals.t),
    sections: displaySections(scheda, res.locals.t, res.locals.fmt, scheda.azienda.ordineSezioni),
    // Записани с потвърждение (или отпреди проверката) — да се виждат и след записа.
    discrepanze: discrepanzeDi(formValuesFromScheda(scheda, res.locals.fmt), res.locals.t),
    // Листовете на скицника — и когато фирмата вече го е изключила (нарисуваното остава).
    schizzi: await fogliDi(scheda.id),
    // Табелите „Avviso di fermo impianto“, попълнени от картата — за който вижда табелите на фирмата.
    cartelli: canIn(principalOf(req).user, 'interventi:read', scheda.aziendaId)
      ? await cartelliDellaScheda(scope(req, 'interventi:read'), scheda.id)
      : null,
    // Протоколите „Verbale di chiusura cantiere“ от картата — за който вижда асистенцията на фирмата.
    verbali: canIn(principalOf(req).user, 'interventi:read', scheda.aziendaId)
      ? await verbaliDellaScheda(scope(req, 'interventi:read'), scheda.id)
      : null,
    // „Buono di lavoro“ от картата — за който вижда асистенцията на фирмата.
    buoni: canIn(principalOf(req).user, 'interventi:read', scheda.aziendaId)
      ? await buoniDellaScheda(scope(req, 'interventi:read'), scheda.id)
      : null,
    // Офертите от картата (C1) — само във фирма с включени оферти, за който ги вижда.
    preventivi: canIn(principalOf(req).user, 'preventivi:read', scheda.aziendaId)
      ? await preventiviDellaScheda(scope(req, 'preventivi:read'), scheda.id)
      : null,
    // Одобрението, поръчките към доставчиците и версиите (routes/schede-approvazione.ts, ordini-invio.ts).
    flusso: {
      approva: canIn(principalOf(req).user, 'schede:approve', scheda.aziendaId),
      consentito: ordineConsentito(scheda, scheda.azienda),
      moduli: moduliDellaScheda(scheda),
      ordini: await ordiniDellaScheda(scheda.id),
    },
  });
});

schedeRouter.get('/schede/:id/modifica', write, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  await renderForm(req, res, 200, {
    scheda,
    values: formValuesFromScheda(scheda, res.locals.fmt),
    errors: {},
    base: scheda.updatedAt.toISOString(),
    conflict: false,
    aziende: [],
    azienda: scheda.aziendaId,
  });
});

schedeRouter.post('/schede/:id', write, requireCsrf, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseScheda(body);
  const formView = { scheda, base, aziende: [], azienda: scheda.aziendaId };
  if (!parsed.ok) {
    await renderForm(req, res, 422, {
      ...formView,
      values: formValuesFromBody(body),
      errors: parsed.errors,
      conflict: false,
    });
    return;
  }
  // Потвърдените при последния запис разлики не се питат пак — само нови или променени.
  const discrepanze = controlloDiscrepanze(res, body, scheda.discrepanzeConfermate);
  if (discrepanze.manca) {
    await renderForm(req, res, 422, {
      ...formView,
      values: formValuesFromBody(body),
      errors: {},
      conflict: false,
      conferma: true,
    });
    return;
  }
  const outcome = await updateScheda(
    scope(req, 'schede:write'),
    scheda.id,
    base,
    {
      ...parsed.data,
      discrepanzeConfermate: discrepanze.impronta,
    },
    principalOf(req).user.id,
  );
  if (outcome === 'missing') return notFound(req, res);
  if (outcome === 'conflict') {
    // Въведеното остава на екрана; човекът решава след като види новата версия.
    await renderForm(req, res, 409, {
      ...formView,
      values: formValuesFromBody(body),
      errors: {},
      conflict: true,
    });
    return;
  }
  setFlash(res, 'ok', 'flash.schedaSaved');
  res.redirect(303, `/schede/${scheda.id}`);
});

schedeRouter.get('/schede/:id/elimina', remove, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:delete'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'trash' });
});

schedeRouter.post('/schede/:id/elimina', remove, requireCsrf, async (req, res) => {
  const ok = await trashScheda(
    scope(req, 'schede:delete'),
    String(req.params.id),
    principalOf(req).user.id,
  );
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaTrashed');
  res.redirect(303, '/schede');
});
