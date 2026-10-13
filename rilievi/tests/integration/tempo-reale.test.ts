// The server half of filling in real time (public/js/collegati.js, moduli.js): which fields come to
// the page as still following their source (data-auto), the places linked since October 2026 filled
// when a form first opens, and which of them are compared on save.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-12',
  numeroImpianto: '880022',
  indirizzo: 'Via Po 3, Torino',
  fermate: '5',
};

/** The Pelazza panel order open, as the browser sends it. */
const PANEL = { quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-_': '1' };

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('the same data in every place, filled in every direction', () => {
  it('keeps as following the survey fields of a form and the sheet fields that followed a form', async () => {
    const { browser } = await signedIn('TECNICO');
    const page = await browser.get('/schede/nuova');
    // The date, the company and the person writing: the forms follow the sheet until someone types.
    assert.match(page.body, /name="oq-data"[^>]*value="(\d{2}\/\d{2}\/\d{4})" data-auto="\1"/);
    assert.match(page.body, /name="sg-mittente"[^>]*data-auto="([^"]+)"[^>]*>\1<\/textarea>/);
    assert.match(page.body, /name="om-email"[^>]*data-auto="[^"@]+@[^"]+"/);
    // The stops of the sheet came from the panel order and still follow it when the form comes back.
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...PANEL,
      'oq-nFermate': '5',
      data: '2026-10-12',
      fermate: '5',
      funiNumero: '4',
      'collegati-auto': 'fermate oq-nFermate',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /name="fermate"[^>]*value="5" data-auto="5"/);
    assert.doesNotMatch(reply.body, /name="funiNumero"[^>]*data-auto/, 'typed by hand');
  });

  it('opens the forms with the address, the plate, the doors, the door operator and its opening', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, {
      ...SURVEY,
      matricola: '0033871',
      marca: 'Schindler',
      tipoImpianto: ['IDRAULICO'],
      tipoPorte: ['AUTOMATICHE'],
      operatoreMarca: 'Selcom',
      operatoreTensione: '24 V DC',
      lucePorte: '800 x 2000',
    });
    // No form was ever on screen: each opens now from the sheet, following it.
    const form = await browser.get(`/schede/${id}/modifica`);
    for (const [name, value] of [
      ['pa-indirizzo', 'Via Po 3, Torino'],
      ['pa-matricola', '0033871'],
      ['pa-marca', 'Schindler'],
      ['oq-opModello', 'Selcom'],
      ['sg-luceCabinaL', '800'],
      ['sg-luceCabinaH', '2000'],
    ]) {
      assert.match(
        form.body,
        new RegExp(`name="${name}"[^>]*value="${value}" data-auto="${value}"`),
      );
    }
    assert.match(form.body, /name="oq-tqIdraulico" value="si" checked data-auto="si"/);
    assert.match(form.body, /name="sg-automatico" value="si" checked data-auto="si"/);
    assert.match(
      form.body,
      /name="om-marcaOpA" data-auto="SELCOM">[^]*?<option value="SELCOM" selected>/,
    );
    assert.match(
      form.body,
      /name="om-voltA" data-auto="24Vcc">[^]*?<option value="24Vcc" selected>/,
    );
  });

  it('asks to confirm a changed address, never a door operator model more precise than its make', async () => {
    const { browser } = await signedIn('TECNICO');
    const asked = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      arganoPreventivo: 'si',
      'pa-_': '1',
      'pa-indirizzo': 'Via Po 33, Torino',
    });
    assert.equal(asked.status, 422);
    assert.match(
      asked.body,
      /<strong>Indirizzo<\/strong> — Scheda: Via Po 3, Torino · Dati argano: Via Po 33, Torino/,
    );
    await create(browser, {
      ...SURVEY,
      tipoPorte: ['AUTOMATICHE'],
      operatoreMarca: 'Selcom',
      ...PANEL,
      'oq-nFermate': '5',
      'oq-porteAutomatiche': 'si',
      'oq-opModello': 'Selcom Midi Supra',
    });
  });
});
