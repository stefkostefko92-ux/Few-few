// The company's subscription (the owner, 12 November 2026 — #31, #33): a new company gets one free month; three
// levels by the number of people (up to 10, up to 25, over 25); when the period ends the whole company can only
// read. The rules without a database: the dates in Rome's calendar, the state, the limit of people, and which
// capabilities stay when the company is read-only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggiungiMesi,
  CAPACITA_IN_SOLA_LETTURA,
  LIVELLI,
  maxPersone,
  scadenzaDopoMesi,
  statoAbbonamento,
} from '../src/abbonamenti/regole.js';
import { sogliaDovuta } from '../src/abbonamenti/scadenze.js';

const roma = (iso: string) => new Date(iso);

describe('the subscription dates', () => {
  it('adds calendar months, keeping the last day of a shorter month', () => {
    assert.equal(aggiungiMesi('2026-11-12', 1), '2026-12-12');
    assert.equal(aggiungiMesi('2026-01-31', 1), '2026-02-28');
    assert.equal(aggiungiMesi('2028-01-31', 1), '2028-02-29');
    assert.equal(aggiungiMesi('2026-11-30', 3), '2027-02-28');
    assert.equal(aggiungiMesi('2026-12-15', 12), '2027-12-15');
  });

  it('gives the free month to the whole last day, at midnight in Rome', () => {
    // Created on 12 November at 11:00 in Rome: free through 12 December, ends at midnight starting the 13th.
    const fine = scadenzaDopoMesi(roma('2026-11-12T10:00:00Z'), 1, roma('2026-11-12T10:00:00Z'));
    assert.equal(fine.toISOString(), '2026-12-12T23:00:00.000Z');
    // Summer time: midnight in Rome is 22:00 UTC.
    const estate = scadenzaDopoMesi(roma('2026-06-03T08:00:00Z'), 1, roma('2026-06-03T08:00:00Z'));
    assert.equal(estate.toISOString(), '2026-07-03T22:00:00.000Z');
  });

  it('extends from the current end when it is still ahead, from now when it has passed', () => {
    const now = roma('2026-11-20T09:00:00Z');
    const avanti = roma('2026-12-12T23:00:00Z'); // midnight starting 13 December
    assert.equal(scadenzaDopoMesi(avanti, 12, now).toISOString(), '2027-12-12T23:00:00.000Z');
    const passata = roma('2026-11-01T23:00:00Z');
    assert.equal(scadenzaDopoMesi(passata, 1, now).toISOString(), '2026-12-20T23:00:00.000Z');
  });
});

describe('the subscription state', () => {
  const now = roma('2026-11-20T09:00:00Z');
  const futuro = roma('2026-12-12T23:00:00Z');
  const passato = roma('2026-11-20T08:59:59Z');

  it('reads the four states', () => {
    assert.deepEqual(
      statoAbbonamento(
        { abbonamentoFino: null, abbonamentoProva: false, abbonamentoLivello: null },
        now,
      ),
      {
        tipo: 'illimitato',
        fino: null,
        livello: null,
        maxPersone: null,
        solaLettura: false,
        poi: null,
      },
    );
    assert.deepEqual(
      statoAbbonamento(
        { abbonamentoFino: futuro, abbonamentoProva: true, abbonamentoLivello: null },
        now,
      ),
      {
        tipo: 'prova',
        fino: futuro,
        livello: null,
        maxPersone: null,
        solaLettura: false,
        poi: null,
      },
    );
    assert.deepEqual(
      statoAbbonamento(
        { abbonamentoFino: futuro, abbonamentoProva: false, abbonamentoLivello: 2 },
        now,
      ),
      { tipo: 'attivo', fino: futuro, livello: 2, maxPersone: 25, solaLettura: false, poi: null },
    );
    assert.deepEqual(
      statoAbbonamento(
        { abbonamentoFino: passato, abbonamentoProva: false, abbonamentoLivello: 1 },
        now,
      ),
      { tipo: 'scaduto', fino: passato, livello: 1, maxPersone: 10, solaLettura: true, poi: null },
    );
    // The trial ends the same way: read-only.
    assert.equal(
      statoAbbonamento(
        { abbonamentoFino: passato, abbonamentoProva: true, abbonamentoLivello: null },
        now,
      ).solaLettura,
      true,
    );
  });

  it('knows the three levels by the number of people', () => {
    assert.deepEqual(Object.keys(LIVELLI).map(Number), [1, 2, 3]);
    assert.equal(maxPersone(1), 10);
    assert.equal(maxPersone(2), 25);
    assert.equal(maxPersone(3), null);
    assert.equal(maxPersone(null), null);
    // A level the code does not know (a hand edit) limits like the smallest — never "unlimited".
    assert.equal(maxPersone(7), 10);
  });

  it('keeps reading, deleting data and managing people when read-only (art. 12.5)', () => {
    assert.deepEqual([...CAPACITA_IN_SOLA_LETTURA].sort(), [
      'audit:view',
      'interventi:read',
      'preventivi:read',
      'schede:delete',
      'schede:read',
      'schede:trash',
      'users:manage',
    ]);
  });
});

describe('the notices before the end (art. 12.6)', () => {
  it('are due 14 and 3 days before and on the day after the end', () => {
    const fine = roma('2026-12-12T23:00:00Z');
    const prima = (giorni: number) => new Date(fine.getTime() - giorni * 24 * 60 * 60 * 1000);
    assert.equal(sogliaDovuta(fine, prima(20)), null);
    assert.equal(sogliaDovuta(fine, prima(14)), 14);
    assert.equal(sogliaDovuta(fine, prima(5)), 14);
    assert.equal(sogliaDovuta(fine, prima(3)), 3);
    assert.equal(sogliaDovuta(fine, prima(0.1)), 3);
    assert.equal(sogliaDovuta(fine, fine), 0);
    assert.equal(sogliaDovuta(fine, prima(-0.9)), 0);
    assert.equal(sogliaDovuta(fine, prima(-2)), null);
  });
});
