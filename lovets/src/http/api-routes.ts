import { Router, type Response } from 'express';
import type { ZodError } from 'zod';
import { checkContact } from '../check/service.js';
import type { Market } from '../compliance/types.js';
import { normalizeEmail, normalizePhone, normalizeUrl } from '../compliance/normalize.js';
import { fingerprint } from '../registry/fingerprint.js';
import { exportRpoList, parseKzpSnapshot, parseRegistryResults } from '../registry/imports.js';
import { lookupKeys } from '../registry/keys.js';
import type { ComplianceStore } from '../store/types.js';
import {
  CheckBody,
  ConsentBody,
  KzpSnapshotBody,
  RegistryResultsBody,
  RpoExportBody,
  SuppressionBody,
} from './schemas.js';

export interface ApiDeps {
  store: ComplianceStore;
  pepper: string;
  now: () => Date;
}

function invalid(res: Response, error: ZodError): void {
  res
    .status(400)
    .json({ error: 'Невалидни данни.', issues: error.issues.map((i) => i.path.join('.')) });
}

/** Нормализира стойност от свободен вход: имейл, домейн, URL или телефон (национален формат по пазара). */
function normalizeAny(raw: string, market: Market): string | null {
  if (raw.includes('@')) return normalizeEmail(raw);
  if (/^https?:\/\//i.test(raw)) return normalizeUrl(raw);
  const v = raw.trim().toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return v;
  return normalizePhone(raw, market);
}

export function apiRoutes(deps: ApiDeps): Router {
  const r = Router();
  const fp = (v: string): string => fingerprint(v, deps.pepper);

  r.get('/me', (_req, res) => {
    res.json({ ok: true });
  });

  r.post('/check', async (req, res) => {
    const body = CheckBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const results = await checkContact(body.data, deps);
    res.json({ results });
  });

  r.post('/registry/results', async (req, res) => {
    const body = RegistryResultsBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (body.data.checkedAt > deps.now()) {
      return void res.status(400).json({ error: 'Датата на проверката е в бъдещето.' });
    }
    const parsed = parseRegistryResults(body.data.csv, body.data.registry);
    const imported = await deps.store.saveRegistryResults(
      body.data.registry,
      parsed.entries.map((e) => ({ fingerprint: fp(e.value), listed: e.listed })),
      body.data.checkedAt,
      body.data.source,
    );
    res.json({ imported, errors: parsed.errors });
  });

  r.post('/registry/kzp-snapshot', async (req, res) => {
    const body = KzpSnapshotBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (body.data.takenAt > deps.now()) {
      return void res.status(400).json({ error: 'Датата на снимката е в бъдещето.' });
    }
    const parsed = parseKzpSnapshot(body.data.text);
    await deps.store.saveSnapshot(
      'KZP',
      body.data.takenAt,
      parsed.values.map(fp),
      body.data.source,
    );
    res.json({ listed: parsed.values.length, errors: parsed.errors });
  });

  r.post('/registry/rpo-export', (req, res) => {
    const body = RpoExportBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    res.type('text/plain').send(exportRpoList(body.data.numbers, body.data.format));
  });

  r.post('/suppressions', async (req, res) => {
    const body = SuppressionBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const value = normalizeAny(body.data.value, body.data.market);
    if (!value) return void res.status(400).json({ error: 'Неразпозната стойност.' });
    const keys = body.data.scope === 'domain' ? lookupKeys(value) : [value];
    for (const k of keys) await deps.store.addSuppression(fp(k), body.data.scope, body.data.reason);
    res.json({ ok: true });
  });

  r.post('/consents', async (req, res) => {
    const body = ConsentBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const value = normalizeAny(body.data.value, body.data.market);
    if (!value) return void res.status(400).json({ error: 'Неразпозната стойност.' });
    if (body.data.givenAt > deps.now()) {
      return void res.status(400).json({ error: 'Датата на съгласието е в бъдещето.' });
    }
    const { channel, givenAt, method, wording } = body.data;
    await deps.store.addConsent(fp(value), {
      channel,
      givenAt,
      method,
      wording,
      withdrawnAt: null,
    });
    res.json({ ok: true });
  });

  return r;
}
