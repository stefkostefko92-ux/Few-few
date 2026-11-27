import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../logger.js';
import { parseBrevoPayload } from '../inbound/brevo.js';
import { classify } from '../tickets/classify.js';
import type { TicketStore } from '../tickets/types.js';

const same = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/**
 * Webhook-ът на Brevo inbound — извън сесията и Origin проверката (Brevo няма нито едно). Brevo не подписва
 * заявката, затова пазят тайният път (404 при грешен — не казваме, че съществува) и Bearer токенът (401).
 * Повторните опити на Brevo: 4xx без 429 и 5xx ИЗХВЪРЛЯТ писмото; само 429 се опитва пак (+10 мин, +1 ч,
 * +2 ч, +8 ч) — затова временен провал на базата е 429 (developers.brevo.com/docs/retry-mechanism).
 */
export function inboundRoutes(deps: {
  store: TicketStore;
  path: string;
  token: string;
  now: () => Date;
}): Router {
  const r = Router();
  r.use(
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  r.post('/:path', express.json({ limit: '10mb' }), async (req, res) => {
    if (!same(String(req.params.path), deps.path)) return void res.status(404).end();
    const auth = req.get('authorization') ?? '';
    const m = /^Bearer\s+(\S+)$/.exec(auth);
    if (!m || !same(m[1]!, deps.token)) return void res.status(401).end();
    const { mails, invalid } = parseBrevoPayload(req.body);
    let accepted = 0;
    let duplicates = 0;
    try {
      for (const mail of mails) {
        const cls = classify(mail);
        const { created } = await deps.store.saveInbound(mail, cls, deps.now());
        if (created) accepted++;
        else duplicates++;
      }
    } catch (err) {
      logger.error({ kind: err instanceof Error ? err.name : 'unknown' }, 'inbound save failed');
      // 429 = Brevo ще опита пак; вече записаните са идемпотентни.
      return void res.status(429).json({ retry: true });
    }
    if (invalid) logger.warn({ invalid }, 'inbound items skipped');
    res.json({ accepted, duplicates, invalid });
  });
  return r;
}
