// Round 44: the comparison of an installation (src/lib/collega/confronto.ts), the records read as its sides (lati.ts),
// the steps (passi.ts), the suggestions (suggerimenti.ts) and the addresses (testo.ts). STATO DI FATTO: a difference is a
// probable error; MODIFICA PREVISTA: an expected modification; SOLO CONFRONTO: side by side, no verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankCalc } from '@/lib/calc-blank';
import { confronto, erroriDi, sintesi, type Lato, type Riga } from '@/lib/collega/confronto';
import { testoValore } from '@/lib/collega/formato';
import { latoCalcolo } from '@/lib/collega/lati';
import { calcoloDaAggiornare, passi } from '@/lib/collega/passi';
import type { RilievoDati } from '@/lib/collega/rilievo';
import { suggerimenti, type Candidato } from '@/lib/collega/suggerimenti';
import { paroleDaCercare, paroleIndirizzo, stessoIndirizzo } from '@/lib/collega/testo';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const R = (over: Partial<RilievoDati> = {}): RilievoDati => ({
  id: 'r1', data: d('2026-10-10'), createdAt: d('2026-10-10'), updatedAt: d('2026-10-10'), indirizzo: 'Via Giuseppe Verdi 14, Milano', matricola: '0123456',
  numeroImpianto: '71234', marca: 'OTIS', portataKg: 630, persone: 8, fermate: 5, posizione: 'ALTO', tipo: ['ELETTRICO'], funiNumero: 4, funiDiametroMm: 10,
  funicellaDiametroMm: 6, limitatoreTipo: 'PFB LK200', operatoreMarca: 'Wittur', lucePorte: '800 x 2000',
  argano: { pesoCabina: 700, velocita: 1, corsa: 12.5, taglia: 1, puleggia: 520, cuneo: null, rapporto: 53, potenzaKw: 7.5, giri: 1400, poli: 4, rinvio: null, rinvioD: null },
  ...over,
});
const L = (over: Partial<Lato> = {}): Lato => ({
  id: 'c1', createdAt: d('2026-10-11'), repl: true, Q: 630, persone: null, fermate: null, velocita: 1, corsa: 12.5, pesoCabina: 700, layout: 'topDefl', taglia: 1,
  funiNumero: 4, funiDiametro: 10, puleggia: 520, rapporto: 53, potenza: 7.5, giri: 1400, poli: 4, funicella: null, porte: null, operatore: null, ...over,
});
// the installation's «Numero di matricola» is the survey's matricola
const imp = { kind: 'REPLACEMENT' as const, indirizzo: 'Via Giuseppe Verdi 14, Milano, MI', plantNumber: '0123456' };
const at = (rows: readonly Riga[], p: string) => rows.find((w) => w.param === p);

test('tutto coincide: nessuna differenza; «in alto» coincide con tiro diretto e con rinvio', () => {
  const rows = confronto({ rilievo: R(), storico: [], impianto: imp, calcolo: L(), progetto: null });
  const s = sintesi(rows);
  assert.deepEqual([s.diff, s.mod, s.fuori], [0, 0, false]);
  assert.ok(s.confrontati >= 10, 'the technical rows really compared');
  assert.equal(at(rows, 'posizione')?.stato, 'ok');
  assert.equal(at(rows, 'indirizzo')?.stato, 'ok', 'the same address by its words');
  assert.equal(at(rows, 'matricola')?.stato, 'ok', 'the installation\'s «Numero di matricola»');
  assert.equal(at(rows, 'numero')?.stato, 'na', 'the lift\'s number: only on the surveys');
  assert.equal(at(rows, 'fermate')?.stato, 'na', 'the calculation keeps no stops');
  assert.equal(at(rows, 'marca')?.stato, 'info');
  assert.ok(!rows.some((w) => w.usa), '«usa» only on a difference');
});

test('stato di fatto diverso: probabile errore, con «usa il valore» verso il modulo giusto', () => {
  const rows = confronto({ rilievo: R(), storico: [], impianto: imp, calcolo: L({ funiNumero: 5, layout: 'bottom' }), progetto: null });
  assert.equal(at(rows, 'funiNumero')?.stato, 'diff');
  assert.equal(at(rows, 'funiNumero')?.usa, 'calc');
  assert.equal(at(rows, 'posizione')?.stato, 'diff');
  assert.deepEqual(erroriDi(rows, 'calcolo').map((w) => w.param), ['posizione', 'funiNumero']);
  // a whole project: the same rows open its one form
  const full = confronto({ rilievo: R(), storico: [], impianto: { ...imp, kind: 'FULL' }, calcolo: null, progetto: L({ fermate: 6 }) });
  assert.equal(at(full, 'fermate')?.stato, 'diff');
  assert.equal(at(full, 'fermate')?.usa, 'progetto');
  // the identity: the installation's data, «usa» to its data
  const moved = confronto({ rilievo: R(), storico: [], impianto: { ...imp, indirizzo: 'Corso Como 3, Milano', plantNumber: '99' }, calcolo: null, progetto: null });
  assert.equal(at(moved, 'indirizzo')?.stato, 'diff');
  assert.equal(at(moved, 'matricola')?.stato, 'diff');
  assert.equal(at(moved, 'matricola')?.usa, 'impianto');
  assert.deepEqual(erroriDi(moved, 'progetto'), [], 'the identity is not a record’s error');
});

test('modifica prevista: portata, persone e velocità diverse sono attese, non errori', () => {
  const rows = confronto({ rilievo: R(), storico: [], impianto: imp, calcolo: L({ Q: 800, velocita: 1.6 }), progetto: L({ Q: 800, persone: 10 }) });
  assert.equal(at(rows, 'Q')?.stato, 'mod');
  assert.equal(at(rows, 'persone')?.stato, 'mod');
  assert.equal(at(rows, 'velocita')?.stato, 'mod');
  assert.equal(at(rows, 'persone')?.usa, null, 'no input for the persons');
  const s = sintesi(rows);
  assert.deepEqual([s.diff, s.mod, s.fuori], [0, 3, false]);
});

test('appena creato dal rilievo: matricola e indirizzo copiati coincidono, ma nulla è stato confrontato', () => {
  const rows = confronto({ rilievo: R(), storico: [], impianto: imp, calcolo: null, progetto: null });
  assert.equal(at(rows, 'matricola')?.stato, 'ok');
  assert.equal(at(rows, 'indirizzo')?.stato, 'ok');
  assert.deepEqual(sintesi(rows), { diff: 0, mod: 0, fuori: false, confrontati: 0 });
});

test('funi e argano in posto contano solo dove il record è una sostituzione', () => {
  const rows = confronto({ rilievo: R(), storico: [], impianto: imp, calcolo: L({ repl: false, funiNumero: 6, taglia: 2 }), progetto: null });
  assert.equal(at(rows, 'funiNumero')?.stato, 'na', 'a new lift’s ropes are not the ones on site');
  assert.equal(at(rows, 'taglia')?.stato, 'na');
  assert.equal(at(rows, 'funiNumero')?.calcolo, 6, 'shown anyway');
});

test('idraulico o MRL: fuori ambito; matricola diversa da un rilievo precedente: errore', () => {
  const rows = confronto({ rilievo: R({ tipo: ['IDRAULICO'] }), storico: [R({ id: 'r0', data: d('2025-03-01'), matricola: '0999999' })], impianto: imp, calcolo: null,
    progetto: null });
  assert.equal(at(rows, 'tipo')?.stato, 'fuori');
  assert.ok(sintesi(rows).fuori);
  assert.equal(at(rows, 'matricola')?.stato, 'diff');
  assert.deepEqual(at(rows, 'matricola')?.storico, [{ data: d('2025-03-01'), valore: '0999999' }]);
  assert.equal(at(rows, 'matricola')?.usa, null, 'the installation\'s matricola is the survey\'s: nothing to put in');
  // the lift's number of an older survey: the same — it matches; another — a probable error, said with the older one
  const num = (n: string) => confronto({ rilievo: R(), storico: [R({ id: 'r0', data: d('2025-03-01'), numeroImpianto: n })], impianto: imp, calcolo: null, progetto: null });
  assert.equal(at(num('71234'), 'numero')?.stato, 'ok');
  assert.equal(at(num('70000'), 'numero')?.stato, 'diff');
  assert.deepEqual(at(num('70000'), 'numero')?.storico, [{ data: d('2025-03-01'), valore: '70000' }]);
  assert.equal(at(confronto({ rilievo: R({ tipo: ['GEARLESS'] }), storico: [], impianto: imp, calcolo: null, progetto: null }), 'tipo')?.stato, 'fuori');
});

test('le righe senza alcun valore non si mostrano; i valori si scrivono all’italiana', () => {
  const rows = confronto({ rilievo: R({ argano: null, marca: null }), storico: [], impianto: imp, calcolo: null, progetto: null });
  assert.equal(at(rows, 'giri'), undefined);
  assert.equal(at(rows, 'marca'), undefined);
  const w = (p: string) => (code: string) => `${p}:${code}`;
  assert.equal(testoValore('funiDiametro', 6.5, w('x')), '6,5 mm');
  assert.equal(testoValore('rapporto', 53, w('x')), '1:53');
  assert.equal(testoValore('taglia', 2, w('x')), '2:1');
  assert.equal(testoValore('posizione', 'ALTO', w('v')), 'v:ALTO');
  assert.equal(testoValore('Q', null, w('x')), '—');
});

test('il calcolo salvato come lato: argano esistente se confrontato, funi tenute altrimenti', () => {
  const V = { ...blankCalc(), Q: '630', r: '2', layout: 'top', o_n: '4', o_d: '10', o_D: '520', n_n: '4', n_d: '10' };
  const c = latoCalcolo({ id: 'c', createdAt: d('2026-10-11'), inputs: V });
  assert.ok(c?.repl);
  assert.equal(c?.funiNumero, 4);
  assert.equal(c?.puleggia, 520);
  assert.equal(c?.taglia, 2);
  const kept = latoCalcolo({ id: 'c', createdAt: d('2026-10-11'), inputs: { ...V, compare: false, o_n: '9' } });
  assert.equal(kept?.funiNumero, 4, 'the ropes kept in the new machine’s fields');
  assert.equal(kept?.puleggia, null);
  assert.equal(latoCalcolo({ id: 'c', createdAt: d('2026-10-11'), inputs: { ...V, P: '650' } }, true)?.pesoCabina, null, 'an estimated car mass is not compared');
  assert.equal(latoCalcolo({ id: 'c', createdAt: d('2026-10-11'), inputs: { nonsense: 1 } }), null);
});

test('i passi: da fare, fatto, da aggiornare (software o rilievo più recente), differenze; i documenti; chi non vede i rilievi', () => {
  const rec = (s: string, old = false) => ({ createdAt: new Date(s), old });
  const none = passi({ rilievo: null, calcolo: null, progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 });
  assert.deepEqual(none, { rilievo: 'daFare', calcolo: 'daFare', progetto: 'daFare', documenti: 'daFare' });
  const r = { updatedAt: new Date('2026-10-12T10:00:00Z') };
  const p = passi({ rilievo: r, calcolo: rec('2026-10-12T09:00:00Z'), progetto: rec('2026-10-13T09:00:00Z', true), tavole: { createdAt: new Date('2026-10-12T12:00:00Z') },
    erroriCalcolo: 0, erroriProgetto: 0 });
  assert.deepEqual(p, { rilievo: 'fatto', calcolo: 'daAggiornare', progetto: 'daAggiornare', documenti: 'daAggiornare' });
  assert.equal(passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z'), progetto: null, tavole: null, erroriCalcolo: 2, erroriProgetto: 0 }).calcolo, 'differenze');
  // the documents: the record's own (relazione, ordine) — done once a current record is saved, without a set issued too
  assert.equal(passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z'), progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 }).documenti, 'fatto');
  assert.equal(passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z', true), progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 }).documenti, 'daAggiornare');
  assert.equal(passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z'), progetto: rec('2026-10-14T09:00:00Z'), tavole: { createdAt: new Date('2026-10-14T10:00:00Z') },
    erroriCalcolo: 0, erroriProgetto: 0 }).documenti, 'fatto');
  // a role that does not see the surveys: linked or not, nothing judged against the survey
  const blind = passi({ rilievo: null, collegato: true, calcolo: rec('2026-10-11T09:00:00Z'), progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 });
  assert.deepEqual(blind, { rilievo: 'fatto', calcolo: 'fatto', progetto: 'daFare', documenti: 'fatto' });
  assert.equal(passi({ rilievo: null, collegato: false, calcolo: null, progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 }).rilievo, 'daFare');
  assert.deepEqual(calcoloDaAggiornare(rec('2026-10-12T09:00:00Z', true), r), { old: true, rilievo: true });
  assert.equal(calcoloDaAggiornare(rec('2026-10-13T09:00:00Z'), r), null);
});

test('i documenti mai «fatto» accanto a un record con differenze o più vecchio del rilievo', () => {
  const rec = (s: string, old = false) => ({ createdAt: new Date(s), old });
  const r = { updatedAt: new Date('2026-10-12T10:00:00Z') };
  const diff = passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z'), progetto: null, tavole: null, erroriCalcolo: 1, erroriProgetto: 0 });
  assert.deepEqual([diff.calcolo, diff.documenti], ['differenze', 'daAggiornare']);
  const older = passi({ rilievo: r, calcolo: rec('2026-10-12T09:00:00Z'), progetto: null, tavole: null, erroriCalcolo: 0, erroriProgetto: 0 });
  assert.deepEqual([older.calcolo, older.documenti], ['daAggiornare', 'daAggiornare']);
  const design = passi({ rilievo: r, calcolo: rec('2026-10-13T09:00:00Z'), progetto: rec('2026-10-13T10:00:00Z'), tavole: { createdAt: new Date('2026-10-13T11:00:00Z') },
    erroriCalcolo: 0, erroriProgetto: 2 });
  assert.deepEqual([design.progetto, design.documenti], ['differenze', 'daAggiornare']);
  // every combination: «fatto» only where each record of the documents is
  for (const c of [null, rec('2026-10-12T09:00:00Z'), rec('2026-10-13T09:00:00Z'), rec('2026-10-13T09:00:00Z', true)]) {
    for (const p of [null, rec('2026-10-12T09:30:00Z'), rec('2026-10-13T10:00:00Z'), rec('2026-10-13T10:00:00Z', true)]) {
      for (const [ec, ep] of [[0, 0], [1, 0], [0, 1]] as const) {
        const s = passi({ rilievo: r, calcolo: c, progetto: p, tavole: null, erroriCalcolo: ec, erroriProgetto: ep });
        if (s.documenti === 'fatto') assert.ok([s.calcolo, s.progetto].every((x) => x === 'fatto' || x === 'daFare'), JSON.stringify(s));
        else if (c || p) assert.equal(s.documenti, 'daAggiornare');
      }
    }
  }
});

test('gli indirizzi: le parole, le abbreviazioni, il più corto dentro il più lungo', () => {
  assert.deepEqual(paroleIndirizzo('V.le Monza n. 12/A'), ['viale', 'monza', '12', 'a']);
  assert.ok(stessoIndirizzo('Via Roma 12', 'via roma 12, 20100 Milano (MI)'));
  assert.ok(stessoIndirizzo('P.zza Duomo 1, Milano', 'Piazza Duomo 1'));
  assert.ok(!stessoIndirizzo('Via Roma 12', 'Via Roma 14'));
  assert.ok(!stessoIndirizzo('Roma', 'Via Roma 12'), 'one word is not an address');
  assert.deepEqual(paroleDaCercare('Via Giuseppe Verdi 14, Milano'), ['giuseppe', 'milano', 'verdi']);
});

test('i suggerimenti: prima la matricola, poi il numero, poi l’indirizzo; mai l’impianto già collegato', () => {
  const c = (id: string, over: Partial<Candidato> = {}): Candidato => ({ id, name: id, kind: 'FULL', address: null, city: null, province: null, plantNumber: null,
    updatedAt: d('2026-10-01'), schede: [], ...over });
  const r = { matricola: '0123456', numeroImpianto: '71234', indirizzo: 'Via Giuseppe Verdi 14, Milano', projectId: 'linked' };
  const out = suggerimenti(r, [
    c('addr', { address: 'Via Giuseppe Verdi 14', city: 'Milano', updatedAt: d('2026-10-09') }),
    c('num', { schede: [{ matricola: null, numeroImpianto: '71234', indirizzo: null }] }),
    c('mat', { schede: [{ matricola: '0123456', numeroImpianto: null, indirizzo: null }] }),
    c('plant', { plantNumber: '0123456', updatedAt: d('2026-10-05') }),
    c('none', { address: 'Corso Como 3', plantNumber: '71234' }),
    c('linked', { plantNumber: '0123456' }),
  ]);
  assert.deepEqual(out.map((s) => s.id), ['plant', 'mat', 'num', 'addr'], 'the matricola: the installation\'s or a survey\'s');
  assert.deepEqual(out[0]?.motivi, ['matricola']);
  assert.deepEqual(out[2]?.motivi, ['numero']);
  assert.equal(out[3]?.indirizzo, 'Via Giuseppe Verdi 14, Milano');
});
