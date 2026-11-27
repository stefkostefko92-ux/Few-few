import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { readUnsubToken } from '../draft/unsubscribe.js';
import type { ComplianceStore } from '../store/types.js';

/**
 * Единственият публичен път: отписването от връзката в писмото (ОРЗД чл. 21(2)–(3); Codice чл. 130, ал. 5;
 * d.lgs. 70/2003 чл. 9). Без вход, без бисквитка и без проверка на Origin — пощенският клиент и RFC 8058
 * one-click не носят нито едно. nginx пуска само `/u/<токен>`. GET показва бутон (скенерите на пощата
 * отварят връзките — те не бива да отписват); POST записва синхронно, преди отговора, без пренасочване.
 */
const UNSUBSCRIBE_REASON = 'unsubscribe_link';

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body>${body}</body></html>`;

const ASK = page(
  'Отписване · Annulla iscrizione',
  '<h1>Отписване от писмата на Carbon Stealth VCC</h1>' +
    '<p>Натиснете бутона и повече няма да Ви пишем.</p>' +
    '<p lang="it">Premi il pulsante e non riceverai altre comunicazioni da Carbon Stealth VCC.</p>' +
    '<form method="post"><button type="submit">Отпиши ме · Annulla iscrizione</button></form>',
);
const DONE = page(
  'Готово · Fatto',
  '<h1>Готово — отписани сте.</h1><p>Повече няма да Ви пишем.</p>' +
    '<p lang="it">Fatto: non riceverà altre comunicazioni.</p>',
);
const NOT_FOUND = page('Не е намерено', '<h1>Връзката не е валидна.</h1>');

const html = (res: Response, status: number, body: string): void => {
  res.status(status).type('html').setHeader('Cache-Control', 'no-store');
  res.send(body);
};

export function publicRoutes(deps: { store: ComplianceStore; unsubKey: string | null }): Router {
  const r = Router();
  r.use(
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );

  const fingerprints = (token: string): string[] | null =>
    deps.unsubKey ? readUnsubToken(token, deps.unsubKey) : null;

  r.get('/:token', (req, res) => {
    if (!fingerprints(req.params.token)) return html(res, 404, NOT_FOUND);
    html(res, 200, ASK);
  });

  r.post('/:token', async (req, res) => {
    const fps = fingerprints(req.params.token);
    if (!fps) return html(res, 404, NOT_FOUND);
    for (const fp of fps) await deps.store.addSuppression(fp, 'value', UNSUBSCRIBE_REASON);
    html(res, 200, DONE);
  });
  return r;
}
