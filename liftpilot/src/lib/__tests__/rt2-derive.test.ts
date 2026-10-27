// The RT after the owner's model derived and laid out (round 52): the components the modification brings (the parts
// replaced, the changes of the loads and of the speed — the model's hints made binding), the documents proposed, what is
// missing to issue, and the fascicolo's pages in the model's order — the cover, «Dati Generali», each component, «Allegati».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { deriveRt2 } from '@/lib/rt2/derive';
import type { Rt2Inputs } from '@/lib/rt2/input';
import { buildFascicolo } from '@/lib/report/rt2/build';
import { V_BASE } from './rt2-fixtures';

const DOC: Rt2Inputs['doc'] = { data: '2026-10-27', commessa: '26-015', costruttore: 'Esempio', utentiEsperti: 'no', annoRealizzazione: '2026',
  ascensorista: 'Elevatori Esempio S.r.l.', componentiModificati: 'Sostituzione dell’argano e delle funi di trazione.' };
const FIRME: Rt2Inputs['firme'] = { redatto: { nome: 'Mario Rossi' }, verificato: { titolo: 'Ing.', nome: 'Laura Bianchi', provincia: 'Brescia', numero: 'A1', sezione: 'A' } };
const base = (c: Partial<Collaudo>) => {
  const C = collaudoOf(V_BASE, { norma: '10411-1', parti: ['machine', 'ropes'], ...c } as Collaudo);
  return { V: V_BASE, C, res: null, anagrafica: { proprietario: { nome: 'Condominio Esempio' }, legge: 'dpr_1497_1963' as const } };
};

test('rt2-derive: solo argano senza variazioni — macchina e funi, i documenti dell’argano e delle funi', () => {
  const d = deriveRt2(base({ documentato: { Q: 630, P: 900, Mcw: 1215 }, libretto: { v: 1, H: 20 } }), { doc: DOC, firme: FIRME });
  assert.deepEqual(d.componenti, ['funi', 'macchina']);
  assert.deepEqual(d.richiesti.map((r) => r.id), ['funi', 'macchina']);
  assert.ok(d.allegati.includes('ceArgano') && d.allegati.includes('funiTrazione') && !d.allegati.includes('idoneitaEdificio'));
  assert.deepEqual(d.mancanti, []);
});

test('rt2-derive: velocità oltre il 5 % e carico oltre il prospetto 1 portano i componenti e la dichiarazione dell’edificio', () => {
  const d = deriveRt2(base({ documentato: { Q: 480, P: 800, Mcw: 1040 }, libretto: { v: 0.7, H: 20 } }), { doc: DOC, firme: FIRME });
  const ids = d.richiesti.map((r) => r.id);
  for (const c of ['funi', 'guideCabina', 'ammCabina', 'contrappeso', 'ammCwt', 'limitatore', 'macchina'] as const) assert.ok(ids.includes(c), c);
  assert.ok(d.allegati.includes('idoneitaEdificio'));
});

test('rt2-derive: contrappeso oltre il prospetto 2 — la dichiarazione dell’edificio proposta, le pagine rimandano a essa (risposta 6)', () => {
  const x = { doc: DOC, firme: FIRME }, b = base({ documentato: { Q: 630, P: 900, Mcw: 1000 }, libretto: { v: 1, H: 20 } });
  const d = deriveRt2(b, x);
  assert.ok(d.ctx.carico?.p2 && !d.ctx.carico.p1);
  assert.ok(d.allegati.includes('idoneitaEdificio'), 'proposta «se pertinente»');
  const testo = (y: Rt2Inputs, dd = deriveRt2(b, y)): string => JSON.stringify(buildFascicolo(dd, y, { matricola: 'BS 1', indirizzo: 'Via Roma 1', capCitta: '25100 Brescia (BS)',
    proprietario: 'Condominio Esempio', azienda: 'Elevatori Esempio S.r.l.', logo: null, numero: 'RT 26-002 R0' }, [], { code: 'RT 26-002 R0' }, null).blocks);
  const con = testo(x);
  assert.ok(con.includes('variano i carichi sulle strutture portanti') && !con.includes('ritenute non significative'), 'allegata: rimanda');
  // the engineer leaves it out: the pages declare the forces non-significant
  const senza = testo({ ...x, dichiarati: { idoneitaEdificio: false } });
  assert.ok(senza.includes('ritenute non significative') && !senza.includes('variano i carichi sulle strutture portanti'), 'tolta: dichiara');
});

test('rt2-derive: mancano le firme e la descrizione, il proprietario e la norma di collaudo', () => {
  const C = collaudoOf(V_BASE, { norma: '10411-1', parti: ['machine'] } as Collaudo);
  const d = deriveRt2({ V: V_BASE, C, res: null, anagrafica: {} }, {});
  const campi = d.mancanti.map((m) => m.campo);
  for (const c of ['doc.componentiModificati', 'firme.redatto.nome', 'firme.verificato.numero', 'anagrafica.proprietario.nome', 'anagrafica.legge']) assert.ok(campi.includes(c), c);
});

test('rt2-derive: il fascicolo — copertina, Dati Generali, i componenti, Allegati', () => {
  const d = deriveRt2(base({ documentato: { Q: 630, P: 900, Mcw: 1215 }, libretto: { v: 1, H: 20 } }), { doc: DOC, firme: FIRME });
  const doc = buildFascicolo(d, { doc: DOC, firme: FIRME }, { matricola: 'BS 1', indirizzo: 'Via Roma 1', capCitta: '25100 Brescia (BS)', proprietario: 'Condominio Esempio',
    azienda: 'Elevatori Esempio S.r.l.', logo: null, numero: 'RT 26-001 R0' }, [], { code: 'RT 26-001 R0' }, null);
  assert.equal(doc.blocks[0]?.t, 'copertina');
  // Dati Generali, Funi (2), Macchina, Allegati
  assert.equal(doc.blocks.filter((b) => b.t === 'pagina').length, 5);
  const text = JSON.stringify(doc.blocks);
  assert.ok(text.includes('Il presente fascicolo si compone di: {PAGINE} pagine') && text.includes('Documenti allegati alla seguente relazione :'));
  assert.ok(!/undefined|NaN|\[object/.test(text));
  assert.equal(doc.meta.norma, 'UNI 10411-1:2024');
});
