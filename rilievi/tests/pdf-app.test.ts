// The PDF in the app on the iPhone home screen (the owner, 5 November 2026: "è aperto un pdf non ho modo
// di chiuderlo, se non chiudendo tutta l'applicazione" — WebKit bug 290847): every link of the portal to a
// PDF carries data-pdf, so public/js/pdf-app.js hands the file to the share sheet there instead of
// leaving the app on a page with no way back. A new PDF link without it would bring the dead end back.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const VIEWS = join(import.meta.dirname, '..', 'views');

function ejsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? ejsFiles(join(dir, entry.name))
      : entry.name.endsWith('.ejs')
        ? [join(dir, entry.name)]
        : [],
  );
}

/** A link to a PDF of the portal: …/pdf, …/pdf/<copia>, the module PDFs of the sheet, the calculation. */
const PDF_HREF = /href="[^"]*(\/pdf\b|modulo\.path|percorso\.pdf)[^"]*"/;

describe('the PDF links of the portal', () => {
  it('all carry data-pdf, for the app on the iPhone home screen', () => {
    const senza: string[] = [];
    let trovati = 0;
    for (const file of ejsFiles(VIEWS)) {
      // The EJS inside a tag (`<%= … %>`) keeps its words but loses its angle brackets.
      const html = readFileSync(file, 'utf8').replace(/<%[\s\S]*?%>/g, (ejs) =>
        ejs.replace(/[<>]/g, ''),
      );
      for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
        if (!PDF_HREF.test(tag)) continue;
        trovati += 1;
        if (!/\sdata-pdf[\s>]/.test(tag)) senza.push(`${file.slice(VIEWS.length + 1)}: ${tag}`);
      }
    }
    assert.ok(trovati >= 10, `PDF links found: ${trovati}`);
    assert.deepEqual(senza, []);
  });
});
