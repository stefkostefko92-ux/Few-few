// The hourly maintenance (the audit of 12 November 2026): the steps were one chain of awaits — the first that
// failed (a company that cannot be deleted, Revolut not answering) stopped all the ones after it, every hour,
// with one line in the log. Each step now runs on its own: the others go on, the failed ones are named, and the
// console shows when the maintenance last ran and whether all of it did.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eseguiPassi, esitoManutenzione } from '../src/manutenzione-passi.js';

describe('the steps of the maintenance', () => {
  it('runs every step even when one fails, and names the failed ones', async () => {
    const fatti: string[] = [];
    const esito = await eseguiPassi(
      [
        ['sessioni', async () => (fatti.push('sessioni'), 3)],
        [
          'aziende',
          async () => {
            throw new Error('violates foreign key');
          },
        ],
        ['pagamenti', async () => (fatti.push('pagamenti'), 0)],
        ['prove', async () => (fatti.push('prove'), 2)],
      ],
      new Date('2026-11-12T10:00:00Z'),
    );
    assert.deepEqual(fatti, ['sessioni', 'pagamenti', 'prove']);
    assert.deepEqual(esito.falliti, ['aziende']);
    assert.deepEqual(esito.conteggi, { sessioni: 3, pagamenti: 0, prove: 2 });
    assert.equal(esito.at.toISOString(), '2026-11-12T10:00:00.000Z');
  });

  it('tells the console: in order, a failed step, or no run for too long', () => {
    const ora = new Date('2026-11-12T12:00:00Z');
    const min = (m: number) => new Date(ora.getTime() - m * 60_000);
    // Never run: fine right after the start, a warning once the first hour is over.
    assert.equal(esitoManutenzione(null, ora, 5 * 60_000), 'ok');
    assert.equal(esitoManutenzione(null, ora, 3 * 3600_000), 'errore');
    assert.equal(esitoManutenzione({ at: min(30), falliti: [], conteggi: {} }, ora, 0), 'ok');
    assert.equal(
      esitoManutenzione({ at: min(30), falliti: ['aziende'], conteggi: {} }, ora, 0),
      'errore',
    );
    // The timer stopped: two hours without a run.
    assert.equal(esitoManutenzione({ at: min(130), falliti: [], conteggi: {} }, ora, 0), 'errore');
  });
});
