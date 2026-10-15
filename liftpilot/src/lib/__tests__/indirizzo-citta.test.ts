// A survey's address and the installation's (round 46): «Crea impianto» splits the municipality the survey writes last
// into the city (and the province in brackets), the name stays the condominium's; the comparison checks the city too —
// «…, Milano» in the address of an installation entered in Bergamo is a difference, not «coincide». And the draft's bar
// writes the time of Italy, as the server writes its days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronto } from '@/lib/collega/confronto';
import type { RilievoDati } from '@/lib/collega/rilievo';
import { dividiIndirizzo, indirizzoImpianto, stessaCitta } from '@/lib/collega/testo';
import { romeTime } from '@/lib/dates';

test('indirizzo del rilievo: il comune scritto per ultimo alla città, la provincia tra parentesi alla provincia', () => {
  assert.deepEqual(dividiIndirizzo('Condominio Via Washington 42, Milano'), { via: 'Condominio Via Washington 42', citta: 'Milano', provincia: null });
  assert.deepEqual(dividiIndirizzo('Via Roma 12, 20100 Milano (mi)'), { via: 'Via Roma 12', citta: 'Milano', provincia: 'MI' });
  assert.deepEqual(dividiIndirizzo('Viale Monza 3, Sesto San Giovanni'), { via: 'Viale Monza 3', citta: 'Sesto San Giovanni', provincia: null });
  // nothing to split: no comma, a street or a number last
  for (const s of ['Via Roma 12', 'Condominio Aurora, Via Roma 12', 'Via Roma, 12']) assert.deepEqual(dividiIndirizzo(s), { via: s, citta: null, provincia: null }, s);
  assert.deepEqual(dividiIndirizzo(null), { via: '', citta: null, provincia: null });
});

test('confronto: stesso indirizzo ma comune diverso → differenza; città vuota o rilievo senza comune → nessuna', () => {
  const R = { id: 'r1', data: new Date('2026-10-10'), createdAt: new Date('2026-10-10'), updatedAt: new Date('2026-10-10'), indirizzo: 'Condominio Via Washington 42, Milano',
    matricola: null, numeroImpianto: null, marca: null, portataKg: null, persone: null, fermate: null, posizione: null, tipo: ['ELETTRICO'], funiNumero: null,
    funiDiametroMm: null, funicellaDiametroMm: null, limitatoreTipo: null, operatoreMarca: null, lucePorte: null, argano: null } as unknown as RilievoDati;
  const row = (address: string, city: string | null) => confronto({ rilievo: R, storico: [], calcolo: null, progetto: null,
    impianto: { indirizzo: indirizzoImpianto({ address, city, province: null }), citta: city, plantNumber: null } }).find((r) => r.param === 'indirizzo');
  // the walk: the survey's whole address in the address field, the wrong city typed beside it
  assert.equal(row('Condominio Via Washington 42, Milano', 'Bergamo')?.stato, 'diff');
  assert.equal(row('Condominio Via Washington 42, Milano', 'Bergamo')?.usa, 'impianto');
  assert.equal(row('Condominio Via Washington 42', 'Milano')?.stato, 'ok', 'split as «Crea impianto» does');
  assert.equal(row('Condominio Via Washington 42, Milano', null)?.stato, 'ok', 'no city entered');
  assert.ok(stessaCitta('Via Roma 12', 'Bergamo'), 'a survey without its municipality says nothing against it');
  assert.ok(stessaCitta('Via Roma 12, Milano', ' milano '));
});

test('ora della bozza: quella d’Italia, anche con il browser in un altro fuso', () => {
  assert.equal(romeTime(new Date('2026-10-15T08:52:00Z')), '10:52', 'summer time');
  assert.equal(romeTime(new Date('2026-12-15T08:52:00Z')), '09:52', 'winter time');
  assert.equal(romeTime(new Date('2026-12-15T23:05:00Z')), '00:05');
});
