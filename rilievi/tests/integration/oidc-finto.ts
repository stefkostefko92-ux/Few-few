/**
 * A fake OpenID provider for the tests of point D1: Microsoft (`<base>/ms`, multi-tenant discovery with the
 * `{tenantid}` issuer template) and Google (`<base>/google`) on one local HTTP server. The authorize step is
 * the test itself: `autorizza()` reads the URL the portal redirected to, checks it, and registers the code
 * with the claims the token endpoint will sign. The token endpoint checks the client, the redirect and the
 * PKCE verifier, as the real ones do. It must be started (and the env set) before the harness is imported.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

export const MS_CLIENT = 'ms-client-id';
export const GOOGLE_CLIENT = 'google-client-id';
const SECRETS: Record<string, string> = {
  [MS_CLIENT]: 'ms-secret-value',
  [GOOGLE_CLIENT]: 'google-secret-value',
};

const chiave = await generateKeyPair('RS256');
const estranea = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(chiave.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

interface Codice {
  claims: JWTPayload;
  challenge: string;
  redirect: string;
  client: string;
  /** Firma con una chiave che il provider non pubblica. */
  firmaEstranea?: boolean;
}

const codici = new Map<string, Codice>();
/** What the token endpoint received, for the assertions. */
export const scambi: Array<{ client: string; verifier: string }> = [];

let server: Server | null = null;
let automatico: ((path: string) => JWTPayload | null) | null = null;

/** For a real browser: the provider's sign-in page answers at once with these claims (null — 404). */
export function accediAutomaticamente(fn: (path: string) => JWTPayload | null): void {
  automatico = fn;
}
export let BASE_FINTO = '';

const leggiCorpo = (req: import('node:http').IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => resolve(body));
  });

export async function avviaProviderFinto(): Promise<void> {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', BASE_FINTO || 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/ms/organizations/v2.0/.well-known/openid-configuration') {
      return json(200, {
        issuer: `${BASE_FINTO}/ms/{tenantid}/v2.0`,
        authorization_endpoint: `${BASE_FINTO}/ms/organizations/oauth2/v2.0/authorize`,
        token_endpoint: `${BASE_FINTO}/token`,
        jwks_uri: `${BASE_FINTO}/keys`,
      });
    }
    if (url.pathname === '/google/.well-known/openid-configuration') {
      return json(200, {
        issuer: `${BASE_FINTO}/google`,
        authorization_endpoint: `${BASE_FINTO}/google/auth`,
        token_endpoint: `${BASE_FINTO}/token`,
        jwks_uri: `${BASE_FINTO}/keys`,
      });
    }
    if (url.pathname === '/keys') return json(200, { keys: [jwk] });
    // The sign-in page of the provider, for a real browser (the visual check): signs in `automatico` at once.
    const auto = automatico?.(url.pathname);
    if (auto) {
      const ritorno = autorizza(url.href, auto);
      res.writeHead(302, {
        location: new URL(ritorno, url.searchParams.get('redirect_uri') ?? '').href,
      });
      return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await leggiCorpo(req));
      const client = form.get('client_id') ?? '';
      const codice = codici.get(form.get('code') ?? '');
      codici.delete(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      scambi.push({ client, verifier });
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (
        !codice ||
        form.get('grant_type') !== 'authorization_code' ||
        SECRETS[client] !== form.get('client_secret') ||
        codice.client !== client ||
        codice.redirect !== form.get('redirect_uri') ||
        codice.challenge !== challenge
      ) {
        return json(400, { error: 'invalid_grant' });
      }
      const firma = codice.firmaEstranea ? estranea.privateKey : chiave.privateKey;
      const jwt = new SignJWT(codice.claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' });
      if (codice.claims.iat === undefined) jwt.setIssuedAt();
      if (codice.claims.exp === undefined) jwt.setExpirationTime('5m');
      const idToken = await jwt.sign(firma);
      return json(200, { access_token: 'x', token_type: 'Bearer', id_token: idToken });
    }
    json(404, { error: 'not_found' });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  BASE_FINTO = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  process.env.OIDC_MICROSOFT_CLIENT_ID = MS_CLIENT;
  process.env.OIDC_MICROSOFT_CLIENT_SECRET = SECRETS[MS_CLIENT];
  process.env.OIDC_MICROSOFT_AUTHORITY = `${BASE_FINTO}/ms`;
  process.env.OIDC_GOOGLE_CLIENT_ID = GOOGLE_CLIENT;
  process.env.OIDC_GOOGLE_CLIENT_SECRET = SECRETS[GOOGLE_CLIENT];
  process.env.OIDC_GOOGLE_ISSUER = `${BASE_FINTO}/google`;
}

export async function fermaProviderFinto(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

export const TENANT = '0b8f4d6e-1c2a-4e7b-9d3f-5a6b7c8d9e0f';
export const ALTRO_TENANT = '1c9e5f7a-2d3b-4f8c-8e4a-6b7c8d9e0f1a';

/** The claims of a Microsoft work account of `tid` (`iss` follows the tenant unless given). */
export const claimsMicrosoft = (oid: string, tid = TENANT, extra: JWTPayload = {}): JWTPayload => ({
  iss: `${BASE_FINTO}/ms/${tid}/v2.0`,
  aud: MS_CLIENT,
  tid,
  oid,
  sub: `pairwise-${oid}`,
  preferred_username: `${oid}@contoso.example`,
  ...extra,
});

export const claimsGoogle = (sub: string, hd?: string, extra: JWTPayload = {}): JWTPayload => ({
  iss: `${BASE_FINTO}/google`,
  aud: GOOGLE_CLIENT,
  sub,
  email: `${sub}@${hd ?? 'gmail.com'}`,
  email_verified: true,
  ...(hd ? { hd } : {}),
  ...extra,
});

/**
 * The provider's half of the sign-in: checks the authorize URL the portal sent the browser to (code flow,
 * PKCE S256, state, nonce, `openid`), registers a code for these claims and returns the callback path.
 * The claims get the request's nonce unless they carry their own.
 */
export function autorizza(
  location: string,
  claims: JWTPayload,
  opzioni: { firmaEstranea?: boolean } = {},
): string {
  const url = new URL(location);
  assert.ok(url.href.startsWith(BASE_FINTO), `not sent to the provider: ${location}`);
  const p = url.searchParams;
  assert.equal(p.get('response_type'), 'code');
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.match(p.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('state') ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('nonce') ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.ok((p.get('scope') ?? '').split(' ').includes('openid'));
  const client = p.get('client_id') ?? '';
  const redirect = p.get('redirect_uri') ?? '';
  const code = randomBytes(16).toString('hex');
  codici.set(code, {
    claims: { nonce: p.get('nonce') ?? '', ...claims },
    challenge: p.get('code_challenge') ?? '',
    redirect,
    client,
    ...opzioni,
  });
  const ritorno = new URL(redirect);
  return `${ritorno.pathname}?code=${code}&state=${p.get('state')}`;
}
