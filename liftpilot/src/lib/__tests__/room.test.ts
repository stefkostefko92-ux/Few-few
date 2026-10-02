// The machine room of a machine replacement (src/lib/room): the new machine over the existing drops as its calculation
// places it, the bedplate made to the calculation's h, what stops a record, the checks and the verdict under the
// acceptance test, and its drawings — every editable dimension reads back what is typed, none changes the calculation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import type { Chain, Entity } from '@/drawing';
import { editValue } from '@/shaft/edit';
import { rinvioAxisOf, rinvioTopOf } from '@/shaft/rinvio';
import { roomPlanOn, roomSectionOn } from '@/shaft/room-view';
import { ownAxis } from '@/shaft/support';
import { KV_VERT } from '@/shaft/norme-vert';
import { deriveRoom } from '../room/derive';
import { applySurveyEdit } from '../room/edit';
import { roomVerdict } from '../room/snapshot';
import { startSurvey, surveySchema, type Survey } from '../room/survey';

const DEFL: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 };
const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const at = (calata: number, dy = 0): Survey => {
  const s = startSurvey(calata);
  return { ...s, cw: { x: s.cw.x, y: s.cw.y + dy } };
};

test('rinvio: la nuova macchina sulle calate esistenti, il telaio alto quanto chiede h del calcolo', () => {
  const d = deriveRoom(DEFL, at(780));
  // D/2 + dx + Dp/2, a simple bend at 1:1
  assert.equal(d.calata.calc, 280 + 300 + 200);
  assert.deepEqual(d.issues, []);
  const calata = d.checks.find((c) => c.id === 'm_calata');
  assert.equal(calata?.status, 'ok');
  // our bedplate made to h: the pulley at its usual axis, h under the sheave's
  const rf = d.M.rinvio;
  assert.ok(rf && rf.on === 'frame' && !rf.maker);
  assert.equal(rf.top, Math.max(rinvioTopOf(400), rinvioAxisOf(400) + 950 - ownAxis(560)));
  assert.ok(d.G && Math.abs(d.G.pulleyZ - rinvioAxisOf(400)) < 1e-9, `${d.G?.pulleyZ}`);
  // a counterweight drop measured elsewhere than the calculation hangs it: not conforming beyond the tolerance
  const off = deriveRoom(DEFL, at(780, 30)).checks.find((c) => c.id === 'm_calata');
  assert.equal(off?.status, 'fail');
  assert.ok(off && off.value !== null && off.value > KV_VERT.dropTol);
});

test('rinvio contro l\'argano o sotto il pavimento: il rilievo non si salva, con la h minima', () => {
  const low = deriveRoom({ ...DEFL, h: 0.6 }, at(780));
  assert.ok(low.issues.includes('rinvio'));
  assert.equal(low.hMin, ownAxis(560) + 200);
  assert.ok(deriveRoom({ ...DEFL, h: (ownAxis(560) + 200) / 1000 }, at(780)).issues.length === 0);
});

test('tiro diretto: calate della puleggia esistente, la nuova al centro o allineata alla cabina', () => {
  const C = PRESETS.C, centred = deriveRoom(C, at(600));
  assert.equal(centred.calata.calc, 600);
  assert.equal(centred.G?.sheaveAt, 300);
  assert.equal(deriveRoom({ ...C, dropAlign: 'car' }, at(600)).G?.sheaveAt, 280);
  // without the existing machine the calculation hangs the new sheave's ropes: 560 against 600 measured
  const alone = deriveRoom({ ...C, compare: false }, at(600));
  assert.equal(alone.calata.calc, 560);
  assert.equal(alone.checks.find((c) => c.id === 'm_calata')?.status, 'fail');
});

test('argano in basso, calate coincidenti o fuori dal vano: niente locale da disegnare', () => {
  const b = deriveRoom(PRESETS.B, at(560));
  assert.deepEqual(b.issues, ['bottom']);
  assert.equal(b.G, null);
  const s = startSurvey(780);
  assert.ok(deriveRoom(DEFL, { ...s, cw: s.car }).issues.includes('drops'));
  assert.ok(deriveRoom(DEFL, { ...s, cw: { x: s.cw.x, y: s.shaft.D + 50 } }).issues.includes('drops'));
});

test('esito: le verifiche delle parti che restano non contano nella UNI 10411', () => {
  const s = at(780), d = deriveRoom(DEFL, { ...s, room: { ...s.room, H: 1900 } });
  const h = d.checks.find((c) => c.id === 'm_height');
  assert.equal(h?.status, 'fail');
  assert.deepEqual(roomVerdict(d.checks, { norma: '10411-1', parti: ['machine'] }), { verdict: 'OK', failCount: 0, warnCount: 0 });
  assert.equal(roomVerdict(d.checks, { norma: 'en81', parti: [] }).verdict, 'FAIL');
});

test('il rilievo si salva come lo schema lo legge', () => {
  assert.ok(surveySchema.safeParse(startSurvey(780)).success);
  assert.ok(!surveySchema.safeParse({ ...startSurvey(780), extra: 1 }).success);
  assert.ok(!surveySchema.safeParse({ ...startSurvey(780), car: { x: -1, y: 0 } }).success);
});

const draw = (V: FormValues, s: Survey, kind: 'plan' | 'section'): Chain[] => {
  const d = deriveRoom(V, s);
  assert.ok(d.G, 'locale');
  return chains(kind === 'plan' ? roomPlanOn(d.site, d.M, d.G).entities : roomSectionOn(d.site, d.M, d.G).entities);
};

for (const [name, V, s] of [
  ['rinvio nel telaio', DEFL, at(780)], ['tiro diretto', PRESETS.C, at(600)],
  ['putrelle sollevate', DEFL, ((x: Survey): Survey => ({ ...x, room: { ...x.room, support: { kind: 'beams', height: 700 } } }))(at(780))],
] as const) {
  test(`locale della sostituzione, ${name}: ogni quota modificabile legge il valore scritto, nessuna cambia il calcolo`, () => {
    const keys = new Set<string>();
    for (const kind of ['plan', 'section'] as const) {
      const before = draw(V, s, kind);
      before.forEach((c, j) => c.edit?.forEach((e, i) => {
        if (!e) return;
        assert.ok(!e.key.startsWith('calc.'), e.key);
        keys.add(e.key);
        if (e.pick) {
          const k = (e.pick.current + 1) % e.pick.options.length, next = applySurveyEdit(s, e, k);
          assert.ok(next, `${kind}: ${e.key}`);
          assert.equal(draw(V, next, kind)[j].edit?.[i]?.pick?.current, k, `${kind}: ${e.key}`);
          return;
        }
        const now = Math.round(e.value ?? Math.abs(c.pts[i + 1] - c.pts[i]));
        for (const dd of [10, -10]) {
          const next = applySurveyEdit(s, e, now + dd);
          if (!next && editValue(e, now + dd) < 0) continue;
          assert.ok(next && surveySchema.safeParse(next).success, `${kind}: ${e.key}`);
          const after = draw(V, next, kind)[j];
          assert.equal(Math.round(Math.abs(after.pts[i + 1] - after.pts[i])), now + dd, `${kind}: ${e.key} ${now} → ${now + dd}`);
        }
      }));
    }
    for (const k of ['room.W', 'room.D', 'room.shaftX', 'room.shaftY', 'room.H', 'room.slab', 'W', 'D', 'drop.carX', 'drop.carY']) assert.ok(keys.has(k), k);
  });
}
