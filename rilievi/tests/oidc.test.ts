// Point D1 — access through the Client's identity provider (terms 2026-11-12, art. 4.6): the pieces without
// network or database. PKCE is S256 (RFC 7636), the state travels encrypted in a cookie, bound to its
// provider and purpose, for 10 minutes; the company's tenant and Workspace domain are read strictly.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

process.env.INTERVENTI_SEAL_KEY ??= randomBytes(32).toString('hex');
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.PUBLIC_BASE_URL ??= 'https://rilievi.example';
process.env.DATABASE_URL ??= 'postgresql://x@127.0.0.1/x_test';

const { sfidaPkce, nuovoStato, leggiStato, consumaStato, STATO_MS } =
  await import('../src/auth/oidc-stato.js');
const { tenantDa, dominioDa, issuerMicrosoft } = await import('../src/auth/oidc-valori.js');

describe('PKCE', () => {
  it('derives the S256 challenge of RFC 7636, appendix B', () => {
    assert.equal(
      sfidaPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('the state cookie', () => {
  const now = Date.UTC(2026, 10, 12, 10);

  it('round-trips with fresh random state, nonce and verifier', () => {
    const a = nuovoStato({ fornitore: 'microsoft', scopo: 'accesso', next: '/schede' }, now);
    const b = nuovoStato({ fornitore: 'microsoft', scopo: 'accesso', next: '/schede' }, now);
    assert.notEqual(a.stato, b.stato);
    assert.notEqual(a.nonce, b.nonce);
    assert.notEqual(a.verifier, b.verifier);
    assert.match(a.stato, /^[A-Za-z0-9_-]{43}$/);
    assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
    const letto = leggiStato(a.cookie, now + 1000);
    assert.deepEqual(letto, {
      fornitore: 'microsoft',
      scopo: 'accesso',
      next: '/schede',
      stato: a.stato,
      nonce: a.nonce,
      verifier: a.verifier,
      scade: now + STATO_MS,
    });
    // The cookie itself never shows what it carries.
    assert.ok(!a.cookie.includes(a.stato) && !a.cookie.includes(a.verifier));
  });

  it('carries the account and session of a link', () => {
    const s = nuovoStato(
      { fornitore: 'google', scopo: 'collega', next: '/account', uid: 'u1', sid: 's1' },
      now,
    );
    const letto = leggiStato(s.cookie, now);
    assert.equal(letto?.scopo, 'collega');
    assert.equal(letto?.uid, 'u1');
    assert.equal(letto?.sid, 's1');
  });

  it('lets each state through once, even from a copied cookie', () => {
    const s = nuovoStato({ fornitore: 'microsoft', scopo: 'accesso', next: '/schede' }, now);
    const letto = leggiStato(s.cookie, now)!;
    assert.equal(consumaStato(letto, now), true);
    assert.equal(consumaStato(leggiStato(s.cookie, now + 1000)!, now + 1000), false);
  });

  it('refuses an expired, altered, empty or foreign cookie', () => {
    const s = nuovoStato({ fornitore: 'google', scopo: 'accesso', next: '/schede' }, now);
    assert.equal(leggiStato(s.cookie, now + STATO_MS), null);
    const raw = Buffer.from(s.cookie, 'base64url');
    raw[raw.length - 1]! ^= 1;
    assert.equal(leggiStato(raw.toString('base64url'), now), null);
    assert.equal(leggiStato(undefined, now), null);
    assert.equal(leggiStato('', now), null);
    assert.equal(leggiStato('x'.repeat(5000), now), null);
    assert.equal(leggiStato(Buffer.from('{"scopo":"accesso"}').toString('base64url'), now), null);
  });
});

describe('the company settings', () => {
  it('takes a Microsoft tenant ID only as a GUID, in lower case', () => {
    assert.equal(
      tenantDa(' 72F988BF-86F1-41AF-91AB-2D7CD011DB47 '),
      '72f988bf-86f1-41af-91ab-2d7cd011db47',
    );
    for (const bad of [
      'contoso.onmicrosoft.com',
      '72f988bf86f141af91ab2d7cd011db47',
      '72f988bf-86f1-41af-91ab-2d7cd011db4',
      'common',
      'organizations',
      // Personal Microsoft accounts are not a company's directory.
      '9188040d-6c67-4c5b-b112-36a304b66dad',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      assert.equal(tenantDa(bad), null, bad);
    }
    assert.equal(tenantDa(''), null);
    assert.equal(tenantDa(undefined), null);
  });

  it('takes a Google Workspace domain as a host name, in lower case', () => {
    assert.equal(dominioDa(' Ascensori-Rossi.IT '), 'ascensori-rossi.it');
    assert.equal(dominioDa('@ascensori.it'), 'ascensori.it');
    for (const bad of [
      'gmail.com',
      'googlemail.com',
      'ascensori',
      'http://ascensori.it',
      'ascensori.it/x',
      '-a.it',
      'a..it',
      'a'.repeat(64) + '.it',
      'mario@ascensori.it',
    ]) {
      assert.equal(dominioDa(bad), null, bad);
    }
  });

  it('builds the issuer of the tenant that signed', () => {
    assert.equal(
      issuerMicrosoft('https://login.microsoftonline.com', '72f988bf-86f1-41af-91ab-2d7cd011db47'),
      'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0',
    );
    assert.equal(issuerMicrosoft('https://login.microsoftonline.com', '../x'), null);
  });
});
