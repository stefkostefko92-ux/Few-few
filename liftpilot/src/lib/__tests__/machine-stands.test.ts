// The machine never stands on posts (registry locale.telaio, locale.rinvio): on the bedplate with the diverting pulley
// ours carries the maker's machine with its feet straight on its irons — no frame of its own over it —, the maker's
// carries it on the maker's pedestal as the maker draws it (SICOR SH160 on XTE5708: 240 mm, the sheave's axis at
// 1050 mm); on a support on the floor our bedframe is as tall as the machine needs and no taller, and on shims the
// maker's machine takes the generic machine's levelling, not a stack raising it. The sheave's axis follows, and the
// calculation's h and L0 with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makerBedplate } from '@/lib/catalog/bedplates';
import { shapeOf } from '@/lib/catalog/shapes';
import { defaultLift, deriveLift, type LiftInputs } from '@/lib/lift';
import { KL } from '@/lib/lift/norme';
import { roomGeo } from '@/shaft/machine-room';
import { bodyBox, machineFrame } from '@/shaft/machine-shape';
import { KV_VERT } from '@/shaft/norme-vert';
import { sheaveAxisOn, supportHeight } from '@/shaft/support';
import { shapeRows } from '../report/machine-shape';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const made = (brand: 'SICOR' | 'Montanari', model: string, support?: Room['support']): LiftInputs => {
  const L = defaultLift(), R = L.shaft.room as Room;
  return { ...L, catalog: { brand, model }, shaft: { ...L.shaft, room: { ...R, ...(support ? { support } : {}) } } };
};
const fmt = (x: number, dp = 0): string => x.toFixed(dp);

test('telaio con rinvio nostro: i piedi dell’argano sui suoi ferri, nessun telaio proprio sopra', () => {
  const dv = deriveLift(made('Montanari', 'M93')), M = dv.machine, rf = M.rinvio, S = shapeOf('Montanari', 'M93');
  assert.ok(S && rf && rf.on === 'frame' && !rf.maker, 'il nostro telaio con rinvio');
  assert.equal(rf.bed, 0);
  const G = roomGeo(dv.layout, M);
  assert.ok(G);
  assert.equal(G.frame.on, 'bedplate');
  assert.equal(G.frame.bed, 0);
  // the sheave's axis: the bedplate's top and the machine's own over its feet; the calculation's h from it
  assert.equal(M.axis, rf.top + S.yWheel);
  assert.ok(Math.abs(Number(dv.values.h) - (M.axis - rf.pulleyAxis) / 1000) < 1e-9, `h ${dv.values.h}`);
  assert.equal(shapeRows(S, M.D, fmt, rf)[4][0], 'Appoggio sul basamento');
});

test('telaio con rinvio del costruttore: l’argano sul piedistallo del costruttore, come lo disegna lui', () => {
  const dv = deriveLift(made('SICOR', 'SH160')), M = dv.machine, rf = M.rinvio, S = shapeOf('SICOR', 'SH160');
  assert.ok(S && rf?.maker, 'XTE5708');
  const bp = makerBedplate('SICOR', 'SH160', M.D, M.Dp);
  assert.ok(bp);
  assert.equal(rf.bed, bp.sheaveAxis - bp.top - S.yWheel);
  assert.equal(rf.bed, 240, 'il piedistallo del foglio SICOR');
  const G = roomGeo(dv.layout, M);
  assert.ok(G);
  assert.equal(G.frame.on, 'pedestal');
  assert.equal(M.axis, 1050);
  assert.equal(shapeRows(S, M.D, fmt, rf)[4][0], 'Piedistallo sul basamento');
});

test('basamento a pavimento: il telaio alto quanto serve all’argano, mai su ritti; sugli spessori solo il livellamento', () => {
  const S = shapeOf('SICOR', 'SH140');
  assert.ok(S);
  for (const D of [400, 480, 600]) {
    const F = machineFrame(D, S), need = Math.max(KV_VERT.machineBed, D / 2 + KV_VERT.machineRimClear - S.yWheel, KV_VERT.machineRimClear - bodyBox(S)[1]);
    assert.equal(F.on, 'frame');
    assert.equal(F.bed, Math.ceil(need - 1e-9), `Ø ${D}`);
  }
  // on shims the levelling the generic machine takes, the maker's sheave where its frame puts it
  const D = 480, shims = supportHeight({ kind: 'shims' }, D, KL.sheaveAxisPerD * D, S);
  assert.ok(shims >= 0 && shims < 10, `spessori ${shims}`);
  assert.equal(sheaveAxisOn({ kind: 'shims' }, D, KL.sheaveAxisPerD * D, S), shims + machineFrame(D, S).axis);
  // the machine on a frame on the floor of the example: its frame as tall as it needs, the relazione says so
  const dv = deriveLift(made('SICOR', 'SH140', { kind: 'frame' })), G = roomGeo(dv.layout, dv.machine);
  assert.ok(G && G.frame.on === 'frame');
  assert.equal(shapeRows(S, dv.machine.D, fmt, dv.machine.rinvio ?? null)[4][0], 'Telaio sotto l’argano');
});
