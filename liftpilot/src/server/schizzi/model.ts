import 'server-only';
// The model that reads a survey sketch (round 50): Claude through Google Cloud Vertex AI in the EU, behind a small
// interface so the route and its tests never depend on the network (the tests put a fake in its place). One request per
// reading: the pictures (base64, made by us: src/lib/report/image-tool.ts), then the instructions; adaptive thinking (the
// model's default: no `thinking` field), effort high, the answer constrained to a JSON schema (structured outputs). No
// temperature, no budget_tokens, no forced tool choice (all refused by Opus 5.5). A policy refusal is retried on the
// fallback model by the SDK's middleware (Vertex has no server-side fallbacks); a refusal that stands, an answer cut by
// max_tokens, any other end are told apart before the content is read. Errors of the API become three kinds the route
// answers with: busy (429), unavailable (the project, the key or the model refused: 401/403/404), failed (the rest). The
// SDKs and Google's auth library are loaded only when the feature is on (next.config.mjs keeps them external).
import { log } from '@/lib/log';
import type { SketchConfig } from './config';

/** The model a refusal of the main one is retried on (Opus 5.5's permitted fallback targets: claude-opus-5, -4-8). */
export const FALLBACK_MODEL = 'claude-opus-5';
/** The longest answer: the JSON of a whole shaft with its stops, and the model's thinking. */
export const MAX_TOKENS = 16_000;

export interface SketchImage { data: string; mediaType: 'image/jpeg' }
export interface SketchRequest { model: string; system: string; images: readonly SketchImage[]; instruction: string; schema: Readonly<Record<string, unknown>> }
export type SketchAnswer =
  | { kind: 'ok'; text: string; model: string }
  | { kind: 'refusal' }
  | { kind: 'truncated' }
  | { kind: 'other'; stopReason: string };
export interface SketchModel { read(req: SketchRequest, signal: AbortSignal): Promise<SketchAnswer> }

export type SketchModelFailure = 'busy' | 'unavailable' | 'failed';
export class SketchModelError extends Error {
  constructor(readonly kind: SketchModelFailure, readonly status: number | null) {
    super(`sketch model ${kind}${status ? ` (${status})` : ''}`);
    this.name = 'SketchModelError';
  }
}

/** An error of the API (or of the network) as one of the three kinds; never its message (it may quote the request). */
function failure(e: unknown): SketchModelError {
  const status = typeof e === 'object' && e !== null && 'status' in e && typeof e.status === 'number' ? e.status : null;
  if (status === 429 || status === 529) return new SketchModelError('busy', status);
  if (status === 401 || status === 403 || status === 404) return new SketchModelError('unavailable', status);
  return new SketchModelError('failed', status);
}

async function vertexModel(cfg: SketchConfig): Promise<SketchModel> {
  const [{ AnthropicVertex }, { GoogleAuth }, sdk] = await Promise.all([
    import('@anthropic-ai/vertex-sdk'), import('google-auth-library'), import('@anthropic-ai/sdk'),
  ]);
  const client = new AnthropicVertex({
    projectId: cfg.projectId,
    region: cfg.region,
    googleAuth: new GoogleAuth({ keyFile: cfg.credentialsFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }),
    timeout: 120_000,
    maxRetries: 1,
    middleware: [sdk.betaRefusalFallbackMiddleware([{ model: FALLBACK_MODEL }], {
      onError: (err) => log.warn({ kind: err.kind }, 'sketch refusal fallback did not answer'),
    })],
  });
  return {
    async read(req, signal) {
      let msg;
      try {
        msg = await client.beta.messages.create({
          model: req.model,
          max_tokens: MAX_TOKENS,
          system: req.system,
          messages: [{
            role: 'user',
            content: [
              ...req.images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })),
              { type: 'text' as const, text: req.instruction },
            ],
          }],
          output_config: { effort: 'high', format: { type: 'json_schema', schema: { ...req.schema } } },
        }, { signal, fallbackState: new sdk.BetaFallbackState() });
      } catch (e) {
        if (signal.aborted) throw new SketchModelError('failed', null);
        throw failure(e);
      }
      // the end of the answer first: a refusal or a cut answer has no usable content
      if (msg.stop_reason === 'refusal') return { kind: 'refusal' };
      if (msg.stop_reason === 'max_tokens') return { kind: 'truncated' };
      if (msg.stop_reason !== 'end_turn') return { kind: 'other', stopReason: String(msg.stop_reason) };
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { kind: 'ok', text, model: msg.model };
    },
  };
}

/** What makes the model of a configuration: Vertex AI (the tests pass a fake: no network). */
export type ModelFactory = (cfg: SketchConfig) => Promise<SketchModel>;

let cached: { key: string; model: Promise<SketchModel> } | null = null;

/**
 * The model for this configuration, made once per configuration — the project, the region, the key file and the key
 * itself (its time, size and inode: a key replaced at the same path makes a new one, Google's auth library keeps the
 * key it read first). A key the API refuses ('unavailable': revoked, its account disabled, the model not enabled)
 * forgets it, so that the next reading makes it again from the key in place then.
 */
export function sketchModel(cfg: SketchConfig, make: ModelFactory = vertexModel): Promise<SketchModel> {
  const key = JSON.stringify([cfg.projectId, cfg.region, cfg.credentialsFile, cfg.key.mtimeMs, cfg.key.size, cfg.key.ino]);
  if (cached?.key === key) return cached.model;
  const model: Promise<SketchModel> = make(cfg).then((made) => ({
    async read(req, signal) {
      try {
        return await made.read(req, signal);
      } catch (e) {
        if (e instanceof SketchModelError && e.kind === 'unavailable' && cached?.model === model) cached = null;
        throw e;
      }
    },
  }));
  model.catch(() => { if (cached?.model === model) cached = null; });
  cached = { key, model };
  return model;
}
