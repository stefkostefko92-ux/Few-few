// The relazione tecnica di modifica after the norm review of round 49 (fix step): under -11 the lock contacts' rule of
// UNI 10411-1 11.1.2 is not applied and each voltage row cites its own clause; under -11 the counterweight increased
// brings the gear (6.6) and the -11 texts of 6.6/6.7 are checks for the new loads; T* or the counterweight decreased
// prints the progressive gear's point (6.1); the speed increased under -1 says the governor of 15.13 is computed in its
// section; the rails cite UNI EN 81-1:2008 G.2.5 only without the lift's use; with the speed or the travel changed the
// crosshead, the standing place and the buffers' place are requirements (15.11, 16 j)); the kept car's area is an
// information. The SCENARI of the golden, with the context changed where a case is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOCI_VANO } from '@/shaft/norme';
import { OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import { carichiOf } from '@/lib/lift/modifica';
import type { CasoVariazione } from '@/lib/lift/obblighi-variazioni';
import type { Parte } from '@/lib/lift/collaudo';
import type { Plant } from '@/lib/plant';
import { deriveRt } from '@/lib/rt/derive';
import { SENZA_USO, refOf, type RtCtx } from '@/lib/rt/componenti/comune';
import { SPAZI_RT, vano } from '@/lib/rt/componenti/contrappeso';
import { limitatore } from '@/lib/rt/componenti/limitatore';
import { LIMITATORE_NON_CALCOLATO, SITO_RT, testoRt } from '@/lib/rt/componenti/punti';
import { quadro } from '@/lib/rt/componenti/quadro';
import { casiOf, sezioniOf } from '@/lib/rt/sezioni';
import type { RtInputs } from '@/lib/rt/input';
import { SCENARI, type Scenario } from './fixtures/rt/scenari';

const scenario = (nome: string): Scenario => {
  const s = SCENARI.map((f) => f()).find((x) => x.nome === nome);
  assert.ok(s, nome);
  return s;
};

/** The context deriveRt builds, with the parts, the cases, the plant data or the inputs changed. */
function ctx(s: Scenario, o: { parti?: readonly Parte[]; casi?: readonly CasoVariazione[]; plant?: Partial<Plant>; inputs?: RtInputs } = {}): RtCtx {
  const base = o.parti ? { ...s.base, collaudo: { ...s.base.collaudo, parti: [...o.parti] } } : s.base, inputs = o.inputs ?? s.inputs;
  return {
    base, inputs, plant: { ...s.plant, ...o.plant }, anagrafica: s.anagrafica, allegati: s.allegati, sezioni: sezioniOf(base, inputs).map((x) => x.key),
    norma: base.norma, parti: base.collaudo.parti, casi: o.casi ?? casiOf(base), I: base.analysis.ctx.I, Mcw: base.analysis.res.Mcw, carichi: carichiOf(base.values),
  };
}

test('quadro: i contatti delle serrature (25/50 V) solo con la UNI 10411-1; ogni tensione con la sua clausola', () => {
  const v = scenario('vano-ammodernamento-velocita'), d = deriveRt(v.base, v.inputs, v.anagrafica, v.plant, v.allegati);
  assert.equal(d.checks.find((c) => c.id === 'rt_ctrl_voltage')?.ref, 'UNI EN 81-20:2020, 5.10.1.3.2');
  assert.equal(d.checks.find((c) => c.id === 'rt_lock_voltage')?.ref, 'UNI 10411-1:2024, 11.1.2');
  // the same controller data on a CE-marked lift (-11) with a new controller: no lock row, no datum, nothing missing for it
  const ce = scenario('vano-ce-carico'), q = v.inputs.componenti?.quadro;
  const x = ctx(ce, { parti: [...ce.base.collaudo.parti, 'controller'], inputs: { ...ce.inputs, componenti: { ...ce.inputs.componenti, quadro: q } } });
  const e = quadro(x);
  assert.deepEqual(e.checks.filter((c) => c.id.startsWith('rt_')).map((c) => [c.id, c.ref]), [['rt_ctrl_voltage', 'UNI EN 81-20:2020, 5.10.1.3.2']]);
  assert.ok(!e.componente.dati.some((c) => ['tensioneContattiSerrature', 'correnteContatti', 'impiantoElettrico'].includes(c.voce)));
  assert.deepEqual(e.mancanti, []);
  // under -1 the missing electrical part is still asked
  const y = quadro(ctx(v, { inputs: { ...v.inputs, componenti: { quadro: { tensioneComando: 230, correnteComando: 'ca' } } } }));
  assert.ok(y.mancanti.some((m) => m.campo === 'componenti.quadro.impiantoElettrico'));
});

test('limitatore: con la -11 il contrappeso aumentato porta il paracadute (6.1 con 6.6); 6.6 e 6.7 come verifiche per i nuovi carichi', () => {
  const ce = scenario('vano-ce-carico');
  const e = limitatore(ctx(ce, { casi: ['loadP2'] }));
  assert.equal(e.checks.find((c) => c.id === 'sg_type')?.ambito, 'richiesta');
  const p = e.punti.find((x) => x.punto.rif === 'UNI 10411-11:2024, 6.6');
  assert.ok(p, 'il punto 6.6');
  assert.match(p.punto.testo, /verificati per i nuovi carichi/);
  assert.doesNotMatch(p.punto.testo, /certificato|velocità nominale/, 'il certificato per T*, velocità e guide è della -1');
  assert.match(SITO_RT.paracaduteCet('10411-1').testo, /certificato d’esame del tipo valido per il nuovo T\*/);
  assert.doesNotMatch(SITO_RT.limitatoreCet('10411-11').testo, /5\.6\.2/);
  // under -1 the counterweight beyond prospetto 2 brings no gear point (6.4, 6.5, 6.8, 6.13–6.15)
  const p1 = scenario('locale-solo-argano-p1');
  assert.ok(!limitatore(ctx(p1, { casi: ['loadP2'] })).punti.some((x) => x.punto.rif.endsWith(', 6.6')));
});

test('limitatore: T* o contrappeso diminuiti — il punto del paracadute progressivo (6.1), nessuno con un altro tipo', () => {
  const s = scenario('locale-solo-argano-p1'), rif = 'UNI 10411-1:2024, 6.1';
  const punti = (gear: Plant['safetyGear']) => limitatore(ctx(s, { casi: ['loadCalo'], plant: { safetyGear: gear } })).punti.filter((p) => p.punto.rif === rif).map((p) => p.punto.testo);
  assert.deepEqual(punti('progressive'), [SITO_RT.paracaduteCalo('10411-1').testo]);
  assert.deepEqual(punti(undefined), [SITO_RT.paracaduteCalo('10411-1').testo], 'tipo non noto: il punto dice «se a presa progressiva»');
  assert.deepEqual(punti('instantaneous'), [SITO_RT.paracaduteCaloAltro('10411-1').testo]);
  assert.match(SITO_RT.paracaduteCalo('10411-1').testo, /UNI EN 81-20 5\.6\.2.*P \+ Q/);
  assert.match(SITO_RT.paracaduteCalo('10411-11').testo, /verificato per i nuovi carichi/);
});

test('velocità aumentata con la -1: il limitatore della 15.13 è calcolato nella sua sezione, non tra i «non calcolati»', () => {
  const o = OBBLIGHI_VARIAZIONI['10411-1'].speedUp;
  assert.ok(o?.testo.includes(LIMITATORE_NON_CALCOLATO), 'il testo della relazione di calcolo resta');
  const t = testoRt(o ?? { rif: '', testo: '', stato: 'confermato' });
  assert.ok(!t.testo.includes(LIMITATORE_NON_CALCOLATO));
  assert.match(t.testo, /calcolati nella sezione del limitatore/);
  const v = scenario('vano-ammodernamento-velocita'), d = deriveRt(v.base, v.inputs, v.anagrafica, v.plant, v.allegati);
  const p = d.punti.find((x) => x.punto.rif === o?.rif);
  assert.equal(p?.punto.testo, t.testo);
  // the other texts pass unchanged
  const altro = OBBLIGHI_VARIAZIONI['10411-1'].loadP1;
  assert.ok(altro && testoRt(altro) === altro);
});

test('guide: UNI EN 81-1:2008 G.2.5 solo senza l’uso dell’ascensore nei dati dell’impianto', () => {
  assert.equal(VOCI_VANO.filter((v) => v.riferimento.includes(SENZA_USO)).length, 1, 'una sola voce porta la regola per portata');
  const v = scenario('vano-ammodernamento-velocita');
  assert.ok(!refOf(ctx(v), 'gr_stress').includes('UNI EN 81-1:2008'), 'uso dato (persone): la UNI EN 81-20 5.7.2.3.6');
  assert.ok(refOf(ctx(v, { plant: { liftUse: undefined } }), 'gr_stress').includes('UNI EN 81-1:2008, G.2.5'));
});

test('vano: con la velocità aumentata la traversa, il posto in piedi e gli ammortizzatori in pianta sono richiesti (15.11, 16 j))', () => {
  assert.deepEqual(Object.keys(SPAZI_RT), ['h_cross', 'h_stand', 'v_buffer']);
  const v = scenario('vano-ammodernamento-velocita'), d = deriveRt(v.base, v.inputs, v.anagrafica, v.plant, v.allegati);
  for (const id of ['h_cross', 'h_stand', 'v_buffer']) assert.equal(d.checks.find((c) => c.id === id)?.ambito, 'richiesta', id);
  // without speed, travel or a part of the headroom (a new controller and governor only) they stay the existing lift's
  const e = vano(ctx(v, { parti: ['controller', 'governor'] }));
  for (const id of ['h_cross', 'h_stand', 'v_buffer']) assert.equal(e.checks.find((c) => c.id === id)?.ambito, 'esistente', id);
});

test('cabina che resta: entro il prospetto 6 un’informazione, mai «Soddisfatta», con il riferimento della UNI EN 81-20 come lettura', () => {
  const p1 = scenario('locale-solo-argano-p1'), d = deriveRt(p1.base, p1.inputs, p1.anagrafica, p1.plant, p1.allegati);
  const c = d.checks.find((x) => x.id === 'rt_area_kept');
  assert.equal(c?.status, 'info');
  assert.ok(c?.ref.startsWith('UNI EN 81-20:2020, 5.4.2.1 (prospetto 6; lettura del software'), c?.ref);
  assert.ok(!c?.ref.includes('UNI 10411-1'), 'la UNI 10411 non la chiede');
});
