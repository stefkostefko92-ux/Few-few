// The machine calculation page in the menu (the owner, 31 October 2026 — "cercare il numero di matricola
// o la via e precompilare il calcolo se ho già la scheda impianto", and a free calculation for a lift
// without a scheda): the search by plate number, number or street leads to the calculation of the
// scheda; without a scheda the calculation carries its own address, plate number and number, lives in a
// company, is read by whoever sees that company's schede, written by who writes them, deleted for good
// by who deletes them, and is never another company's.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, makeUser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;
const unico = () => `${Date.now().toString().slice(-6)}${++counter}`;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `66${unico()}`;
  const indirizzo = (extra.indirizzo as string | undefined) ?? 'Via Roma 1, 20121 Milano (MI)';
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-10-20'),
      matricola,
      numeroImpianto: `7${counter}`,
      indirizzo,
      tipoImpianto: ['ELETTRICO'],
      searchText: `${matricola} ${indirizzo.toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`,
      ...extra,
    },
  });
}

// The first case of tests/argano-rt.json, as the form sends it.
const FORM: Record<string, string> = {
  portata: '480',
  massaCabina: '600',
  massaContrappeso: '840',
  velocita: '1',
  corsa: '20',
  sospensione: '1:1',
  macchina: 'alto',
  azionamento: '2V',
  giriMotore: '1400',
  rapportoA: '1',
  rapportoB: '50',
  diametroPuleggia: '500',
  gola: 'cuneo',
  angoloGola: '40',
  angoloAvvolgimento: '180',
  funiSostituzione: 'si',
  funiNumero: '4',
  fune: 'telcal-10-114',
  compensazione: 'nessuna',
};

const nuovo = (browser: Browser, fields: Record<string, string>) =>
  browser.submit('/calcolo-argano/nuovo', '/calcolo-argano', { base: '', ...FORM, ...fields });

const idDa = (location: string | null) =>
  /^\/calcolo-argano\/([a-z0-9]+)#risultati$/.exec(location ?? '')?.[1];

describe('the search of the machine calculation page', () => {
  it('is in the menu and leads a plate number straight to the calculation of the scheda', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const page = await browser.get('/calcolo-argano');
    assert.equal(page.status, 200);
    assert.match(page.body, /href="\/calcolo-argano" aria-current="page"/);
    assert.match(page.body, /Nessun calcolo salvato/);
    const found = await browser.get(`/calcolo-argano?q=${scheda.matricola}`);
    assert.equal(found.status, 303);
    assert.equal(found.location, `/schede/${scheda.id}/calcolo-argano`);
  });

  it('lists every scheda of a street, says which has a calculation, never links a hydraulic one', async () => {
    const azienda = await makeAzienda();
    const via = `Via Calcolo${unico()}`;
    const elettrica = await makeScheda(azienda.id, { indirizzo: `${via} 1, Milano` });
    const idraulica = await makeScheda(azienda.id, {
      indirizzo: `${via} 3, Milano`,
      tipoImpianto: ['IDRAULICO'],
    });
    const cestino = await makeScheda(azienda.id, {
      indirizzo: `${via} 5, Milano`,
      deletedAt: new Date(),
    });
    const { browser } = await signedIn('TECNICO', azienda.id);
    await browser.submit(
      `/schede/${elettrica.id}/calcolo-argano`,
      `/schede/${elettrica.id}/calcolo-argano`,
      { ...FORM, base: '' },
    );
    const page = await browser.get(`/calcolo-argano?q=${encodeURIComponent(via)}`);
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(`href="/schede/${elettrica.id}/calcolo-argano"`));
    assert.match(page.body, /Calcolo salvato il/);
    assert.ok(page.body.includes(idraulica.matricola!), 'the hydraulic lift is listed');
    assert.ok(!page.body.includes(`/schede/${idraulica.id}/calcolo-argano`), 'but not linked');
    assert.match(page.body, /Impianto idraulico: non ha argano/);
    assert.ok(!page.body.includes(cestino.matricola!), 'a scheda in the trash is not found');
    // The hydraulic one alone is not a shortcut either.
    const sola = await browser.get(`/calcolo-argano?q=${idraulica.matricola}`);
    assert.equal(sola.status, 200);
  });

  it('offers a free calculation for what it does not find, with the search written in', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const page = await browser.get('/calcolo-argano?q=0012345');
    assert.match(page.body, /Nessuna scheda e nessun calcolo trovati/);
    assert.match(page.body, /href="\/calcolo-argano\/nuovo\?da=0012345"/);
    const form = await browser.get('/calcolo-argano/nuovo?da=0012345');
    assert.match(form.body, /id="f-matricola"[^>]*value="0012345"/);
    const via = await browser.get('/calcolo-argano/nuovo?da=Via%20Dante%202');
    assert.match(via.body, /id="f-indirizzo"[^>]*value="Via Dante 2"/);
  });
});

describe('a calculation without a scheda', () => {
  it('is saved with its address, plate number and number, audited, found and drawn', async () => {
    const azienda = await makeAzienda();
    const { user, browser } = await signedIn('TECNICO', azienda.id);
    const matricola = `0${unico()}`;
    const saved = await nuovo(browser, {
      indirizzo: '  Via Dante 2, 20121 Milano (MI) ',
      matricola,
      numeroImpianto: '7',
    });
    assert.equal(saved.status, 303);
    const id = idDa(saved.location);
    assert.ok(id, saved.location ?? '');
    const row = await prisma.calcoloArgano.findUniqueOrThrow({ where: { id } });
    assert.equal(row.schedaId, null);
    assert.equal(row.aziendaId, azienda.id);
    assert.equal(row.indirizzo, 'Via Dante 2, 20121 Milano (MI)');
    assert.equal(row.matricola, matricola, 'the leading zero stays');
    assert.equal(row.updatedById, user.id);
    assert.match(row.searchText, new RegExp(`via dante 2 20121 milano mi ${matricola} 7`));
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ARGANO_CALCOLO', targetType: 'calcolo', targetId: id },
    });
    assert.equal(audit?.aziendaId, azienda.id);

    const page = (await browser.get(`/calcolo-argano/${id}`)).body;
    assert.match(page, /Via Dante 2, 20121 Milano \(MI\)/);
    assert.match(page, /id="f-matricola"[^>]*value="0/);
    assert.match(page, /0,733 m\/s/);
    assert.match(page, /Aderenza verificata nei due casi/);
    assert.ok(!/[А-яЁё]/.test(page), 'no Cyrillic in the page');

    const pdf = await browser.get(`/calcolo-argano/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-disposition') ?? '', /calcolo-argano-7\.pdf/);

    const search = (await browser.get(`/calcolo-argano?q=dante+${matricola}`)).body;
    assert.match(search, /Calcoli senza scheda/);
    assert.match(search, new RegExp(`href="/calcolo-argano/${id}"`));
    const list = (await browser.get('/calcolo-argano')).body;
    assert.match(list, /Senza scheda/);
  });

  it('shows every mistake of the address and of the data and saves nothing', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const prima = await prisma.calcoloArgano.count({ where: { aziendaId: azienda.id } });
    const reply = await nuovo(browser, {
      indirizzo: '   ',
      matricola: '12A',
      numeroImpianto: '1'.repeat(21),
      velocita: '12',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Correggi 4 campi/);
    assert.match(reply.body, /Indica l&#39;indirizzo dell&#39;impianto/);
    assert.match(reply.body, /Solo cifre, senza lettere o simboli/);
    assert.match(reply.body, /id="f-matricola"[^>]*value="12A"/);
    assert.equal(await prisma.calcoloArgano.count({ where: { aziendaId: azienda.id } }), prima);
  });

  it('asks the company when the person writes in more than one, and only among them', async () => {
    const a = await makeAzienda();
    const b = await makeAzienda();
    const c = await makeAzienda();
    const user = await makeUser('TECNICO', undefined, a.id);
    await prisma.membership.create({ data: { userId: user.id, aziendaId: b.id, role: 'TECNICO' } });
    const browser = new Browser();
    assert.equal((await browser.login(user.email)).status, 302);
    const form = (await browser.get('/calcolo-argano/nuovo')).body;
    assert.match(form, /id="f-azienda"/);
    const senza = await nuovo(browser, { indirizzo: 'Via Po 1' });
    assert.equal(senza.status, 422);
    assert.match(senza.body, /Azienda: /);
    assert.equal((await nuovo(browser, { indirizzo: 'Via Po 1', azienda: c.id })).status, 422);
    const ok = await nuovo(browser, { indirizzo: 'Via Po 1', azienda: b.id });
    assert.equal(ok.status, 303);
    const row = await prisma.calcoloArgano.findUniqueOrThrow({ where: { id: idDa(ok.location) } });
    assert.equal(row.aziendaId, b.id);
  });

  it('saves only on the open version and keeps what the person wrote on a conflict', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = idDa((await nuovo(browser, { indirizzo: 'Via Verdi 9' })).location)!;
    const pagina = `/calcolo-argano/${id}`;
    const base = /name="base" value="([^"]+)"/.exec((await browser.get(pagina)).body)![1]!;
    const primo = await browser.submit(pagina, pagina, {
      ...FORM,
      base,
      indirizzo: 'Via Verdi 9',
      portata: '630',
    });
    assert.equal(primo.status, 303);
    const stale = await browser.submit(pagina, pagina, {
      ...FORM,
      base,
      indirizzo: 'Via Verdi 11',
      portata: '320',
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Nel frattempo qualcuno ha salvato/);
    assert.match(stale.body, /id="f-portata"[^>]*value="320"/);
    assert.match(stale.body, /id="f-indirizzo"[^>]*value="Via Verdi 11"/);
    const row = await prisma.calcoloArgano.findUniqueOrThrow({ where: { id } });
    assert.equal(row.indirizzo, 'Via Verdi 9');
    assert.equal((row.dati as { portata: number }).portata, 630);
  });

  it('is read-only for CLIENTE, deleted only by who deletes schede, 404 for another company', async () => {
    const azienda = await makeAzienda();
    const tecnico = await signedIn('TECNICO', azienda.id);
    const id = idDa((await nuovo(tecnico.browser, { indirizzo: 'Via Manzoni 4' })).location)!;
    const pagina = `/calcolo-argano/${id}`;
    assert.ok(!(await tecnico.browser.get(pagina)).body.includes('danger-zone'));
    const negato = await tecnico.browser.submit(pagina, `${pagina}/elimina`, {});
    assert.equal(negato.status, 403, 'TECNICO does not delete');

    const cliente = await signedIn('CLIENTE', azienda.id);
    const read = (await cliente.browser.get(pagina)).body;
    assert.match(read, /Puoi vedere il calcolo ma non modificarlo/);
    assert.ok(!/Calcola e salva/.test(read));
    assert.equal((await cliente.browser.get(`${pagina}/pdf`)).status, 200);
    assert.ok(
      !(await cliente.browser.get('/calcolo-argano')).body.includes('/calcolo-argano/nuovo'),
    );
    assert.equal((await cliente.browser.get('/calcolo-argano/nuovo')).status, 403);
    const forged = await cliente.browser.submit(pagina, pagina, {
      ...FORM,
      base: '',
      indirizzo: 'Via Falsa 1',
    });
    assert.ok([403, 404].includes(forged.status), String(forged.status));

    const altra = await makeAzienda();
    const estraneo = await signedIn('ADMIN', altra.id);
    assert.equal((await estraneo.browser.get(pagina)).status, 404);
    assert.equal((await estraneo.browser.get(`${pagina}/pdf`)).status, 404);
    assert.equal(
      (await estraneo.browser.submit('/calcolo-argano/nuovo', `${pagina}/elimina`, {})).status,
      404,
    );
    assert.ok(!(await estraneo.browser.get('/calcolo-argano?q=manzoni')).body.includes(pagina));

    const responsabile = await signedIn('RESPONSABILE', azienda.id);
    assert.match((await responsabile.browser.get(pagina)).body, /danger-zone/);
    const via = await responsabile.browser.submit(pagina, `${pagina}/elimina`, {});
    assert.equal(via.status, 303);
    assert.equal(via.location, '/calcolo-argano');
    assert.equal(await prisma.calcoloArgano.count({ where: { id } }), 0);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'ARGANO_CALCOLO_DELETE', targetId: id } }),
      1,
    );
    assert.equal((await responsabile.browser.get(pagina)).status, 404);
  });

  it('cannot be stored without an address (the database says no too)', async () => {
    const azienda = await makeAzienda();
    await assert.rejects(
      prisma.calcoloArgano.create({ data: { aziendaId: azienda.id, dati: {} } }),
      /CalcoloArgano_impianto_check/,
    );
  });
});
