// dati.json of the export is written to disk section by section, the big sections row by row as they come from
// the database (the audit of 12 November 2026: the whole file was built in memory, indented — a company with
// thousands of signed sheets took the portal down for everyone). The result is the same JSON; a row source is
// read one page at a time and never more than a page is held.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { aPagine, scriviDati } from '../src/aziende/esportazione-dati.js';

describe('dati.json written as a stream', () => {
  it('gives the same JSON as the plain object, with rows that come one at a time', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rilievi-dati-'));
    try {
      async function* righe() {
        for (let i = 0; i < 5; i += 1)
          yield { id: i, testo: `riga "${i}" è\n`, quando: new Date(0) };
      }
      async function* nessuna() {}
      const file = join(dir, 'dati.json');
      const bytes = await scriviDati(file, {
        formato: 'x/1',
        azienda: { name: 'Rossi & C.', logo: null },
        persone: [{ email: 'a@example.it' }],
        schede: righe(),
        registro: nessuna(),
      });
      const testo = await readFile(file, 'utf8');
      assert.equal(Buffer.byteLength(testo), bytes);
      assert.deepEqual(JSON.parse(testo), {
        formato: 'x/1',
        azienda: { name: 'Rossi & C.', logo: null },
        persone: [{ email: 'a@example.it' }],
        schede: [0, 1, 2, 3, 4].map((i) => ({
          id: i,
          testo: `riga "${i}" è\n`,
          quando: '1970-01-01T00:00:00.000Z',
        })),
        registro: [],
      });
      assert.deepEqual(Object.keys(JSON.parse(testo) as object), [
        'formato',
        'azienda',
        'persone',
        'schede',
        'registro',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads a table one page at a time, after the last row of the page before', async () => {
    const tutte = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}` }));
    const chieste: Array<string | undefined> = [];
    let inMano = 0;
    let massimo = 0;
    const leggi = async (dopo: string | undefined) => {
      chieste.push(dopo);
      const da = dopo ? tutte.findIndex((r) => r.id === dopo) + 1 : 0;
      const pagina = tutte.slice(da, da + 3);
      inMano = pagina.length;
      massimo = Math.max(massimo, inMano);
      return pagina;
    };
    const viste: string[] = [];
    for await (const r of aPagine(leggi, 3)) viste.push(r.id);
    assert.deepEqual(
      viste,
      tutte.map((r) => r.id),
    );
    assert.deepEqual(chieste, [undefined, 'r2', 'r5']);
    assert.equal(massimo, 3);
  });
});
