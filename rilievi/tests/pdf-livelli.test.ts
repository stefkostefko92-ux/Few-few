// The language layers of the DMG forms (the owner, 13 November 2026: "Controlla la modalità di stampa Dmg" —
// on paper and on his screen the Italian, French and English labels lay on top of one another). The forms keep
// the three languages as layers of the same page and only say "Italian on, the others off": a viewer or a
// printer that does not know layers draws them all. What leaves the portal has ONE language for everybody:
// the content of the layers that are off is taken out of the page, and the layers themselves are gone.
//  - a viewer that knew the layers sees exactly what it saw before (pixel for pixel);
//  - nothing of the other languages is left to draw, and nothing says "layers" any more;
//  - what was only hidden keeps its effect on what follows (a font or a colour set there), as the PDF rules say.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import {
  DMG_FIXTURES,
  DMG_PITAGORA,
  GEAT,
  MOVILIFT,
  moduloPdf,
  type ModuloAcro,
} from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { togliLivelliSpenti } from '../src/ordini/pdf-livelli.js';
import { pdfFontPaths } from '../src/schede/pdf.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const popplerHere =
  spawnSync('pdftoppm', ['-v']).error === undefined &&
  spawnSync('pdftotext', ['-v']).error === undefined;

/** The joined, decoded content of every page. */
function contenuti(doc: PDFDocument): string[] {
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => doc.context.lookup(ref))
        : contents
          ? [contents]
          : [];
    return streams
      .map((s) =>
        Buffer.from(
          s instanceof PDFRawStream
            ? decodePDFRawStream(s).decode()
            : (s as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents(),
        ).toString('latin1'),
      )
      .join('\n');
  });
}

/** Nothing says "layers" any more: no configuration, no layer among the page properties, no marker. */
function senzaLivelli(doc: PDFDocument, dove: string): void {
  assert.equal(doc.catalog.get(PDFName.of('OCProperties')), undefined, `${dove}: OCProperties`);
  for (const [i, page] of doc.getPages().entries()) {
    const props = page.node.Resources()?.lookupMaybe(PDFName.of('Properties'), PDFDict);
    for (const [name, value] of props?.entries() ?? []) {
      const dict = value instanceof PDFRef ? doc.context.lookup(value) : value;
      const type = dict instanceof PDFDict ? dict.get(PDFName.of('Type')) : undefined;
      assert.notEqual(String(type), '/OCG', `${dove}, page ${i + 1}: ${String(name)}`);
    }
  }
  for (const [i, testo] of contenuti(doc).entries())
    assert.doesNotMatch(testo, /\/OC\s*\/\w+\s*BDC/, `${dove}, page ${i + 1}`);
}

const DMG: ModuloAcro[] = [DMG_FIXTURES, DMG_PITAGORA];

describe('the layers of the DMG forms', () => {
  for (const modulo of DMG) {
    it(`${modulo.id}: only the language that was on is left in the pages`, async () => {
      const prima = await PDFDocument.load(moduloPdf(modulo));
      const lunghezze = contenuti(prima).map((t) => t.length);
      const doc = await PDFDocument.load(moduloPdf(modulo));
      assert.equal(togliLivelliSpenti(doc), true);
      senzaLivelli(doc, modulo.id);
      // Two of the three languages are gone from every page; the drawing and the Italian labels stay.
      for (const [i, testo] of contenuti(doc).entries()) {
        assert.ok(testo.length < lunghezze[i]! * 0.97, `page ${i + 1}: ${testo.length}`);
        assert.ok(testo.length > lunghezze[i]! * 0.5, `page ${i + 1}: ${testo.length}`);
      }
      // Done once: a second pass finds nothing.
      assert.equal(togliLivelliSpenti(doc), false);
      // And the file is whole after saving.
      const salvato = await PDFDocument.load(await doc.save());
      assert.equal(salvato.getPageCount(), prima.getPageCount());
      senzaLivelli(salvato, `${modulo.id} saved`);
    });
  }

  it('stops on layers it does not know how to take out', async () => {
    // A document with one page and one layer that is off; `cambia` adds what must stop the work.
    const con = async (
      cambia: (doc: PDFDocument, spento: PDFRef, d: PDFDict) => void,
    ): Promise<PDFDocument> => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const spento = doc.context.register(
        doc.context.obj({ Type: 'OCG', Name: PDFString.of('English') }),
      );
      const d = doc.context.obj({ OFF: [spento] });
      doc.catalog.set(PDFName.of('OCProperties'), doc.context.obj({ OCGs: [spento], D: d }));
      cambia(doc, spento, d);
      return doc;
    };
    const xobject = (doc: PDFDocument, contenuto: string, voci: Record<string, unknown>): void =>
      void doc.context.register(
        doc.context.flateStream(contenuto, {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, 1, 1],
          ...voci,
        }),
      );
    // Alone, the layer simply goes.
    const semplice = await con(() => undefined);
    assert.equal(togliLivelliSpenti(semplice), true);
    assert.equal(semplice.catalog.get(PDFName.of('OCProperties')), undefined);
    const fermati: Array<[string, RegExp, Parameters<typeof con>[0]]> = [
      [
        'a state for print only',
        /\/AS/,
        (doc, _s, d) => d.set(PDFName.of('AS'), doc.context.obj([])),
      ],
      [
        'a print rule on the layer',
        /Usage/,
        (doc, spento) =>
          doc.context.lookup(spento, PDFDict).set(PDFName.of('Usage'), doc.context.obj({})),
      ],
      ['the layer on an object', /\/OC/, (doc, spento) => xobject(doc, '', { OC: spento })],
      [
        'the layer inside a drawing of its own',
        /извън съдържанието/,
        (doc, spento) =>
          xobject(doc, '/OC /MC0 BDC EMC', { Resources: { Properties: { MC0: spento } } }),
      ],
      ['a drawing without resources of its own', /ресурси/, (doc) => xobject(doc, '', {})],
    ];
    for (const [cosa, errore, cambia] of fermati) {
      const doc = await con(cambia);
      assert.throws(() => togliLivelliSpenti(doc), errore, cosa);
      // Stopped before anything was written: the layers are still declared.
      assert.ok(doc.catalog.get(PDFName.of('OCProperties')), cosa);
    }
  });

  it('leaves a form without layers alone', async () => {
    for (const modulo of [MOVILIFT, GEAT]) {
      const doc = await PDFDocument.load(moduloPdf(modulo));
      const prima = contenuti(doc);
      assert.equal(togliLivelliSpenti(doc), false, modulo.id);
      assert.deepEqual(contenuti(doc), prima);
    }
  });

  it(
    'gives the filled sheets with one language for every viewer',
    { skip: !fontsHere },
    async () => {
      const fogli = [
        await renderModulo(
          DMG_FIXTURES,
          { cliente: 'Ascensori Rossi Srl', modello: 'luna', fermate: '6', data: '13/11/2026' },
          fontDir,
        ),
        await renderModulo(DMG_PITAGORA, { azienda: 'Ascensori Rossi Srl', nPiani: '6' }, fontDir),
      ];
      for (const [i, bytes] of fogli.entries()) {
        const doc = await PDFDocument.load(bytes);
        senzaLivelli(doc, DMG[i]!.id);
        // The layers themselves are not written either: no object of the file is a layer of a language.
        const nomi = doc.context
          .enumerateIndirectObjects()
          .map(([, obj]) => obj)
          .filter(
            (obj): obj is PDFDict =>
              obj instanceof PDFDict && String(obj.get(PDFName.of('Type'))) === '/OCG',
          )
          .map((obj) => obj.lookup(PDFName.of('Name'))?.toString() ?? '');
        assert.deepEqual(
          nomi.filter((nome) => /Fran|English|Italiano|Dati/.test(nome)),
          [],
        );
      }
    },
  );

  it(
    'shows a viewer that knew the layers exactly what it showed before, and no other language',
    { skip: !popplerHere && 'pdftoppm and pdftotext are not installed here' },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'rilievi-livelli-'));
      // The page itself, without the fields over it (the cover of QF Fixtures is a button as large as
      // the page): what is compared is the drawing and the labels.
      const pagine = async (modulo: ModuloAcro, cambia: (doc: PDFDocument) => void) => {
        const doc = await PDFDocument.load(moduloPdf(modulo), { updateMetadata: false });
        for (const page of doc.getPages()) page.node.delete(PDFName.of('Annots'));
        doc.catalog.delete(PDFName.of('AcroForm'));
        cambia(doc);
        const file = join(dir, `${modulo.id}-${Math.random().toString(36).slice(2)}.pdf`);
        writeFileSync(file, await doc.save());
        return { file, n: doc.getPageCount() };
      };
      const disegna = (file: string, page: number): Buffer => {
        const run = spawnSync('pdftoppm', ['-r', '120', '-f', `${page}`, '-l', `${page}`, file], {
          maxBuffer: 64 * 1024 * 1024,
        });
        assert.equal(run.status, 0, run.stderr.toString());
        assert.ok(run.stdout.length > 1000, 'a picture');
        return run.stdout;
      };
      const leggi = (file: string): string =>
        spawnSync('pdftotext', ['-layout', file, '-'], {
          maxBuffer: 16 * 1024 * 1024,
        }).stdout.toString();
      const STRANIERO = /armoire|controller|\bfloors?\b/i;
      try {
        for (const modulo of DMG) {
          // As the vendor made it (poppler honours the layers), with the layers taken out, and as a
          // viewer without layers shows the vendor's file: every language at once.
          const prima = await pagine(modulo, () => undefined);
          const dopo = await pagine(modulo, (doc) => void togliLivelliSpenti(doc));
          const tutti = await pagine(
            modulo,
            (doc) => void doc.catalog.delete(PDFName.of('OCProperties')),
          );
          for (let page = 1; page <= prima.n; page += 1) {
            const vista = disegna(prima.file, page);
            assert.ok(vista.equals(disegna(dopo.file, page)), `${modulo.id}, page ${page}`);
            // The check can fail: without the layers and with their content the page is another one.
            assert.ok(!vista.equals(disegna(tutti.file, page)), `${modulo.id}, page ${page}: all`);
          }
          // Read as plain text, the sheet has the Italian labels and none of the others.
          assert.match(
            leggi(tutti.file),
            STRANIERO,
            `${modulo.id}: the other languages were there`,
          );
          const testo = leggi(dopo.file);
          assert.match(testo, /quadro di manovra/i, modulo.id);
          assert.match(testo, /\bpiani\b/i, modulo.id);
          assert.doesNotMatch(testo, STRANIERO, modulo.id);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
