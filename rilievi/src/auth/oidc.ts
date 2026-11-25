import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { config, isProduction } from '../config.js';
import { HOUR, MINUTE } from '../time.js';
import { FORNITORI, sfidaPkce, type Fornitore, type StatoOidc } from './oidc-stato.js';
import { dominioDa, GUID, issuerMicrosoft } from './oidc-valori.js';

/**
 * Протоколът на входа с доставчика на самоличност на клиента (D1, чл. 4.6): OpenID Connect, authorization
 * code + PKCE S256, поверителен клиент (тайната е само на сървъра). Документът за откриване се помни час;
 * ключовете — от `jwks_uri` (jose ги помни и подновява). ID токенът се проверява изцяло: подпис RS256,
 * издател (на Microsoft — на директорията, която е подписала: `<authority>/<tid>/v2.0`), аудитория,
 * срок, nonce. Microsoft — през `organizations` (само служебни акаунти); Google — само с `hd` (Workspace).
 * Самоличността е `<tid>:<oid>` / `sub` — имейлът е само надпис, по него не се влиза никога.
 */

export class ErroreOidc extends Error {
  constructor(readonly motivo: 'config' | 'scoperta' | 'scambio' | 'token') {
    super(`oidc: ${motivo}`);
  }
}

export interface Identita {
  soggetto: string;
  /** Директорията (tid) или домейнът (hd); null — личен акаунт (Google без `hd`). */
  organizzazione: string | null;
  etichetta: string | null;
}

interface Cliente {
  id: string;
  secret: string;
  base: string;
}

function clienteDi(fornitore: Fornitore): Cliente | null {
  const c = config();
  const [id, secret, base] =
    fornitore === 'microsoft'
      ? [c.OIDC_MICROSOFT_CLIENT_ID, c.OIDC_MICROSOFT_CLIENT_SECRET, c.OIDC_MICROSOFT_AUTHORITY]
      : [c.OIDC_GOOGLE_CLIENT_ID, c.OIDC_GOOGLE_CLIENT_SECRET, c.OIDC_GOOGLE_ISSUER];
  if (!id || !secret) return null;
  if (isProduction() && !base.startsWith('https://')) return null;
  return { id, secret, base };
}

/** Доставчиците с регистрирано приложение (двете стойности в средата). */
export const fornitoriConfigurati = (): Fornitore[] =>
  FORNITORI.filter((f) => clienteDi(f) !== null);

/** Произходите на страниците за вход на доставчиците — за `form-action` на CSP (формата пренасочва там). */
export const originiFornitori = (): string[] =>
  fornitoriConfigurati().map((f) => new URL(clienteDi(f)!.base).origin);

export const redirectDi = (fornitore: Fornitore): string =>
  `${config().PUBLIC_BASE_URL}/accesso/esterno/${fornitore}/ritorno`;

const scopertaSchema = z.object({
  issuer: z.string().min(1).max(500),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});

interface Scoperta {
  authorize: URL;
  token: URL;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  at: number;
}

const scoperte = new Map<Fornitore, Scoperta>();

const sicuro = (url: URL): boolean => url.protocol === 'https:' || !isProduction();

async function scoperta(fornitore: Fornitore): Promise<{ d: Scoperta; c: Cliente }> {
  const c = clienteDi(fornitore);
  if (!c) throw new ErroreOidc('config');
  const memo = scoperte.get(fornitore);
  if (memo && Date.now() - memo.at < HOUR) return { d: memo, c };
  const indirizzo =
    fornitore === 'microsoft'
      ? `${c.base}/organizations/v2.0/.well-known/openid-configuration`
      : `${c.base}/.well-known/openid-configuration`;
  let raw: unknown;
  try {
    const res = await fetch(indirizzo, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    raw = await res.json();
  } catch {
    throw new ErroreOidc('scoperta');
  }
  const parsed = scopertaSchema.safeParse(raw);
  if (!parsed.success) throw new ErroreOidc('scoperta');
  const doc = parsed.data;
  const atteso = fornitore === 'microsoft' ? `${c.base}/{tenantid}/v2.0` : c.base;
  const authorize = new URL(doc.authorization_endpoint);
  const token = new URL(doc.token_endpoint);
  const jwksUrl = new URL(doc.jwks_uri);
  // Страницата за вход — само на произхода от настройката (CSP form-action го пуска само него).
  if (
    doc.issuer !== atteso ||
    authorize.origin !== new URL(c.base).origin ||
    ![authorize, token, jwksUrl].every(sicuro)
  ) {
    throw new ErroreOidc('scoperta');
  }
  const d: Scoperta = {
    authorize,
    token,
    jwks: createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * MINUTE,
    }),
    at: Date.now(),
  };
  scoperte.set(fornitore, d);
  return { d, c };
}

/** Къде отива браузърът: страницата за вход на доставчика с state, nonce и PKCE на това състояние. */
export async function urlAutorizzazione(
  fornitore: Fornitore,
  s: { stato: string; nonce: string; verifier: string },
): Promise<string> {
  const { d, c } = await scoperta(fornitore);
  const url = new URL(d.authorize);
  const p = url.searchParams;
  p.set('client_id', c.id);
  p.set('response_type', 'code');
  p.set('redirect_uri', redirectDi(fornitore));
  // Само каквото трябва: самоличността и надписът (Microsoft: oid идва с `profile`).
  p.set('scope', fornitore === 'microsoft' ? 'openid profile' : 'openid email');
  p.set('state', s.stato);
  p.set('nonce', s.nonce);
  p.set('code_challenge', sfidaPkce(s.verifier));
  p.set('code_challenge_method', 'S256');
  if (fornitore === 'microsoft') p.set('response_mode', 'query');
  p.set('prompt', 'select_account');
  return url.href;
}

const tokenSchema = z.object({ id_token: z.string().min(1).max(20_000) });
const testo = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** Кодът от отговора → проверената самоличност. Всяка грешка е `ErroreOidc` (без токена в съобщението). */
export async function identitaDaCodice(
  fornitore: Fornitore,
  codice: string,
  s: StatoOidc,
): Promise<Identita> {
  const { d, c } = await scoperta(fornitore);
  let raw: unknown;
  try {
    const res = await fetch(d.token, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: codice,
        redirect_uri: redirectDi(fornitore),
        client_id: c.id,
        client_secret: c.secret,
        code_verifier: s.verifier,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    raw = await res.json();
  } catch {
    throw new ErroreOidc('scambio');
  }
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) throw new ErroreOidc('scambio');
  return verificaIdToken(fornitore, parsed.data.id_token, s.nonce, d, c);
}

async function verificaIdToken(
  fornitore: Fornitore,
  token: string,
  nonce: string,
  d: Scoperta,
  c: Cliente,
): Promise<Identita> {
  let payload: JWTPayload;
  try {
    // Издателят на Microsoft е на директорията, която е подписала — tid се чете преди проверката само
    // за да се построи очакваният издател; после проверката го сверява с подписаното.
    const issuer =
      fornitore === 'microsoft'
        ? issuerMicrosoft(c.base, String(decodeJwt(token).tid ?? ''))
        : [c.base, c.base.replace(/^https:\/\//, '')];
    if (!issuer) throw new Error('tid');
    ({ payload } = await jwtVerify(token, d.jwks, {
      issuer,
      audience: c.id,
      algorithms: ['RS256'],
      clockTolerance: 60,
      maxTokenAge: '15m',
      requiredClaims: ['iat', 'exp', 'sub'],
    }));
  } catch {
    throw new ErroreOidc('token');
  }
  if (payload.nonce !== nonce) throw new ErroreOidc('token');
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== c.id)
    throw new ErroreOidc('token');
  if (fornitore === 'microsoft') {
    const tid = testo(payload.tid, 36);
    const oid = testo(payload.oid, 36)?.toLowerCase() ?? null;
    if (!tid || !GUID.test(tid) || !oid || !GUID.test(oid)) throw new ErroreOidc('token');
    return {
      soggetto: `${tid}:${oid}`,
      organizzazione: tid,
      etichetta: testo(payload.preferred_username, 254) ?? testo(payload.email, 254),
    };
  }
  const sub = testo(payload.sub, 200);
  if (!sub) throw new ErroreOidc('token');
  return {
    soggetto: sub,
    organizzazione: payload.hd === undefined ? null : dominioDa(payload.hd),
    etichetta: testo(payload.email, 254),
  };
}
