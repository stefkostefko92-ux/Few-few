// The list of saved winch calculations, page by page: the pager sends `?p=`, as on every other list
// (audit, 4 November 2026 — the page read `?page=`, so "Successiva" showed page 1 again).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

describe('the list of winch calculations', () => {
  it('turns the page', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    // One more than a page, the oldest first: the newest are on page 1.
    for (let n = 1; n <= 26; n += 1)
      await prisma.calcoloArgano.create({
        data: {
          aziendaId: azienda.id,
          indirizzo: `Via Pagina ${String(n).padStart(2, '0')}`,
          dati: {},
          updatedAt: new Date(Date.UTC(2026, 9, 1, 0, n)),
        },
      });
    const first = (await browser.get('/calcolo-argano')).body;
    assert.match(first, /Via Pagina 26/);
    assert.doesNotMatch(first, /Via Pagina 01</);
    assert.match(first, /href="\/calcolo-argano\?p=2"/);
    const second = (await browser.get('/calcolo-argano?p=2')).body;
    assert.match(second, /Via Pagina 01</);
    assert.doesNotMatch(second, /Via Pagina 26/);
  });
});
