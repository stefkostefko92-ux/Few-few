// Round 44: what a linked survey gives the installation's forms (src/lib/collega/rilievo.ts, prefill.ts). The sheet's own
// fields first, the argano data sheet where the sheet is empty (only when its question is «Sì» and it is stored); only
// empty values (or the software's standard) are filled, a typed one never; «usa il valore del rilievo» sets one on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { blankCalc } from '@/lib/calc-blank';
import { blankProgetto } from '@/lib/lift/progetto';
import { arganoDi, datiLetti, poliDi, rapportoDi, rilievoDati, unNumero, type RilievoRow } from '@/lib/collega/rilievo';
import { layoutDi, seminaCalc, seminaLift, semeCalc, semeLift, usaCalc, usaLift } from '@/lib/collega/prefill';

const day = new Date('2026-10-10T00:00:00Z');
/** a brand new drawing of the Progetto (round 45) */
const nuovoDisegno = () => blankProgetto();
function row(over: Partial<RilievoRow> = {}): RilievoRow {
  return {
    id: 'cm00000000000000000000s1', data: day, createdAt: day, updatedAt: day, datiAt: null, indirizzo: 'Via Giuseppe Verdi 14, Milano', matricola: '0123456', numeroImpianto: '71234',
    marca: 'OTIS', portataKg: 630, capienzaPersone: 8, fermate: 5, ubicazioneMacchina: ['ALTO'], tipoImpianto: ['ELETTRICO'], funiNumero: 4,
    funiDiametroMm: new Prisma.Decimal('10.00'), funicellaDiametroMm: new Prisma.Decimal('6.5'), limitatoreTipo: 'PFB LK200', operatoreMarca: 'Wittur',
    lucePorte: '800 x 2000', arganoPreventivo: true, quadroOrdine: null, quadroMarca: null, quadroModello: null, ordineQuadro: null,
    preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { velocita: '1,0', corsa: '12,5', taglia12: true, diametroPuleggia: 'Ø 520 mm', rapportoRiduzione: '1:53',
      potenzaKw: '7,5 kW', giri: '1.400', poli: '4/16', pesoCabina: '700', pulegginaRinvio: 'no', cuneo: '40', funiN: '6', portata: '480' } },
    ...over,
  };
}

test('numeri del modulo: un solo numero all’italiana, il rapporto e i poli dell’avvolgimento veloce', () => {
  assert.equal(unNumero('7,5 kW'), 7.5);
  assert.equal(unNumero('1.400'), 1400);
  assert.equal(unNumero('4 o 6'), null);
  assert.equal(unNumero(true), null);
  assert.equal(unNumero(undefined), null);
  for (const [s, i] of [['53', 53], ['1:53', 53], ['1/53', 53], ['53:1', 53], ['2:3', null], ['1', null]] as const) assert.equal(rapportoDi(s), i, s);
  assert.equal(poliDi('4/16'), 4);
  assert.equal(poliDi('6'), 6);
  assert.equal(poliDi('5'), null);
  assert.equal(poliDi('2/4/8'), null);
});

test('il rilievo: prima la scheda, poi il modulo dati argano dove la scheda è vuota', () => {
  const r = rilievoDati(row());
  assert.equal(r.portataKg, 630, 'the sheet wins over the module');
  assert.equal(r.funiNumero, 4);
  assert.equal(r.funiDiametroMm, 10);
  assert.equal(r.funicellaDiametroMm, 6.5);
  assert.equal(r.posizione, 'ALTO');
  assert.deepEqual(r.argano && { v: r.argano.velocita, H: r.argano.corsa, r: r.argano.taglia, D: r.argano.puleggia, i: r.argano.rapporto, P: r.argano.potenzaKw,
    n: r.argano.giri, p: r.argano.poli, m: r.argano.pesoCabina }, { v: 1, H: 12.5, r: 2, D: 520, i: 53, P: 7.5, n: 1400, p: 4, m: 700 });
  const empty = rilievoDati(row({ portataKg: null, funiNumero: null }));
  assert.equal(empty.portataKg, 480, 'the module where the sheet is empty');
  assert.equal(empty.funiNumero, 6);
  // «Argano da sostituire?» not «Sì», or another module's JSON in the column: no argano sheet
  assert.equal(rilievoDati(row({ arganoPreventivo: false })).argano, null);
  assert.equal(rilievoDati(row({ preventivoArgano: { modulo: 'montanari-preventivo', valori: { velocita: '1' } } })).argano, null);
  // both or neither of the machine's places: not known
  assert.equal(rilievoDati(row({ ubicazioneMacchina: ['ALTO', 'BASSO'] })).posizione, null);
  assert.equal(arganoDi({ taglia11: true, taglia12: true })?.taglia, null);
  // the power in CV only: in kW (a metric horsepower), the kW written win
  assert.equal(arganoDi({ potenzaCv: '10' })?.potenzaKw, 7.35);
  assert.equal(arganoDi({ potenzaCv: '10', potenzaKw: '7,5' })?.potenzaKw, 7.5);
});

test('la posizione della macchina: in basso; in alto con o senza rinvio solo se il modulo lo dice', () => {
  assert.equal(layoutDi(rilievoDati(row({ ubicazioneMacchina: ['BASSO'] }))), 'bottom');
  assert.equal(layoutDi(rilievoDati(row())), 'top', '«Puleggia di rinvio: no»');
  const withPulley = row({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { pulegginaRinvio: '400' } } });
  assert.equal(layoutDi(rilievoDati(withPulley)), 'topDefl');
  assert.equal(layoutDi(rilievoDati(row({ arganoPreventivo: false }))), null, 'above, the pulley not known');
  // «sì» as the sheets write it (a word boundary after «ì» is not one for \b)
  for (const s of ['sì', 'Sì, Ø 400', 'si']) assert.equal(layoutDi(rilievoDati(row({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { pulegginaRinvio: s } } }))), 'topDefl', s);
  assert.equal(layoutDi(rilievoDati(row({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { pulegginaRinvio: 'sicuro?' } } }))), null);
});

test('nuovo dal rilievo: un valore già uguale alla misura (la macchina in alto, uno standard) è del rilievo; in una bozza no', () => {
  const seme = semeCalc(rilievoDati(row()));
  const fresh = seminaCalc({ ...blankCalc(), layout: 'top' }, seme);
  assert.ok(fresh.seeded.includes('layout') && fresh.seeded.includes('o_poles'), fresh.seeded.join());
  const draft = seminaCalc({ ...blankCalc(), layout: 'top' }, seme, false);
  assert.ok(!draft.seeded.includes('layout') && !draft.seeded.includes('o_poles'));
  // the Progetto (round 45): the machine and its ropes are the «Calcolo argano»'s — «usa» puts nothing in
  const lift = seminaLift(nuovoDisegno(), rilievoDati(row({ ubicazioneMacchina: ['BASSO'] }))).draft;
  assert.deepEqual(usaLift(lift, rilievoDati(row()), 'funiNumero').set, []);
});

test('calcolo: il rilievo riempie solo i campi vuoti o standard, mai quelli scritti', () => {
  const r = rilievoDati(row()), seme = semeCalc(r);
  assert.equal(seme.Q, '630');
  assert.equal(seme.o_n, '4');
  assert.equal(seme.o_d, '10');
  assert.equal(seme.o_D, '520');
  assert.equal(seme.o_i, '53');
  assert.equal(seme.o_poles, '4');
  assert.equal(seme.layout, 'top');
  assert.equal(seme.r, '2');
  const start = { ...blankCalc(), Q: '480', o_poles: '4' };
  const { values, seeded } = seminaCalc(start, seme);
  assert.equal(values.Q, '480', 'typed: never overwritten');
  assert.ok(!seeded.includes('Q'));
  assert.equal(values.o_n, '4');
  assert.equal(values.v, '1');
  assert.equal(values.H, '12.5');
  assert.equal(values.P, '700');
  assert.equal(values.o_Pn, '7.5');
  assert.equal(values.o_nm, '1400');
  // a standard value of the software is the software's, not the user's: the measured one takes its place
  const six = seminaCalc(blankCalc(), semeCalc(rilievoDati(row({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { poli: '6' } } }))));
  assert.equal(six.values.o_poles, '6');
  // in a draft a value equal to the standard may be the user's: only the empty fields take the survey's
  const sixSeme = semeCalc(rilievoDati(row({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { poli: '6' } } })));
  const draft = seminaCalc({ ...blankCalc(), o_poles: '4', o_fn: 50 }, sixSeme, false);
  assert.equal(draft.values.o_poles, '4', 'a draft’s value at the standard stays');
  assert.ok(!draft.seeded.includes('o_poles'));
  assert.equal(draft.values.Q, '630', 'an empty field of the draft still takes the survey’s');
});

test('calcolo: «usa il valore del rilievo» mette il valore anche sopra quello scritto', () => {
  const r = rilievoDati(row());
  const u = usaCalc({ ...blankCalc(), Q: '480' }, r, 'Q');
  assert.equal(u.values.Q, '630');
  assert.deepEqual(u.set, ['Q']);
  // the ropes kept in the new machine's fields when the old machine is not compared
  const kept = usaCalc({ ...blankCalc(), context: 'repl', compare: false, keepRopes: true, n_n: '3' }, r, 'funiNumero');
  assert.equal(kept.values.o_n, '4');
  assert.equal(kept.values.n_n, '4');
  // above with the pulley not known, over a machine below: above, direct
  const above = usaCalc({ ...blankCalc(), layout: 'bottom' }, rilievoDati(row({ arganoPreventivo: false })), 'posizione');
  assert.equal(above.values.layout, 'top');
  // nothing in the survey for it: nothing set
  assert.deepEqual(usaCalc(blankCalc(), rilievoDati(row({ arganoPreventivo: false })), 'giri').set, []);
});

test('progetto (round 45): il disegno prende dal rilievo solo le fermate; il resto è del calcolo argano', () => {
  const r = rilievoDati(row({ ubicazioneMacchina: ['BASSO'] }));
  const { draft, seeded } = seminaLift(nuovoDisegno(), r);
  assert.deepEqual(seeded, ['floors']);
  assert.equal(draft.progetto.shaft.vertical.floors.length, 5);
  assert.ok(!draft.blank.includes('floors') && draft.blank.includes('rise.0'), 'the stops in, their rises to enter');
  // the load, the speed, the roping and the machine's place are not the drawing's to take
  assert.deepEqual(draft.progetto.shaft.Q, nuovoDisegno().progetto.shaft.Q);
  for (const k of ['Q', 'Qkg', 'v', 'r', 'layout'] as const) assert.ok(!draft.blank.includes(k), `${k} is the calculation's`);
  // the badges compare the drawing with the stops alone
  assert.deepEqual(semeLift(r), { floors: '5' });
  // a value already entered stays (a draft): seeding again changes nothing and fills nothing
  assert.deepEqual(seminaLift(draft, r), { draft, seeded: [] });
  // «usa il valore»: the stops over what the drawing holds; any other parameter is the calculation's
  const four = { ...draft, progetto: { ...draft.progetto, shaft: { ...draft.progetto.shaft, vertical: { ...draft.progetto.shaft.vertical,
    floors: draft.progetto.shaft.vertical.floors.slice(0, 4).map((f, i) => (i === 3 ? { ...f, rise: 0 } : f)) } } } };
  assert.equal(usaLift(four, r, 'fermate').draft.progetto.shaft.vertical.floors.length, 5);
  for (const p of ['Q', 'velocita', 'posizione', 'taglia'] as const) assert.deepEqual(usaLift(four, r, p).set, [], p);
  // stops out of the form's range are not put in
  assert.deepEqual(seminaLift(nuovoDisegno(), rilievoDati(row({ fermate: 90 }))).seeded, []);
});

test('i dati letti dall’impianto: una modifica che non li tocca non rende nulla «da aggiornare» (round 57)', () => {
  const later = new Date('2026-10-20T08:00:00Z');
  // a save that leaves what the installation reads as it was (a note, a module it does not read): the same
  assert.equal(datiLetti(row({ updatedAt: later, datiAt: later })), datiLetti(row()));
  assert.notEqual(datiLetti(row({ portataKg: 700 })), datiLetti(row()), 'the load');
  assert.notEqual(datiLetti(row({ data: later })), datiLetti(row()), 'the day: it decides the reference');
  const modulo = row().preventivoArgano as { modulo: string; valori: Record<string, unknown> };
  assert.notEqual(datiLetti(row({ preventivoArgano: { ...modulo, valori: { ...modulo.valori, velocita: '1,6' } } })), datiLetti(row()), 'the argano sheet');
  // a sheet from before migration 32: its `updatedAt`
  assert.equal(rilievoDati(row({ datiAt: null, updatedAt: later })).datiAt.getTime(), later.getTime());
  assert.equal(rilievoDati(row({ datiAt: day, updatedAt: later })).datiAt.getTime(), day.getTime());
});

test('l’ordine del quadro: velocità, corsa, fermate, regolazione e misure del vano dove la scheda non le ha (round 57)', () => {
  const pel = row({ quadroOrdine: true, quadroMarca: 'PELAZZA', arganoPreventivo: false, fermate: null,
    ordineQuadro: { modulo: 'pelazza-ordine-quadri-032026', valori: { velocita: '1,6', corsa: '24,5 m', nFermate: '8', tqVvvfAperto: true } } });
  const p = rilievoDati(pel);
  assert.deepEqual(p.quadro && { v: p.quadro.velocita, H: p.quadro.corsa, f: p.quadro.fermate, r: p.quadro.regolazione }, { v: 1.6, H: 24.5, f: 8, r: 'vvvf' });
  assert.equal(p.fermate, 8, 'the stops where the sheet has none');
  assert.equal(p.regolazione, 'vvvf');
  // the calculator: the speed and the travel from the panel order when no argano sheet is there
  const seme = semeCalc(p);
  assert.equal(seme.v, '1.6');
  assert.equal(seme.H, '24.5');
  // a make that is not the module's: nothing read
  assert.equal(rilievoDati(row({ ...pel, quadroMarca: 'MOVILIFT' })).quadro, null);
  // QI Touch: the travel in mm, the shaft's sides without a unit (in metres under 20)
  const qi = rilievoDati(row({ quadroOrdine: true, quadroMarca: 'MASTECH', quadroModello: 'QI_TOUCH', arganoPreventivo: false,
    ordineQuadro: { modulo: 'mastech-qi-touch', valori: { velocita: '1', corsa: '12500', numeroFermate: '5', p1Larghezza: '1,60', p1Profondita: '1750', s1Fossa: '1400', s2Testata: '3,7' } } }));
  assert.deepEqual(qi.quadro && [qi.quadro.corsa, qi.quadro.vanoW, qi.quadro.vanoD, qi.quadro.fossa, qi.quadro.testata], [12.5, 1600, 1750, 1400, 3700]);
  // MoviLift: pit and headroom in metres
  const ml = rilievoDati(row({ quadroOrdine: true, quadroMarca: 'MOVILIFT', arganoPreventivo: false,
    ordineQuadro: { modulo: 'movilift-modulo-ordine-scelta-v2-6', valori: { fossa: '1,2', testata: '3,6', corsa: '9' } } }));
  assert.deepEqual(ml.quadro && [ml.quadro.fossa, ml.quadro.testata, ml.quadro.corsa], [1200, 3600, 9]);
  // the Progetto: the shaft's measures where still to enter, marked
  const d = nuovoDisegno(), s = seminaLift(d, qi);
  assert.ok(['W', 'D', 'pit', 'headroom'].every((k) => s.seeded.includes(k)), 'the four measures');
  assert.equal(s.draft.progetto.shaft.W, 1600);
  assert.equal(s.draft.progetto.shaft.vertical.headroom, 3700);
  assert.deepEqual(semeLift(qi), { floors: '5', W: '1600', D: '1750', pit: '1400', headroom: '3700' });
  // the argano sheet's motor before the panel's ticks
  assert.equal(rilievoDati(row({ ...pel, arganoPreventivo: true, preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { motoreAc2: true } } })).regolazione, '2v');
});
