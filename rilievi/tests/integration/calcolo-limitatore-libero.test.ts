// The overspeed governor calculation page against the real app (the owner, 5 November 2026 — "tab calcolo
// limitatore" from the workbook Limitatore_velocita_EN81-20-2020.xlsx, following the machine calculation):
// the menu page with the search (a plate number straight to the calculation of the scheda, a hydraulic
// lift listed but not linked) and a calculation without a scheda with its own address, read-only for
// CLIENTE, deleted for good by who deletes schede, never another company's.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;
const unico = () => `${Date.now().toString().slice(-6)}${++counter}`;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `77${unico()}`;
  const indirizzo = (extra.indirizzo as string | undefined) ?? 'Via Roma 1, 20121 Milano (MI)';
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-11-05'),
      matricola,
      numeroImpianto: `8${counter}`,
      indirizzo,
      tipoImpianto: ['ELETTRICO'],
      searchText: `${matricola} ${indirizzo.toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`,
      ...extra,
    },
  });
}

// The example of the sheet "Limitatore", as the form sends it.
const FORM: Record<string, string> = { vn: '1,6', tipo: 'progressivo', norma: 'en81-20-2020' };

const pagina = (id: string) => `/schede/${id}/calcolo-limitatore`;

const nuovo = (browser: Browser, fields: Record<string, string>) =>
  browser.submit('/calcolo-limitatore/nuovo', '/calcolo-limitatore', {
    base: '',
    ...FORM,
    ...fields,
  });
const idDa = (location: string | null) =>
  /^\/calcolo-limitatore\/([a-z0-9]+)#risultati$/.exec(location ?? '')?.[1];

describe('the governor calculation page and the calculation without a scheda', () => {
  it('is in the menu; a plate number leads straight to the calculation of the scheda', async () => {
    const azienda = await makeAzienda();
    const via = `Via Limitatore${unico()}`;
    const scheda = await makeScheda(azienda.id, { indirizzo: `${via} 1, Milano` });
    const idraulica = await makeScheda(azienda.id, {
      indirizzo: `${via} 3, Milano`,
      tipoImpianto: ['IDRAULICO'],
    });
    const { browser } = await signedIn('TECNICO', azienda.id);
    const page = await browser.get('/calcolo-limitatore');
    assert.equal(page.status, 200);
    assert.match(page.body, /href="\/calcolo-limitatore" aria-current="page"/);
    assert.match(page.body, /Nessun calcolo salvato/);
    const found = await browser.get(`/calcolo-limitatore?q=${scheda.matricola}`);
    assert.equal(found.status, 303);
    assert.equal(found.location, pagina(scheda.id));
    const strada = (await browser.get(`/calcolo-limitatore?q=${encodeURIComponent(via)}`)).body;
    assert.match(strada, new RegExp(`href="${pagina(scheda.id)}"`));
    assert.ok(strada.includes(idraulica.matricola!), 'the hydraulic lift is listed');
    assert.ok(!strada.includes(pagina(idraulica.id)), 'but not linked');
    assert.match(strada, /Impianto idraulico: fuori dall&#39;ambito del calcolo/);
    // The machine calculation page still links its own calculation.
    assert.match(
      (await browser.get(`/calcolo-argano?q=${encodeURIComponent(via)}`)).body,
      new RegExp(`href="/schede/${scheda.id}/calcolo-argano"`),
    );
    const altrove = (await browser.get('/calcolo-limitatore?q=0099887')).body;
    assert.match(altrove, /href="\/calcolo-limitatore\/nuovo\?da=0099887"/);
  });

  it('is saved with its address, found, drawn, read-only for CLIENTE, deleted by who deletes', async () => {
    const azienda = await makeAzienda();
    const tecnico = await signedIn('TECNICO', azienda.id);
    const matricola = `0${unico()}`;
    const saved = await nuovo(tecnico.browser, {
      indirizzo: ' Via Dante 2, 20121 Milano (MI) ',
      matricola,
      numeroImpianto: '9',
    });
    assert.equal(saved.status, 303);
    const id = idDa(saved.location);
    assert.ok(id, saved.location ?? '');
    const row = await prisma.calcoloLimitatore.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, null);
    assert.equal(row.indirizzo, 'Via Dante 2, 20121 Milano (MI)');
    assert.equal(row.matricola, matricola);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'LIMITATORE_CALCOLO', targetType: 'calcolo', targetId: id },
      }),
      1,
    );
    const p = `/calcolo-limitatore/${id}`;
    const page = (await tecnico.browser.get(p)).body;
    assert.match(page, /Via Dante 2, 20121 Milano \(MI\)/);
    assert.match(page, /data-esito="v1">da 1,84 a 2,15 m\/s</);
    assert.ok(!page.includes('danger-zone'), 'TECNICO does not delete');
    const pdf = await tecnico.browser.get(`${p}/pdf`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-disposition') ?? '', /calcolo-limitatore-9\.pdf/);
    assert.match(
      (await tecnico.browser.get(`/calcolo-limitatore?q=dante+${matricola}`)).body,
      new RegExp(`href="${p}"`),
    );
    assert.match((await tecnico.browser.get('/calcolo-limitatore')).body, /Senza scheda/);
    assert.equal((await tecnico.browser.submit(p, `${p}/elimina`, {})).status, 403);

    const cliente = await signedIn('CLIENTE', azienda.id);
    assert.match((await cliente.browser.get(p)).body, /Puoi vedere il calcolo ma non modificarlo/);
    assert.equal((await cliente.browser.get('/calcolo-limitatore/nuovo')).status, 403);

    const estraneo = await signedIn('ADMIN', (await makeAzienda()).id);
    assert.equal((await estraneo.browser.get(p)).status, 404);
    assert.equal((await estraneo.browser.get(`${p}/pdf`)).status, 404);

    const responsabile = await signedIn('RESPONSABILE', azienda.id);
    const via = await responsabile.browser.submit(p, `${p}/elimina`, {});
    assert.equal(via.status, 303);
    assert.equal(via.location, '/calcolo-limitatore');
    assert.equal(await prisma.calcoloLimitatore.count({ where: { id } }), 0);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'LIMITATORE_CALCOLO_DELETE', targetId: id } }),
      1,
    );
  });

  it('cannot be stored without an address (the database says no too)', async () => {
    const azienda = await makeAzienda();
    await assert.rejects(
      prisma.calcoloLimitatore.create({ data: { aziendaId: azienda.id, dati: {} } }),
      /CalcoloLimitatore_impianto_check/,
    );
  });
});
