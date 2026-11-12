/**
 * A fake Revolut Merchant API for the payment tests (#31): orders, reading an order, registering a webhook, as the
 * official OpenAPI (version 2026-08-17) describes them. It checks the secret key and the API version header like
 * the real one, and lets a test complete, fail or cancel an order and send the signed webhook to the portal. Start
 * it (and set REVOLUT_API_BASE) before the harness is imported.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const CHIAVE = 'sk_test_revolut_finto_0123456789';
export const SEGRETO_WEBHOOK = 'wsk_finto_0123456789abcdef';

export interface OrdineFinto {
  id: string;
  state: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  reference: string;
  redirect: string;
}

export const ordini = new Map<string, OrdineFinto>();
export const webhook: { url: string | null } = { url: null };
export const chiamate: Array<{ method: string; path: string }> = [];

let server: Server | null = null;
export let BASE_REVOLUT = '';

const corpo = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c.toString('utf8')));
    req.on('end', () => resolve(s));
  });

const vista = (o: OrdineFinto) => ({
  id: o.id,
  token: `tok-${o.id}`,
  type: 'payment',
  state: o.state,
  amount: o.amount,
  currency: o.currency,
  merchant_order_data: { reference: o.reference },
  checkout_url: `${BASE_REVOLUT}/pay/${o.id}`,
  created_at: new Date().toISOString(),
});

export async function avviaRevolutFinto(): Promise<void> {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    chiamate.push({ method: req.method ?? '', path: url.pathname });
    if (url.pathname.startsWith('/api/')) {
      if (req.headers.authorization !== `Bearer ${CHIAVE}`)
        return json(401, { code: 'unauthorized' });
      if (!req.headers['revolut-api-version']) return json(400, { code: 'version_required' });
    }
    if (url.pathname === '/api/orders' && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as Record<string, unknown>;
      const id = randomUUID();
      const o: OrdineFinto = {
        id,
        state: 'pending',
        amount: Number(b.amount),
        currency: String(b.currency),
        reference: String((b.merchant_order_data as { reference?: string })?.reference ?? ''),
        redirect: String(b.redirect_url ?? ''),
      };
      ordini.set(id, o);
      return json(201, vista(o));
    }
    const m = /^\/api\/orders\/([0-9a-f-]+)$/.exec(url.pathname);
    if (m && req.method === 'GET') {
      const o = ordini.get(m[1]!);
      return o ? json(200, vista(o)) : json(404, { code: 'not_found' });
    }
    if (url.pathname === '/api/webhooks' && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as { url: string; events: string[] };
      webhook.url = b.url;
      return json(200, {
        id: 'wh-1',
        url: b.url,
        events: b.events,
        signing_secret: SEGRETO_WEBHOOK,
      });
    }
    json(404, { code: 'not_found' });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  BASE_REVOLUT = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  process.env.REVOLUT_API_BASE = BASE_REVOLUT;
}

export async function fermaRevolutFinto(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

/** The order of a checkout URL the portal redirected to. */
export const ordineDa = (checkoutUrl: string): OrdineFinto => {
  const id = checkoutUrl.split('/').pop() ?? '';
  const o = ordini.get(id);
  if (!o) throw new Error(`no order ${id}`);
  return o;
};

/** A webhook event as Revolut signs it: HMAC-SHA256 of "v1.<timestamp>.<body>" with the signing secret. */
export function eventoFirmato(
  evento: string,
  orderId: string,
  opzioni: { segreto?: string; timestamp?: number } = {},
) {
  const body = JSON.stringify({ event: evento, order_id: orderId, merchant_order_ext_ref: null });
  const ts = String(opzioni.timestamp ?? Date.now());
  const firma = createHmac('sha256', opzioni.segreto ?? SEGRETO_WEBHOOK)
    .update(`v1.${ts}.${body}`)
    .digest('hex');
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'revolut-request-timestamp': ts,
      'revolut-signature': `v1=${firma}`,
    },
  };
}
