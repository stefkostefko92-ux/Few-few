// The VIES client (terms 2026-11-13, art. 12.10; art. 18(1)(a) of Implementing Regulation (EU) No 282/2011). The
// contract is the official "swagger_publicVAT.yaml" of the European Commission: POST /check-vat-number, the answer
// with `valid`, `requestDate`, `requestIdentifier`, `name`, `address`; errors as `actionSucceed: false` — also with
// HTTP 200. Acceptance criteria:
//  - the request carries the customer's number split in country and number, and OUR number as the requester (only
//    then VIES issues the consultation number);
//  - valid → the consultation number, the date and the name/address ("---" means not disclosed);
//  - not valid, or a number VIES refuses as input → "nonValida";
//  - VIES or the member state down, a timeout, the network, an unreadable answer → "nonDisponibile", never a throw
//    and never "valid".
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { consultaVies } from '../src/pagamenti/vies.js';

let server: Server;
let base = '';
const richieste: Array<{ path: string; body: Record<string, unknown> }> = [];
let risposta: { status: number; body: string; attesaMs?: number } = { status: 200, body: '{}' };

before(async () => {
  server = createServer((req, res) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c.toString('utf8')));
    req.on('end', () => {
      richieste.push({ path: req.url ?? '', body: JSON.parse(s) as Record<string, unknown> });
      setTimeout(() => {
        res.writeHead(risposta.status, { 'content-type': 'application/json' });
        res.end(risposta.body);
      }, risposta.attesaMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const valida = {
  countryCode: 'IT',
  vatNumber: '00743110157',
  requestDate: '2026-11-12T19:39:25.287Z',
  valid: true,
  requestIdentifier: 'WAPIAAAAY1aBcDeF',
  name: 'ASCENSORI  ROSSI\nSRL',
  address: 'VIA ROMA 1 \n20100 MILANO MI\n',
};

describe('the VIES check of a VAT number', () => {
  it('asks with the number split and with our number as the requester', async () => {
    risposta = { status: 200, body: JSON.stringify(valida) };
    const r = await consultaVies('IT00743110157', { base });
    const ultima = richieste.at(-1)!;
    assert.equal(ultima.path, '/check-vat-number');
    assert.deepEqual(ultima.body, {
      countryCode: 'IT',
      vatNumber: '00743110157',
      requesterMemberStateCode: 'BG',
      requesterNumber: '208725180',
    });
    assert.deepEqual(r, {
      esito: 'valida',
      consultazione: 'WAPIAAAAY1aBcDeF',
      at: new Date('2026-11-12T19:39:25.287Z'),
      nome: 'ASCENSORI ROSSI SRL',
      indirizzo: 'VIA ROMA 1 20100 MILANO MI',
    });
  });

  it('keeps a valid answer without consultation number, name or address', async () => {
    risposta = {
      status: 200,
      body: JSON.stringify({ ...valida, requestIdentifier: '', name: '---', address: '---' }),
    };
    const r = await consultaVies('DE811907980', { base });
    assert.equal(r.esito, 'valida');
    assert.deepEqual(r.esito === 'valida' && [r.consultazione, r.nome, r.indirizzo], [
      null,
      null,
      null,
    ]);
    assert.deepEqual(richieste.at(-1)!.body.countryCode, 'DE');
  });

  it('says "not valid" for an unknown number and for an input VIES refuses', async () => {
    // VIES answered for this number: the consultation and its moment are the proof that it was asked (the sale
    // then goes with Bulgarian VAT — conditions 2026-11-14, art. 12.10 b).
    risposta = { status: 200, body: JSON.stringify({ ...valida, valid: false, name: '---' }) };
    const no = await consultaVies('IT00743110157', { base });
    assert.equal(no.esito, 'nonValida');
    assert.ok(no.esito === 'nonValida' && no.at instanceof Date);
    assert.equal(no.esito === 'nonValida' && no.consultazione, valida.requestIdentifier);
    const senza = { esito: 'nonValida', consultazione: null, at: null };
    risposta = {
      status: 200,
      body: JSON.stringify({ actionSucceed: false, errorWrappers: [{ error: 'INVALID_INPUT' }] }),
    };
    assert.deepEqual(await consultaVies('IT00743110157', { base }), senza);
    // A number that is not "country + digits" never leaves the portal.
    const prima = richieste.length;
    assert.deepEqual(await consultaVies('00743110157', { base }), senza);
    assert.equal(richieste.length, prima);
  });

  it('says "not available" when VIES or the member state does not answer — never "valid"', async () => {
    for (const codice of [
      'MS_UNAVAILABLE',
      'SERVICE_UNAVAILABLE',
      'TIMEOUT',
      'MS_MAX_CONCURRENT_REQ',
    ]) {
      risposta = {
        status: 200,
        body: JSON.stringify({ actionSucceed: false, errorWrappers: [{ error: codice }] }),
      };
      assert.deepEqual(await consultaVies('IT00743110157', { base }), {
        esito: 'nonDisponibile',
        codice,
      });
    }
    risposta = { status: 500, body: JSON.stringify({ actionSucceed: false }) };
    assert.deepEqual(await consultaVies('IT00743110157', { base }), {
      esito: 'nonDisponibile',
      codice: 'errore',
    });
    risposta = { status: 200, body: '<html>manutenzione</html>' };
    assert.deepEqual(await consultaVies('IT00743110157', { base }), {
      esito: 'nonDisponibile',
      codice: 'rete',
    });
    risposta = { status: 200, body: JSON.stringify({ valid: 'true' }) };
    assert.deepEqual(await consultaVies('IT00743110157', { base }), {
      esito: 'nonDisponibile',
      codice: 'risposta',
    });
    risposta = { status: 200, body: JSON.stringify(valida), attesaMs: 300 };
    assert.deepEqual(await consultaVies('IT00743110157', { base, timeoutMs: 50 }), {
      esito: 'nonDisponibile',
      codice: 'rete',
    });
    assert.deepEqual(await consultaVies('IT00743110157', { base: 'http://127.0.0.1:1' }), {
      esito: 'nonDisponibile',
      codice: 'rete',
    });
  });
});
