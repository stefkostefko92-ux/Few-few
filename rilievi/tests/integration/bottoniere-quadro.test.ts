// The owner's 24 October 2026 pass, end to end: the panel that stays and its check, the stop of the
// argano, the push-button panels of their own, the brake shoes no longer asked (their column untouched),
// one 2SG sheet with automatic doors, the sketches in full screen on the sheet page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { type Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-24',
  numeroImpianto: '880024',
  indirizzo: 'Via Roma 24, Torino',
  fermate: '4',
  tipoPorte: ['AUTOMATICHE'],
};
const MIGRATION = 'prisma/migrations/20261024090000_bottoniere_quadro_stop_argano/migration.sql';

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

/** Saves the sheet again with `form` on top (the page's own `base`). */
async function save(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const edit = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, { ...SURVEY, base, ...form });
}

describe('the 24 October 2026 pass', () => {
  it('saves the panel that stays, its check, the stop of the argano and the push-button panels', async () => {
    const { browser } = await signedIn('TECNICO');
    const note = 'Bottoniere di piano in acciaio, pulsanti a fungo';
    const id = await create(browser, {
      ...SURVEY,
      quadroSostituire: 'no',
      controlloQuadro: 'si',
      controlloQuadroTipo: 'Contatto su quadro',
      arganoPreventivo: 'si',
      stopArgano: 'si',
      bottoniereSostituire: 'si',
      bottoniereNote: note,
    });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [row.quadroSostituire, row.controlloQuadro, row.controlloQuadroTipo, row.stopArgano],
      [false, true, 'Contatto su quadro', true],
      'the check with a new argano too',
    );
    assert.deepEqual([row.bottoniereSostituire, row.bottoniereNote], [true, note]);
    assert.match(row.searchText, /pulsanti a fungo/);
    const found = await browser.get('/schede?q=pulsanti%20a%20fungo');
    assert.match(found.body, new RegExp(`/schede/${id}`), 'found by the note on the panels');

    const print = (await browser.get(`/schede/${id}/stampa`)).body;
    for (const text of [
      '<h2>Bottoniere</h2>',
      note,
      'Stop argano da installare?',
      'Quadro di manovra da sostituire',
      'Controllo su quadro manovra da installare?',
    ]) {
      assert.ok(print.includes(text), `print without "${text}"`);
    }

    // A new panel: no check asked, what was there not read; "No" on the panels: no note.
    assert.equal(
      (
        await save(browser, id, {
          quadroSostituire: 'si',
          controlloQuadro: 'si',
          controlloQuadroTipo: 'Contatto su quadro',
          bottoniereSostituire: 'no',
          bottoniereNote: note,
        })
      ).status,
      303,
    );
    const changed = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [changed.quadroSostituire, changed.controlloQuadro, changed.controlloQuadroTipo],
      [true, null, null],
    );
    assert.deepEqual([changed.bottoniereSostituire, changed.bottoniereNote], [false, null]);
  });

  it('leaves the old answer on the brake shoes in its column', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, arganoPreventivo: 'no' });
    await prisma.scheda.update({ where: { id }, data: { ganasceFreno: true } });
    const form = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.doesNotMatch(form, /name="ganasceFreno"/);
    assert.equal(
      (await save(browser, id, { arganoPreventivo: 'no', ganasceFreno: 'no' })).status,
      303,
    );
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.ganasceFreno, true);
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /Ganasce freno/);
  });

  it('keeps the check on the panel of a sheet saved before the panel was asked (the migration)', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, quadroSostituire: 'no', controlloQuadro: 'si' });
    const plain = await create(browser, {
      ...SURVEY,
      quadroSostituire: 'no',
      controlloQuadro: 'no',
    });
    // As the old code saved them: no answer on the panel.
    await prisma.scheda.updateMany({
      where: { id: { in: [id, plain] } },
      data: { quadroSostituire: null },
    });
    const update = /^UPDATE "Scheda"[\s\S]*?;$/m.exec(readFileSync(MIGRATION, 'utf8'));
    assert.ok(update, 'the migration answers the panel of the old sheets');
    await prisma.$executeRawUnsafe(update[0]);
    const rows = await prisma.scheda.findMany({
      where: { id: { in: [id, plain] } },
      select: { id: true, quadroSostituire: true, controlloQuadro: true },
    });
    assert.deepEqual(
      Object.fromEntries(rows.map((r) => [r.id, [r.quadroSostituire, r.controlloQuadro]])),
      { [id]: [false, true], [plain]: [null, false] },
      '"No" on the check says nothing about the panel',
    );
    assert.match(
      (await browser.get(`/schede/${id}`)).body,
      /Controllo su quadro manovra da installare\?/,
    );
  });

  it('gives automatic doors one 2SG sheet: the suspensions’ when both are “Sì”', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, {
      ...SURVEY,
      sospensioni: 'si',
      sospensioniNumero: '4',
      'sg-_': '1',
      'sg-ordNo': '77',
      operatore: 'si',
      'so-_': '1',
      'so-ordNo': '78',
    });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([row.sospensioni, row.operatore], [true, true]);
    assert.equal((row.ordineSospensioni as { valori: { ordNo: string } }).valori.ordNo, '77');
    assert.equal((await browser.get(`/schede/${id}/sospensioni-2sg`)).status, 200);
    assert.equal((await browser.get(`/schede/${id}/operatore-2sg`)).status, 404);
    const page = (await browser.get(`/schede/${id}`)).body;
    assert.match(page, new RegExp(`href="/schede/${id}/sospensioni-2sg"`));
    assert.doesNotMatch(page, /operatore-2sg/);
    // The form: the operator's sheet hidden behind the suspensions' one, the whole row wide.
    const form = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.match(
      form,
      /<div class="field--wide" data-when="sospensioni" data-when-values="si" data-when-not data-off>/,
    );
    assert.equal(
      (form.match(/data-gemelli="ordineSospensioni:2sg-ordine-porte"/g) ?? []).length,
      2,
    );
  });

  it('opens the sketches of the sheet page in full screen', async () => {
    const azienda = await makeAzienda();
    await prisma.azienda.update({ where: { id: azienda.id }, data: { schizzi: true } });
    const { browser } = await signedIn('TECNICO', azienda.id);
    const sheet = (d: string) => JSON.stringify({ e: [{ t: 'p', c: 'k', s: 1, d }] });
    const id = await create(browser, {
      ...SURVEY,
      'schizzi-_': '1',
      schizzo: [sheet('M10 10l5 5'), sheet('M100 100l200 0')],
    });
    assert.equal(await prisma.schizzo.count({ where: { schedaId: id } }), 2);
    const page = (await browser.get(`/schede/${id}`)).body;
    assert.equal((page.match(/data-schizzo-intero(?![-\w])/g) ?? []).length, 2);
    assert.match(page, /<dialog class="schizzo-intero"[^>]*data-schizzo-intero-vista/);
    assert.match(page, /\/static\/js\/schizzo-intero\.js/);
  });
});
