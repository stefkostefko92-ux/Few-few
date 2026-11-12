// Quotes (the owner, 12 November 2026 — point C1: "off by default, turned on from the master settings"). Off,
// nobody in the company sees them (menu, pages, scheda button, settings, role rights); only the MASTER turns
// them on and off, and turning off deletes nothing. On: numbered per company from 1, filled from the scheda
// or free, totals computed by the server only (a forged total is ignored), the open-version rule, the states.
// The email, the price list, export and deletion — preventivi-invio.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { assertPdfA2b } from '../pdfa.js';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { accendi, base, crea, RIGHE, SCHEDA } from './preventivi-dati.js';

before(startApp);
after(stopApp);

describe('quotes', () => {
  it('are off by default and only the MASTER turns them on; off deletes nothing', async () => {
    const azienda = await makeAzienda('Preventivi Spenti');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: master } = await signedIn('MASTER');
    assert.equal((await admin.get('/preventivi')).status, 403);
    assert.equal((await admin.get('/preventivi/nuovo')).status, 403);
    assert.equal((await admin.get(`/impostazioni/preventivi?azienda=${azienda.id}`)).status, 404);
    const home = await admin.get('/schede');
    assert.doesNotMatch(home.body, /href="\/preventivi"/);
    const ruoli = await admin.get(`/impostazioni/ruoli?azienda=${azienda.id}`);
    assert.doesNotMatch(ruoli.body, /value="preventivi:read"/);

    // The ADMIN cannot turn them on.
    const csrf = await admin.csrf(`/impostazioni/azienda?azienda=${azienda.id}`);
    assert.equal(
      (await admin.post(`/aziende/${azienda.id}/preventivi`, { _csrf: csrf, attivi: '1' })).status,
      403,
    );
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).preventiviAttivi,
      false,
    );

    // Off: the MASTER (who sees every scheda) gets no quote button and no quote from a scheda either.
    const scheda = await admin.submit('/schede/nuova', '/schede', SCHEDA);
    const schedaId = scheda.location.split('/').pop()!;
    assert.doesNotMatch(
      (await master.get(`/schede/${schedaId}`)).body,
      /\/preventivi\/nuovo\?scheda=/,
    );
    assert.equal((await master.get(`/preventivi/nuovo?scheda=${schedaId}`)).status, 303);
    await accendi(master, azienda.id, true);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'AZIENDA_PREVENTIVI', aziendaId: azienda.id },
      }),
      1,
    );
    assert.equal((await admin.get('/preventivi')).status, 200);
    assert.match((await admin.get('/schede')).body, /href="\/preventivi"/);
    assert.match(
      (await admin.get(`/impostazioni/ruoli?azienda=${azienda.id}`)).body,
      /value="preventivi:read"/,
    );
    const id = await crea(admin, { ...RIGHE, azienda: azienda.id });

    // Saving the roles while quotes are off keeps their rights (the form does not show them).
    await accendi(master, azienda.id, false);
    const roles = await admin.submit(
      `/impostazioni/ruoli?azienda=${azienda.id}`,
      '/impostazioni/ruoli',
      {
        azienda: azienda.id,
        'perm-RESPONSABILE': ['schede:read', 'schede:write'],
      },
    );
    assert.equal(roles.status, 303);
    assert.equal((await admin.get(`/preventivi/${id}`)).status, 403);
    assert.equal(await prisma.preventivo.count({ where: { id } }), 1);
    await accendi(master, azienda.id, true);
    const { browser: resp } = await signedIn('RESPONSABILE', azienda.id);
    assert.equal((await resp.get(`/preventivi/${id}`)).status, 200);
  });

  it('gives the default quote rights to the roles of a company that saved its rights before quotes', async () => {
    const azienda = await makeAzienda('Preventivi Permessi Salvati');
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: {
        permessiRuoli: {
          RESPONSABILE: ['schede:read'],
          DIREZIONE: ['schede:read', 'preventivi:read'],
          TECNICO: ['schede:read'],
        },
      },
    });
    const sql = readFileSync(
      new URL(
        '../../prisma/migrations/20261113090100_preventivi_permessi/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    // Twice: the second run changes nothing.
    for (let i = 0; i < 2; i += 1)
      for (const statement of sql.split(';').filter((s) => /UPDATE/.test(s)))
        await prisma.$executeRawUnsafe(statement);
    const { permessiRuoli } = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(permessiRuoli, {
      RESPONSABILE: ['schede:read', 'preventivi:read', 'preventivi:write'],
      // A company that already decided on quotes (here: reading only) keeps its choice.
      DIREZIONE: ['schede:read', 'preventivi:read'],
      TECNICO: ['schede:read'],
    });
  });

  it('are numbered per company, filled from the scheda, totals by the server only', async () => {
    const azienda = await makeAzienda('Preventivi Ascensori');
    const altra = await makeAzienda('Altra Azienda');
    await prisma.azienda.updateMany({
      where: { id: { in: [azienda.id, altra.id] } },
      data: { preventiviAttivi: true },
    });
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { preventivoCondizioni: 'Pagamento 30% all’ordine.' },
    });
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    const scheda = await browser.submit('/schede/nuova', '/schede', SCHEDA);
    assert.equal(scheda.status, 303);
    const schedaId = scheda.location.split('/').pop()!;
    assert.match(
      (await browser.get(`/schede/${schedaId}`)).body,
      new RegExp(`/preventivi/nuovo\\?scheda=${schedaId}`),
    );

    const form = await browser.get(`/preventivi/nuovo?scheda=${schedaId}`);
    assert.equal(form.status, 200);
    assert.match(
      form.body,
      /name="impianto"[^>]*value="Matricola MI 7788 · N° 880022 · Via Manzoni 4, Milano"/,
    );
    assert.match(form.body, /Sostituzione del quadro di manovra/);
    assert.match(form.body, /Pagamento 30% all’ordine\./);

    const id = await crea(browser, {
      ...RIGHE,
      scheda: schedaId,
      imponibile: '1',
      totale: '1',
    });
    const row = await prisma.preventivo.findUniqueOrThrow({ where: { id } });
    assert.equal(row.numero, 1);
    assert.equal(row.schedaId, schedaId);
    // 4850,00 − 5 % = 4607,50 (10 %: 460,75); 12,5 h × 45 = 562,50 (22 %: 123,75).
    assert.equal(row.imponibile, 460750 + 56250);
    assert.equal(row.imposta, 46075 + 12375);
    assert.equal(row.totale, row.imponibile + row.imposta);
    assert.equal(row.stato, 'BOZZA');
    const second = await crea(browser, { ...RIGHE, cliente: 'Studio Rossi', azienda: azienda.id });
    assert.equal((await prisma.preventivo.findUniqueOrThrow({ where: { id: second } })).numero, 2);

    const show = await browser.get(`/preventivi/${id}`);
    assert.match(show.body, /Preventivo n\. 1/);
    // 5.170,00 + IVA 584,50 = 5.754,50
    assert.match(show.body, /5\.754,50/);
    const list = await browser.get('/preventivi?q=rossi');
    assert.match(list.body, new RegExp(`/preventivi/${second}`));
    assert.doesNotMatch(list.body, new RegExp(`/preventivi/${id}"`));

    const pdf = await browser.get(`/preventivi/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    await assertPdfA2b(pdf.bytes);

    // Below RESPONSABILE (defaults) and in another company: nothing.
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    assert.equal((await tecnico.get(`/preventivi/${id}`)).status, 403);
    const { browser: estraneo } = await signedIn('ADMIN', altra.id);
    assert.equal((await estraneo.get(`/preventivi/${id}`)).status, 404);
    assert.equal((await estraneo.get(`/preventivi/${id}/pdf`)).status, 404);
  });

  it('edits only the open version and only while not accepted; states and deletion', async () => {
    const azienda = await makeAzienda('Preventivi Stati');
    await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
    const { browser } = await signedIn('ADMIN', azienda.id);
    const id = await crea(browser, { ...RIGHE, azienda: azienda.id });
    const vecchia = await base(browser, id);
    const ok = await browser.submit(`/preventivi/${id}/modifica`, `/preventivi/${id}`, {
      ...RIGHE,
      oggetto: 'Oggetto nuovo',
      base: vecchia,
    });
    assert.equal(ok.status, 303);
    const stale = await browser.submit(`/preventivi/${id}/modifica`, `/preventivi/${id}`, {
      ...RIGHE,
      oggetto: 'Oggetto vecchio',
      base: vecchia,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Oggetto vecchio/);

    const stato = (a: string) =>
      browser.submit(`/preventivi/${id}`, `/preventivi/${id}/stato`, { stato: a });
    await stato('ACCETTATO');
    assert.equal((await prisma.preventivo.findUniqueOrThrow({ where: { id } })).stato, 'BOZZA');
    await stato('INVIATO');
    await stato('ACCETTATO');
    assert.equal((await prisma.preventivo.findUniqueOrThrow({ where: { id } })).stato, 'ACCETTATO');
    assert.equal((await browser.get(`/preventivi/${id}/modifica`)).status, 303);
    const csrf = await browser.csrf(`/preventivi/${id}`);
    const locked = await browser.post(`/preventivi/${id}`, {
      _csrf: csrf,
      ...RIGHE,
      oggetto: 'X',
      base: '',
    });
    assert.equal(locked.status, 409);
    assert.equal(
      (await prisma.preventivo.findUniqueOrThrow({ where: { id } })).oggetto,
      'Oggetto nuovo',
    );
    // Not a draft: not deleted.
    await browser.submit(`/preventivi/${id}`, `/preventivi/${id}/elimina`, {});
    assert.equal(await prisma.preventivo.count({ where: { id } }), 1);
    await stato('INVIATO');

    const bozza = await crea(browser, { ...RIGHE, azienda: azienda.id });
    const del = await browser.submit(`/preventivi/${bozza}`, `/preventivi/${bozza}/elimina`, {});
    assert.equal(del.status, 303);
    assert.equal(await prisma.preventivo.count({ where: { id: bozza } }), 0);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'PREVENTIVO_DELETE', targetId: bozza } }),
      1,
    );
    // „Duplica“ — a new number, today, the same lines.
    const copia = await browser.get(`/preventivi/nuovo?da=${id}`);
    assert.match(copia.body, /Quadro di manovra VVVF/);
  });
});
