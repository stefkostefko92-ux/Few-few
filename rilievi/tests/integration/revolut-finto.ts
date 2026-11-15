/**
 * A fake Revolut Merchant API for the payment tests (#31): orders, reading an order, refunding an order (a new
 * order of type "refund", linked with `related_order_id`; the same Idempotency-Key gives the same refund), reading
 * a dispute and registering a webhook, as the official OpenAPI (version 2026-08-17) describes them. It checks the
 * secret key and the API version header like the real one, and lets a test complete, fail or cancel an order and
 * send the signed webhook to the portal. Start it (it sets REVOLUT_API_BASE, and starts the fake VIES and Discord
 * of esterni-finti.ts) before the harness is imported.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { avviaEsterniFinti, fermaEsterniFinti } from './esterni-finti.js';

export const CHIAVE = 'sk_test_revolut_finto_0123456789';
export const SEGRETO_WEBHOOK = 'wsk_finto_0123456789abcdef';

export interface OrdineFinto {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  reference: string;
  redirect: string;
  /** A refund order: the order it gives money back on. */
  related?: string;
}

/** How the next refunds answer: the state of the new refund order, or an HTTP error, or no answer at all. */
export const rimborsi: {
  stato: OrdineFinto['state'];
  http: number | null;
  /** The request is accepted and done, but the answer never arrives (the portal sees a network error). */
  muto: boolean;
  chiavi: Map<string, string>;
  richieste: Array<{ ordine: string; chiave: string | undefined; amount: number }>;
} = { stato: 'processing', http: null, muto: false, chiavi: new Map(), richieste: [] };

export interface DisputaFinta {
  id: string;
  state: 'needs_response' | 'under_review' | 'won' | 'lost';
  substate?: string;
  amount: number;
  order_id: string;
  response_due_date?: string;
}
export const dispute = new Map<string, DisputaFinta>();

export const ordini = new Map<string, OrdineFinto>();
export const webhook: {
  url: string | null;
  registrati: number;
  eliminati: string[];
  eventi: string[];
  /** As a sandbox that does not know the dispute events: 422 when they are asked. */
  rifiutaDispute: boolean;
} = { url: null, registrati: 0, eliminati: [], eventi: [], rifiutaDispute: false };
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
  type: o.related ? 'refund' : 'payment',
  ...(o.related ? { related_order_id: o.related } : {}),
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
    const r = /^\/api\/orders\/([0-9a-f-]+)\/refund$/.exec(url.pathname);
    if (r && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as Record<string, unknown>;
      const chiave = req.headers['idempotency-key'] as string | undefined;
      const origine = ordini.get(r[1]!);
      rimborsi.richieste.push({ ordine: r[1]!, chiave, amount: Number(b.amount) });
      if (rimborsi.http !== null) return json(rimborsi.http, { code: 'refund_refused' });
      if (!origine) return json(404, { code: 'not_found' });
      const gia = chiave ? rimborsi.chiavi.get(chiave) : undefined;
      if (gia) return json(201, vista(ordini.get(gia)!));
      const resi = [...ordini.values()]
        .filter((o) => o.related === origine.id && o.state !== 'failed' && o.state !== 'cancelled')
        .reduce((somma, o) => somma + o.amount, 0);
      if (
        origine.state !== 'completed' ||
        origine.related ||
        resi + Number(b.amount) > origine.amount
      )
        return json(422, { code: 'refund_not_possible' });
      const id = randomUUID();
      const o: OrdineFinto = {
        id,
        state: rimborsi.stato,
        amount: Number(b.amount),
        currency: String(b.currency),
        reference: String((b.merchant_order_data as { reference?: string })?.reference ?? ''),
        redirect: '',
        related: origine.id,
      };
      ordini.set(id, o);
      if (chiave) rimborsi.chiavi.set(chiave, id);
      if (rimborsi.muto) return req.socket.destroy();
      return json(201, vista(o));
    }
    const d = /^\/api\/disputes\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (d && req.method === 'GET') {
      const x = dispute.get(d[1]!);
      if (!x) return json(404, { code: 'not_found' });
      return json(200, {
        id: x.id,
        state: x.state,
        substate: x.substate ?? 'new',
        created_at: '2026-11-10T09:00:00.000Z',
        updated_at: new Date().toISOString(),
        response_due_date: x.response_due_date ?? '2026-11-25T09:00:00.000Z',
        reason_code: '13.1',
        reason_description: 'Merchandise/Services Not Received',
        amount: x.amount,
        currency: 'EUR',
        payment: { id: randomUUID(), order_id: x.order_id, amount: x.amount, currency: 'EUR' },
      });
    }
    if (url.pathname === '/api/webhooks' && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as { url: string; events: string[] };
      if (webhook.rifiutaDispute && b.events.some((e) => e.startsWith('DISPUTE_')))
        return json(422, { code: 'unknown_event' });
      webhook.eventi = b.events;
      webhook.url = b.url;
      webhook.registrati += 1;
      return json(200, {
        id: `wh-${webhook.registrati}`,
        url: b.url,
        events: b.events,
        signing_secret: SEGRETO_WEBHOOK,
      });
    }
    const w = /^\/api\/webhooks\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (w && req.method === 'DELETE') {
      webhook.eliminati.push(w[1]!);
      res.writeHead(204);
      return res.end();
    }
    json(404, { code: 'not_found' });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  BASE_REVOLUT = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  process.env.REVOLUT_API_BASE = BASE_REVOLUT;
  // Every payment of a company outside Bulgaria asks VIES: the tests never reach the real one.
  await avviaEsterniFinti();
}

export async function fermaRevolutFinto(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await fermaEsterniFinti();
}

/** The refund orders the fake holds for an order. */
export const rimborsiDi = (orderId: string): OrdineFinto[] =>
  [...ordini.values()].filter((o) => o.related === orderId);

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
  // A dispute event carries only the dispute id (Webhook-Dispute-Event).
  const body = JSON.stringify(
    evento.startsWith('DISPUTE_')
      ? { event: evento, dispute_id: orderId }
      : { event: evento, order_id: orderId, merchant_order_ext_ref: null },
  );
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
