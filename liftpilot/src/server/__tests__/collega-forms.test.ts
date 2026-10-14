// Round 44, third pass: where the installation's forms start from its reference survey (src/server/collega/forms.ts).
// Marked «dal rilievo» are only the fields whose value came from the survey — filled at the start (in a brand new form
// also a value the software already held equal to the measure: the machine above, a standard), put in by «usa», or kept
// marked by the draft while still the survey's —, never a value of a saved calculation that happens to equal it; the
// notice «parte dal rilievo» (seeded) only when the form starts from the survey — a value put in by «usa» on a saved
// calculation continued stays marked in its draft, but never says the form starts from the survey —; «prima» only when
// the field held something else. Over a mocked database holding one survey.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { capsOf } from '@/lib/rbac';
import { blankCalc } from '@/lib/calc-blank';
import { blankLift } from '@/lib/lift/blank';
import { bozzaRilievo } from '@/lib/collega/formato';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;

const day = new Date(Date.UTC(2026, 9, 10));
/** the reference survey: 630 kg, 5 stops, above with «Puleggia di rinvio: no», 4 ropes Ø 10, the argano sheet stored */
const ROW = (over: Row = {}): Row => ({
  id: 'cm00000000000000000000s1', data: day, createdAt: day, updatedAt: day, indirizzo: 'Via Rilievo 1, Torino', matricola: 'MX-1', numeroImpianto: null,
  marca: null, portataKg: 630, capienzaPersone: 8, fermate: 5, ubicazioneMacchina: ['ALTO'], tipoImpianto: ['ELETTRICO'], funiNumero: 4,
  funiDiametroMm: new Prisma.Decimal('10'), funicellaDiametroMm: null, limitatoreTipo: null, operatoreMarca: null, lucePorte: null, arganoPreventivo: true,
  preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { velocita: '1', poli: '4', pulegginaRinvio: 'no' } },
  ...over,
});
let survey: Row | null = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: { scheda: { findFirst: async () => survey } } } });
const forms = () => import(src('server/collega/forms.ts'));

const user = { id: 'u1', role: 'TECHNICIAN', companyId: 'c1' };
beforeEach(() => { survey = ROW(); });

test('calcolo nuovo: segnati i valori presi dal rilievo — anche la macchina «in alto» e lo standard uguale alla misura', async () => {
  const { avvioCalc } = await forms();
  const a = await avvioCalc(user, 'p1', blankCalc(), 'new', undefined);
  for (const id of ['Q', 'layout', 'o_n', 'o_d', 'v', 'o_poles']) assert.ok(a.origine?.valori[id] !== undefined, id);
  assert.equal(a.start.layout, 'top');
  assert.equal(a.origine?.valori.o_poles, '4', 'the standard 4 poles are the measured ones');
  assert.ok(a.seeded.length > 0, 'the notice «parte dal rilievo»');
  // the machine above already held as the survey says it: the survey's still, on a start from it
  const top = await avvioCalc(user, 'p1', { ...blankCalc(), layout: 'top' }, 'new', undefined);
  assert.equal(top.origine?.valori.layout, 'top');
  assert.ok(top.seeded.includes('layout'));
});

test('calcolo salvato ripreso: nulla dal rilievo, nessun segno sui valori uguali, nessun avviso', async () => {
  const { avvioCalc } = await forms();
  const saved = { ...blankCalc(), Q: '630', layout: 'top', o_n: '4', o_d: '10' };
  const a = await avvioCalc(user, 'p1', saved, null, undefined);
  assert.deepEqual([a.seeded, a.origine?.valori], [[], {}]);
  assert.equal(a.rilievo?.matricola, 'MX-1', 'the survey is still there for «usa»');
  // «usa» on it: only that value marked, the notice does not say the form starts from the survey
  const u = await avvioCalc(user, 'p1', { ...saved, Q: '480' }, null, 'Q');
  assert.deepEqual([u.seeded, u.origine?.valori], [[], { Q: '630' }]);
  assert.equal(u.usa?.prima, '480');
});

test('«usa il valore»: «prima» solo se il campo aveva un altro valore', async () => {
  const { avvioCalc, avvioLift } = await forms();
  const same = await avvioCalc(user, 'p1', { ...blankCalc(), o_n: '4' }, null, 'funiNumero');
  assert.deepEqual([same.usa?.set, same.usa?.prima], [['o_n'], null]);
  assert.equal((await avvioCalc(user, 'p1', { ...blankCalc(), o_n: '6' }, null, 'funiNumero')).usa?.prima, '6');
  assert.equal((await avvioCalc(user, 'p1', { ...blankCalc(), layout: 'bottom' }, null, 'posizione')).usa?.prima, 'bottom');
  assert.equal((await avvioCalc(user, 'p1', { ...blankCalc(), layout: 'top' }, null, 'posizione')).usa?.prima, null);
  // the one form: a value still to enter held nothing (its placeholder is not a value); an equal one — nothing either
  const lift = blankLift();
  assert.equal((await avvioLift(user, 'p1', lift, null, 'posizione')).usa?.prima, null);
  const five = (await avvioLift(user, 'p1', lift, 'new', undefined)).start;
  assert.equal((await avvioLift(user, 'p1', five, null, 'fermate')).usa?.prima, null);
  assert.equal((await avvioLift(user, 'p1', five, null, 'Q')).usa?.prima, null);
  const typed = { ...five, inputs: { ...five.inputs, shaft: { ...five.inputs.shaft, Q: 800 } } };
  assert.equal((await avvioLift(user, 'p1', typed, null, 'Q')).usa?.prima, '800');
});

test('bozza: i suoi campi restano dell’utente; tornano segnati solo quelli che la bozza teneva segnati e ancora uguali', async () => {
  const { avvioCalc } = await forms();
  const draft = { ...blankCalc(), Q: '630', o_n: '4', o_d: '9', v: '1' };
  const plain = await avvioCalc(user, 'p1', draft, 'draft', undefined);
  assert.equal(plain.origine?.valori.Q, undefined, 'typed equal to the survey: the user’s');
  const kept = await avvioCalc(user, 'p1', draft, 'draft', undefined, { rilievo: ['o_n', 'o_d', 'v', 'nonsense'], parte: true });
  assert.deepEqual(Object.keys(kept.origine?.valori ?? {}).filter((id) => ['Q', 'o_n', 'o_d', 'v', 'nonsense'].includes(id)).sort(), ['o_n', 'v'],
    'o_d changed since: no longer the survey’s');
  assert.ok(kept.seeded.includes('o_n'), 'a draft started from the survey says so again');
  assert.equal(kept.origine?.parte, true);
  // a saved calculation continued: the marks of a draft are not read
  assert.deepEqual((await avvioCalc(user, 'p1', draft, null, undefined, { rilievo: ['o_n'], parte: true })).origine?.valori, {});
});

test('progetto: nuovo dal rilievo segnato; ripreso salvato — nulla; la bozza riporta i suoi segni', async () => {
  const { avvioLift } = await forms();
  survey = ROW({ ubicazioneMacchina: ['BASSO'] });
  const a = await avvioLift(user, 'p1', blankLift(), 'new', undefined);
  for (const id of ['Qkg', 'floors', 'layout', 'v']) assert.ok(a.origine?.valori[id] !== undefined, id);
  // a new lift: the existing machine's hidden fields take nothing, and «usa» on them puts nothing in
  assert.equal(a.origine?.valori.o_n, undefined);
  assert.deepEqual((await avvioLift(user, 'p1', a.start, null, 'funiNumero')).usa?.set, []);
  const again = await avvioLift(user, 'p1', a.start, null, undefined);
  assert.deepEqual([again.seeded, again.origine?.valori], [[], {}]);
  const draft = await avvioLift(user, 'p1', a.start, 'draft', undefined, { rilievo: ['Qkg', 'floors'], parte: true });
  assert.deepEqual(Object.keys(draft.origine?.valori ?? {}).sort(), ['Qkg', 'floors']);
});

test('«usa» su un calcolo salvato ripreso, poi la sua bozza: il valore resta segnato, nessun avviso «parte dal rilievo»', async () => {
  const { avvioCalc } = await forms();
  const saved = { ...blankCalc(), Q: '800', layout: 'top', o_n: '4', o_d: '10', v: '1.6', H: '18' };
  const u = await avvioCalc(user, 'p1', saved, null, 'Q');
  assert.deepEqual([u.seeded, u.origine?.valori, u.origine?.parte], [[], { Q: '630' }, false]);
  // the calculator's draft after another field changed (H 18 → 19): the value put in, not a start from the survey
  const values = { ...u.start, H: '19' }, kept = bozzaRilievo(u.origine, (id) => values[id]);
  assert.deepEqual(kept, { rilievo: ['Q'] });
  const again = await avvioCalc(user, 'p1', values, 'draft', undefined, kept);
  assert.deepEqual([again.seeded, again.origine?.valori, again.origine?.parte, again.usa], [[], { Q: '630' }, false, null]);
  // a brand new calculation from the survey: its draft says it started from it, and the notice comes back
  const fresh = await avvioCalc(user, 'p1', blankCalc(), 'new', undefined);
  const mine = { ...fresh.start, H: '19' }, fromSurvey = bozzaRilievo(fresh.origine, (id) => mine[id]);
  assert.equal(fromSurvey.parte, true);
  const back = await avvioCalc(user, 'p1', mine, 'draft', undefined, fromSurvey);
  assert.ok(back.seeded.includes('Q') && back.origine?.parte === true);
  // «usa» on that draft: still a form started from the survey
  assert.ok((await avvioCalc(user, 'p1', { ...mine, Q: '800' }, 'draft', 'Q', fromSurvey)).seeded.length > 0);
});

test('«sì» alla puleggia di rinvio: in alto con rinvio — e «usa» sulla posizione dice il valore messo, non «in alto»', async () => {
  const { avvioCalc } = await forms();
  survey = ROW({ preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { pulegginaRinvio: 'Sì' } } });
  assert.equal((await avvioCalc(user, 'p1', blankCalc(), 'new', undefined)).start.layout, 'topDefl');
  const u = await avvioCalc(user, 'p1', { ...blankCalc(), layout: 'bottom' }, null, 'posizione');
  assert.deepEqual([u.usa?.set, u.usa?.messo, u.usa?.prima], [['layout'], 'topDefl', 'bottom']);
  // no word on the pulley: above, direct, over a machine below
  survey = ROW({ arganoPreventivo: false, preventivoArgano: null });
  const alto = await avvioCalc(user, 'p1', { ...blankCalc(), layout: 'bottom' }, null, 'posizione');
  assert.deepEqual([alto.usa?.set, alto.usa?.messo], [['layout'], 'top']);
});

test('senza «rilievi:view»: nulla seminato, segnato o nominato', async () => {
  const { avvioCalc } = await forms();
  const blind = { ...user, caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'rilievi:view', granted: false }]) };
  const a = await avvioCalc(blind, 'p1', blankCalc(), 'new', 'Q', { rilievo: ['Q'], parte: true });
  assert.deepEqual([a.rilievo, a.origine, a.seeded, a.usa, a.start.Q], [null, null, [], null, '']);
});
