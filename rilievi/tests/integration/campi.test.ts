import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

/**
 * The fields of the second brief and of the owner's October pass, as the browser sends them (three
 * stops, two of them measured; manual doors ask the locks and the cam — the suspensions sent with them
 * are read only when the doors become automatic).
 */
const SECOND = {
  data: '2026-10-12',
  matricola: '0045120',
  indirizzo: 'Via Torino 5, Milano',
  buonoLavoro: 'BL 2026/512',
  fermate: '3',
  tipoPorte: ['MANUALI'],
  doppioAccesso: 'no',
  quadroNote: 'Quadro nel sottoscala',
  arganoPreventivo: 'no',
  arganoTipo: 'A vite senza fine',
  contattiFreno: 'si',
  kitControlloGanasce: 'si',
  kitControlloGanasceTipo: 'Microinterruttori',
  quadroSostituire: 'no',
  controlloQuadro: 'no',
  arganoNote: 'Rumore sul cuscinetto',
  tirantiCabinaNumero: '4',
  tirantiCabinaTipo: 'Tiranti M12',
  serrature: 'si',
  serratureNumero: '3',
  serratureTipo: 'A gancio',
  pattinoRetrattile: 'si',
  pattinoRetrattileTipo: 'Wittur',
  sospensioni: 'si',
  sospensioniNumero: '4',
  serratureNote: 'Contatti ossidati',
  luceVanoSostituire: 'si',
  luceVanoNote: 'Plafoniere al 2° piano',
  telesoccorsoInstallare: 'si',
  perifericaInstallare: 'no',
  cornettaInstallare: 'si',
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
    assert.equal(row.doppioAccesso, false);
    assert.equal(row.pattinoRetrattile, true);
    assert.equal(row.pattinoRetrattileTipo, 'Wittur');
    assert.equal(row.serratureTipo, 'A gancio');
    assert.equal(row.serratureNote, 'Contatti ossidati');
    assert.deepEqual(
      [row.quadroNote, row.arganoNote, row.luceVanoNote],
      ['Quadro nel sottoscala', 'Rumore sul cuscinetto', 'Plafoniere al 2° piano'],
    );
    assert.deepEqual(
      [row.kitControlloGanasce, row.kitControlloGanasceTipo, row.controlloQuadro],
      [true, 'Microinterruttori', false],
    );
    assert.deepEqual([row.tirantiCabinaNumero, row.tirantiCabinaTipo], [4, 'Tiranti M12']);
    assert.equal(row.arganoTipo, 'A vite senza fine');
    assert.equal(row.contattiFreno, null, 'the brake contacts are no longer asked');
    assert.deepEqual(
      [row.sospensioni, row.sospensioniNumero, row.ordineSospensioni],
      [null, null, null],
      'manual doors: no suspensions',
    );
    assert.equal(row.luceVanoSostituire, true);
    assert.deepEqual(
      [row.telesoccorsoInstallare, row.perifericaInstallare, row.cornettaInstallare],
      [true, false, true],
    );
    assert.equal(row.displayPortineria, false);
    assert.equal(row.bottoniereMisure, true);
    assert.match(row.searchText, /bl 2026 512/);
    assert.match(row.searchText, /wittur/, 'the type of the cam is searchable');
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
    assert.match(page.body, /name="perifericaInstallare" value="no" data-clearable checked/);
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
    assert.deepEqual(
      [row.serrature, row.serratureTipo, row.pattinoRetrattile, row.pattinoRetrattileTipo],
      [null, null, null, null],
    );
    assert.deepEqual([row.sospensioni, row.serratureNote], [true, 'Contatti ossidati']);
  });

  it('keeps the old answers of the fields taken off the sheet when the sheet is saved again', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    await prisma.scheda.update({
      where: { id },
      data: {
        bloccaPortine: true,
        autolivellamento: false,
        pattinoRetrattileNumero: 2,
        arganoMarca: 'MONTANARI',
        telesoccorso: true,
        telesoccorsoStato: 'MANCA_PERIFERICA',
        operatoreMarca: 'Selcom',
        lucePorte: '800 x 2000',
        operatoreTensione: '24 V DC',
      },
    });
    // A page opened before October 2026 still sends the operator of the doors: it is not read.
    const old = { ...SECOND, operatoreMarca: 'Fermator', lucePorte: '900', operatoreTensione: '' };
    assert.equal((await edit(browser, id, old)).status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [
        row.bloccaPortine,
        row.autolivellamento,
        row.pattinoRetrattileNumero,
        row.arganoMarca,
        row.telesoccorso,
        row.telesoccorsoStato,
        row.operatoreMarca,
        row.lucePorte,
        row.operatoreTensione,
      ],
      [true, false, 2, 'MONTANARI', true, 'MANCA_PERIFERICA', 'Selcom', '800 x 2000', '24 V DC'],
    );
    const page = await browser.get(`/schede/${id}`);
    assert.doesNotMatch(
      page.body,
      /Blocca portine|Autolivellamento|Montanari|Manca periferica|Marca operatore|Selcom/,
    );
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

  it('saves and prints the suspensions and opens the 2SG sheet with automatic doors, without the locks', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SECOND, tipoPorte: 'AUTOMATICHE' });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [row.tipoPorte, row.sospensioni, row.sospensioniNumero],
      [['AUTOMATICHE'], true, 4],
    );
    assert.deepEqual(
      row.ordineSospensioni,
      { modulo: '2sg-ordine-porte', valori: {} },
      '"Sì" opens the 2SG sheet, empty when nothing is written in it',
    );
    assert.deepEqual([row.serrature, row.pattinoRetrattile], [null, null]);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /<dt>Numero sospensioni<\/dt>\s*<dd>4<\/dd>/);
    assert.doesNotMatch(print.body, /Serrature da cambiare|Pattino retrattile/);
  });

  it('prints the locks and skates to change, the alarm with the emergency call, the notes and the measurements table; the PDF carries them too', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, SECOND);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /<h2>Serrature, sospensioni o operatore<\/h2>/);
    assert.match(print.body, /<dt>Serrature da cambiare<\/dt>/);
    assert.doesNotMatch(print.body, /Numero sospensioni/, 'manual doors: no suspensions');
    assert.match(print.body, /Pattino retrattile da cambiare/);
    assert.match(print.body, /<dt>Tipo di pattino retrattile<\/dt>\s*<dd>Wittur<\/dd>/);
    assert.match(
      print.body,
      /<dt>Note serrature e sospensioni<\/dt>\s*<dd>Contatti ossidati<\/dd>/,
    );
    assert.match(print.body, /<h2>Funi e tiranti<\/h2>/);
    assert.match(print.body, /<dt>Tipo tiranti cabina<\/dt>\s*<dd>Tiranti M12<\/dd>/);
    assert.match(print.body, /<h2>Allarme e telesoccorso<\/h2>/);
    assert.doesNotMatch(print.body, /<h2>(Allarme|Telesoccorso)<\/h2>/);
    assert.match(
      print.body,
      /Periferica sotto cabina da installare[\s\S]*Cornetta nel locale[\s\S]*Allarme in portineria[\s\S]*Display in portineria/,
      "the porter's lodge last",
    );
    assert.match(print.body, /<dt>Note luce vano<\/dt>\s*<dd>Plafoniere al 2° piano<\/dd>/);
    assert.match(print.body, /<dt>Tipo argano esistente<\/dt>\s*<dd>A vite senza fine<\/dd>/);
    assert.doesNotMatch(print.body, /Contatti freno|tiranti in fossa/);
    assert.match(print.body, /<table class="ptable">/);
    assert.match(
      print.body,
      /<th scope="row" data-label="Fermata">1<\/th><td data-label="Piano">T<\/td><td data-label="Lunghezza \(mm\)">320,5<\/td>/,
    );
    const show = await browser.get(`/schede/${id}`);
    assert.match(show.body, /<table class="mtable">/);
    assert.match(show.body, /Buono di lavoro/);
    assert.doesNotMatch(show.body, /Buono di riferimento/);
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
