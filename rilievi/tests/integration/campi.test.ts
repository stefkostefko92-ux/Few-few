import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

/** The fields of the second brief, as the browser sends them (three stops, two of them measured). */
const SECOND = {
  data: '2026-10-12',
  matricola: '0045120',
  indirizzo: 'Via Torino 5, Milano',
  buonoLavoro: 'BL 2026/512',
  fermate: '3',
  tipoPorte: ['SEMIAUTOMATICHE', 'MANUALI'],
  operatoreMarca: 'Selcom',
  lucePorte: '800 x 2000',
  operatoreTensione: '24 V DC',
  doppioAccesso: 'no',
  bloccaPortine: 'si',
  autolivellamento: 'no',
  pattinoRetrattile: 'si',
  pattinoRetrattileNumero: '2',
  serrature: 'si',
  serratureNumero: '3',
  serratureTipo: 'A gancio',
  luceVanoSostituire: 'si',
  telesoccorso: 'si',
  telesoccorsoStato: 'MANCA_PERIFERICA',
  allarmePortineria: 'si',
  displayPortineria: 'no',
  noteBottoniere: 'Placche in ottone',
  bottoniereMisure: 'si',
  'mb-1-piano': 'T',
  'mb-1-lunghezzaMm': '320,5',
  'mb-1-larghezzaMm': '105',
  'mb-1-interasseSuperiore': '60 mm',
  'mb-1-interasseInferiore': '58 mm',
  'mb-1-display': 'si',
  'mb-2-piano': '2',
  'mb-3-piano': '3',
  'mb-3-lunghezzaMm': '300',
  'mb-3-display': 'no',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

async function edit(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const page = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(page.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, { ...form, base });
}

const rowsOf = (schedaId: string) =>
  prisma.misuraBottoniera.findMany({ where: { schedaId }, orderBy: { fermata: 'asc' } });

describe('the second brief', () => {
  it('saves the door, alarm and work-order fields and one row per measured stop', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.buonoLavoro, 'BL 2026/512');
    assert.equal(row.operatoreMarca, 'Selcom');
    assert.equal(row.lucePorte, '800 x 2000');
    assert.equal(row.doppioAccesso, false);
    assert.equal(row.bloccaPortine, true);
    assert.equal(row.pattinoRetrattileNumero, 2);
    assert.equal(row.luceVanoSostituire, true);
    assert.equal(row.telesoccorsoStato, 'MANCA_PERIFERICA');
    assert.equal(row.displayPortineria, false);
    assert.equal(row.bottoniereMisure, true);
    assert.match(row.searchText, /bl 2026 512/);
    const rows = await rowsOf(id);
    assert.deepEqual(
      rows.map((r) => [r.fermata, r.piano, r.lunghezzaMm?.toString() ?? null, r.display]),
      [
        [1, 'T', '320.5', true],
        [3, null, '300', false],
      ],
      'stop 2 has nothing but its own number: not stored',
    );
    const found = await browser.get('/schede?q=BL%202026%2F512');
    assert.match(found.body, new RegExp(`/schede/${id}`), 'found by the work order');
  });

  it('opens the edit form with a row per stop and a template for more stops', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    const page = await browser.get(`/schede/${id}/modifica`);
    for (const n of [1, 2, 3]) assert.match(page.body, new RegExp(`data-misura="${n}"`));
    assert.doesNotMatch(page.body, /data-misura="4"/);
    assert.match(page.body, /name="mb-1-lunghezzaMm"[^>]*value="320,5"/);
    assert.match(page.body, /name="mb-2-piano"[^>]*value="2"/);
    assert.match(page.body, /<template data-misure-template>[\s\S]*name="mb-__N__-piano"/);
    assert.match(page.body, /Vuoi inserire le misure delle bottoniere vecchie\?/);
    assert.match(page.body, /value="MANCA_PERIFERICA" data-clearable checked/);
  });

  it('rewrites the rows on save: fewer stops drop the rows above, "No" drops them all', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    const fewer = await edit(browser, id, { ...SECOND, fermate: '2' });
    assert.equal(fewer.status, 303);
    assert.deepEqual(
      (await rowsOf(id)).map((r) => r.fermata),
      [1],
    );
    const off = await edit(browser, id, { ...SECOND, bottoniereMisure: 'no' });
    assert.equal(off.status, 303);
    assert.equal((await rowsOf(id)).length, 0);
    // The door details follow the door type: automatic only → nothing of the manual doors stays.
    const auto = await edit(browser, id, { ...SECOND, tipoPorte: ['AUTOMATICHE'] });
    assert.equal(auto.status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.operatoreMarca, 'Selcom');
    assert.equal(row.bloccaPortine, null);
    assert.equal(row.pattinoRetrattile, null);
    assert.equal(row.pattinoRetrattileNumero, null);
  });

  it('brings a wrong cell back next to it, with what was typed, and saves nothing', async () => {
    const { browser } = await signedIn('TECNICO');
    const before = await prisma.misuraBottoniera.count();
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SECOND,
      'mb-2-lunghezzaMm': 'abc',
    });
    assert.equal(reply.status, 422);
    assert.match(
      reply.body,
      /href="#f-mb-2-lunghezzaMm">Lunghezza, fermata 2: Inserisci un numero/,
    );
    assert.match(reply.body, /id="err-mb-2-lunghezzaMm"/);
    assert.match(reply.body, /name="mb-2-lunghezzaMm"[^>]*value="abc"/);
    assert.match(reply.body, /name="mb-1-piano"[^>]*value="T"/);
    assert.equal(await prisma.misuraBottoniera.count(), before);
  });

  it('prints the locks and the skates to change, the alarm and the measurements table; the PDF carries them too', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /Serrature o sospensioni da cambiare/);
    assert.match(print.body, /Pattino retrattile da cambiare/);
    assert.match(print.body, /Allarme e telesoccorso/);
    assert.match(
      print.body,
      /class="opt opt--on"><span class="opt__box" aria-hidden="true"><\/span>Manca periferica/,
    );
    assert.match(print.body, /<table class="ptable">/);
    assert.match(
      print.body,
      /<th scope="row" data-label="Fermata">1<\/th><td data-label="Piano">T<\/td><td data-label="Lunghezza \(mm\)">320,5<\/td>/,
    );
    const show = await browser.get(`/schede/${id}`);
    assert.match(show.body, /<table class="mtable">/);
    assert.match(show.body, /Buono di lavoro di riferimento/);
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
  });

  it('removes the rows together with the sheet when it is purged from the bin', async () => {
    const { browser: tech } = await signedIn('TECNICO');
    const id = await create(tech, SECOND);
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal(
      (await admin.submit(`/schede/${id}/elimina`, `/schede/${id}/elimina`, {})).status,
      303,
    );
    assert.equal(
      (await admin.submit(`/cestino/${id}/elimina`, `/cestino/${id}/elimina`, {})).status,
      303,
    );
    assert.equal((await rowsOf(id)).length, 0);
  });
});
