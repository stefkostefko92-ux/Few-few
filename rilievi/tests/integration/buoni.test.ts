// "Buono di lavoro" (the owner, 12 November 2026): a new document from a scheda or free, with the general
// data, the work sequences, the six checks, the report and the bottom signatures. Every signature is optional
// and bound to what it signs: a signed row does not change silently ("Togli la firma" first), a bottom
// signature closes the whole sheet until it is removed, a signature already on any document of the portal is
// refused as copied. PDF/A, email, the company's code and clause, export and deletion with the company.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { assertPdfA2b } from '../pdfa.js';
import { Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const FIRMA_A = JSON.stringify({ s: [[10, 150, 120, 40, 260, 160, 380, 70]] });
const FIRMA_B = JSON.stringify({ s: [[30, 120, 200, 60, 420, 150, 520, 40]] });
const FIRMA_C = JSON.stringify({ s: [[50, 100, 150, 180, 300, 30, 560, 110]] });
const FIRMA_D = JSON.stringify({ s: [[70, 60, 170, 160, 320, 20, 540, 180]] });

const SCHEDA = {
  data: '2026-11-02',
  numeroImpianto: '770011',
  matricola: 'MI 4455',
  indirizzo: 'Via Verdi 9, Milano',
  buonoLavoro: 'BL-118',
  fermate: '4',
  tipoImpianto: ['ELETTRICO'],
  quadroSostituire: 'si',
};

async function nuovaScheda(browser: Browser) {
  const reply = await browser.submit('/schede/nuova', '/schede', SCHEDA);
  assert.equal(reply.status, 303, `scheda: ${reply.status}`);
  return reply.location.split('/').pop()!;
}

async function crea(browser: Browser, form: Record<string, string | string[]>) {
  const reply = await browser.submit('/buoni/nuovo', '/buoni', form);
  assert.equal(
    reply.status,
    303,
    `create failed with ${reply.status}: ${reply.body.slice(0, 300)}`,
  );
  return reply.location.split('/').pop()!;
}

async function modifica(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const page = await browser.get(`/buoni/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
  return browser.submit(`/buoni/${id}/modifica`, `/buoni/${id}`, { ...form, base });
}

async function finali(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const page = await browser.get(`/buoni/${id}`);
  const base = /name="base" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
  return browser.submit(`/buoni/${id}`, `/buoni/${id}/firme`, { ...form, base });
}

describe('buono di lavoro', () => {
  it('is filled from the scheda, signed on a row, listed, found and shown', async () => {
    const azienda = await makeAzienda('Buoni Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const schedaId = await nuovaScheda(browser);

    const form = await browser.get(`/buoni/nuovo?scheda=${schedaId}`);
    assert.equal(form.status, 200);
    assert.match(form.body, /name="numero"[^>]*value="BL-118"/);
    assert.match(form.body, /name="matricola"[^>]*value="MI 4455"/);
    assert.match(form.body, /Sostituzione del quadro di manovra/);

    const id = await crea(browser, {
      scheda: schedaId,
      numero: 'BL-118',
      matricola: 'MI 4455',
      ubicazione: 'Via Verdi 9, Milano',
      pos: 'si',
      'seq-0-descrizione': 'Smontaggio quadro',
      'seq-0-esito': 'ok',
      'seq-0-data': '2026-11-16',
      'seq-0-firma': FIRMA_A,
      'seq-1-descrizione': 'Montaggio quadro nuovo',
      'ctl-limitatore-esito': 'ok',
    });
    const row = await prisma.buonoLavoro.findUniqueOrThrow({
      where: { id },
      include: { firme: true },
    });
    assert.equal(row.schedaId, schedaId);
    assert.equal(row.aziendaId, azienda.id);
    assert.equal(row.firme.length, 1);
    assert.match(row.firme[0]!.posto, /^s-[0-9a-f]{8}$/);
    assert.equal((row.sequenze as unknown[]).length, 2);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'BUONO_CREATE', targetId: id } }),
      1,
    );

    const show = await browser.get(`/buoni/${id}`);
    assert.equal(show.status, 200);
    assert.match(show.body, /Smontaggio quadro/);
    assert.match(show.body, /class="buono-firma-mini"/);
    assert.doesNotMatch(show.body, /firma non valida/);
    const list = await browser.get('/buoni?q=4455');
    assert.match(list.body, new RegExp(`/buoni/${id}`));
    assert.doesNotMatch(
      (await browser.get('/buoni?q=nessunrisultato')).body,
      new RegExp(`/buoni/${id}`),
    );
    assert.match((await browser.get(`/schede/${schedaId}`)).body, new RegExp(`/buoni/${id}`));

    const pdf = await browser.get(`/buoni/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    await assertPdfA2b(pdf.bytes);
  });

  it('a signed row changes only after "Togli la firma"', async () => {
    const azienda = await makeAzienda('Buoni Righe');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, {
      azienda: azienda.id,
      'seq-0-descrizione': 'Prova freno',
      'seq-0-esito': 'ok',
      'seq-0-firma': FIRMA_B,
    });
    const firma = await prisma.buonoFirma.findFirstOrThrow({ where: { buonoId: id } });
    const rowId = firma.posto.slice(2);

    // The form sends the signed row back as it is (hidden): saving it changes nothing of it.
    const page = await browser.get(`/buoni/${id}/modifica`);
    assert.match(page.body, /buono-riga--firmata/);
    assert.match(page.body, new RegExp(`name="togli" value="s-${rowId}"`));

    const changed = await modifica(browser, id, {
      'seq-0-id': rowId,
      'seq-0-descrizione': 'Prova freno (rifatta)',
      'seq-0-esito': 'ok',
    });
    assert.equal(changed.status, 422);
    assert.match(changed.body, /La riga è firmata/);
    assert.equal(await prisma.buonoFirma.count({ where: { buonoId: id } }), 1);

    const tolta = await modifica(browser, id, {
      'seq-0-id': rowId,
      'seq-0-descrizione': 'Prova freno',
      'seq-0-esito': 'ok',
      togli: `s-${rowId}`,
    });
    assert.equal(tolta.status, 303);
    assert.equal(tolta.location, `/buoni/${id}/modifica#riga-${rowId}`);
    assert.equal(await prisma.buonoFirma.count({ where: { buonoId: id } }), 0);

    const ok = await modifica(browser, id, {
      'seq-0-id': rowId,
      'seq-0-descrizione': 'Prova freno (rifatta)',
      'seq-0-esito': 'nonOk',
    });
    assert.equal(ok.status, 303);
    const row = await prisma.buonoLavoro.findUniqueOrThrow({ where: { id } });
    assert.equal((row.sequenze as Array<{ esito: string }>)[0]!.esito, 'nonOk');
  });

  it('the bottom signatures close the sheet until they are removed', async () => {
    const azienda = await makeAzienda('Buoni Finali');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, {
      azienda: azienda.id,
      tecnici: 'Bianchi',
      'seq-0-descrizione': 'Collaudo',
    });

    const firmata = await finali(browser, id, { 'fin-custode-firma': FIRMA_C });
    assert.equal(firmata.status, 303);
    const f = await prisma.buonoFirma.findFirstOrThrow({ where: { buonoId: id } });
    assert.equal(f.posto, 'f-custode');
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'BUONO_FIRME', targetId: id } }),
      1,
    );
    const show = await browser.get(`/buoni/${id}`);
    assert.match(show.body, /Il buono ha firme in fondo/);
    assert.doesNotMatch(show.body, new RegExp(`href="/buoni/${id}/modifica"`));

    const edit = await browser.get(`/buoni/${id}/modifica`);
    assert.equal(edit.status, 303);
    assert.equal(edit.location, `/buoni/${id}#firme`);

    // A form opened before the signature: the sheet is closed now.
    const stale = await browser.submit(`/buoni/${id}`, `/buoni/${id}`, {
      base: new Date().toISOString(),
      tecnici: 'Rossi',
    });
    assert.equal(stale.status, 303);
    assert.equal(
      (await prisma.buonoLavoro.findUniqueOrThrow({ where: { id } })).tecnici,
      'Bianchi',
    );

    // The bottom signatures from a page that is no longer current: sign again.
    const vecchia = await browser.submit(`/buoni/${id}`, `/buoni/${id}/firme`, {
      base: '2020-01-01T00:00:00.000Z',
      'fin-geometra-firma': FIRMA_D,
    });
    assert.equal(vecchia.status, 303);
    assert.equal(await prisma.buonoFirma.count({ where: { buonoId: id } }), 1);

    const via = await finali(browser, id, { togli: 'f-custode' });
    assert.equal(via.status, 303);
    assert.equal(await prisma.buonoFirma.count({ where: { buonoId: id } }), 0);
    assert.equal((await browser.get(`/buoni/${id}/modifica`)).status, 200);
  });

  it('refuses a signature copied from another document of the portal', async () => {
    const azienda = await makeAzienda('Buoni Copie');
    const { browser } = await signedIn('TECNICO', azienda.id);
    await crea(browser, { azienda: azienda.id, 'seq-0-descrizione': 'A', 'seq-0-firma': FIRMA_D });
    const copia = await browser.submit('/buoni/nuovo', '/buoni', {
      azienda: azienda.id,
      'seq-0-descrizione': 'B',
      'seq-0-firma': FIRMA_D,
    });
    assert.equal(copia.status, 422);
    assert.match(copia.body, /già su un altro documento/);
    const doppia = await browser.submit('/buoni/nuovo', '/buoni', {
      azienda: azienda.id,
      'seq-0-descrizione': 'B',
      'seq-0-firma': FIRMA_A.replace('10', '11'),
      'seq-1-descrizione': 'C',
      'seq-1-firma': FIRMA_A.replace('10', '11'),
    });
    assert.equal(doppia.status, 422);
    assert.match(doppia.body, /La stessa firma compare due volte/);
  });

  it('stays in its company; the client reads but does not write', async () => {
    const azienda = await makeAzienda('Buoni Isolati');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, { azienda: azienda.id, numero: 'ISO-1' });
    const { browser: altro } = await signedIn('TECNICO', (await makeAzienda('Buoni Altri')).id);
    for (const path of [`/buoni/${id}`, `/buoni/${id}/pdf`, `/buoni/${id}/modifica`])
      assert.equal((await altro.get(path)).status, 404, path);
    assert.doesNotMatch((await altro.get('/buoni')).body, /ISO-1/);
    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    assert.equal((await cliente.get(`/buoni/${id}`)).status, 200);
    assert.notEqual((await cliente.get(`/buoni/${id}/modifica`)).status, 200);
    assert.equal((await new Browser().get(`/buoni/${id}`)).status, 302);
  });

  it('is sent by email with its PDF, and deleted only without signatures', async () => {
    const azienda = await makeAzienda('Buoni Posta');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, {
      azienda: azienda.id,
      numero: 'MAIL-7',
      'seq-0-descrizione': 'X',
    });
    const sent = await browser.submit(`/buoni/${id}`, `/buoni/${id}/invia`, {
      email: 'cantiere-buoni@example.com',
    });
    assert.equal(sent.status, 303);
    const mail = outbox.find((m) => m.to === 'cantiere-buoni@example.com');
    assert.ok(mail, 'the email with the PDF');
    assert.match(mail.subject, /MAIL-7/);

    await finali(browser, id, { 'fin-capoOfficina-firma': FIRMA_B.replace('30', '31') });
    const rifiuto = await browser.submit(`/buoni/${id}`, `/buoni/${id}/elimina`, {});
    assert.equal(rifiuto.status, 303);
    assert.ok(await prisma.buonoLavoro.findUnique({ where: { id } }));
    await finali(browser, id, { togli: 'f-capoOfficina' });
    const via = await browser.submit(`/buoni/${id}`, `/buoni/${id}/elimina`, {});
    assert.equal(via.status, 303);
    assert.equal(via.location, '/buoni');
    assert.equal(await prisma.buonoLavoro.findUnique({ where: { id } }), null);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'BUONO_DELETE', targetId: id } }),
      1,
    );
  });
});
