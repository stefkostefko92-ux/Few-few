// Point D2: the lists as CSV for Excel (what the person sees, never a formula) and the read-only API with the
// company's keys — shown once, stored as an HMAC, revocable, one company only, the bin excluded.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { BASE, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

async function scheda(
  browser: Awaited<ReturnType<typeof signedIn>>['browser'],
  form: Record<string, string>,
) {
  const reply = await browser.submit('/schede/nuova', '/schede', { data: '2026-11-12', ...form });
  assert.equal(reply.status, 303);
  return reply.location.split('/').pop()!;
}

const api = (path: string, chiave?: string) =>
  fetch(`${BASE}${path}`, { headers: chiave ? { authorization: `Bearer ${chiave}` } : {} });

describe('CSV and API', () => {
  it('exports the list as CSV for Excel, never a formula', async () => {
    const azienda = await makeAzienda('Csv Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    await scheda(browser, { indirizzo: '=HYPERLINK("http://x")', matricola: 'CSV-1' });
    const csv = await browser.get('/schede/esporta.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') ?? '', /^text\/csv/);
    assert.match(
      csv.headers.get('content-disposition') ?? '',
      /attachment; filename="schede-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    assert.ok(csv.body.startsWith('﻿"N'));
    assert.match(csv.body, /"'=HYPERLINK\(""http:\/\/x""\)"/);
    assert.match(csv.body, /"CSV-1"/);
    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda('Altra Csv')).id);
    assert.doesNotMatch((await altro.get('/schede/esporta.csv')).body, /CSV-1/);
  });

  it('gives a key once, reads only its company, stops when revoked', async () => {
    const azienda = await makeAzienda('Api Ascensori');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const id = await scheda(admin, {
      indirizzo: 'Via Api 1',
      matricola: 'API-1',
      numeroImpianto: '4401',
    });
    const nel = await scheda(admin, { indirizzo: 'Via Cestino 1', matricola: 'API-2' });
    await prisma.scheda.update({ where: { id: nel }, data: { deletedAt: new Date() } });
    const altra = await makeAzienda('Api Altra');
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    const fuori = await scheda(estraneo, { indirizzo: 'Via Fuori 1', matricola: 'API-X' });

    const page = `/impostazioni/api?azienda=${azienda.id}`;
    const created = await admin.submit(page, '/impostazioni/api', {
      azienda: azienda.id,
      nome: 'Gestionale',
    });
    assert.equal(created.status, 200);
    const chiave =
      /id="api-chiave" type="text" readonly value="(rk_[a-z0-9]{12}_[A-Za-z0-9_-]{43})"/.exec(
        created.body,
      )?.[1];
    assert.ok(chiave, 'the key is shown once');
    const row = await prisma.chiaveApi.findFirstOrThrow({ where: { aziendaId: azienda.id } });
    assert.ok(!JSON.stringify(row).includes(chiave.slice(16)), 'the secret is not stored');
    assert.doesNotMatch(
      (await admin.get(page)).body,
      new RegExp(chiave.slice(16)),
      'shown only once',
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'API_CHIAVE_CREATA', aziendaId: azienda.id },
      }),
      1,
    );

    const list = await api('/api/v1/schede', chiave);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    const data = (await list.json()) as {
      totale: number;
      schede: Array<{ id: string; matricola: string }>;
    };
    assert.deepEqual(
      data.schede.map((s) => s.matricola),
      ['API-1'],
    );
    const one = (await (await api(`/api/v1/schede/${id}`, chiave)).json()) as {
      campi: Record<string, unknown>;
    };
    assert.equal(one.campi.indirizzo, 'Via Api 1');
    assert.equal(one.campi.numeroImpianto, '4401');
    assert.equal((await api(`/api/v1/schede/${fuori}`, chiave)).status, 404);
    assert.equal((await api(`/api/v1/schede/${nel}`, chiave)).status, 404);

    for (const bad of [
      undefined,
      `${chiave.slice(0, -1)}A`,
      'rk_aaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]) {
      const r = await api('/api/v1/schede', bad);
      assert.equal(r.status, 401, String(bad));
      assert.equal(r.headers.get('www-authenticate'), 'Bearer');
    }
    // Only the company's ADMIN manages keys.
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    assert.equal((await tecnico.get(page)).status, 403);

    const revoca = await admin.submit(page, `/impostazioni/api/${row.id}/revoca`, {
      azienda: azienda.id,
    });
    assert.equal(revoca.status, 303);
    assert.equal((await api('/api/v1/schede', chiave)).status, 401);
  });
});
