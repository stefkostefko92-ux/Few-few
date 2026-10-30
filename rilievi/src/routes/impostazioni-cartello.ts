import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { CAMPI_DATI, parseDatiSocietari } from '../aziende/dati.js';
import { setCartelloModello, setDatiSocietari } from '../aziende/intestazione.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { anteprimaModello } from '../cartelli/anteprima.js';
import { isModelloId, MODELLI } from '../cartelli/modelli.js';
import { setFlash } from '../http/flash.js';
import { notFound, renderImpostazioni } from './impostazioni.js';

/**
 * Настройките на фирмата за табелата „Avviso di fermo impianto“: данните ѝ (главата на табелата до
 * логото) и шаблонът. Пишат администраторът ѝ и MASTER (`aziende:settings`); фирма извън обхвата — 404.
 * Умалените шаблони са за всеки, който вижда табелите или настройките.
 */
export const impostazioniCartelloRouter: Router = Router();
const settings = requireCapability('aziende:settings');
const read = requireCapability('interventi:read');

impostazioniCartelloRouter.post('/impostazioni/dati', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const parsed = parseDatiSocietari(body);
  if (!parsed.ok) {
    // Пратеното обратно във формата — само низовете на нейните полета.
    const values = Object.fromEntries(
      CAMPI_DATI.map((key) => {
        const value = body[key];
        return [key, typeof value === 'string' ? value.slice(0, 400) : ''];
      }),
    );
    return renderImpostazioni(res, 422, {
      aziende,
      azienda,
      dati: { values, errors: parsed.errors },
    });
  }
  if (!(await setDatiSocietari(user, azienda.id, parsed.data))) return notFound(req, res);
  setFlash(res, 'ok', 'flash.datiSaved');
  res.redirect(303, `/impostazioni?azienda=${encodeURIComponent(azienda.id)}#h-dati`);
});

impostazioniCartelloRouter.post(
  '/impostazioni/cartello',
  settings,
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const aziende = await aziendeImpostabili(user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda) return notFound(req, res);
    if (!isModelloId(body.modello)) {
      return renderImpostazioni(res, 400, { aziende, azienda, error: 'impostazioni.error' });
    }
    if (!(await setCartelloModello(user, azienda.id, body.modello))) return notFound(req, res);
    setFlash(res, 'ok', 'flash.cartelloSaved');
    res.redirect(303, `/impostazioni?azienda=${encodeURIComponent(azienda.id)}#h-cartello`);
  },
);

impostazioniCartelloRouter.get('/cartelli/modelli/:file', read, async (req, res) => {
  const match = /^([a-z-]+)\.webp$/.exec(String(req.params.file));
  const id = match?.[1];
  if (!isModelloId(id)) return notFound(req, res);
  const webp = await anteprimaModello(MODELLI.get(id)!);
  res
    .status(200)
    .set({
      'Content-Type': 'image/webp',
      'Content-Length': String(webp.length),
      // Адресът носи версията (?v=) — шаблоните се сменят само с нов билд.
      'Cache-Control': 'private, max-age=86400',
    })
    .end(webp);
});
