import { Router, type Response } from 'express';
import type { ZodError } from 'zod';
import { checkContact } from '../check/service.js';
import type { AppConfig } from '../config.js';
import { composeFirstEmail } from '../draft/first-email.js';
import { suggestSlots } from '../draft/slots.js';
import { fingerprint } from '../registry/fingerprint.js';
import { exportRpoList, parseKzpSnapshot, parseRegistryResults } from '../registry/imports.js';
import { consentKey, suppressionKeys } from '../registry/keys.js';
import type { ComplianceStore } from '../store/types.js';
import {
  CheckBody,
  ConsentBody,
  FirstEmailBody,
  SlotsQuery,
  KzpSnapshotBody,
  RegistryResultsBody,
  RpoExportBody,
  SuppressionBody,
} from './schemas.js';

export interface ApiDeps {
  store: ComplianceStore;
  pepper: string;
  now: () => Date;
  config: Pick<AppConfig, 'publicUrl' | 'noticeUrl' | 'unsubKey' | 'retentionMonths'>;
}

function invalid(res: Response, error: ZodError): void {
  res
    .status(400)
    .json({ error: 'Невалидни данни.', issues: error.issues.map((i) => i.path.join('.')) });
}

const FUTURE = { error: 'Датата е в бъдещето.' };

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

  /**
   * Черновата на първия имейл. Проверката се пуска НАНОВО тук — клиентът не носи присъда. Черновата не
   * се пази: връща се за копиране (собственикът праща от своята поща). Отказ → 409 с код.
   */
  r.post('/drafts/first-email', async (req, res) => {
    const body = FirstEmailBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const b = body.data;
    const verdicts = await checkContact(
      { query: b.query, market: b.market, sourceUrl: b.sourceUrl },
      deps,
    );
    const verdict = verdicts.find((v) => v.market === b.market);
    if (!verdict)
      return void res
        .status(409)
        .json({ error: 'Няма проверка за този пазар.', code: 'not_allowed' });
    const result = composeFirstEmail(
      {
        verdict,
        sourceUrl: b.sourceUrl,
        seenAt: b.seenAt,
        topic: b.topic,
        offer: b.offer,
        senderName: b.senderName,
        slots: b.slots,
        ...(b.recipientName ? { recipientName: b.recipientName } : {}),
      },
      { ...deps.config, pepper: deps.pepper },
      deps.now(),
    );
    if (!result.ok) {
      return void res.status(409).json({
        error: 'Черновата не може да се направи.',
        code: result.code,
        missing: result.missing ?? [],
      });
    }
    res.json(result.draft);
  });

  r.get('/drafts/slots', (req, res) => {
    const q = SlotsQuery.safeParse(req.query);
    if (!q.success) return invalid(res, q.error);
    res.json({ slots: suggestSlots(deps.now(), q.data.market).map((d) => d.toISOString()) });
  });

  /** Резултат от проверка: файл с грешен ред се отказва цял — без частичен внос (fail-closed). */
  r.post('/registry/results', async (req, res) => {
    const body = RegistryResultsBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (body.data.checkedAt > deps.now()) return void res.status(400).json(FUTURE);
    const parsed = parseRegistryResults(body.data.csv, body.data.registry);
    if (parsed.errors.length) {
      return void res
        .status(400)
        .json({ error: 'Файлът има грешни редове — нищо не е внесено.', errors: parsed.errors });
    }
    const imported = await deps.store.saveRegistryResults(
      body.data.registry,
      parsed.entries.map((e) => ({ fingerprint: fp(e.value), listed: e.listed })),
      body.data.checkedAt,
      body.data.source,
    );
    res.json({ imported, errors: [] });
  });

  /**
   * Снимка на регистъра на КЗП: всичко, което липсва в нея, става „не е вписан“ — затова грешен
   * ред отказва целия файл, а снимка под половината от предишната иска изрично потвърждение.
   */
  r.post('/registry/kzp-snapshot', async (req, res) => {
    const body = KzpSnapshotBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (body.data.takenAt > deps.now()) return void res.status(400).json(FUTURE);
    const parsed = parseKzpSnapshot(body.data.text);
    // Празна снимка = всеки контакт „не е вписан“ — отказ винаги, и с confirmShrink (преглед на PR #480).
    if (!parsed.errors.length && parsed.values.length === 0) {
      return void res
        .status(400)
        .json({ error: 'Снимката е празна — нищо не е внесено.', errors: [] });
    }
    if (parsed.errors.length) {
      return void res
        .status(400)
        .json({ error: 'Файлът има грешни редове — нищо не е внесено.', errors: parsed.errors });
    }
    const previous = await deps.store.latestSnapshotSize('KZP');
    if (previous > 0 && parsed.values.length < previous / 2 && !body.data.confirmShrink) {
      return void res.status(409).json({
        error: `Снимката има ${parsed.values.length} записа срещу ${previous} в предишната — потвърди, ако е вярно.`,
        previous,
        current: parsed.values.length,
      });
    }
    await deps.store.saveSnapshot(
      'KZP',
      body.data.takenAt,
      parsed.values.map(fp),
      body.data.source,
    );
    res.json({ listed: parsed.values.length, errors: [] });
  });

  r.post('/registry/rpo-export', (req, res) => {
    const body = RpoExportBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    res.type('text/plain').send(exportRpoList(body.data.numbers, body.data.format));
  });

  r.post('/suppressions', async (req, res) => {
    const body = SuppressionBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const keys = suppressionKeys(body.data.value, body.data.scope, body.data.market);
    if (!keys.length) return void res.status(400).json({ error: 'Неразпозната стойност.' });
    for (const k of keys) await deps.store.addSuppression(fp(k), body.data.scope, body.data.reason);
    res.json({ ok: true, keys: keys.length });
  });

  r.post('/consents', async (req, res) => {
    const body = ConsentBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const key = consentKey(body.data.value, body.data.market);
    if (!key) return void res.status(400).json({ error: 'Неразпозната стойност.' });
    if (body.data.givenAt > deps.now()) return void res.status(400).json(FUTURE);
    const { channel, givenAt, method, wording } = body.data;
    await deps.store.addConsent(fp(key), { channel, givenAt, method, wording, withdrawnAt: null });
    res.json({ ok: true });
  });

  return r;
}
