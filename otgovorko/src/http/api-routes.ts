import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';
import type { ZodError } from 'zod';
import { RISKY } from '../tickets/classify.js';
import type { TicketStore, TicketView } from '../tickets/types.js';
import { VOICE_KEY } from '../draft/worker.js';
import { DeleteBody, DraftBody, ListQuery, SampleBody, SentBody, VoiceBody } from './schemas.js';

function invalid(res: Response, error: ZodError): void {
  res
    .status(400)
    .json({ error: 'Невалидни данни.', issues: error.issues.map((i) => i.path.join('.')) });
}

const summary = (t: TicketView) => ({
  id: t.id,
  receivedAt: t.receivedAt,
  cls: t.cls,
  risky: RISKY.has(t.cls),
  status: t.status,
  from: t.from,
  subject: t.subject,
  hasDraft: Boolean(t.draft),
});

/**
 * Панелът на собственика. „Отбележи като пратено“ само записва — Отговорко не праща нищо (SPEC §2).
 * Рисковите класове искат второ потвърждение (`confirmRisk: true`), иначе 409.
 */
export function apiRoutes(deps: { tickets: TicketStore; now: () => Date }): Router {
  const r = Router();
  const { tickets } = deps;

  r.get('/me', (_req, res) => void res.json({ ok: true }));

  /** `?from=адрес` — всички писма на един човек (искане по чл. 15 или 17); подателят е шифрован, затова
   *  търсенето е след дешифриране, в паметта. */
  r.get('/tickets', async (req, res) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return invalid(res, q.error);
    const from = q.data.from?.toLowerCase();
    const all = await tickets.list(from ? 100_000 : 200);
    res.json({ tickets: (from ? all.filter((t) => t.from.address === from) : all).map(summary) });
  });

  r.get('/tickets/:id', async (req, res) => {
    const t = await tickets.get(req.params.id);
    if (!t) return void res.status(404).json({ error: 'Няма такова писмо.' });
    res.json({
      ...summary(t),
      text: t.text,
      attachments: t.attachments,
      draft: t.draft,
      sentAt: t.sentAt,
    });
  });

  r.put('/tickets/:id/draft', async (req, res) => {
    const body = DraftBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (!(await tickets.updateDraft(req.params.id, body.data.text))) {
      return void res.status(409).json({ error: 'Писмото вече е затворено или пратено.' });
    }
    res.json({ ok: true });
  });

  r.post('/tickets/:id/sent', async (req, res) => {
    const body = SentBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const t = await tickets.get(req.params.id);
    if (!t) return void res.status(404).json({ error: 'Няма такова писмо.' });
    if (RISKY.has(t.cls) && body.data.confirmRisk !== true) {
      return void res.status(409).json({
        error: 'Рисков клас (пари, жалба, лични данни или правно) — потвърди втори път.',
        code: 'confirm_risk',
      });
    }
    const hash = createHash('sha256').update(body.data.text).digest('hex');
    if (!(await tickets.markSent(t.id, body.data.text, hash, deps.now()))) {
      return void res
        .status(409)
        .json({ error: 'Писмото вече е затворено или пратено.', code: 'not_sendable' });
    }
    res.json({ ok: true, hash });
  });

  r.post('/tickets/:id/close', async (req, res) => {
    const t = await tickets.get(req.params.id);
    if (!t) return void res.status(404).json({ error: 'Няма такова писмо.' });
    await tickets.setStatus(t.id, 'closed');
    res.json({ ok: true });
  });

  /** Изтриване по искане (чл. 17 ОРЗД) — само с изрично потвърждение. */
  r.delete('/tickets/:id', async (req, res) => {
    const body = DeleteBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(409).json({ error: 'Потвърди изтриването.', code: 'confirm_delete' });
    }
    res.status((await tickets.remove(req.params.id)) ? 200 : 404).json({ ok: true });
  });

  /**
   * Пратен отговор → образец за гласа (до 5 влизат в промпта за ВСЯКО писмо). Затова образецът е текст,
   * който собственикът е обезличил (без имена, поръчки, суми), не копие на писмото до клиента.
   */
  r.post('/tickets/:id/sample', async (req, res) => {
    const body = SampleBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const t = await tickets.get(req.params.id);
    if (!t || t.status !== 'sent') {
      return void res.status(409).json({ error: 'Образец може да е само пратен отговор.' });
    }
    res.json({ id: await tickets.addSample(body.data.text, deps.now()) });
  });

  r.get('/samples', async (_req, res) => void res.json({ samples: await tickets.samples(20) }));
  r.delete('/samples/:id', async (req, res) => {
    res.status((await tickets.removeSample(req.params.id)) ? 200 : 404).json({ ok: true });
  });

  r.get(
    '/voice',
    async (_req, res) => void res.json({ text: (await tickets.getSetting(VOICE_KEY)) ?? '' }),
  );
  r.put('/voice', async (req, res) => {
    const body = VoiceBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    await tickets.setSetting(VOICE_KEY, body.data.text);
    res.json({ ok: true });
  });

  return r;
}
