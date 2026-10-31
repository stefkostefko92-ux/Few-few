// What the portal shows of a stop sign (the owner, 30 October 2026: "nella parte superiore di tutti i
// cartelli deve comparire il logo e i dati societari"): the picture on the sign page and in the settings
// is the sign's own PDF turned into WebP by pdftoppm — logo and company data on top, the same as on paper.
// Without pdftoppm (a laptop) the bare template is shown; CI and the image install it, so there it runs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { intestazioneDi } from '../src/aziende/dati.js';
import { anteprimaModello } from '../src/cartelli/anteprima.js';
import { MODELLI, modelloDi } from '../src/cartelli/modelli.js';
import { DATI_VUOTI, misuraVista, vistaCartello } from '../src/cartelli/vista.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

const popplerHere = spawnSync('pdftoppm', ['-v']).error === undefined;

const DATI = {
  ragioneSociale: 'Ascensori Prova S.r.l.',
  indirizzo: 'Via Roma 12',
  cap: '20121',
  citta: 'Milano',
  provincia: 'mi',
  telefono: '02 1234567',
  email: 'info@ascensoriprova.example',
  partitaIva: '01234567890',
  sito: 'www.ascensoriprova.example',
};

/** A magenta logo: no template has that colour, so its pixels are the logo's. */
const LOGO = await sharp({
  create: { width: 300, height: 100, channels: 3, background: { r: 255, g: 0, b: 255 } },
})
  .png()
  .toBuffer();

async function pixels(webp: Buffer) {
  const { data, info } = await sharp(webp)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const magenta = (data: Buffer, from: number, to: number) => {
  let n = 0;
  for (let i = from * 3; i < to * 3; i += 3)
    if (data[i]! > 200 && data[i + 1]! < 80 && data[i + 2]! > 200) n++;
  return n;
};

describe(
  'the picture of a stop sign',
  { skip: (!fontsHere || !popplerHere) && 'DejaVu fonts or pdftoppm are not installed here' },
  () => {
    it('is the PDF page, of the size the page reserves, with the logo in the top part', async () => {
      for (const modello of MODELLI.values()) {
        const azienda = { intestazione: intestazioneDi('Ascensori Prova', DATI), logo: LOGO };
        const webp = await vistaCartello(modello, DATI_VUOTI, azienda, fontDir);
        assert.equal(webp.subarray(8, 12).toString(), 'WEBP', modello.id);
        const { data, width, height } = await pixels(webp);
        const { width: w, height: h } = misuraVista(modello);
        assert.equal(width, w, modello.id);
        assert.ok(Math.abs(height - h) <= 1, `${modello.id}: ${height} for ${h}`);
        const top = Math.round(height * 0.3) * width;
        assert.ok(magenta(data, 0, top) > 500, `${modello.id}: the logo is on top`);
        assert.equal(magenta(data, top, width * height), 0, `${modello.id}: only on top`);
      }
    });

    it('puts the company data on top and leaves the rest of the sign as it is', async () => {
      for (const modello of MODELLI.values()) {
        const draw = async (intestazione: { nome: string; righe: string[] }) =>
          pixels(await vistaCartello(modello, DATI_VUOTI, { intestazione, logo: null }, fontDir));
        const con = await draw(intestazioneDi('Ascensori Prova', DATI));
        const senza = await draw({ nome: '', righe: [] });
        const { width, height } = con;
        const diff = (from: number, to: number) => {
          let n = 0;
          for (let i = from * width * 3; i < to * width * 3; i++)
            if (Math.abs(con.data[i]! - senza.data[i]!) > 40) n++;
          return n;
        };
        const cut = Math.round(height * 0.3);
        assert.ok(diff(0, cut) > 500, `${modello.id}: the data are drawn on top`);
        assert.equal(diff(cut, height), 0, `${modello.id}: nothing else changes`);
      }
    });

    it('is drawn once for the same input and again when the logo or the data change', async () => {
      const modello = modelloDi('blu');
      const azienda = { intestazione: intestazioneDi('Ascensori Prova', DATI), logo: LOGO };
      const prima = await vistaCartello(modello, DATI_VUOTI, azienda, fontDir);
      assert.equal(await vistaCartello(modello, DATI_VUOTI, { ...azienda }, fontDir), prima);
      const senzaLogo = await vistaCartello(
        modello,
        DATI_VUOTI,
        { ...azienda, logo: null },
        fontDir,
      );
      assert.notDeepEqual(senzaLogo, prima);
      const altriDati = await vistaCartello(
        modello,
        DATI_VUOTI,
        { ...azienda, intestazione: intestazioneDi('Altra Ditta', null) },
        fontDir,
      );
      assert.notDeepEqual(altriDati, prima);
    });
  },
);

describe(
  'the picture without pdftoppm',
  { skip: !fontsHere && 'DejaVu fonts are not installed' },
  () => {
    it('is the bare template, never an error', async () => {
      const path = process.env.PATH;
      process.env.PATH = '/nonexistent';
      try {
        const modello = modelloDi('grafite-oro');
        const azienda = {
          intestazione: intestazioneDi(`Senza poppler ${Date.now()}`, null),
          logo: null,
        };
        const webp = await vistaCartello(modello, DATI_VUOTI, azienda, fontDir);
        assert.deepEqual(webp, await anteprimaModello(modello));
      } finally {
        process.env.PATH = path;
      }
    });
  },
);
