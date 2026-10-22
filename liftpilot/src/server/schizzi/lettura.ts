import 'server-only';
// POST /api/projects/[id]/schizzi/[allegatoId]/lettura (round 50): the automatic reading of a survey sketch — the
// measures the model proposes, which the technician confirms or corrects one by one before they enter a form (nothing
// here is saved: neither the pictures sent nor the proposal). In order, each step before any costlier one: the request
// comes from the application's own pages (Origin = PUBLIC_BASE_URL), the session, the right ('progetto:edit': whoever
// draws the shaft and the machine room; never a read-only company), the ids, the body ({ target: 'vano' | 'locale' },
// strict), the installation (of the company, not archived), the file (of that installation, kind SCHIZZO: anything else
// is «not found»), the feature on (src/server/schizzi/config.ts: else 503); a reading already made of the same bytes for
// the same target, model and instructions is answered from memory (24 h, 200 readings) and costs nothing; else 20
// readings an hour per user and 100 a day per company, at most 2 under way in the server, the pictures made by us in
// the renderers' slots (src/lib/report/image-tool.ts) and sent to the model (model.ts) within 140 s in all (nginx waits
// 150 s on this path), the answer checked against the catalog (src/lib/schizzi/proposta.ts). The activity log keeps
// the file's id and SHA-256, the target, the model, how many values and whether from memory — never the picture or
// what was read; the log the same, with the time taken. Every answer is JSON, never cached: { ok: true, proposta,
// cached } or { ok: false, error, message } (error: an errors.* key, message: its Italian text).
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { ANSWER } from '@/lib/answers';
import { publicBaseUrl } from '@/lib/env';
import { log } from '@/lib/log';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { TYPE_OF, isAllegatoMime } from '@/lib/allegati/limits';
import { modelImages } from '@/lib/report/image-tool';
import { RendererBusy } from '@/lib/report/render';
import { TARGETS, type Target } from '@/lib/schizzi/campi';
import { ANSWER_SCHEMA, PROMPT_VERSION, SYSTEM, instruction } from '@/lib/schizzi/prompt';
import { propostaDa, type Proposta } from '@/lib/schizzi/proposta';
import { idSchema } from '@/lib/schemas';
import { readCapped, uploadOrigin } from '@/server/allegati/upload';
import { sketchState } from './config';
import { SketchModelError, sketchModel } from './model';
import { bytesOf, progettoDi, schizzoDaLeggere } from './queries';
import it from '../../../messages/it.json';

export const LETTURA_LIMITS = {
  perUserHour: 20,
  perCompanyDay: 100,
  /** readings under way in the server at once (each holds up to four pictures and waits for the model) */
  inFlight: 2,
  /** readings kept in memory, and for how long */
  cacheEntries: 200,
  cacheMs: 24 * 60 * 60 * 1000,
  /** the whole reading, pictures and model, within this (nginx: proxy_read_timeout 150s on the path) */
  deadlineMs: 140_000,
} as const;

export type LetturaError = 'forbidden' | 'unauthorized' | 'notFound' | 'invalidFields' | 'archived' | 'rateLimited' | 'rendererBusy'
  | 'sketchOff' | 'sketchBusy' | 'sketchRefused' | 'sketchFailed';
const STATUS: Readonly<Record<LetturaError, number>> = {
  forbidden: 403, unauthorized: 401, notFound: 404, invalidFields: 400, archived: 409, rateLimited: 429, rendererBusy: 503,
  sketchOff: 503, sketchBusy: 503, sketchRefused: 422, sketchFailed: 502,
};
const MESSAGE: Readonly<Record<LetturaError, string>> = {
  forbidden: ANSWER.forbidden, unauthorized: ANSWER.unauthorized, notFound: ANSWER.notFound, invalidFields: it.errors.invalidFields,
  archived: ANSWER.archived, rateLimited: ANSWER.rateLimited, rendererBusy: ANSWER.busy, sketchOff: ANSWER.sketchOff, sketchBusy: ANSWER.sketchBusy,
  sketchRefused: ANSWER.sketchRefused, sketchFailed: ANSWER.sketchFailed,
};

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (error: LetturaError): Response => {
  const res = json(STATUS[error], { ok: false, error, message: MESSAGE[error] });
  if (STATUS[error] === 503) res.headers.set('Retry-After', '10');
  return res;
};

const bodySchema = z.object({ target: z.enum(TARGETS) }).strict();

// --- the readings kept in memory: by company, the file's bytes, the target, the model and the instructions -----------

const memory = new Map<string, { at: number; proposta: Proposta }>();
const keyOf = (companyId: string, sha256: string, target: Target, model: string): string => [companyId, sha256, target, model, PROMPT_VERSION].join(':');
function recall(key: string): Proposta | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LETTURA_LIMITS.cacheMs) {
    memory.delete(key);
    return null;
  }
  return structuredClone(hit.proposta);
}
function remember(key: string, proposta: Proposta): void {
  memory.delete(key);
  memory.set(key, { at: Date.now(), proposta: structuredClone(proposta) });
  while (memory.size > LETTURA_LIMITS.cacheEntries) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}
/** The readings kept in memory forgotten (the tests; a change of the instructions does it by PROMPT_VERSION). */
export const forgetReadings = (): void => memory.clear();

let reading = 0;

export async function handleLettura(req: Request, rawProject: string, rawAttachment: string): Promise<Response> {
  const started = Date.now();
  if (!uploadOrigin(req.headers, publicBaseUrl())) return refuse('forbidden');
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return refuse('unauthorized');
  if (!can(user, 'progetto:edit')) return refuse('forbidden');
  const projectId = idSchema.safeParse(rawProject), attachmentId = idSchema.safeParse(rawAttachment);
  if (!projectId.success || !attachmentId.success) return refuse('notFound');
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return refuse('invalidFields');
  const raw = await readCapped(req.body, 1024);
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(raw ? JSON.parse(new TextDecoder().decode(raw)) : null);
    if (!parsed.success) return refuse('invalidFields');
    body = parsed.data;
  } catch {
    return refuse('invalidFields');
  }
  const project = await progettoDi(user, projectId.data);
  if (!project) return refuse('notFound');
  if (project.archivedAt) return refuse('archived');
  const file = await schizzoDaLeggere(user, project.id, attachmentId.data);
  if (!file || !isAllegatoMime(file.mime)) return refuse('notFound');
  const state = sketchState();
  if (!state.on) return refuse('sketchOff');
  const { config } = state, target = body.target, ctx = { companyId: user.companyId, projectId: project.id, attachmentId: file.id, target };
  const answer = async (proposta: Proposta, cached: boolean): Promise<Response> => {
    // what was read never goes in the log or the activity log: the sketch may carry names and addresses
    await audit({
      companyId: user.companyId, userId: user.id, action: 'SKETCH_READ', entity: 'Attachment', entityId: file.id,
      meta: { attachmentId: file.id, sha256: file.sha256, target, model: proposta.model, fields: proposta.fields.length, cached },
    });
    log.info({ ...ctx, model: proposta.model, fields: proposta.fields.length, notRead: proposta.notRead.length, cached, ms: Date.now() - started }, 'sketch read');
    return json(200, { ok: true, proposta, cached });
  };

  const key = keyOf(user.companyId, file.sha256, target, config.model), known = recall(key);
  if (known) return answer(known, true);
  if (!rateLimit(`schizzi-user:${user.id}`, LETTURA_LIMITS.perUserHour, 60 * 60 * 1000)) return refuse('rateLimited');
  if (!rateLimit(`schizzi-company:${user.companyId}`, LETTURA_LIMITS.perCompanyDay, 24 * 60 * 60 * 1000)) return refuse('rateLimited');
  if (reading >= LETTURA_LIMITS.inFlight) return refuse('sketchBusy');
  reading++;
  try {
    let pictures: Buffer[];
    try {
      pictures = await modelImages({ load: () => bytesOf(file.id, file.size), type: TYPE_OF[file.mime], orientation: file.orientation }, file.pages);
    } catch (e) {
      if (e instanceof RendererBusy) return refuse('rendererBusy');
      log.warn({ ...ctx, detail: e instanceof Error ? e.message.slice(0, 200) : 'image tool failed' }, 'sketch pictures failed');
      return refuse('sketchFailed');
    }
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(Math.max(10_000, started + LETTURA_LIMITS.deadlineMs - Date.now()))]);
    let reply;
    try {
      const model = await sketchModel(config);
      reply = await model.read({
        model: config.model, system: SYSTEM, instruction: instruction(target), schema: ANSWER_SCHEMA,
        images: pictures.map((p) => ({ data: p.toString('base64'), mediaType: 'image/jpeg' as const })),
      }, signal);
    } catch (e) {
      const kind = e instanceof SketchModelError ? e.kind : 'failed', status = e instanceof SketchModelError ? e.status : null;
      log.warn({ ...ctx, kind, status }, 'sketch model failed');
      return refuse(kind === 'busy' ? 'sketchBusy' : kind === 'unavailable' ? 'sketchOff' : 'sketchFailed');
    }
    if (reply.kind === 'refusal') {
      log.info({ ...ctx }, 'sketch reading refused by the model');
      return refuse('sketchRefused');
    }
    if (reply.kind !== 'ok') {
      log.warn({ ...ctx, end: reply.kind === 'other' ? reply.stopReason : reply.kind }, 'sketch reading ended early');
      return refuse('sketchFailed');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(reply.text);
    } catch {
      parsed = undefined;
    }
    const proposta = parsed === undefined ? null : propostaDa(parsed, target, reply.model, PROMPT_VERSION);
    if (!proposta) {
      log.warn({ ...ctx }, 'sketch reading: the answer is not the expected JSON');
      return refuse('sketchFailed');
    }
    remember(key, proposta);
    return answer(proposta, false);
  } finally {
    reading--;
  }
}
