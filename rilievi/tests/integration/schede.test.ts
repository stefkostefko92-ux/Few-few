import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

/** A full sheet as the browser sends it (Italian decimal commas, ticked boxes repeated). */
const FULL = {
  data: '2026-10-12',
  indirizzo: 'Via Giuseppe Verdi 14, 20121 Milano',
  marca: 'Schindler',
  matricola: '0033871',
  numeroImpianto: '104552',
  portataKg: '630',
  capienzaPersone: '8',
  fermate: '6',
  ubicazioneMacchina: ['ALTO'],
  ubicazioneCassettina: '-1',
  parcheggio: 'Cortile interno',
  tipoImpianto: ['ELETTRICO'],
  tipoPorte: ['AUTOMATICHE', 'SEMIAUTOMATICHE'],
  serrature: 'si',
  serratureNumero: '6',
  serratureTipo: 'Elettromeccaniche',
  funiDiametroMm: '10,5',
  funiTrefoli: '8',
  funiNumero: '4',
  funiLunghezzaM: '42.75',
  limitatoreTipo: 'Montanari',
  funicellaDiametroMm: '6',
  funicellaLunghezzaM: '45',
  tenditore: 'A peso',
  caviNumero: '2',
  caviConduttori: '24',
  caviLunghezzaM: '30',
  noteQuadretto: 'Interruttore da sostituire',
  noteImpianto: 'Бележка на български: машинното е чисто. Città.',
  noteBottoniere: 'Pulsante usurato al piano 2',
  lavoriExtra: 'Buono n. 512',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  const id = /^\/schede\/([a-z0-9]+)$/.exec(reply.location)?.[1];
  assert.ok(id);
  return id;
}

const ids = (body: string) =>
  [...body.matchAll(/class="row-link" href="\/schede\/([a-z0-9]+)"/g)].map((m) => m[1]);

describe('sheets', () => {
  it('opens a new sheet with today as the date', async () => {
    const { browser } = await signedIn('TECNICO');
    const page = await browser.get('/schede/nuova');
    assert.equal(page.status, 200);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
    assert.match(page.body, new RegExp(`name="data" type="date"[^>]*value="${today}"`));
  });

  it('saves every field of the brief exactly, with the author and an audit entry', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const id = await create(browser, FULL);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.data.toISOString().slice(0, 10), '2026-10-12');
    assert.equal(row.matricola, '0033871');
    assert.equal(row.portataKg, 630);
    assert.equal(row.ubicazioneCassettina, -1);
    assert.deepEqual(row.tipoPorte, ['AUTOMATICHE', 'SEMIAUTOMATICHE']);
    assert.equal(row.serrature, true);
    assert.equal(row.serratureNumero, 6);
    assert.equal(row.funiDiametroMm?.toString(), '10.5');
    assert.equal(row.funiLunghezzaM?.toString(), '42.75');
    assert.equal(row.noteImpianto, FULL.noteImpianto);
    assert.equal(row.createdById, user.id);
    assert.match(row.searchText, /104552 0033871 via giuseppe verdi/);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'SCHEDA_CREATE', targetId: id } }),
      1,
    );
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, /10,5 mm/);
    assert.match(page.body, /8 persone/);
    assert.match(page.body, /Бележка на български/);
  });

  it('shows the errors next to the fields and saves nothing', async () => {
    const { browser } = await signedIn('TECNICO');
    const before = await prisma.scheda.count();
    const reply = await browser.submit('/schede/nuova', '/schede', {
      data: '2026-10-12',
      portataKg: '63O',
      funiDiametroMm: '6,555',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /id="error-summary"/);
    assert.match(reply.body, /id="err-portataKg"/);
    assert.match(reply.body, /value="63O"/, 'what was typed stays on screen');
    assert.match(reply.body, /Compila almeno indirizzo, matricola o n° impianto/);
    assert.equal(await prisma.scheda.count(), before);
  });

  it('finds sheets by number, matricola, address (without accents) and notes; exact numbers first', async () => {
    const { browser } = await signedIn('OPERATORE');
    const a = await create(browser, {
      data: '2026-01-10',
      numeroImpianto: '5521',
      indirizzo: 'Piazza Città 3, Torino',
    });
    const b = await create(browser, {
      data: '2026-05-10',
      numeroImpianto: '55210',
      matricola: '987',
      indirizzo: 'Corso Francia 1',
    });
    const c = await create(browser, {
      data: '2026-09-10',
      matricola: '445521',
      noteImpianto: 'Fune usurata vicino al tenditore',
    });
    const byNumber = await browser.get('/schede?q=5521');
    assert.deepEqual(ids(byNumber.body), [a, b, c], 'exact, then prefix, then the rest by date');
    assert.deepEqual(ids((await browser.get('/schede?q=CITTA%20torino')).body), [a]);
    assert.deepEqual(ids((await browser.get('/schede?q=fune%20usurata')).body), [c]);
    assert.deepEqual(
      ids((await browser.get('/schede?q=francia%20torino')).body),
      [],
      'all words must match',
    );
    assert.match((await browser.get('/schede?q=5521')).body, /<mark>5521<\/mark>/);
    const partial = await browser.get('/schede?q=987', { 'x-partial': '1' });
    assert.equal(partial.status, 200);
    assert.doesNotMatch(partial.body, /<html/);
    assert.match(partial.body, /data-status="1 scheda per «987»"/);
    const tricky = await browser.get('/schede?q=%25%27%22%3Cscript%3E');
    assert.equal(tricky.status, 200);
    assert.doesNotMatch(tricky.body, /<script>/);
  });

  it('never overwrites someone else’s save: a stale form gets a conflict and keeps its input', async () => {
    const { browser: first } = await signedIn('TECNICO');
    const { browser: second } = await signedIn('TECNICO');
    const id = await create(first, { data: '2026-10-12', matricola: '111' });
    const page = await first.get(`/schede/${id}/modifica`);
    const base = /name="base" value="([^"]+)"/.exec(page.body)![1]!;
    const _csrf1 = /name="_csrf" value="([^"]+)"/.exec(page.body)![1]!;
    const saved = await second.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      base: (await prisma.scheda.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString(),
      data: '2026-10-12',
      matricola: '222',
    });
    assert.equal(saved.status, 303);
    const stale = await first.post(`/schede/${id}`, {
      _csrf: _csrf1,
      base,
      data: '2026-10-12',
      matricola: '333',
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /value="333"/);
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id } })).matricola, '222');
    // The conflict page carries the new version: saving again after a look is a deliberate overwrite.
    const fresh = /name="base" value="([^"]+)"/.exec(stale.body)![1]!;
    const again = await first.post(`/schede/${id}`, {
      _csrf: _csrf1,
      base: fresh,
      data: '2026-10-12',
      matricola: '333',
    });
    assert.equal(again.status, 303);
    assert.equal((await prisma.scheda.findUniqueOrThrow({ where: { id } })).matricola, '333');
  });

  it('keeps clients read-only and technicians away from deleting', async () => {
    const { browser: tech } = await signedIn('TECNICO');
    const id = await create(tech, { data: '2026-10-12', matricola: '777' });
    const { browser: client } = await signedIn('CLIENTE');
    assert.equal((await client.get(`/schede/${id}`)).status, 200);
    assert.equal((await client.get('/schede/nuova')).status, 403);
    assert.equal((await client.get(`/schede/${id}/modifica`)).status, 403);
    const _csrf = await client.csrf('/account');
    assert.equal(
      (await client.post('/schede', { _csrf, data: '2026-10-12', matricola: '1' })).status,
      403,
    );
    assert.doesNotMatch((await client.get(`/schede/${id}`)).body, /\/modifica"/);
    assert.equal((await tech.get(`/schede/${id}/elimina`)).status, 403);
  });

  it('moves deleted sheets to a bin that only admins open, restore and empty', async () => {
    const { browser: manager } = await signedIn('RESPONSABILE');
    const id = await create(manager, { data: '2026-10-12', matricola: '424242' });
    const trashed = await manager.submit(`/schede/${id}/elimina`, `/schede/${id}/elimina`, {});
    assert.equal(trashed.status, 303);
    assert.deepEqual(ids((await manager.get('/schede?q=424242')).body), []);
    assert.equal((await manager.get(`/schede/${id}`)).status, 404);
    assert.equal((await manager.get('/cestino')).status, 403);
    const { browser: admin } = await signedIn('ADMIN');
    assert.match((await admin.get('/cestino')).body, new RegExp(`/schede/${id}`));
    assert.equal((await admin.get(`/schede/${id}`)).status, 200, 'admins can open a binned sheet');
    const restored = await admin.submit('/cestino', `/cestino/${id}/ripristina`, {});
    assert.equal(restored.status, 303);
    assert.deepEqual(ids((await manager.get('/schede?q=424242')).body), [id]);
    await manager.submit(`/schede/${id}/elimina`, `/schede/${id}/elimina`, {});
    const purged = await admin.submit(`/cestino/${id}/elimina`, `/cestino/${id}/elimina`, {});
    assert.equal(purged.status, 303);
    assert.equal(await prisma.scheda.count({ where: { id } }), 0);
    const actions = await prisma.auditLog.findMany({
      where: { targetId: id },
      orderBy: { at: 'asc' },
    });
    assert.deepEqual(
      actions.map((a) => a.action),
      ['SCHEDA_CREATE', 'SCHEDA_DELETE', 'SCHEDA_RESTORE', 'SCHEDA_DELETE', 'SCHEDA_PURGE'],
    );
  });

  it('prints and downloads the PDF of every field', async () => {
    const { browser } = await signedIn('CLIENTE');
    const { browser: tech } = await signedIn('TECNICO');
    const id = await create(tech, FULL);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.equal(print.status, 200);
    assert.match(
      print.body,
      /class="opt opt--on"><span class="opt__box" aria-hidden="true"><\/span>Elettrico/,
    );
    assert.match(print.body, /Lavori extra \(buono di lavoro\)/);
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(
      pdf.headers.get('content-disposition'),
      'attachment; filename="scheda-104552-2026-10-12.pdf"',
    );
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    const bg = await browser.get(`/schede/${id}/pdf?lang=bg`);
    assert.equal(bg.status, 303, 'the language switch redirects to the clean address first');
  });

  it('answers 404 for sheets that do not exist, whatever the id looks like', async () => {
    const { browser } = await signedIn('TECNICO');
    for (const path of [
      '/schede/nonexistent0000000000000',
      '/schede/..%2F..%2Fetc',
      '/schede/x/pdf',
    ]) {
      assert.equal((await browser.get(path)).status, 404, path);
    }
  });
});
