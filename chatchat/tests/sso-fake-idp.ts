import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';

/**
 * Локален ФАЛШИВ OpenID доставчик за тестовете (unit — през `handle` без мрежа; интеграционни и
 * e2e — през http сървър). Издатели: `<base>/<tid>/v2.0` (като Microsoft Entra ID, по един на
 * директория) и `<base>/generic` (общ OIDC). Discovery, JWKS, authorize (code + PKCE S256),
 * token (client_secret_basic/post, проверка на code_verifier, еднократен код), logout.
 * Кой „влиза“ — `next`; повреди на id_token — `tamper` (грешен iss/aud/nonce/подпис, изтекъл…).
 */

export const FAKE_CLIENT_ID = 'chatchat-test-client';
export const FAKE_CLIENT_SECRET = 'fake-client-secret-0123456789abcdef';
export const ENTRA_TID = '11111111-2222-4333-8444-555555555555';
export const OTHER_TID = '99999999-8888-4777-8666-555555555555';

export interface Tamper {
  iss?: string;
  aud?: string;
  nonce?: string;
  /** Изтекъл преди 10 минути (над толеранса). */
  expired?: boolean;
  /** nbf и iat след 10 минути. */
  future?: boolean;
  /** Подписан с чужд ключ със същия kid. */
  foreignKey?: boolean;
  /** Без id_token в отговора на token endpoint-а. */
  noIdToken?: boolean;
}

interface Pending {
  realm: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  claims: Record<string, unknown>;
}

const REALM =
  /^\/((?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v2\.0|generic)(\/.*)$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export class FakeIdp {
  base = 'http://127.0.0.1:0';
  /** Следващият вход при доставчика (claims, които влизат в id_token). */
  next: Record<string, unknown> | null = null;
  tamper: Tamper = {};
  /** Последните параметри на /authorize (login_hint, prompt…). */
  lastAuthorize: URLSearchParams | null = null;
  /** Колко пъти е викан token endpoint-ът. */
  tokenCalls = 0;
  /** Колко пъти са поискани ключовете (кешът на JWKS). */
  jwksCalls = 0;
  readonly redirectUris = new Set<string>();
  private readonly codes = new Map<string, Pending>();
  private server: Server | null = null;
  private key!: { privateKey: CryptoKey; jwk: JWK };
  private foreign!: CryptoKey;

  static async create(): Promise<FakeIdp> {
    const idp = new FakeIdp();
    const pair = await generateKeyPair('RS256', { extractable: true });
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'fake-key-1',
      alg: 'RS256',
      use: 'sig',
    };
    idp.key = { privateKey: pair.privateKey, jwk };
    idp.foreign = (await generateKeyPair('RS256')).privateKey;
    return idp;
  }

  issuer(realm: string): string {
    return `${this.base}/${realm}`;
  }

  entraIssuer(tid = ENTRA_TID): string {
    return this.issuer(`${tid}/v2.0`);
  }

  genericIssuer(): string {
    return this.issuer('generic');
  }

  async listen(host = '127.0.0.1'): Promise<void> {
    this.server = createServer((req, res) => {
      void this.toRequest(req, host)
        .then((r) => this.handle(r))
        .then(async (out) => {
          res.writeHead(out.status, Object.fromEntries(out.headers.entries()));
          res.end(Buffer.from(await out.arrayBuffer()));
        })
        .catch(() => res.writeHead(500).end());
    });
    await new Promise<void>((resolve) => this.server?.listen(0, host, () => resolve()));
    const { port } = this.server.address() as AddressInfo;
    this.base = `http://${host === '127.0.0.1' ? '127.0.0.1' : host}:${port}`;
  }

  async close(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  private async toRequest(req: IncomingMessage, host: string): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    return new Request(`http://${host}${req.url ?? '/'}`, {
      method: req.method ?? 'GET',
      headers,
      ...(body && req.method !== 'GET' ? { body } : {}),
    });
  }

  /** Fetch API — за unit тестовете (customFetch на openid-client) и за http сървъра. */
  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const m = REALM.exec(url.pathname);
    if (!m) return json({ error: 'not_found' }, 404);
    const realm = m[1] as string;
    const rest = m[2] as string;
    if (rest === '/.well-known/openid-configuration') return json(this.metadata(realm));
    if (rest === '/keys') {
      this.jwksCalls += 1;
      return json({ keys: [this.key.jwk] });
    }
    if (rest === '/authorize') return this.authorize(realm, url.searchParams);
    if (rest === '/token' && req.method === 'POST') return this.token(realm, req);
    if (rest === '/logout') return new Response('bye', { status: 200 });
    return json({ error: 'not_found' }, 404);
  }

  metadata(realm: string): Record<string, unknown> {
    const iss = this.issuer(realm);
    const entra = realm !== 'generic';
    return {
      issuer: iss,
      authorization_endpoint: `${iss}/authorize`,
      token_endpoint: `${iss}/token`,
      jwks_uri: `${iss}/keys`,
      end_session_endpoint: `${iss}/logout`,
      response_types_supported: ['code'],
      subject_types_supported: [entra ? 'pairwise' : 'public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid', 'profile', 'email'],
      // Entra не обявява PKCE в metadata (но го поддържа) — както тук.
      ...(entra ? {} : { code_challenge_methods_supported: ['S256'] }),
    };
  }

  private authorize(realm: string, q: URLSearchParams): Response {
    this.lastAuthorize = q;
    const redirectUri = q.get('redirect_uri') ?? '';
    if (q.get('client_id') !== FAKE_CLIENT_ID) return json({ error: 'unauthorized_client' }, 400);
    if (this.redirectUris.size && !this.redirectUris.has(redirectUri)) {
      return json({ error: 'invalid_redirect_uri' }, 400);
    }
    if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
      return json({ error: 'invalid_request' }, 400);
    }
    const scope = (q.get('scope') ?? '').split(' ');
    const challenge = q.get('code_challenge') ?? '';
    const nonce = q.get('nonce') ?? '';
    if (!scope.includes('openid') || !challenge || !nonce)
      return json({ error: 'invalid_request' }, 400);
    if (!this.next) return json({ error: 'login_required' }, 400);
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, {
      realm,
      clientId: FAKE_CLIENT_ID,
      redirectUri,
      challenge,
      nonce,
      claims: this.next,
    });
    const to = new URL(redirectUri);
    to.searchParams.set('code', code);
    const state = q.get('state');
    if (state) to.searchParams.set('state', state);
    return new Response(null, { status: 302, headers: { location: to.href } });
  }

  private clientOk(req: Request, form: URLSearchParams): boolean {
    const basic = req.headers.get('authorization');
    if (basic?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(basic.slice(6), 'base64')
        .toString('utf8')
        .split(':')
        .map((s) => decodeURIComponent(s));
      return id === FAKE_CLIENT_ID && secret === FAKE_CLIENT_SECRET;
    }
    return (
      form.get('client_id') === FAKE_CLIENT_ID && form.get('client_secret') === FAKE_CLIENT_SECRET
    );
  }

  private async token(realm: string, req: Request): Promise<Response> {
    this.tokenCalls += 1;
    const form = new URLSearchParams(await req.text());
    if (!this.clientOk(req, form)) return json({ error: 'invalid_client' }, 401);
    const code = form.get('code') ?? '';
    const pending = this.codes.get(code);
    this.codes.delete(code); // еднократен
    if (!pending || pending.realm !== realm || form.get('grant_type') !== 'authorization_code') {
      return json({ error: 'invalid_grant' }, 400);
    }
    if (form.get('redirect_uri') !== pending.redirectUri)
      return json({ error: 'invalid_grant' }, 400);
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (challenge !== pending.challenge) return json({ error: 'invalid_grant' }, 400);
    const body: Record<string, unknown> = {
      access_token: randomBytes(16).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
    };
    if (!this.tamper.noIdToken) body.id_token = await this.idToken(realm, pending);
    return json(body);
  }

  private async idToken(realm: string, p: Pending): Promise<string> {
    const t = this.tamper;
    const now = Math.floor(Date.now() / 1000);
    const shift = t.expired ? -1200 : t.future ? 600 : 0;
    const entra = realm !== 'generic';
    const payload: Record<string, unknown> = {
      ...(entra ? { tid: realm.split('/')[0], ver: '2.0' } : {}),
      ...p.claims,
      nonce: t.nonce ?? p.nonce,
    };
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'fake-key-1', typ: 'JWT' })
      .setIssuer(t.iss ?? this.issuer(realm))
      .setAudience(t.aud ?? p.clientId)
      .setSubject(
        typeof p.claims.sub === 'string' ? p.claims.sub : `sub-${randomBytes(6).toString('hex')}`,
      )
      .setIssuedAt(now + shift)
      .setNotBefore(now + shift)
      .setExpirationTime(now + shift + 600)
      .sign(t.foreignKey ? this.foreign : this.key.privateKey);
  }
}
