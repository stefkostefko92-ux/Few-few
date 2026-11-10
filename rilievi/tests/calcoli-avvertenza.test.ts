// Every calculation sheet says who made it, with what, and who must check it (the owner, 10 November 2026:
// "Su ogni foglio dobbiamo scrivere che è stato generato dal nostro software … deve essere comunque
// controllato e firmato da persona istruita e da chi è stato generato (il nome utente)"): on every page of
// the PDF the software, the person who generated it and when; at the end the notice and the box for the
// qualified technician's check and signature; the same notice on every calculation page of the portal.
// A future calculator is held to it too: any PDF drawn with the calculation head must draw them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { calcolaArgano } from '../src/argano/calcolo.js';
import { buildCorrente, improntaCalcolo } from '../src/build.js';
import type { DatiArgano } from '../src/argano/dati.js';
import { renderCalcoloArgano } from '../src/argano/pdf.js';
import { righeRisultato } from '../src/argano/righe.js';
import { translatorFor } from '../src/i18n.js';
import { calcolaLimitatore } from '../src/limitatore/calcolo.js';
import { renderCalcoloLimitatore } from '../src/limitatore/pdf.js';
import { sintesiLimitatore } from '../src/limitatore/righe.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

const ROOT = join(import.meta.dirname, '..');
const t = translatorFor('it');
const files = (dir: string, ext: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return name.endsWith(ext) ? [path] : [];
  });

const TESTATA = {
  intestazione: { nome: 'Ascensori Esempio S.r.l.', righe: ['Via Roma 12, 20121 Milano (MI)'] },
  logo: null,
};
const IMPIANTO = { indirizzo: 'Via Roma 1, Milano', matricola: '0012345', numeroImpianto: '7' };
const SALVATO = { quando: '09/11/2026, 18:00', autore: 'Giulia Bianchi' };
const GENERATO = {
  quando: '10/11/2026, 11:30',
  autore: 'Marco Neri',
  build: '0a1b2c3d4e',
  impronta: 'AB12-CD34-EF56',
};

/** The words of each page (pdftotext), or null without poppler. */
function pagine(pdf: Buffer, count: number): string[] | null {
  const out: string[] = [];
  for (let n = 1; n <= count; n += 1) {
    const text = spawnSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', '-', '-'], {
      input: pdf,
    });
    if (text.error !== undefined) return null;
    out.push(text.stdout.toString('utf8').replace(/\s+/g, ' '));
  }
  return out;
}

describe('the notice of a calculation', () => {
  it('limits the liability only as far as the law allows, never as a total exclusion', () => {
    const testo = t('calcoli.avvertenza.testo');
    // A clause that excludes liability for intent or gross negligence is void (art. 1229 c.c.; чл. 94 ЗЗД).
    assert.match(testo, /nei limiti consentiti dalla legge/i);
    assert.doesNotMatch(testo, /nessuna responsabilit/i);
    // What the law keeps whatever is written: intent and gross negligence, and towards injured people the
    // liability for defective products (Directive (EU) 2024/2853, from 9 December 2026).
    assert.match(
      testo,
      /Restano ferme le responsabilità che per legge non possono essere escluse o limitate/,
    );
    assert.match(testo, /dolo o colpa grave/);
    assert.match(testo, /persone fisiche per danni da prodotti difettosi/);
    assert.match(testo, /D\.P\.R\. 162\/1999/);
    assert.match(testo, /Rilievi Impianti/);
    assert.match(testo, /tecnico abilitato/);
    assert.match(t('calcoli.piede.generato', { nome: 'X', quando: 'Y' }), /Rilievi Impianti.*X.*Y/);
  });

  it('is drawn by every PDF with the calculation head, and shown on every calculation page', () => {
    const disegnatori = files(join(ROOT, 'src'), '.ts').filter(
      (path) =>
        !path.endsWith('pdf-testata.ts') && /disegnaTestata\(/.test(readFileSync(path, 'utf8')),
    );
    assert.ok(disegnatori.length >= 2, 'the argano and the governor PDFs at least');
    for (const path of disegnatori) {
      const code = readFileSync(path, 'utf8');
      assert.match(code, /disegnaAvvertenza\(/, relative(ROOT, path));
      assert.match(code, /disegnaPiede\(doc, t, \{ generato: /, relative(ROOT, path));
    }
    const pagine = files(join(ROOT, 'views'), '.ejs').filter((path) =>
      /\/calcolo[^/]*\.ejs$/.test(path),
    );
    assert.ok(pagine.length >= 2);
    for (const path of pagine)
      assert.match(
        readFileSync(path, 'utf8'),
        /include\('\.\.\/partials\/avvertenza-calcolo'\)/,
        relative(ROOT, path),
      );
  });
});

describe('the build and the reference of a sheet', () => {
  it('names the running code; the same input and software give the same reference, any change another', () => {
    assert.match(buildCorrente(), /^[0-9a-f]{10}$/);
    assert.equal(buildCorrente(), buildCorrente());
    const dati = { vn: 1.6, tipo: 'progressivo', norma: 'en81-20-2020', intervento: 'limitatore' };
    const rif = improntaCalcolo('limitatore', 'b1', dati);
    assert.match(rif, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const rovescio = Object.fromEntries(Object.entries(dati).reverse());
    assert.equal(
      improntaCalcolo('limitatore', 'b1', rovescio),
      rif,
      'the order of the keys does not count',
    );
    assert.notEqual(improntaCalcolo('limitatore', 'b2', dati), rif, 'another build');
    assert.notEqual(
      improntaCalcolo('limitatore', 'b1', { ...dati, vn: 1.7 }),
      rif,
      'another input',
    );
    assert.notEqual(improntaCalcolo('argano', 'b1', dati), rif, 'another calculation');
  });
});

describe(
  'the calculation PDFs',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    const controlla = async (pdf: Buffer, nome: string) => {
      const count = (await PDFDocument.load(pdf)).getPageCount();
      const testi = pagine(pdf, count);
      if (testi === null) return count;
      testi.forEach((testo, i) => {
        assert.match(
          testo,
          /Generato con Rilievi Impianti \(Carbon Stealth VCC\), build 0a1b2c3d4e, da Marco Neri il 10\/11\/2026, 11:30 · Rif\. AB12-CD34-EF56/,
          `${nome} p. ${i + 1}`,
        );
        assert.match(
          testo,
          /Calcolo salvato il 09\/11\/2026, 18:00 da Giulia Bianchi/,
          `${nome} p. ${i + 1}`,
        );
        assert.match(testo, new RegExp(`${i + 1}\\s*/\\s*${count}`), `${nome} p. ${i + 1}`);
      });
      const ultima = testi.at(-1)!;
      for (const parola of [
        'Avvertenza',
        'Verifica del tecnico abilitato',
        'Dati di ingresso verificati',
        'Nome e cognome',
        'Firma',
      ])
        assert.ok(ultima.includes(parola), `${nome}: ${parola}`);
      assert.ok(ultima.includes('Nei limiti consentiti dalla legge'), nome);
      return count;
    };

    it('the governor: one page, with the notice and the signature box', async () => {
      const d = {
        vn: 1.6,
        tipo: 'progressivo',
        norma: 'en81-20-2020',
        intervento: 'limitatore',
      } as const;
      const pdf = await renderCalcoloLimitatore({
        sintesi: sintesiLimitatore(d, calcolaLimitatore(d), t),
        t,
        impianto: IMPIANTO,
        salvato: SALVATO,
        generato: GENERATO,
        testata: TESTATA,
        fontDir,
      });
      assert.equal(await controlla(pdf, 'limitatore'), 1);
    });

    it('the machine: every case of the workbook, at most two pages, every page signed by its maker', async () => {
      const RT = JSON.parse(readFileSync(join(import.meta.dirname, 'argano-rt.json'), 'utf8')) as {
        casi: Record<string, { dati: DatiArgano }>;
      };
      for (const [nome, caso] of Object.entries(RT.casi)) {
        const pdf = await renderCalcoloArgano({
          dati: caso.dati,
          sezioni: righeRisultato(calcolaArgano(caso.dati), caso.dati, t),
          t,
          impianto: IMPIANTO,
          salvato: SALVATO,
          generato: GENERATO,
          testata: TESTATA,
          fontDir,
        });
        const count = await controlla(pdf, nome);
        assert.ok(count <= 2, `${nome}: ${count} pages`);
      }
    });
  },
);
