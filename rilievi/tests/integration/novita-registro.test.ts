// The first page of a new installation registers every update on its own day (src/novita/registro.ts):
// there was no update to announce, so nobody sees the popup — the next update will be the first one.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { vociAttive } from '../../src/novita/attive.js';
import { prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

// What this portal announces (the entry about a sign-in that is not switched on is left out).
const VOCI = vociAttive();

describe('the updates on a new installation', () => {
  it('are registered at the first page, each on its own day, and announce nothing', async () => {
    assert.equal(await prisma.novita.count(), 0);
    const { browser } = await signedIn('TECNICO');
    const page = await browser.get('/schede', { accept: 'text/html' });
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.body, /data-novita/);
    const righe = await prisma.novita.findMany();
    // Each on its own day — never later than the start of the current UTC day (an entry dated a day that has not
    // begun in UTC yet would be published in the future).
    const oggi = new Date().toISOString().slice(0, 10);
    assert.deepEqual(
      righe.map((r) => [r.id, r.pubblicataAt.toISOString()]).sort(),
      VOCI.map((v) => [v.id, `${v.data < oggi ? v.data : oggi}T00:00:00.000Z`]).sort(),
    );
  });
});
