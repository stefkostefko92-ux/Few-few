import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { CAMPI_DATI, parseDatiSocietari } from '../aziende/dati.js';
import { setCartelloModello, setDatiSocietari, testataDi } from '../aziende/intestazione.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { isModelloId, MODELLI } from '../cartelli/modelli.js';
import { DATI_VUOTI, vistaCartello } from '../cartelli/vista.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { vistaLimiter } from '../http/limits.js';
import { notFound, renderImpostazioni } from './impostazioni.js';

/**
 * Настройките на фирмата за табелата „Avviso di fermo impianto“: данните ѝ (главата на табелата до
 * логото) и шаблонът. Пишат администраторът ѝ и MASTER (`aziende:settings`); фирма извън обхвата — 404.
 * Картинките на шаблоните в избора — с главата на фирмата, само за който пипа настройките ѝ.
 */
export const impostazioniCartelloRouter: Router = Router();
const settings = requireCapability('aziende:settings');

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

/**
 * Шаблонът с главата на фирмата (логото и данните ѝ горе, полетата празни) — изборът в настройките
 * показва табелата такава, каквато ще излезе.
 */
impostazioniCartelloRouter.get(
  '/impostazioni/cartello/anteprima/:file',
  settings,
  vistaLimiter,
  async (req, res) => {
    const match = /^([a-z-]+)\.webp$/.exec(String(req.params.file));
    const id = match?.[1];
    const aziende = await aziendeImpostabili(principalOf(req).user);
    const azienda = aziende.find((a) => a.id === req.query.azienda);
    if (!isModelloId(id) || !azienda) return notFound(req, res);
    const webp = await vistaCartello(
      MODELLI.get(id)!,
      DATI_VUOTI,
      await testataDi(azienda),
      config().PDF_FONT_DIR,
    );
    res
      .status(200)
      .set({ 'Content-Type': 'image/webp', 'Content-Length': String(webp.length) })
      .end(webp);
  },
);
