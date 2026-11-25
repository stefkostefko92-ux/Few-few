// What a refund order of Revolut says (API 2026-09-22, refundOrder "Declined refunds"): a refused Revolut Pay refund
// answers 200 with the refund order — the order still "processing", its payment "declined" or "failed" with the
// reason (examples Res-Refund-Declined and Res-Refund-Failed, word for word in revolut-rimborsi-rifiutati.json); a
// card answers 400, as every refusal did before 2026-09-22. The order read back later (webhook, maintenance) says
// the same. A refusal is final for the portal; anything still moving keeps the refund open — closing a refund
// that Revolut may still pay would let it be ordered twice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { ROOT } from '../src/paths.js';
import {
  esitoOrdineRimborso,
  leggiOrdine,
  rimborsaOrdine,
  VERSIONE_API,
} from '../src/pagamenti/revolut.js';

const esempi = JSON.parse(
  readFileSync(join(ROOT, 'tests', 'revolut-rimborsi-rifiutati.json'), 'utf8'),
) as Record<'Res-Refund-Declined' | 'Res-Refund-Failed', Record<string, unknown>>;

const C = { base: 'https://revolut.invalid', chiave: 'chiave-di-prova' };
const veroFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = veroFetch;
});

/** Revolut answers `body` with `status` to the next request; the request is kept. */
function risponde(status: number, body: unknown) {
  const viste: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    viste.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return viste;
}

const ordine = (o: Record<string, unknown>) => {
  risponde(200, o);
  return leggiOrdine(C, String(o.id));
};

describe('a refund order of Revolut', () => {
  it('is refused when its Revolut Pay payment is declined (Res-Refund-Declined)', async () => {
    const o = await ordine(esempi['Res-Refund-Declined']);
    assert.equal(o.state, 'processing');
    assert.deepEqual(esitoOrdineRimborso(o), { rifiutato: 'suspected_fraud' });
  });

  it('is refused when its Revolut Pay payment failed (Res-Refund-Failed)', async () => {
    const o = await ordine(esempi['Res-Refund-Failed']);
    assert.deepEqual(esitoOrdineRimborso(o), { rifiutato: 'technical_error' });
  });

  it('is refused when the order itself failed or was cancelled, as before', async () => {
    const base = esempi['Res-Refund-Declined'];
    for (const state of ['failed', 'cancelled'] as const)
      assert.deepEqual(esitoOrdineRimborso(await ordine({ ...base, state, payments: [] })), {
        rifiutato: state,
      });
  });

  it('is answered 200 by the refund request and read as refused, the API version unchanged', async () => {
    const declinato = {
      ...esempi['Res-Refund-Declined'],
      amount: 2900,
      currency: 'EUR',
      related_order_id: 'ordine-pagato',
    };
    const viste = risponde(200, declinato);
    const o = await rimborsaOrdine(C, 'ordine-pagato', {
      amount: 2900,
      reference: 'rimborso-1',
      description: 'prova',
      chiave: 'rimborso-1',
    });
    assert.deepEqual(esitoOrdineRimborso(o), { rifiutato: 'suspected_fraud' });
    const intestazioni = new Headers(viste[0]!.init?.headers);
    assert.equal(intestazioni.get('Revolut-Api-Version'), VERSIONE_API);
    assert.equal(VERSIONE_API, '2026-08-17');
  });

  it('stays open while a payment is still moving, and is completed only by a completed order', async () => {
    const base = esempi['Res-Refund-Declined'];
    const con = (state: string, payments: unknown[]) => ordine({ ...base, state, payments });
    // No payment yet, a payment in progress, or a refused attempt next to one in progress: open.
    assert.equal(esitoOrdineRimborso(await con('processing', [])), 'inCorso');
    assert.equal(
      esitoOrdineRimborso(await con('processing', [{ state: 'refund_started' }])),
      'inCorso',
    );
    assert.equal(
      esitoOrdineRimborso(
        await con('processing', [{ state: 'declined' }, { state: 'refund_started' }]),
      ),
      'inCorso',
    );
    assert.equal(esitoOrdineRimborso(await ordine({ ...base, payments: undefined })), 'inCorso');
    // The order completed: completed, whatever an earlier attempt said.
    assert.equal(
      esitoOrdineRimborso(await con('completed', [{ state: 'declined' }, { state: 'completed' }])),
      'completato',
    );
  });

  it('keeps the reason only when it is a plain code, and never fails on payments it cannot read', async () => {
    const base = esempi['Res-Refund-Failed'];
    for (const decline_reason of ['<b>x</b>', 'a'.repeat(31), 'Con spazi'])
      assert.deepEqual(
        esitoOrdineRimborso(
          await ordine({ ...base, payments: [{ state: 'failed', decline_reason }] }),
        ),
        { rifiutato: 'failed' },
      );
    // Payments in a shape not foreseen: the order is still read (a paid order stays readable), the refund open.
    for (const payments of [[{ stato: 'x' }], 'nessuno', [{ state: 7 }]]) {
      const o = await ordine({ ...base, payments });
      assert.equal(o.id, base.id);
      assert.equal(esitoOrdineRimborso(o), 'inCorso');
    }
  });
});
