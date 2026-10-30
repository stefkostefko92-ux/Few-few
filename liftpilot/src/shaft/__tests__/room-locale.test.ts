// The machine room as a designer sets it out (round 36): the free height over the rotating parts (m_above), the free
// area by the handwheel (m_wheel), an existing room's height under UNI 10411-1 (m_hexist), the lifting hook's rated load
// and place, the reactions R1…Rn on the support's bearings, the slab's openings named and set out, section B-B with the
// door and the panel where it sees them, the upstands, the hitches, the hook and the mounts; the plan's light, switches,
// sockets, grille and trunking; the HEB beams on their bearing plates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '@/drawing';
import { DEFAULT_ROOM, KV_VERT, defaultInputs, layout, roomGeo, type MachineSpec, type MachineSupport, type ShaftInputs } from '../index';
import { aboveCheck, existingRoomCheck, rotatingTop, wheelAt, wheelCheck } from '../room-above';
import { freeBeside } from '../room-free';
import { hookLoad, hookOf } from '../room-hook';
import { reactionPoints, rigidShares, supportReactions } from '../room-reactions';
import { openingName, slabOpenings, askewOf, dropAngle } from '../room-setout';
import { layoutSite } from '../room-site';
import { panelSeen, seenFittings } from '../room-section-extra';
import { roomPlanEntities, roomSectionEntities } from '../room-view';
import { dropSpan } from '../machine-room';
import { mountsLines, mountsText } from '../room-mounts';
import { machineBox } from '../support-check';
import { HEB_PAD } from '../support';
import { hebDrawn } from '../heb';

const M: MachineSpec = { D: 400, Dp: 0, n: 5, d: 8, mass: 400, label: '', axis: 600, h: 0, reverse: false, ropeIn: 0 };
const inputs = (room: Partial<typeof DEFAULT_ROOM> = {}, I: Partial<ShaftInputs> = {}): ShaftInputs => ({ ...defaultInputs(1600, 1750), ...I, room: { ...DEFAULT_ROOM, ...room } });
const geo = (room: Partial<typeof DEFAULT_ROOM> = {}, I: Partial<ShaftInputs> = {}, m: MachineSpec = M) => {
  const L = layout(inputs(room, I)), G = roomGeo(L, m);
  assert.ok(G, 'locale macchina');
  return { L, G };
};
const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const texts = (es: readonly Entity[]): string[] => es.flatMap((e) => (e.e === 'text' ? [e.text] : e.e === 'tag' ? [e.text] : []));

test('m_above: 300 mm liberi sopra le parti rotanti non protette, avviso sotto', () => {
  const { G } = geo();
  const top = rotatingTop(G, M), ok = aboveCheck(G, M);
  assert.equal(ok.value, Math.round(G.room.H - top));
  assert.equal(ok.limit, KV_VERT.rotatingAbove);
  assert.equal(ok.status, 'ok');
  // the ceiling lowered to 200 mm over the highest rotating part: a warning (the parts may be guarded)
  const low = geo({ H: Math.ceil(top) + 200 }).G;
  assert.equal(aboveCheck(low, M).status, 'warn');
  // the sheave's rim with its ropes is among the rotating parts
  assert.ok(top >= M.axis + M.D / 2 + M.d);
});

test('m_wheel: la superficie libera accanto all’argano presso il volantino', () => {
  const { G } = geo(), w = wheelAt(G, M), box = machineBox(G, M), f = freeBeside(G.room, box, undefined, w);
  assert.ok(f.wheel <= KV_VERT.wheelReach, `${f.wheel}`);
  assert.equal(wheelCheck(f.wheel).status, 'ok');
  assert.equal(wheelCheck(KV_VERT.wheelReach + 1).status, 'warn');
  // the area is 500 × 600 (or 600 × 500), as deep as it needs
  const [x0, y0, x1, y1] = f.area, a = [x1 - x0, y1 - y0].sort((p, q) => p - q);
  assert.deepEqual(a, [Math.min(KV_VERT.maintW, KV_VERT.maintD), Math.max(KV_VERT.maintW, KV_VERT.maintD)]);
});

test('m_hexist: locale esistente sotto 2,0 m, avviso fino a 1,8 m più l’imbottitura, poi non passa', () => {
  assert.equal(existingRoomCheck({ H: 2000 }).status, 'ok');
  const warn = existingRoomCheck({ H: 1900 });
  assert.deepEqual([warn.status, warn.limit], ['warn', KV_VERT.existingRoomMin]);
  const fail = existingRoomCheck({ H: 1840 });
  assert.deepEqual([fail.status, fail.limit], ['fail', KV_VERT.existingRoomPad + KV_VERT.existingPadding]);
});

test('gancio: portata del pezzo più pesante arrotondata per eccesso, sopra il baricentro dell’argano', () => {
  assert.equal(hookLoad(450), KV_VERT.hookMin);
  assert.equal(hookLoad(1000), 1000);
  assert.equal(hookLoad(1001), 1500);
  const { G } = geo(), h = hookOf(G, M), old = hookOf(G, M, [1250]);
  assert.equal(h.load, KV_VERT.hookMin);
  // a replacement lifts the existing machine too
  assert.equal(old.load, 1500);
  assert.ok(Math.abs(h.u - (G.frame0 + G.frame1) / 2) < 1e-6 && Math.abs(h.v - (G.across[0] + G.across[1]) / 2) < 1e-6);
  assert.equal(h.eye, G.room.H - KV_VERT.hookDrop);
});

test('reazioni R1…Rn: la somma è il carico, il corpo rigido le ripartisce con la leva', () => {
  // a load at the middle of four corners: a quarter each; off-centre, the nearer corners take more
  assert.deepEqual(rigidShares([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [500, 500], 400).map((x) => Math.round(x)), [100, 100, 100, 100]);
  const off = rigidShares([[0, 0], [1000, 0]], [750, 0], 400);
  assert.deepEqual(off.map((x) => Math.round(x)), [100, 300]);
  const load = { machine: 400, static: 2000, dyn: 2 };
  for (const support of [{ kind: 'shims' }, { kind: 'frame' }, { kind: 'plates' }, { kind: 'plinth' }] as MachineSupport[]) {
    const { G } = geo({ support }), r = supportReactions(G, M, load);
    const total = r.R.reduce((a, b) => a + b, 0), F = ((load.machine + load.static * load.dyn) * 9.81) / 10;
    assert.equal(r.on, 'slab', support.kind);
    assert.ok(Math.abs(total - F) < 1e-6 * F, `${support.kind}: ${total} ≠ ${F}`);
    assert.equal(reactionPoints(G, M).length, r.R.length, support.kind);
  }
  // beams from wall to wall: in the walls, with their own weight
  const { G } = geo({ support: { kind: 'beams', profile: 'IPE 240' } }), r = supportReactions(G, M, load);
  assert.equal(r.on, 'walls');
  assert.ok(r.R.reduce((a, b) => a + b, 0) > ((load.machine + load.static * load.dyn) * 9.81) / 10);
});

test('fori nella soletta: misura «FORO L×P» e centro; la linea delle calate obliqua con il suo angolo', () => {
  const { L, G } = geo(), S = layoutSite(L), ops = slabOpenings(S, M, G);
  assert.ok(ops.length >= 1);
  for (const o of ops) assert.match(openingName(o, G), /^FORO \d+×\d+$/);
  const plan = texts(roomPlanEntities(L, M, G).entities);
  assert.ok(plan.some((t) => t.startsWith('FORO ')), 'foro nominato in pianta');
  assert.equal(askewOf(G), false);
  const sk = geo({}, { cw: 'left', plan: { cwPos: 300 } }).G;
  assert.equal(askewOf(sk), true);
  assert.ok(dropAngle(sk) > 0 && dropAngle(sk) <= 45);
});

test('pianta: luce, interruttore, prese, griglia di aerazione, canalina, gancio, R1…Rn e quote da due muri', () => {
  const { L, G } = geo(), es = roomPlanEntities(L, M, G).entities;
  const marks = new Set(es.flatMap((e) => (e.e === 'mark' ? [e.sym] : [])));
  for (const s of ['light', 'switch', 'socket', 'vent', 'hook'] as const) assert.ok(marks.has(s), s);
  assert.ok(es.some((e) => e.e === 'line' && e.st === 'hidden'), 'canalina');
  const tags = es.flatMap((e) => (e.e === 'tag' ? [e.text] : []));
  for (let i = 1; i <= reactionPoints(G, M).length; i++) assert.ok(tags.includes(`R${i}`), `R${i}`);
  const named = chains(es).flatMap((c) => c.text ?? []);
  for (const t of ['Telaio', 'Gancio']) assert.ok(named.some((x) => x?.endsWith(t)), t);
  assert.ok(texts(es).some((t) => t.startsWith('GANCIO DI SOLLEVAMENTO · PORTATA')));
});

test('sezione B-B: porta e quadro dalla parte in cui si vedono, bordi dei fori, gancio, spazio sopra le parti rotanti, antivibranti', () => {
  const { L, G } = geo(), R = G.room, [r0, r1] = dropSpan(G, 0, 0, R.W, R.D), fit = seenFittings(G, r0, r1);
  const es = roomSectionEntities(L, M, G).entities, cs = chains(es);
  // the default room: the door on the front wall, seen on the left; the panel behind the view, its height on the plan
  assert.equal(fit.door, 'left');
  assert.equal(fit.panel, null);
  assert.equal(panelSeen(G), false);
  const door = cs.find((c) => c.text?.some((t) => t?.includes('H. Porta')));
  assert.equal(door?.side, 'left');
  assert.ok(!cs.some((c) => c.text?.some((t) => t?.includes('H. Quadro'))), 'il quadro non si vede');
  assert.ok(chains(roomPlanEntities(L, M, G).entities).some((c) => c.text?.some((t) => t?.includes(`H. ${R.panelH}`))), 'altezza del quadro in pianta');
  // the upstands round the openings, 50 mm high
  assert.ok(es.some((e) => e.e === 'path' && e.fill === 'concrete' && Math.abs(Math.max(...e.pts.map(([, z]) => z)) - KV_VERT.slabKerb) < 1e-6), 'bordo');
  assert.ok(cs.some((c) => c.text?.[0] === '{v} Bordo'));
  assert.ok(cs.some((c) => c.text?.[0] === `{v} (≥ ${KV_VERT.rotatingAbove})`), 'spazio sopra le parti rotanti');
  const t = texts(es);
  assert.ok(t.some((x) => x.startsWith('Gancio, portata')), 'gancio');
  assert.ok(t.some((x) => x.includes('antivibranti')), 'antivibranti');
  // the panel on the left wall, beyond the cut: drawn, its height on its side
  const side = geo({ panelWall: 'left', panelAt: 900 }).G, [s0, s1] = dropSpan(side, 0, 0, side.room.W, side.room.D);
  assert.notEqual(seenFittings(side, s0, s1).panel, null);
});

test('taglia 2:1: attacchi sotto la soletta con P2 e P3 in sezione e in pianta', () => {
  // (the ropes down to the car's and the counterweight's pulleys half a pulley in from the hitches)
  const m2: MachineSpec = { ...M, ropeIn: 150 };
  const L = layout(inputs()), G = roomGeo(L, m2);
  assert.ok(G);
  assert.equal(G.deadEnds.length, 2);
  for (const es of [roomSectionEntities(L, m2, G).entities, roomPlanEntities(L, m2, G).entities]) {
    const tags = es.flatMap((e) => (e.e === 'tag' ? [e.text] : []));
    assert.ok(tags.includes('P2') && tags.includes('P3'));
  }
});

test('antivibranti e fissaggi: quanti, dove, del costruttore, da verificare', () => {
  for (const support of [{ kind: 'shims' }, { kind: 'frame' }, { kind: 'plinth' }] as MachineSupport[]) {
    const { G } = geo({ support }), text = mountsText(G, M), [a, b] = mountsLines(G, M);
    assert.match(text, /^N\. \d+ antivibranti/);
    assert.ok(text.includes('strutturista') && b.includes('strutturista') && a.includes('costruttore'), support.kind);
  }
});

test('putrelle HEB su piastre e malta: l’argano più alto della piastra e del letto, le piastre negli appoggi', () => {
  assert.equal(HEB_PAD, KV_VERT.hebPlateT + KV_VERT.hebMortar);
  const { L, G } = geo({ support: { kind: 'frame' }, heb: {} });
  const S = layoutSite(L), heb = hebDrawn(G, M, S, S.govRopes);
  assert.ok(heb, 'putrelle');
  const named = chains(roomPlanEntities(L, M, G).entities).flatMap((c) => c.text ?? []);
  assert.ok(named.includes('{v} Appoggio') && named.includes('{v} Asse HEB'), 'appoggio e assi in pianta');
  const sec = roomSectionEntities(L, M, G).entities;
  assert.ok(texts(sec).some((t) => t.includes(`${KV_VERT.hebPlateW}×${KV_VERT.hebPlateT}`)), 'piastre in sezione');
});
