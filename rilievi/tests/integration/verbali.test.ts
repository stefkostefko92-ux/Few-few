// "Verbale di chiusura cantiere" against the real app (the owner, 5 November 2026): from the scheda of the
// lift (the button on the scheda, the search in the form) or without one; from the scheda only the address,
// the N° buono and today's date; the draft is written by people; signed like the intervention sheet by the
// technician and the supervisor on the final content; after both signatures two PDFs — the company copy
// and the installer copy — and only while the seal holds. Never a report or a scheda of another company.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { businessDay } from '../../src/time.js';
import { improntaLeggibile } from '../../src/interventi/sigillo.js';
import { improntaVerbale, sigilloVerbaleValido } from '../../src/verbali/sigillo.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import {
  create as creaIntervento,
  firma as firmaIntervento,
  firmeNuove,
  FORM as FORM_INTERVENTO,
  SEAL_KEY,
} from './interventi-helpers.js';

before(startApp);
after(stopApp);

let counter = 0;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `55${Date.now().toString().slice(-6)}${++counter}`;
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-10-12'),
      matricola,
      numeroImpianto: `7${counter}`,
      indirizzo: 'Via Monte Santo 8, 20124 Milano (MI)',
      buonoLavoro: `BL 2026/${counter}`,
      marca: 'Schindler',
      searchText: `${matricola} via monte santo 8 20124 milano mi`,
      ...extra,
    },
  });
}

const FORM = {
  data: '2026-11-05',
  indirizzo: 'Via Monte Santo 8',
  buono: 'BL 2026/118',
  't-quadro': 'Quadro nuovo installato',
  'c-quadro': 'si',
  'c-funi': 'no',
  't-varieLocale': 'Pulizia del locale.',
  't-imbotti': 'Verniciati',
  positivo: 'si',
};

async function crea(
  browser: Browser,
  form: Record<string, string> = FORM,
  page = '/verbali/nuovo',
) {
  const reply = await browser.submit(page, '/verbali', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

const baseOf = async (browser: Browser, id: string) =>
  /name="base" value="([^"]+)"/.exec((await browser.get(`/verbali/${id}/modifica`)).body)?.[1] ??
  '';

async function paginaFirma(browser: Browser, id: string) {
  const page = await browser.get(`/verbali/${id}/firma`);
  assert.equal(page.status, 200, `signing page: ${page.status}`);
  return {
    body: page.body,
    base: /name="base" value="([^"]+)"/.exec(page.body)![1]!,
    impronta: /name="impronta" value="([0-9a-f]{64})"/.exec(page.body)![1]!,
  };
}

/** Two fresh signatures (the technician and the supervisor) with their names. */
function firmeVerbale(): Record<string, string> {
  const f = firmeNuove();
  return {
    firmaTecnico: f.firmaTecnico!,
    firmaTecnicoNome: 'Mario Rossi',
    firmaSupervisore: f.firmaCliente!,
    firmaSupervisoreNome: 'Anna Bianchi',
  };
}

async function firma(browser: Browser, id: string, fields = firmeVerbale()) {
  const vista = await paginaFirma(browser, id);
  return browser.submit(`/verbali/${id}/firma`, `/verbali/${id}/conferma`, {
    base: vista.base,
    impronta: vista.impronta,
    ...fields,
  });
}

describe('a closing report from the scheda of the lift, or without one', () => {
  it('fills in only the address, the N° buono and the date of today from the scheda, and keeps the link', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const page = (await browser.get(`/schede/${scheda.id}`)).body;
    assert.match(page, new RegExp(`href="/verbali/nuovo\\?scheda=${scheda.id}"`));

    const form = (await browser.get(`/verbali/nuovo?scheda=${scheda.id}`)).body;
    assert.match(form, new RegExp(`name="scheda" value="${scheda.id}"`));
    assert.match(form, /id="f-indirizzo"[^>]*value="Via Monte Santo 8, 20124 Milano \(MI\)"/);
    assert.match(
      form,
      new RegExp(`id="f-buono"[^>]*value="${scheda.buonoLavoro!.replace('/', '\\/')}"`),
    );
    assert.match(form, new RegExp(`id="f-data"[^>]*value="${businessDay()}"`));
    // Nothing else comes from the scheda: every row and every choice is empty.
    assert.doesNotMatch(form, /name="t-[a-zA-Z]+" type="text"[^>]*value="[^"]+"/);
    assert.doesNotMatch(form, /<textarea[^>]*name="t-[^"]+"[^>]*>[^<]+<\/textarea>/);
    assert.doesNotMatch(form, /type="radio"[^>]* checked/);

    const id = await crea(
      browser,
      { ...FORM, scheda: scheda.id },
      `/verbali/nuovo?scheda=${scheda.id}`,
    );
    const row = await prisma.verbale.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, scheda.id);
    assert.equal(row.aziendaId, azienda.id);
    assert.deepEqual(row.voci, {
      quadro: { t: 'Quadro nuovo installato', c: 'si' },
      funi: { c: 'no' },
      varieLocale: { t: 'Pulizia del locale.' },
      imbotti: { t: 'Verniciati' },
    });
    assert.equal(row.positivo, true);
    assert.equal(row.confermatoAt, null);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: id, action: 'VERBALE_CREATE' },
    });
    assert.equal(audit.targetType, 'verbale');
    // Listed on the scheda and in the list; the report links back to the scheda.
    assert.match(
      (await browser.get(`/schede/${scheda.id}`)).body,
      new RegExp(`href="/verbali/${id}"`),
    );
    assert.match((await browser.get('/verbali')).body, new RegExp(`href="/verbali/${id}"`));
    const show = await browser.get(`/verbali/${id}`);
    assert.match(show.body, new RegExp(`href="/schede/${scheda.id}"`));
    assert.match(show.body, /Quadro nuovo installato/);
    assert.match(show.body, /Verbale di chiusura cantiere/);
  });

  it('finds the scheda from the form and opens it filled when there is one match', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const one = await browser.get(`/verbali/nuovo?cerca=${encodeURIComponent(scheda.matricola!)}`);
    assert.equal(one.status, 303);
    assert.equal(one.location, `/verbali/nuovo?scheda=${scheda.id}`);
    const none = await browser.get('/verbali/nuovo?cerca=nessunasimile');
    assert.match(none.body, /Nessuna scheda trovata: compila il verbale a mano/);
  });

  it('is written without a scheda too: an empty form with the date of today', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const form = (await browser.get('/verbali/nuovo')).body;
    assert.match(form, new RegExp(`id="f-data"[^>]*value="${businessDay()}"`));
    assert.match(form, /id="f-indirizzo"[^>]*value=""/);
    assert.match(form, /action="\/verbali\/nuovo" role="search"/);
    const id = await crea(browser, { ...FORM, indirizzo: 'Via Senza Scheda 1' });
    const row = await prisma.verbale.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, null);
    assert.equal(row.indirizzo, 'Via Senza Scheda 1');
    // Too long a text: 422 with what was written, nothing saved.
    const before = await prisma.verbale.count({ where: { aziendaId: azienda.id } });
    const bad = await browser.submit('/verbali/nuovo', '/verbali', {
      ...FORM,
      't-cavi': 'x'.repeat(301),
      'c-cavi': 'si',
    });
    assert.equal(bad.status, 422);
    assert.match(bad.body, /Cavi — Vano corsa/);
    assert.match(bad.body, /Certificato: Cavi/);
    assert.equal(await prisma.verbale.count({ where: { aziendaId: azienda.id } }), before);
  });

  it('never takes a scheda of another company or in the trash, and never shows another company', async () => {
    const azienda = await makeAzienda();
    const altra = await makeAzienda();
    const estranea = await makeScheda(altra.id);
    const cestinata = await makeScheda(azienda.id, { deletedAt: new Date() });
    const { browser } = await signedIn('TECNICO', azienda.id);
    for (const id of [estranea.id, cestinata.id]) {
      const page = await browser.get(`/verbali/nuovo?scheda=${id}`);
      assert.equal(page.status, 303);
      assert.equal(page.location, '/verbali/nuovo');
      const forged = await browser.submit('/verbali/nuovo', '/verbali', { ...FORM, scheda: id });
      assert.equal(forged.status, 422);
      assert.match(forged.body, /La scheda scelta non è più disponibile/);
    }
    assert.equal(
      await prisma.verbale.count({ where: { schedaId: { in: [estranea.id, cestinata.id] } } }),
      0,
    );
    // A report of another company: 404 everywhere.
    const { browser: other } = await signedIn('TECNICO', altra.id);
    const suo = await crea(other);
    for (const path of [
      `/verbali/${suo}`,
      `/verbali/${suo}/modifica`,
      `/verbali/${suo}/firma`,
      `/verbali/${suo}/pdf/azienda`,
    ])
      assert.equal((await browser.get(path)).status, 404, path);
    assert.doesNotMatch((await browser.get('/verbali')).body, new RegExp(suo));
  });

  it('lets the customer read but not write', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser);
    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    const show = await cliente.get(`/verbali/${id}`);
    assert.equal(show.status, 200);
    assert.doesNotMatch(show.body, new RegExp(`href="/verbali/${id}/(modifica|firma)"`));
    assert.doesNotMatch((await cliente.get('/verbali')).body, /href="\/verbali\/nuovo"/);
    assert.equal((await cliente.get('/verbali/nuovo')).status, 403);
    assert.equal((await cliente.get(`/verbali/${id}/modifica`)).status, 403);
  });

  it('saves the draft only over the version that was opened', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser);
    const base = await baseOf(browser, id);
    const saved = await browser.submit(`/verbali/${id}/modifica`, `/verbali/${id}`, {
      ...FORM,
      't-cavi': 'Cavi nuovi',
      base,
    });
    assert.equal(saved.status, 303);
    assert.equal(
      ((await prisma.verbale.findUniqueOrThrow({ where: { id } })).voci as Record<string, unknown>)
        .cavi !== undefined,
      true,
    );
    const stale = await browser.submit(`/verbali/${id}/modifica`, `/verbali/${id}`, {
      ...FORM,
      't-cavi': 'Vecchio',
      base,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /modificato da qualcun altro/);
    assert.match(stale.body, /value="Vecchio"/, 'what was written stays in the form');
  });
});

describe('signing the closing report and its two PDFs', () => {
  it('asks "Verbale positivo" before signing', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, { ...FORM, positivo: '' });
    const page = await browser.get(`/verbali/${id}/firma`);
    assert.equal(page.status, 303);
    assert.equal(page.location, `/verbali/${id}/modifica`);
    const show = await browser.get(`/verbali/${id}`);
    assert.match(show.body, /Prima di firmare indica se il verbale è positivo/);
  });

  it('signs exactly the content shown, seals it, and then gives the company copy and the installer copy', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser);
    // A draft has no PDF and never holds a signature (CHECK "Verbale_firme_check").
    for (const copia of ['azienda', 'installatore'])
      assert.equal((await browser.get(`/verbali/${id}/pdf/${copia}`)).status, 404);
    await assert.rejects(
      prisma.verbale.update({ where: { id }, data: { firmaSupervisoreNome: 'Anna' } }),
    );

    const vista = await paginaFirma(browser, id);
    const row = await prisma.verbale.findUniqueOrThrow({ where: { id } });
    assert.equal(vista.impronta, improntaVerbale(row));
    assert.match(vista.body, new RegExp(improntaLeggibile(vista.impronta)));
    assert.match(vista.body, /Firma tecnico esecutore/);
    assert.match(vista.body, /Firma supervisore/);
    assert.match(vista.body, /data-firma-canvas/);

    const empty = await browser.submit(`/verbali/${id}/firma`, `/verbali/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
    });
    assert.equal(empty.status, 422);
    assert.match(empty.body, /Manca la firma nel riquadro/);
    const f = firmeVerbale();
    const same = await browser.submit(`/verbali/${id}/firma`, `/verbali/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
      ...f,
      firmaSupervisore: f.firmaTecnico!,
    });
    assert.equal(same.status, 422);
    assert.match(same.body, /il supervisore deve firmare nel proprio riquadro/);

    // Changed after the page was opened: the signatures were for the old content.
    const colleague = (await signedIn('OPERATORE', azienda.id)).browser;
    await colleague.submit(`/verbali/${id}/modifica`, `/verbali/${id}`, {
      ...FORM,
      buono: 'BL 999',
      base: await baseOf(colleague, id),
    });
    const stale = await browser.submit(`/verbali/${id}/firma`, `/verbali/${id}/conferma`, {
      base: vista.base,
      impronta: vista.impronta,
      ...f,
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /BL 999/);
    assert.match(stale.body, /name="firmaTecnico" value=""/);
    assert.equal((await prisma.verbale.findUniqueOrThrow({ where: { id } })).confermatoAt, null);

    const done = await firma(browser, id);
    assert.equal(done.status, 303);
    const sealed = await prisma.verbale.findUniqueOrThrow({ where: { id } });
    assert.ok(sealed.confermatoAt);
    assert.equal(sealed.buono, 'BL 999');
    assert.equal(sealed.impronta, improntaVerbale(sealed));
    assert.equal(sigilloVerbaleValido(SEAL_KEY(), sealed), true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: id, action: 'VERBALE_CONFIRM' },
    });
    assert.deepEqual(audit.meta, { impronta: sealed.impronta });

    const show = await browser.get(`/verbali/${id}`);
    assert.match(show.body, /Sigillo verificato/);
    assert.doesNotMatch(show.body, new RegExp(`href="/verbali/${id}/modifica"`));
    for (const copia of ['azienda', 'installatore']) {
      assert.match(show.body, new RegExp(`href="/verbali/${id}/pdf/${copia}"`));
      const pdf = await browser.get(`/verbali/${id}/pdf/${copia}`);
      assert.equal(pdf.status, 200, copia);
      assert.equal(pdf.headers.get('content-type'), 'application/pdf');
      assert.match(
        pdf.headers.get('content-disposition') ?? '',
        new RegExp(`copia-${copia}\\.pdf"$`),
      );
      assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    }
    assert.equal((await browser.get(`/verbali/${id}/pdf/cliente`)).status, 404);
    // The customer of the company reads the signed report and downloads both copies.
    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    assert.equal((await cliente.get(`/verbali/${id}/pdf/installatore`)).status, 200);

    // Signed: closed for every path.
    assert.equal((await browser.get(`/verbali/${id}/firma`)).status, 303);
    const edit = await browser.submit('/verbali/nuovo', `/verbali/${id}`, {
      ...FORM,
      base: sealed.updatedAt.toISOString(),
    });
    assert.equal(edit.status, 303);
    assert.equal(
      (await prisma.verbale.findUniqueOrThrow({ where: { id } })).sigillo,
      sealed.sigillo,
    );
  });

  it('blocks both PDFs of a report changed after the signature, in the database', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    for (const tamper of [
      Prisma.sql`"buono" = 'BL Falso'`,
      Prisma.sql`"positivo" = false`,
      Prisma.sql`"voci" = '{}'::jsonb`,
      Prisma.sql`"firmaSupervisoreNome" = 'Altra Persona'`,
    ]) {
      const id = await crea(browser);
      assert.equal((await firma(browser, id)).status, 303);
      assert.equal((await browser.get(`/verbali/${id}/pdf/azienda`)).status, 200);
      await prisma.$executeRaw`UPDATE "Verbale" SET ${tamper} WHERE "id" = ${id}`;
      const page = await browser.get(`/verbali/${id}`);
      assert.match(page.body, /Il sigillo non corrisponde al contenuto firmato/);
      for (const copia of ['azienda', 'installatore']) {
        assert.doesNotMatch(page.body, new RegExp(`href="/verbali/${id}/pdf/${copia}"`));
        assert.equal((await browser.get(`/verbali/${id}/pdf/${copia}`)).status, 303, copia);
      }
    }
  });

  it('keeps its seal when the scheda it came from is deleted for good', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(
      browser,
      { ...FORM, scheda: scheda.id },
      `/verbali/nuovo?scheda=${scheda.id}`,
    );
    assert.equal((await firma(browser, id)).status, 303);
    await prisma.scheda.delete({ where: { id: scheda.id } });
    const row = await prisma.verbale.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, null);
    assert.equal((await browser.get(`/verbali/${id}/pdf/azienda`)).status, 200);
  });

  it('refuses strokes already on an intervention sheet or on another report', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    // The strokes of a confirmed intervention sheet, copied into the supervisor's pad.
    const intervento = await creaIntervento(browser, FORM_INTERVENTO);
    const suIntervento = firmeNuove();
    assert.equal((await firmaIntervento(browser, intervento, suIntervento)).status, 303);
    const id = await crea(browser);
    const replay = await firma(browser, id, {
      ...firmeVerbale(),
      firmaSupervisore: suIntervento.firmaCliente!,
    });
    assert.equal(replay.status, 422);
    assert.match(replay.body, /Questa firma è già presente su un altro documento/);
    assert.match(replay.body, /name="firmaSupervisore" value=""/);
    // The strokes of a confirmed report on an intervention sheet: refused too.
    const mie = firmeVerbale();
    assert.equal((await firma(browser, id, mie)).status, 303);
    const altro = await creaIntervento(browser, FORM_INTERVENTO);
    const back = await firmaIntervento(browser, altro, {
      ...firmeNuove(),
      firmaTecnico: mie.firmaTecnico!,
    });
    assert.equal(back.status, 422);
    assert.equal(
      (await prisma.intervento.findUniqueOrThrow({ where: { id: altro } })).confermatoAt,
      null,
    );
  });
});
