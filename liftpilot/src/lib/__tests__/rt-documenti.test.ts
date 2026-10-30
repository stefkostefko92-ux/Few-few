// The documents the relazione tecnica di modifica expects and the building's structures (round 49, RT plan §4.5 and
// §4.8): each document by the parts, the cases and the sections, with the clause of UNI 10411-1 App. C or -11 App. A;
// the file that is a document — the engineer's choice, else the one file of its kind and component when no other open
// document could take it; the structures never an unconditional «no change».
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { $Enums } from '@prisma/client';
import { PRESETS } from '@/calc/presets';
import type { Parte } from '@/lib/lift/collaudo';
import type { Carichi, Norma10411 } from '@/lib/lift/modifica';
import { DOCUMENTI, documentiOf, struttureRt, type BaseDocumenti } from '@/lib/rt/documenti';
import type { RtInputs } from '@/lib/rt/input';
import { sezioniOf } from '@/lib/rt/sezioni';
import { ALLEGATO_KINDS, COMPONENTI, DOCUMENTO_IDS, type AllegatoKind, type Componente, type RtAllegato } from '@/lib/rt/types';

const DOC: Carichi = { Q: 630, P: 700, Mcw: 1015 };
const base = (norma: Norma10411, parti: readonly Parte[], o: { path?: 'locale' | 'vano'; doc?: Carichi; V?: Record<string, number>; car?: 'spring' | 'pu' | 'oil'; H?: number } = {}): BaseDocumenti => ({
  path: o.path ?? 'locale', norma, collaudo: { norma, parti, documentato: o.doc ?? DOC, libretto: { v: 1, H: o.H ?? 18 } }, values: { ...PRESETS.B, ...o.V },
  ...(o.path === 'vano' ? { lift: { layout: { inputs: { room: null, vertical: { carBufferType: o.car } } } } } : {}),
});
const ids = (b: BaseDocumenti, inputs: RtInputs = {}, allegati: readonly RtAllegato[] = []): string[] =>
  documentiOf(b, sezioniOf(b, inputs), inputs, allegati).map((d) => d.id);
const file = (position: number, kind: AllegatoKind, component: Componente | null): RtAllegato =>
  ({ position, attachmentId: `f${position}`, kind, title: `File ${position}`, component, sha256: 'a'.repeat(64), pages: 1, mime: 'application/pdf' });

test('rt-documenti: il registro dei documenti attesi; i tipi dei file sono quelli della base (AttachmentKind, migrazione 27)', () => {
  assert.deepEqual(Object.values($Enums.AttachmentKind), [...ALLEGATO_KINDS]);
  assert.deepEqual(DOCUMENTI.map((d) => d.id), [...DOCUMENTO_IDS]);
  for (const d of DOCUMENTI) {
    assert.ok(ALLEGATO_KINDS.includes(d.kind), d.id);
    assert.ok(d.componenti.length && d.componenti.every((c) => COMPONENTI.includes(c)), d.id);
    assert.match(d.clausola['10411-1'], /^UNI 10411-1:2024, /);
    assert.match(d.clausola['10411-11'], /^UNI 10411-11:2024, /);
  }
});

test('rt-documenti: lo schizzo di rilievo (migrazione 29) prima di ALTRO, nello schema e nella migrazione, solo aggiunto', () => {
  assert.deepEqual(ALLEGATO_KINDS.slice(-3), ['FOTO', 'SCHIZZO', 'ALTRO']);
  const sql = readFileSync(new URL('../../../prisma/migrations/29_schizzi/migration.sql', import.meta.url), 'utf8');
  const statements = sql.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
  assert.deepEqual(statements, [`ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'SCHIZZO' BEFORE 'ALTRO';`]);
  assert.match(sql, /-- Rollback/);
});

test('rt-documenti: per parti, casi e sezioni', () => {
  // «Solo argano»: the machine's data and the inverter's setting (-1), the ropes' certificates, the logbook
  assert.deepEqual(ids(base('10411-1', ['machine', 'ropes'])), ['macchina_ue', 'taratura', 'funi_cert', 'libretto']);
  assert.deepEqual(ids(base('10411-11', ['machine', 'ropes'])), ['macchina_ue', 'funi_cert', 'libretto'], '-11: la taratura con il quadro (App. A 11.1)');
  // the controller: wiring diagram, its safety devices, inverter's setting, the alarm's statement (-1 App. C 11.1)
  assert.deepEqual(ids(base('10411-1', ['controller'])), ['schema', 'quadro_ue', 'taratura', 'allarme_ue', 'libretto']);
  assert.deepEqual(ids(base('10411-11', ['controller'])), ['schema', 'quadro_ue', 'taratura', 'libretto']);
  // governor and gear new; the travel up brings the governor rope's certificate
  // (the new gear brings the car rails' section, 15.6: their anchorages too)
  assert.deepEqual(ids(base('10411-1', ['governor', 'safetyGear'])), ['limitatore_ue', 'limitatore_cet', 'limitatore_fune', 'paracadute_cet', 'ancoraggi', 'libretto']);
  assert.deepEqual(ids(base('10411-11', ['governor'])), ['limitatore_ue', 'limitatore_cet', 'limitatore_fune', 'libretto']);
  assert.ok(ids(base('10411-1', ['machine', 'travel'], { path: 'vano', H: 15 })).includes('limitatore_fune'), 'corsa allungata di 3 m');
  // the speed up keeps the gear with its type certificate (-1 15.3), and the rails' anchorages (15.5)
  const up = ids(base('10411-1', ['machine', 'speed'], { path: 'vano', V: { v: 1.08 } }));
  for (const d of ['paracadute_cet', 'ancoraggi'] as const) assert.ok(up.includes(d), d);
  // buffers: a certificate for polyurethane or hydraulic ones, none for springs (the section is the calculation)
  assert.ok(ids(base('10411-1', ['machine', 'speed'], { path: 'vano', V: { v: 1.08 }, car: 'oil' })).includes('ammortizzatori_cet'));
  assert.ok(!up.includes('ammortizzatori_cet'), 'molle: nessun certificato');
  const pu: RtInputs = { componenti: { ammortizzatori: { cabina: { tipo: 'pu' } } } };
  assert.ok(ids(base('10411-1', ['buffers']), pu).includes('ammortizzatori_cet'));
  assert.ok(!ids(base('10411-1', ['machine']), pu).includes('ammortizzatori_cet'), 'senza la sezione degli ammortizzatori');
  // landing doors: locks' certificates, fire classification only with a class
  assert.deepEqual(ids(base('10411-1', ['landingDoors'])), ['serrature_cet', 'libretto']);
  assert.ok(ids(base('10411-1', ['landingDoors']), { componenti: { porte: { piano: { fuocoEsistente: 'E60' } } } }).includes('porte_fuoco'));
  assert.ok(!ids(base('10411-1', ['landingDoors']), { componenti: { porte: { piano: { fuocoEsistente: 'nessuna', fuocoNuova: 'nessuna' } } } }).includes('porte_fuoco'));
  // the logbook always, recommended
  const lib = documentiOf(base('10411-1', ['machine']), [], {}, []).find((d) => d.id === 'libretto');
  assert.deepEqual([lib?.consigliato, lib?.stato], [true, 'da_allegare']);
});

test('rt-documenti: le strutture dell’edificio', () => {
  // beyond prospetto 1 (6.3): the owner's declaration
  const p1 = struttureRt(base('10411-1', ['load'], { doc: { Q: 400, P: 600, Mcw: 825 }, V: { Q: 450, P: 600, k: 0.5 } }), {});
  assert.deepEqual([p1.esito, p1.documento], ['documento', true]);
  // the machine new: the engineer's answer about the forces
  assert.deepEqual(struttureRt(base('10411-1', ['machine']), {}).esito, 'manca_risposta');
  assert.deepEqual(struttureRt(base('10411-1', ['machine']), {}).domande, ['forze']);
  assert.deepEqual(struttureRt(base('10411-1', ['machine']), { strutture: { forze: 'non_aumentano' } }).esito, 'dichiarazione');
  assert.deepEqual(struttureRt(base('10411-1', ['machine']), { strutture: { forze: 'aumentano' } }).esito, 'documento');
  // the layout changed brings the question without a new machine
  assert.deepEqual(struttureRt(base('10411-1', ['controller']), { doc: { layoutModificato: true } }).domande, ['forze']);
  // nothing calls point 5
  assert.deepEqual(struttureRt(base('10411-1', ['controller']), {}), { esito: 'non_richiamato', documento: false, domande: [], motivi: [] });
  // -11: within 10 % point 5 not applied (6.2), beyond it the declaration
  assert.equal(struttureRt(base('10411-11', ['load'], { doc: { Q: 600, P: 700, Mcw: 1015 } }), {}).esito, 'non_applicato');
  assert.equal(struttureRt(base('10411-11', ['load'], { doc: { Q: 500, P: 600, Mcw: 1015 } }), {}).esito, 'documento');
  // the documents follow
  assert.ok(ids(base('10411-1', ['machine']), { strutture: { forze: 'aumentano' } }).includes('idoneita_strutture'));
  assert.ok(!ids(base('10411-1', ['machine']), { strutture: { forze: 'non_aumentano' } }).includes('idoneita_strutture'));
});

test('rt-documenti: quale file è quale documento', () => {
  const b = base('10411-1', ['controller', 'governor', 'safetyGear']);
  const files = [file(1, 'SCHEMA_ELETTRICO', 'quadro'), file(2, 'CERTIFICATO_ESAME_TIPO', 'limitatore'), file(3, 'LIBRETTO_VERBALE', 'impianto')];
  const by = (inputs: RtInputs, f = files) => Object.fromEntries(documentiOf(b, sezioniOf(b, inputs), inputs, f).map((d) => [d.id, [d.stato, d.allegato?.position ?? null, d.allegato?.scelto ?? null]]));
  const auto = by({});
  assert.deepEqual(auto.schema, ['allegato', 1, false]);
  assert.deepEqual(auto.libretto, ['allegato', 3, false]);
  // the governor's and the gear's type certificates could both be file 2: neither is chosen by the software
  assert.deepEqual([auto.limitatore_cet, auto.paracadute_cet], [['da_allegare', null, null], ['da_allegare', null, null]]);
  const scelti = by({ documenti: { limitatore_cet: 'f2', quadro_ue: 'separato', schema: 'altro' } });
  assert.deepEqual(scelti.limitatore_cet, ['allegato', 2, true]);
  assert.deepEqual(scelti.paracadute_cet, ['da_allegare', null, null], 'il file scelto per un altro documento non si prende');
  assert.deepEqual(scelti.quadro_ue, ['separato', null, null]);
  assert.deepEqual(scelti.schema, ['allegato', 1, false], 'un file che non è della relazione è ignorato');
  // a file without a component is never matched by itself
  assert.deepEqual(by({}, [file(1, 'SCHEMA_ELETTRICO', null)]).schema, ['da_allegare', null, null]);
});

test('rt-documenti: limitatore con la velocità aumentata (15.13), ACOP e UCM (6.12, 15.4; -11 6.10), paracadute progressivo con i carichi diminuiti (6.1)', () => {
  // -1, the speed up: the kept governor's type certificate (App. C (15), 15.13) and the ACOP's (15.4)
  const up = ids(base('10411-1', ['machine', 'speed'], { path: 'vano', V: { v: 1.08 } }));
  for (const d of ['limitatore_cet', 'acop_cet'] as const) assert.ok(up.includes(d), d);
  assert.ok(!up.includes('limitatore_ue'), 'la dichiarazione UE solo con il limitatore nuovo');
  // -11, the speed changed: only a new ACOP or governor brings their certificates (App. A (15) c), f))
  const up11 = ids(base('10411-11', ['machine', 'speed'], { path: 'vano', V: { v: 1.08 } }));
  for (const d of ['limitatore_cet', 'acop_cet'] as const) assert.ok(!up11.includes(d), d);
  // new ACOP and UCM protections under both parts
  for (const n of ['10411-1', '10411-11'] as const) assert.ok(ids(base(n, ['ucm'])).includes('acop_cet'), n);
  const acop = DOCUMENTI.find((d) => d.id === 'acop_cet');
  assert.deepEqual([acop?.kind, acop?.componenti[0], acop?.clausola['10411-11']], ['CERTIFICATO_ESAME_TIPO', 'argano', 'UNI 10411-11:2024, 6.10, 15 c) e App. A (6, 14, 15)']);
  // T* and the counterweight decreased under -1: the progressive gear's certificate (6.1), not with another gear
  const calo = base('10411-1', ['machine', 'load'], { doc: { Q: 630, P: 800, Mcw: 1200 } });
  const con = (gear: 'progressive' | 'instantaneous' | undefined): string[] => documentiOf(calo, sezioniOf(calo, {}), {}, [], gear).map((d) => d.id);
  assert.ok(con('progressive').includes('paracadute_cet'));
  assert.ok(!con('instantaneous').includes('paracadute_cet'));
  assert.ok(!con(undefined).includes('paracadute_cet'), 'tipo non noto: il punto in sito lo chiede');
});
