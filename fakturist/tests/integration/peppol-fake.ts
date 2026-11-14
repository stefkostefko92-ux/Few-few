import { createHmac } from 'node:crypto';

/**
 * Фалшив eConnect PSB за интеграционните тестове (по документацията им): токен, регистрация, изпращане
 * (409 при повторен UUID), изтегляне. Поведението се управлява през `state`; `restore()` връща fetch.
 */
export const API = 'https://accp-psb.econnect.eu';
export const IDENTITY = 'https://accp-identity.econnect.eu';

export interface EnrollCall {
  party: string;
  body: { hooks: Array<{ action: string }> };
}

export interface FakeState {
  downloadXml: string;
  downloadFails: boolean;
  /** 'ok' — 200; 'echo' — 400 с тялото на заявката обратно (както би направил доставчик при грешка). */
  enrollMode: 'ok' | 'echo';
  enrollDelayMs: number;
  /** Вика се, преди доставчикът да отговори на изпращане (известие, дошло докато заявката тече). */
  onSend: ((documentId: string) => Promise<void>) | null;
  /** Отговор на изпращането вместо 200 (напр. 503 — временна грешка). */
  sendStatus: number | null;
}

export interface FakeEConnect {
  sent: Array<{ party: string; id: string; ubl: string }>;
  enrolled: EnrollCall[];
  rejectedEnrolls: EnrollCall[];
  state: FakeState;
  realFetch: typeof fetch;
  restore(): void;
}

export function installFakeEConnect(): FakeEConnect {
  const realFetch = globalThis.fetch;
  const fake: FakeEConnect = {
    sent: [],
    enrolled: [],
    rejectedEnrolls: [],
    state: {
      downloadXml: '',
      downloadFails: false,
      enrollMode: 'ok',
      enrollDelayMs: 0,
      onSend: null,
      sendStatus: null,
    },
    realFetch,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === `${IDENTITY}/connect/token`) {
      return Response.json({ access_token: 'tok', expires_in: 3600 });
    }
    if (!url.startsWith(API)) return realFetch(input, init);
    const path = decodeURIComponent(url.slice(API.length));
    const enroll = /^\/api\/v1-beta\/([^/]+)\/enroll$/.exec(path);
    if (enroll && init?.method === 'PUT') {
      const call: EnrollCall = { party: enroll[1]!, body: JSON.parse(String(init.body)) };
      if (fake.state.enrollDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fake.state.enrollDelayMs));
      }
      if (fake.state.enrollMode === 'echo') {
        fake.rejectedEnrolls.push(call);
        const action = call.body.hooks[0]?.action ?? '';
        return new Response(`invalid hook action '${action}' in ${String(init.body)}`, {
          status: 400,
        });
      }
      fake.enrolled.push(call);
      return new Response(null, { status: 200 });
    }
    const send = /^\/api\/v1\/([^/]+)\/salesInvoice\/send$/.exec(path);
    if (send) {
      const id = (init?.headers as Record<string, string>)['X-EConnect-DocumentId']!;
      if (fake.state.onSend) await fake.state.onSend(id);
      if (fake.state.sendStatus) return new Response(null, { status: fake.state.sendStatus });
      if (fake.sent.some((s) => s.id === id)) return new Response(null, { status: 409 });
      fake.sent.push({ party: send[1]!, id, ubl: String(init?.body) });
      return Response.json({ id });
    }
    const download = /^\/api\/v1\/([^/]+)\/purchaseInvoice\/([^/]+)\/download$/.exec(path);
    if (download) {
      if (fake.state.downloadFails) return new Response(null, { status: 503 });
      return new Response(fake.state.downloadXml, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return fake;
}

/** Известие, подписано като eConnect: HMAC-SHA256 на суровото тяло с тайната след „#“. */
export function postHook(
  fake: FakeEConnect,
  origin: string,
  body: Record<string, unknown>,
  opts: { secret: string; delivery?: string },
): Promise<Response> {
  return postSignedRaw(
    fake,
    origin,
    JSON.stringify({ sentOn: new Date().toISOString(), ...body }),
    opts,
  );
}

/** Точно това тяло, подписано — за повторение на заловено известие. */
export function postSignedRaw(
  fake: FakeEConnect,
  origin: string,
  raw: string,
  opts: { secret: string; delivery?: string },
): Promise<Response> {
  const signature = createHmac('sha256', opts.secret).update(raw).digest('hex');
  return fake.realFetch(`${origin}/webhooks/peppol`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-econnect-signature': `sha256=${signature}`,
      ...(opts.delivery ? { 'x-econnect-delivery': opts.delivery } : {}),
    },
    body: raw,
  });
}

/** Тайната на известията от адреса, който фирмата е регистрирала. */
export function hookSecretOf(call: EnrollCall): string {
  return call.body.hooks[0]!.action.split('#')[1]!;
}
